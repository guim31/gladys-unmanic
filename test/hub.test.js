// -----------------------------------------------------------------------------
// The behavior of the hub against the fake Unmanic: states, scene events,
// commands, errors, persistence.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG,
  FakeUnmanic,
  createWorld,
  queueDevice,
  queueFeature,
  serverFeature,
  workerDevice,
  workerFeature,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('the server, queue and worker states come from the real answers', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.pending = 3;
  unmanic.setBusy('Default-0', 'sample-a.mkv', '42');
  const w = await world(t, { unmanic });
  const state = (id) => w.fake.lastState(id);
  assert.equal(state(serverFeature(w.gladys, 'online')), 1);
  assert.equal(state(serverFeature(w.gladys, 'version')), '0.4.1~1c324b8');
  assert.equal(state(serverFeature(w.gladys, 'paused')), 0);
  assert.equal(state(queueFeature(w.gladys, 'pending')), 3);
  assert.equal(state(queueFeature(w.gladys, 'in_progress')), 1);
  assert.equal(state(queueFeature(w.gladys, 'completed_today')), 0);
  assert.equal(state(workerFeature(w.gladys, 'active')), 1);
  assert.equal(state(workerFeature(w.gladys, 'progress')), 42);
  assert.equal(state(workerFeature(w.gladys, 'file')), 'sample-a.mkv');
  assert.equal(state(workerFeature(w.gladys, 'active', 'default-1')), 0);
  assert.equal(state(workerFeature(w.gladys, 'file', 'default-1')), '—');
  assert.equal(w.fake.connectionStatus.connected, true);
  // No authentication: no header.
  assert.ok(unmanic.requests.every((r) => r.headers.authorization === undefined));
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    [
      'Unmanic 192.0.2.10:8888',
      'Unmanic queue',
      'Unmanic Default-Worker-1',
      'Unmanic Default-Worker-2',
    ],
  );
});

test('the tasks of the day are counted from the history, from local midnight', async (t) => {
  const unmanic = new FakeUnmanic();
  const w = await world(t, { unmanic });
  const now = w.clock.now(); // 10:40 in Paris
  unmanic.complete('yesterday.mkv', now - 11 * 60 * 60_000);
  unmanic.complete('a.mkv', now - 2 * 60 * 60_000);
  unmanic.complete('b.mkv', now - 60 * 60_000, false);
  unmanic.complete('c.mkv', now - 60_000);
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(queueFeature(w.gladys, 'completed_today')), 2);
  assert.equal(w.fake.lastState(queueFeature(w.gladys, 'failed_today')), 1);
  // The next day starts at zero.
  w.clock.advance(14 * 60 * 60_000);
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(queueFeature(w.gladys, 'completed_today')), 0);
  assert.equal(w.fake.lastState(queueFeature(w.gladys, 'failed_today')), 0);
});

test('only the changes are published, everything again when a device is added', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before, 'an unchanged reading publishes nothing');
  w.unmanic.pending = 4;
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(queueFeature(w.gladys, 'pending')), 4);
  const count = w.fake.states.length;
  await w.fake.deviceCreated({ external_id: workerDevice(w.gladys) });
  assert.equal(w.fake.states.length, count + 4, 'the four worker features again');
  assert.ok(w.fake.widgetRefreshes.length >= 1);
});

test('an unchanged value is republished after 12 hours (heartbeat)', async (t) => {
  const w = await world(t);
  const count = w.fake.states.length;
  w.clock.advance(12 * 60 * 60_000);
  await w.hub.pollAll();
  assert.ok(w.fake.states.length > count);
});

test('queue_empty fires once when the last task is done', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.pending = 1;
  unmanic.setBusy('Default-0');
  const w = await world(t, { unmanic });
  unmanic.pending = 0;
  await w.hub.pollAll();
  assert.equal(events(w, 'queue_empty').length, 0, 'a worker is still busy');
  unmanic.setIdle('Default-0');
  unmanic.complete('sample-a.mkv', w.clock.now());
  await w.hub.pollAll();
  await w.hub.pollAll();
  const fired = events(w, 'queue_empty');
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0].data, {
    device: queueDevice(w.gladys),
    completed_today: 1,
    failed_today: 0,
  });
});

test('an idle server at start fires no queue_empty', async (t) => {
  const w = await world(t);
  await w.hub.pollAll();
  assert.equal(events(w, 'queue_empty').length, 0);
});

test('task_failed fires for a new failure, once, also across a restart', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.complete('old-failure.mkv', Date.parse('2026-11-15T09:30:08Z'), false);
  const w = await world(t, { unmanic });
  assert.equal(events(w, 'task_failed').length, 0, 'the failures found at start are not news');
  unmanic.complete('fine.mkv', w.clock.now() - 2000);
  unmanic.complete('broken-b.mkv', w.clock.now() - 1000, false);
  await w.hub.pollAll();
  await w.hub.pollAll();
  const fired = events(w, 'task_failed');
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0].data, {
    device: queueDevice(w.gladys),
    file: 'broken-b.mkv',
    failed_today: 2,
  });

  // Same /data, new container: nothing is announced twice.
  await w.app.stop();
  const again = await world(t, { unmanic, dataDir: w.dataDir, clock: w.clock });
  await again.hub.pollAll();
  assert.equal(events(again, 'task_failed').length, 0);
  unmanic.complete('another.mkv', w.clock.now(), false);
  await again.hub.pollAll();
  assert.equal(events(again, 'task_failed').length, 1);
});

test('a failure older than an hour is not announced; a cleared history resets the cursor', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.complete('a.mkv', Date.parse('2026-11-15T09:00:00Z'));
  const w = await world(t, { unmanic });
  w.clock.advance(3 * 60 * 60_000);
  unmanic.complete('old.mkv', w.clock.now() - 2 * 60 * 60_000, false);
  await w.hub.pollAll();
  assert.equal(events(w, 'task_failed').length, 0);

  // History cleared in Unmanic: the ids start again from 1.
  unmanic.history = [];
  unmanic.complete('after-clear.mkv', w.clock.now(), false);
  await w.hub.pollAll();
  assert.equal(events(w, 'task_failed').length, 0, 'nothing old is replayed');
  unmanic.complete('next.mkv', w.clock.now(), false);
  await w.hub.pollAll();
  assert.equal(events(w, 'task_failed').length, 1);
});

test('a worker that disappears stays in Gladys, offline', async (t) => {
  const w = await world(t);
  w.unmanic.removeWorker('Default-1');
  await w.hub.pollAll();
  assert.ok(
    w.fake.discoveredDevices.some((d) => d.external_id === workerDevice(w.gladys, 'default-1')),
  );
  assert.ok(
    w.fake.transports.some(
      (entry) =>
        entry.device_external_id === workerDevice(w.gladys, 'default-1') &&
        entry.transport === 'unreachable',
    ),
  );
  const ack = await w.fake.sceneAction('pause_workers', {
    device: workerDevice(w.gladys, 'default-1'),
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /no longer exists/);
});

test('a worker added to Gladys is shown offline after a restart, until Unmanic lists it', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.removeWorker('Default-1');
  const devices = [
    {
      external_id: 'ext:test-integration:worker:default-1',
      params: [{ name: 'UNMANIC_WORKER', value: 'Default-1' }],
      features: [],
    },
  ];
  const w = await world(t, { unmanic, devices });
  assert.ok(
    w.fake.transports.some(
      (entry) =>
        entry.device_external_id === workerDevice(w.gladys, 'default-1') &&
        entry.transport === 'unreachable',
    ),
  );
  unmanic.addWorker('Default-1', 'Default-Worker-2');
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(workerFeature(w.gladys, 'active', 'default-1')), 0);
});

test('the pause switch of a worker pauses it, the server switch pauses every worker', async (t) => {
  const w = await world(t);
  const worker = { external_id: workerDevice(w.gladys) };
  let ack = await w.fake.setValue(worker, { external_id: workerFeature(w.gladys, 'paused') }, 1);
  assert.equal(ack.success, true, ack.error);
  assert.equal(w.unmanic.worker('Default-0').paused, true);
  assert.equal(w.unmanic.worker('Default-1').paused, false);
  assert.equal(w.fake.lastState(workerFeature(w.gladys, 'paused')), 1);
  assert.equal(w.fake.lastState(serverFeature(w.gladys, 'paused')), 0);

  const server = { external_id: w.gladys.externalIds('server', 'main').device };
  ack = await w.fake.setValue(server, { external_id: serverFeature(w.gladys, 'paused') }, 1);
  assert.equal(ack.success, true, ack.error);
  assert.ok(w.unmanic.workers.every((item) => item.paused));
  assert.equal(w.fake.lastState(serverFeature(w.gladys, 'paused')), 1);
  ack = await w.fake.setValue(server, { external_id: serverFeature(w.gladys, 'paused') }, 0);
  assert.equal(ack.success, true, ack.error);
  assert.ok(w.unmanic.workers.every((item) => !item.paused));

  ack = await w.fake.setValue(server, { external_id: serverFeature(w.gladys, 'version') }, 1);
  assert.equal(ack.success, false, 'a sensor is not a command');
});

test('commands off by default: switches read-only, scenes and widget refuse', async (t) => {
  const { allow_control: _ignored, ...config } = CONFIG;
  const w = await world(t, { config });
  const pause = w.fake.discoveredDevices[0].features.find((f) => f.external_id.endsWith(':paused'));
  assert.equal(pause.read_only, true);
  const worker = { external_id: workerDevice(w.gladys) };
  const ack = await w.fake.setValue(worker, { external_id: workerFeature(w.gladys, 'paused') }, 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /turned off/);
  const scene = await w.fake.sceneAction('pause_workers', {});
  assert.equal(scene.success, false);
  assert.ok(!w.unmanic.requests.some((r) => r.path.includes('/workers/worker/')));
});

test('pause and resume scene actions: one worker, or every worker', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('pause_workers', {});
  assert.equal(ack.success, true, ack.error);
  assert.ok(w.unmanic.workers.every((item) => item.paused));
  ack = await w.fake.sceneAction('resume_workers', { device: workerDevice(w.gladys, 'default-1') });
  assert.equal(ack.success, true, ack.error);
  assert.equal(w.unmanic.worker('Default-1').paused, false);
  assert.equal(w.unmanic.worker('Default-0').paused, true);
  ack = await w.fake.sceneAction('resume_workers', { device: queueDevice(w.gladys) });
  assert.equal(ack.success, true, 'the queue device means every worker');
  assert.ok(w.unmanic.workers.every((item) => !item.paused));
  ack = await w.fake.sceneAction('pause_workers', { device: 'ext:other:thing' });
  assert.equal(ack.success, false);
});

test('a refused command is explained, with the Unmanic error line only', async (t) => {
  const w = await world(t);
  w.unmanic.failNext = {
    status: 500,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: '500: Failed to pause worker', traceback: ['secret stack'] }),
  };
  const ack = await w.fake.sceneAction('pause_workers', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unexpected answer from Unmanic/);
});

test('read_summary says the queue and the tasks of the day', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.pending = 7;
  unmanic.setBusy('Default-0');
  const w = await world(t, { unmanic, config: { ...CONFIG, language: 'fr' } });
  unmanic.complete('a.mkv', w.clock.now() - 1000);
  unmanic.complete('b.mkv', w.clock.now() - 500, false);
  const ack = await w.fake.sceneAction('read_summary', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.outputs.summary,
    "Unmanic: 7 tâche(s) en attente, 1 en cours, 1 terminée(s) aujourd'hui, 1 en échec aujourd'hui.",
  );
  assert.equal(ack.data.outputs.pending, 7);
  assert.equal(ack.data.outputs.in_progress, 1);
  assert.equal(ack.data.outputs.failed_today, 1);
});

test('a server down: offline, the values not refreshed, one status message', async (t) => {
  const w = await world(t);
  w.unmanic.online = false;
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(serverFeature(w.gladys, 'online')), 0);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  const count = w.fake.states.length;
  w.clock.advance(13 * 60 * 60_000);
  await w.hub.pollAll();
  // Only "online: 0" gets its heartbeat: no stale count republished as fresh.
  assert.deepEqual(
    w.fake.states.slice(count).map((state) => state.device_feature_external_id),
    [serverFeature(w.gladys, 'online')],
  );
  w.unmanic.online = true;
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(serverFeature(w.gladys, 'online')), 1);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('reverse proxy: Basic auth sent when set, a refusal explained', async (t) => {
  const unmanic = new FakeUnmanic({ basicAuth: 'gladys:s3cret' });
  const w = await world(t, { unmanic });
  assert.equal(w.hub.error.kind, 'auth');
  assert.match(w.fake.connectionStatus.message.en, /reverse proxy/);
  await w.fake.configUpdated({ ...CONFIG, username: 'gladys', password: 's3cret' });
  assert.equal(w.hub.error, null);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('another web server at the address is not taken for Unmanic', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.handle = () => ({
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html>',
  });
  const w = await world(t, { unmanic });
  assert.equal(w.hub.error.kind, 'not_unmanic');
  const other = new FakeUnmanic();
  other.handle = () => ({ status: 404, headers: { 'content-type': 'text/html' }, body: 'nope' });
  const w2 = await world(t, { unmanic: other });
  assert.equal(w2.hub.error.kind, 'not_unmanic');
});

test('no address: no device, a status that says what to do', async (t) => {
  const w = await world(t, { config: { language: 'en' } });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  const ack = await w.fake.sceneAction('read_summary', {});
  assert.equal(ack.success, false);
});

test('another server in the configuration: its old failures are not news', async (t) => {
  const unmanic = new FakeUnmanic();
  const w = await world(t, { unmanic });
  unmanic.complete('x.mkv', w.clock.now(), false);
  await w.fake.configUpdated({ ...CONFIG, url: 'http://192.0.2.10:8888/proxy' });
  assert.equal(events(w, 'task_failed').length, 0);
});

test('the test_connection action reports the version, workers and queue', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.en, 'OK, Unmanic 0.4.1~1c324b8, 2 worker(s), 0 task(s) waiting');
});

test('the container reads the server on its own timer, without onPoll', async (t) => {
  const w = await world(t, { timers: true, config: { ...CONFIG, poll_interval: '30' } });
  // The timer armed at start is a real one: clear it, re-arm it under the mock.
  clearTimeout(w.hub.pollTimer);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  w.hub.schedulePoll();
  const before = w.unmanic.requests.length;
  t.mock.timers.tick(30_000);
  await w.hub.polling;
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(w.unmanic.requests.length > before);
  assert.ok(w.fake.discoveredDevices.every((device) => device.should_poll === false));
});

test('a command waits for the reading in flight, then reads again', async (t) => {
  const w = await world(t);
  const inFlight = w.hub.pollAll(); // a timer reading, started before the command
  await w.fake.widgetAction('overview', 'pause_all', {}, { settings: {} });
  await inFlight;
  assert.equal(w.fake.lastState(serverFeature(w.gladys, 'paused')), 1);
});

test('a bug in the first reading at start does not stop the timer', async (t) => {
  const w = await createWorld({ timers: true, connect: false });
  t.after(() => w.app.stop());
  w.hub.applySuccess = async () => {
    throw new TypeError('parser bug');
  };
  await w.gladys.connect();
  await w.app.ready;
  assert.ok(w.hub.pollTimer, 'the timer is armed');
});
