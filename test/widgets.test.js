// -----------------------------------------------------------------------------
// The `overview` widget: content valid for the core (budget, vocabulary), in
// every language, its settings and its pause / resume button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { CONFIG, FakeUnmanic, createWorld, workerDevice } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const get = async (w, language = 'en', settings = {}) => {
  const ack = await w.fake.widgetGet('overview', { settings, language });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], JSON.stringify(ack.data));
  return ack.data.content.components;
};

test('the widget shows the queue, the workers and a pause button, in every language', async (t) => {
  const unmanic = new FakeUnmanic();
  unmanic.pending = 5;
  unmanic.setBusy('Default-0', 'a-very-long-file-name-of-a-movie-2026.mkv', '37');
  const w = await world(t, { unmanic });
  unmanic.complete('done.mkv', w.clock.now());
  await w.hub.pollAll();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const components = await get(w, language);
    assert.ok(components.length <= 8);
    assert.ok(components.filter((c) => c.type === 'text').length <= 2);
    const values = components.filter((c) => c.type === 'value').map((c) => c.value);
    assert.deepEqual(values, [5, 1, 1, 0]);
    const status = components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 2);
    assert.match(status.items[0].value, /^37 % · a-very-long/);
    assert.ok(status.items[0].value.length <= 40);
    assert.equal(components.at(-1).action.key, 'pause_all');
  }
});

test('a worker row shows the name given in Gladys', async (t) => {
  const devices = [
    { external_id: 'ext:test-integration:worker:default-0', name: 'GPU', features: [] },
  ];
  const w = await world(t, { devices });
  await w.gladys.getDevices();
  assert.equal(w.hub.displayName(workerDevice(w.gladys), 'x'), 'GPU');
  const status = (await get(w)).find((c) => c.type === 'status');
  assert.equal(status.items[0].label, 'GPU');
});

test('the settings hide the workers and the button', async (t) => {
  const w = await world(t);
  const components = await get(w, 'en', { show_workers: false, show_button: false });
  assert.deepEqual(
    components.map((c) => c.type),
    ['value', 'value', 'value', 'value'],
  );
});

test('the button pauses every worker, then offers to resume', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction('overview', 'pause_all', {}, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.en, /paused/);
  assert.ok(w.unmanic.workers.every((worker) => worker.paused));
  const components = await get(w);
  assert.equal(components.at(-1).action.key, 'resume_all');
  assert.equal(components.find((c) => c.type === 'status').items[0].value, 'Paused');
  await w.fake.widgetAction('overview', 'resume_all', {}, { settings: {} });
  assert.ok(w.unmanic.workers.every((worker) => !worker.paused));
});

test('commands off: no button', async (t) => {
  const w = await world(t, { config: { ...CONFIG, allow_control: false } });
  const components = await get(w);
  assert.ok(!components.some((c) => c.type === 'button'));
});

test('no server, or a server down: a message instead of figures', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match((await get(empty))[0].text, /address of your Unmanic server/);
  const w = await world(t);
  w.unmanic.online = false;
  await w.hub.pollAll();
  const components = await get(w, 'fr');
  assert.equal(components[0].items[0].value, 'Hors ligne');
});
