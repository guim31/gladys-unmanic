// -----------------------------------------------------------------------------
// An in-memory Unmanic server behind the `request` seam of the client
// (src/unmanic/http.js). Answers come from a real Unmanic 0.4.1 server
// (test/fixtures/unmanic/), with the behaviors that matter: workers that
// pick up a task, pause and resume, a queue that fills and empties, tasks
// that fail, an optional reverse proxy with Basic auth, a server that does
// not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/unmanic/${name}.json`, import.meta.url), 'utf8'));

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
  body: JSON.stringify(body),
});

// An idle and a busy worker of the captures.
const IDLE_TEMPLATE = fixture('workers-idle').workers_status[1];
const BUSY_TEMPLATE = fixture('workers-busy').workers_status[0];
const HISTORY_TEMPLATE = fixture('history-latest').results[0];

export class FakeUnmanic {
  /**
   * @param {object} [options]
   * @param {string|null} [options.basicAuth] `user:password` of a reverse proxy, null: none
   */
  constructor({ basicAuth = null } = {}) {
    this.basicAuth = basicAuth;
    this.online = true;
    this.version = fixture('version').version;
    this.workers = [];
    this.addWorker('Default-0', 'Default-Worker-1');
    this.addWorker('Default-1', 'Default-Worker-2');
    this.pending = 0;
    this.history = [];
    this.requests = [];
    this.failNext = null;
  }

  addWorker(id, name) {
    this.workers.push(structuredClone({ ...IDLE_TEMPLATE, id, name }));
  }

  removeWorker(id) {
    this.workers = this.workers.filter((worker) => worker.id !== id);
  }

  worker(id) {
    return this.workers.find((worker) => worker.id === id);
  }

  /** A worker picks up `file` (`percent` as Unmanic sends it: a string). */
  setBusy(id, file = 'sample-a.mkv', percent = '42') {
    const worker = this.worker(id);
    const paused = worker.paused;
    Object.assign(worker, structuredClone(BUSY_TEMPLATE), { id, name: worker.name, paused });
    worker.current_file = file;
    worker.subprocess.percent = percent;
  }

  setIdle(id) {
    const worker = this.worker(id);
    Object.assign(worker, structuredClone(IDLE_TEMPLATE), {
      id,
      name: worker.name,
      paused: worker.paused,
    });
  }

  /** A task completes at `at` (ms). */
  complete(file, at, success = true) {
    const id = this.history.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    this.history.unshift({
      ...HISTORY_TEMPLATE,
      id,
      task_label: file,
      task_success: success,
      start_time: at / 1000 - 5,
      finish_time: at / 1000,
    });
    return id;
  }

  handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const path = new URL(url).pathname;
    this.requests.push({ method, path, body, headers });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.basicAuth) {
      const expected = `Basic ${Buffer.from(this.basicAuth).toString('base64')}`;
      if (headers.authorization !== expected) {
        return { status: 401, headers: { 'content-type': 'text/html' }, body: 'Unauthorized' };
      }
    }
    if (!path.startsWith('/unmanic/api/v2/')) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
    }
    if (this.failNext) {
      const answer = this.failNext;
      this.failNext = null;
      return answer;
    }
    const route = `${method} ${path.slice('/unmanic/api/v2/'.length)}`;
    switch (route) {
      case 'GET version/read':
        return json(200, { version: this.version });
      case 'GET workers/status':
        return json(200, { workers_status: this.workers });
      case 'POST pending/tasks':
        // In progress tasks are counted in recordsTotal only (real capture).
        return json(200, {
          recordsTotal: this.pending + this.workers.filter((w) => !w.idle).length,
          recordsFiltered: this.pending,
          results: [],
        });
      case 'POST history/tasks':
        return json(200, {
          recordsTotal: this.history.length,
          recordsFiltered: this.history.length,
          results: this.history.slice(0, body.length),
          successCount: this.history.filter((row) => row.task_success).length,
          failedCount: this.history.filter((row) => !row.task_success).length,
        });
      case 'POST workers/worker/pause':
      case 'POST workers/worker/resume': {
        const worker = this.worker(body.worker_id);
        if (!worker) {
          return json(500, fixture('error-500'));
        }
        worker.paused = route.endsWith('pause');
        return json(200, { success: true });
      }
      case 'POST workers/worker/pause/all':
      case 'POST workers/worker/resume/all':
        for (const worker of this.workers) {
          worker.paused = route.endsWith('pause/all');
        }
        return json(200, { success: true });
      default:
        // Unmanic answers an unknown route with an empty 200 (real capture).
        return { status: 200, headers: { 'content-type': 'application/json' }, body: '' };
    }
  }
}

/** A fake network: the servers by base URL; any other host does not answer. */
export function createNetwork(servers = {}) {
  return {
    servers,
    async request(url, options) {
      const origin = new URL(url).origin;
      const server = Object.entries(servers).find(([base]) => new URL(base).origin === origin);
      if (!server) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return server[1].handle(url, options);
    },
  };
}
