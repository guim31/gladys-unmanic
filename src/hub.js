// -----------------------------------------------------------------------------
// The hub: reads the Unmanic server on a timer of the container (the interval
// chosen in the configuration), publishes the states of the server, queue and
// worker devices when they change, fires the scene events, and runs the
// commands (pause, resume) of the switches, the scene actions and the widget.
//
// Gladys never polls these devices (should_poll: false): the scene events
// must fire even for a device that was not added, and a device created
// without should_poll is never polled by Gladys 5.2 anyway.
//
// Scene events:
//   - queue_empty: no task waiting and no worker busy any more, after a
//     reading where something was waiting or in progress;
//   - task_failed: a task has just ended in failure. The id of the newest
//     completed task seen is kept under /data, so a restart announces nothing
//     twice; failures older than an hour are not announced (a container
//     stopped for a night does not replay it).
// No webhook: the sandbox has no inbound port.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { UnmanicClient, ERROR_KINDS } from './unmanic/client.js';
import { parseHistory, parsePending, parseWorkers } from './unmanic/model.js';
import {
  DEVICE_TYPES,
  FEATURE_KEYS,
  WORKER_PARAM,
  buildQueue,
  buildServer,
  buildWorker,
  featureValues,
  queueIds,
  serverIds,
  workerIds,
  workerSlug,
} from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  SUMMARY_TEXT,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'unmanic-hub' });

export const WIDGET_KEY = 'overview';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  QUEUE_EMPTY: 'queue_empty',
  TASK_FAILED: 'task_failed',
});

export const HUB_TIMINGS = {
  // The version changes with an update: read it hourly, not at every reading.
  versionMs: 60 * 60_000,
  // Failures older than this are not announced.
  failureMaxAgeMs: 60 * 60_000,
  // At most this many task_failed events per reading (a broken library).
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

const MAX_STATES_PER_REQUEST = 100;

/** Start of the local day (the supervisor sets TZ to the time zone of Gladys). */
export function startOfDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export class CommandError extends Error {}

export class UnmanicHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/unmanic/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.server = this.emptyServer();
    /** @type {Map<string, object>} workers by slug, online or last seen */
    this.workers = new Map();
    this.error = null;
    this.devicesKey = null;
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transports = new Map();
    this.connection = null;
    this.saved = { workers: [], lastTaskId: null, url: null };
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    this.view = null;
    /** Consecutive readings with nothing waiting nor in progress. */
    this.emptyReadings = 0;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  emptyServer() {
    return {
      reachable: null,
      version: null,
      versionAt: 0,
      pending: null,
      inProgress: null,
      completedToday: null,
      failedToday: null,
      allPaused: null,
      busy: null,
    };
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const workers = Array.isArray(saved.workers)
      ? saved.workers.filter((worker) => worker && typeof worker.id === 'string' && worker.id)
      : [];
    this.saved = {
      workers: workers.map(({ id, name }) => ({ id, name: typeof name === 'string' ? name : id })),
      lastTaskId: Number.isInteger(saved.lastTaskId) ? saved.lastTaskId : null,
      url: typeof saved.url === 'string' ? saved.url : null,
    };
    // Workers added to Gladys are shown offline until the server lists them.
    try {
      const devices = await this.gladys.getDevices();
      for (const device of devices ?? []) {
        const id = device.params?.find((param) => param.name === WORKER_PARAM)?.value;
        if (typeof id === 'string' && id && !this.saved.workers.some((w) => w.id === id)) {
          this.saved.workers.push({ id, name: id });
        }
      }
    } catch (err) {
      this.problem('devices', `Cannot read the devices of Gladys: ${err.message}`);
    }
    for (const { id, name } of this.saved.workers) {
      this.workers.set(workerSlug(id), {
        id,
        name,
        online: false,
        busy: false,
        paused: false,
        progress: 0,
        file: '',
      });
    }
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transports.clear();
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const signature = JSON.stringify([config.url, config.username, config.password]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client = config.url
        ? new UnmanicClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
      this.error = null;
      this.server = this.emptyServer();
      if (config.url && this.saved.url && this.saved.url !== config.url) {
        // Another server: its failures and workers are new, not news.
        this.saved = { workers: [], lastTaskId: null, url: config.url };
        this.workers.clear();
        this.store.save(this.saved);
      } else if (config.url && !this.saved.url) {
        this.saved.url = config.url;
        this.store.save(this.saved);
      }
    }
    this.devicesKey = null; // the language or the commands may have changed
    try {
      await this.refresh();
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Devices ---------------------------------------------------------------

  devices() {
    if (!this.client) {
      return [];
    }
    return [
      buildServer(this.gladys, this.config),
      buildQueue(this.gladys, this.config),
      ...[...this.workers.values()].map((worker) => buildWorker(this.gladys, this.config, worker)),
    ];
  }

  /** Publish the devices when the list (or a name) changed. */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const key = JSON.stringify(devices);
    if (!force && key === this.devicesKey) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale device.
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read the server, publish the devices again. */
  async rediscover() {
    await this.refresh();
    await this.publishDevices({ force: true });
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.resolve(device.external_id)) {
      return;
    }
    await this.publishStates({ force: true, only: device.external_id });
    this.transports.delete(device.external_id);
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** What a device external id designates: { type, worker? }, or null. */
  resolve(externalId) {
    if (!externalId) {
      return null;
    }
    if (externalId === serverIds(this.gladys).device) {
      return { type: DEVICE_TYPES.SERVER };
    }
    if (externalId === queueIds(this.gladys).device) {
      return { type: DEVICE_TYPES.QUEUE };
    }
    for (const worker of this.workers.values()) {
      if (workerIds(this.gladys, worker.id).device === externalId) {
        return { type: DEVICE_TYPES.WORKER, worker };
      }
    }
    return null;
  }

  /** The name of a device in Gladys (the user may have renamed it), else `fallback`. */
  displayName(externalId, fallback) {
    const device = (this.gladys.devices ?? []).find((item) => item.external_id === externalId);
    return typeof device?.name === 'string' && device.name ? device.name : fallback;
  }

  // --- Reading the server ----------------------------------------------------

  /** Read the server and apply what changed. Concurrent calls share the read. */
  pollAll() {
    this.polling ??= this.readAll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /**
   * A reading that starts after this call: a command or a new configuration
   * must not get the answers of a reading already in flight.
   */
  async refresh() {
    if (this.polling) {
      await this.polling.catch(() => {});
    }
    return this.pollAll();
  }

  /** Gladys asks for a refresh (onPoll): read the server now. */
  async pollDevice(device) {
    if (this.resolve(device.external_id)) {
      await this.pollAll();
    }
  }

  async readAll() {
    if (!this.client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      return;
    }
    const client = this.client;
    let widgetChanged;
    try {
      const versionDue =
        !this.server.version || this.now() - this.server.versionAt >= this.timings.versionMs;
      const [version, workers, pending, history] = await Promise.all([
        versionDue ? client.version() : null,
        client.workers(),
        client.pending(),
        client.history(),
      ]);
      if (client !== this.client) {
        return; // reconfigured meanwhile
      }
      const parsedHistory = parseHistory(history, startOfDay(this.now()));
      widgetChanged = await this.applySuccess({
        version: version ?? this.server.version,
        versionAt: version ? this.now() : this.server.versionAt,
        workers: parseWorkers(workers),
        pending: parsePending(pending),
        history: parsedHistory,
      });
      await this.announceFailures(parsedHistory.rows);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      widgetChanged = this.applyFailure(err);
    }
    await this.publishDevices();
    await this.publishStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async applySuccess(next) {
    const previous = this.server;
    if (this.error) {
      logger.info(`Unmanic ${this.config.url}: connection restored`);
    } else if (previous.reachable === null) {
      logger.info(`Unmanic ${this.config.url}: connected, version ${next.version}`);
    }
    this.error = null;
    this.resolved('server');

    // Workers: the ones listed are online, the others known stay offline
    // (a worker group shrunk or renamed). Keyed by slug, the external id part.
    const online = new Map();
    for (const worker of next.workers) {
      if (!online.has(workerSlug(worker.id))) {
        online.set(workerSlug(worker.id), worker);
      }
    }
    for (const [slug, worker] of this.workers) {
      if (!online.has(slug) && worker.online) {
        Object.assign(worker, { online: false, busy: false, progress: 0, file: '' });
        logger.info(`Unmanic worker ${worker.name}: gone`);
      }
    }
    let workersChanged = false;
    for (const [slug, worker] of online) {
      const known = this.workers.get(slug);
      if (!known || known.name !== worker.name) {
        workersChanged = true;
      }
      this.workers.set(slug, { ...worker, online: true });
    }
    if (workersChanged) {
      this.saved.workers = [...this.workers.values()].map(({ id, name }) => ({ id, name }));
      this.store.save(this.saved);
    }

    const inProgress = next.workers.filter((worker) => worker.busy).length;
    const waiting = next.pending === null ? null : next.pending + inProgress;
    // Unmanic hands a task to a worker in two steps (out of the queue, then
    // the worker busy): one empty reading may fall in between. Two in a row.
    this.emptyReadings = waiting === 0 ? this.emptyReadings + 1 : 0;
    const busy =
      waiting === null
        ? previous.busy
        : waiting > 0
          ? true
          : this.emptyReadings >= 2
            ? false
            : previous.busy;
    this.server = {
      reachable: true,
      version: next.version,
      versionAt: next.versionAt,
      pending: next.pending,
      inProgress,
      completedToday: next.history.completedToday,
      failedToday: next.history.failedToday,
      allPaused: next.workers.length > 0 && next.workers.every((worker) => worker.paused),
      busy,
    };

    if (previous.busy === true && this.server.busy === false) {
      logger.info('Unmanic: queue empty');
      await this.fire(TRIGGERS.QUEUE_EMPTY, {
        device: queueIds(this.gladys).device,
        completed_today: this.server.completedToday,
        failed_today: this.server.failedToday,
      });
    }

    const view = JSON.stringify([
      this.server.pending,
      this.server.inProgress,
      this.server.completedToday,
      this.server.failedToday,
      this.server.allPaused,
      next.workers.map((worker) => [worker.id, worker.busy, worker.paused, worker.progress]),
    ]);
    const changed = view !== this.view || previous.reachable !== true;
    this.view = view;
    return changed;
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.server = { ...this.server, reachable: false };
    this.view = null;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Unmanic ${this.config.url}: ${err.message}`);
    } else {
      logger.debug(`Unmanic ${this.config.url}: ${err.message} (again)`);
    }
    return wasError !== err.kind;
  }

  /** Fire task_failed for the failed tasks completed since the newest one seen. */
  async announceFailures(rows) {
    const newest = rows.reduce((max, row) => Math.max(max, row.id), 0);
    const cursor = this.saved.lastTaskId;
    // An empty history keeps the cursor: the next task tells a clear apart.
    if (cursor === newest || (rows.length === 0 && cursor !== null)) {
      return;
    }
    this.saved.lastTaskId = newest;
    this.store.save(this.saved);
    // First reading of this server, or its history was cleared (ids reused):
    // start from now, announce nothing old.
    if (cursor === null || newest < cursor) {
      return;
    }
    const fresh = rows
      .filter(
        (row) =>
          row.id > cursor && !row.success && this.now() - row.at <= this.timings.failureMaxAgeMs,
      )
      .sort((a, b) => a.id - b.id)
      .slice(-this.timings.maxEventsPerRead);
    for (const row of fresh) {
      logger.info(`Unmanic: task failed on ${row.file}`);
      await this.fire(TRIGGERS.TASK_FAILED, {
        device: queueIds(this.gladys).device,
        file: row.file,
        failed_today: this.server.failedToday ?? 0,
      });
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys --------------------------------------------------

  /** Every feature value of every device: [deviceExternalId, values]. */
  values() {
    if (!this.client) {
      return [];
    }
    const server = serverIds(this.gladys);
    const queue = queueIds(this.gladys);
    const entries = [
      [server.device, featureValues(DEVICE_TYPES.SERVER, server, this.server)],
      [queue.device, featureValues(DEVICE_TYPES.QUEUE, queue, this.server)],
    ];
    for (const worker of this.workers.values()) {
      const ids = workerIds(this.gladys, worker.id);
      // Before the first answer, nothing is known of the worker.
      const source = this.server.reachable === null ? {} : worker;
      entries.push([ids.device, featureValues(DEVICE_TYPES.WORKER, ids, source)]);
    }
    return entries;
  }

  async publishStates({ force = false, only = null } = {}) {
    const now = this.now();
    const down = this.server.reachable === false;
    const onlineId = serverIds(this.gladys).feature(FEATURE_KEYS.ONLINE);
    const states = [];
    for (const [deviceId, values] of this.values()) {
      if (only && deviceId !== only) {
        continue;
      }
      for (const { externalId, value, text } of values) {
        if (value === null) {
          continue;
        }
        const last = this.published.get(externalId);
        // While the server is down, its last values are not republished as fresh.
        const stale = down && externalId !== onlineId;
        const fresh =
          last && last.value === value && (stale || now - last.at < this.timings.heartbeatMs);
        if (!force && fresh) {
          continue;
        }
        states.push(
          text
            ? { device_feature_external_id: externalId, text: String(value) }
            : { device_feature_external_id: externalId, state: value },
        );
      }
    }
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(batch);
        for (const state of batch) {
          this.published.set(state.device_feature_external_id, {
            value: state.text ?? state.state,
            at: now,
          });
        }
        this.resolved('states');
      } catch (err) {
        this.problem('states', `States refused: ${err.message}`);
      }
    }
  }

  async publishTransports() {
    if (!this.client || this.server.reachable === null) {
      return;
    }
    const transport = (ok) => (ok ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE);
    const wanted = [
      [serverIds(this.gladys).device, transport(this.server.reachable)],
      [queueIds(this.gladys).device, transport(this.server.reachable)],
    ];
    for (const worker of this.workers.values()) {
      wanted.push([
        workerIds(this.gladys, worker.id).device,
        transport(this.server.reachable && worker.online),
      ]);
    }
    const entries = wanted
      .filter(([externalId, value]) => this.transports.get(externalId) !== value)
      .map(([externalId, value]) => ({ external_id: externalId, transport: value }));
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands ----------------------------------------------------------------

  fail(text) {
    throw new CommandError(pick(text, this.config?.language));
  }

  ensureServer() {
    if (!this.client) {
      this.fail(ACTION_TEXT.noServer);
    }
  }

  /**
   * Pause or resume: one worker, or every worker (the server or queue
   * device, or none). A paused worker stops its task where it is and goes on
   * from there when resumed.
   * @param {string|null} deviceExternalId
   * @param {boolean} paused
   */
  async setPaused(deviceExternalId, paused) {
    this.ensureServer();
    if (!this.config.allowControl) {
      this.fail(ACTION_TEXT.controlOff);
    }
    const target = deviceExternalId
      ? this.resolve(deviceExternalId)
      : { type: DEVICE_TYPES.SERVER };
    if (!target) {
      this.fail(ACTION_TEXT.notAWorker);
    }
    if (target.type === DEVICE_TYPES.WORKER && !target.worker.online) {
      this.fail(ACTION_TEXT.workerGone);
    }
    const one = target.type === DEVICE_TYPES.WORKER;
    const what = one ? `worker ${target.worker.name}` : 'all workers';
    try {
      if (one) {
        await this.client.setWorkerPaused(target.worker.id, paused);
      } else {
        await this.client.setAllPaused(paused);
      }
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      logger.warn(`Unmanic: ${paused ? 'pause' : 'resume'} of ${what} refused: ${err.message}`);
      throw new CommandError(pick(ERROR_TEXT[err.kind], this.config.language));
    }
    logger.info(`Unmanic: ${what} ${paused ? 'paused' : 'resumed'}`);
    try {
      await this.refresh();
    } catch (err) {
      // The command went through: a failing follow-up read does not undo it.
      this.problem('refresh', 'Reading after the command failed', err, 'error');
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
    return target;
  }

  /** A switch of the server or of a worker (onSetValue). */
  async setValue(device, feature, value) {
    if (feature.external_id !== `${device.external_id}:${FEATURE_KEYS.PAUSED}`) {
      throw new Error(`Feature ${feature.external_id} is read-only`);
    }
    await this.setPaused(device.external_id, Number(value) === 1);
  }

  // --- Reports -----------------------------------------------------------------

  totals() {
    return {
      pending: this.server.pending ?? 0,
      inProgress: this.server.inProgress ?? 0,
      completedToday: this.server.completedToday ?? 0,
      failedToday: this.server.failedToday ?? 0,
      workers: [...this.workers.values()].filter((worker) => worker.online).length,
    };
  }

  /** The sentence of the summary scene action, in the configured language. */
  summary() {
    this.ensureServer();
    const text = SUMMARY_TEXT[this.config.language] ?? SUMMARY_TEXT.en;
    if (this.error || !this.server.reachable) {
      return text.down;
    }
    const totals = this.totals();
    const parts = [
      text.pending(totals.pending),
      text.inProgress(totals.inProgress),
      text.completed(totals.completedToday),
    ];
    if (totals.failedToday) {
      parts.push(text.failed(totals.failedToday));
    }
    if (this.server.allPaused) {
      parts.push(text.paused);
    }
    return `Unmanic: ${parts.join(', ')}.`.slice(0, 1000);
  }

  /** "Test the connection": read the server now, one report. */
  async testConnection() {
    await this.refresh();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!this.client || this.error) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const totals = this.totals();
      message[language] = [
        text.ok(this.server.version),
        text.workers(totals.workers),
        text.pending(totals.pending),
      ].join(', ');
    }
    return message;
  }
}

export { ERROR_KINDS };
