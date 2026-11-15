// -----------------------------------------------------------------------------
// Unmanic API client (/unmanic/api/v2, port 8888), checked on Unmanic 0.4.1
// (image josh5/unmanic). Unmanic has no authentication of its own: a user name
// and password are only sent (HTTP Basic) for a reverse proxy in front of it,
// never in the URL, never in the logs.
//
// The readings: version/read, workers/status (one entry per worker),
// pending/tasks (the queue) and history/tasks (completed tasks, newest
// first). The commands: workers/worker/pause|resume (one worker) and
// workers/worker/pause/all|resume/all.
//
// Careful: an Unmanic error answers its Python traceback; the client keeps
// the `error` line only. The `after` filter of history/tasks is ignored by
// Unmanic 0.4.1: the hub counts the tasks of the day itself.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // the reverse proxy refused the user name or password (401, 403)
  NOT_UNMANIC: 'not_unmanic', // something answers, not the Unmanic API
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

export class UnmanicError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'UnmanicError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Completed tasks read at each reading: enough for the counts of a day on a
// home server, and for the failures since the previous reading.
export const HISTORY_PAGE_SIZE = 250;

export class UnmanicClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the base path if any
   * @param {string} [options.username] reverse proxy only
   * @param {string} [options.password]
   * @param {Function} [options.request] HTTP seam (src/unmanic/http.js)
   */
  constructor({ url, username = '', password = '', request = httpRequest }) {
    this.url = url;
    this.request = request;
    this.headers = username
      ? { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
      : {};
    this.hasCredentials = Boolean(username);
  }

  async call(path, { method = 'GET', json, timeoutMs } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}/unmanic/api/v2/${path}`, {
        method,
        json,
        timeoutMs,
        headers: this.headers,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new UnmanicError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new UnmanicError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const { status, headers = {}, body } = answer;
    if (status === 401 || status === 403) {
      throw new UnmanicError(
        ERROR_KINDS.AUTH,
        this.hasCredentials
          ? 'User name or password refused'
          : 'Authentication required (reverse proxy)',
        { status },
      );
    }
    if (status >= 300 && status < 400) {
      throw new UnmanicError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    let data;
    const isJson = String(headers['content-type'] ?? '').includes('json');
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      data = undefined;
    }
    if (status === 404 || (data === undefined && status >= 200 && status < 300)) {
      throw new UnmanicError(ERROR_KINDS.NOT_UNMANIC, `No Unmanic API at this address (/${path})`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      // Unmanic answers { error, messages, traceback }: the first line only.
      const reason =
        isJson && data && typeof data.error === 'string' ? `: ${data.error.slice(0, 120)}` : '';
      throw new UnmanicError(ERROR_KINDS.HTTP, `/${path} answered HTTP ${status}${reason}`, {
        status,
      });
    }
    return data;
  }

  /** Version of the server; also tells an Unmanic from another web server. */
  async version() {
    const answer = await this.call('version/read');
    if (!answer || typeof answer !== 'object' || typeof answer.version !== 'string') {
      throw new UnmanicError(ERROR_KINDS.NOT_UNMANIC, 'No Unmanic version in version/read');
    }
    return answer.version;
  }

  /** Unmanic answers an unknown route with an empty 200: check the shape of each answer. */
  async expect(path, answer, valid) {
    if (!answer || typeof answer !== 'object' || !valid(answer)) {
      throw new UnmanicError(ERROR_KINDS.NOT_UNMANIC, `Unexpected answer from /${path}`);
    }
    return answer;
  }

  async workers() {
    const answer = await this.call('workers/status');
    return this.expect('workers/status', answer, (a) => Array.isArray(a.workers_status));
  }

  /** The queue: only the count matters (`recordsFiltered`: tasks not started yet). */
  async pending() {
    const answer = await this.call('pending/tasks', {
      method: 'POST',
      json: { start: 0, length: 1 },
    });
    return this.expect('pending/tasks', answer, (a) => a.recordsFiltered != null);
  }

  /** The latest completed tasks, newest first. */
  async history() {
    const answer = await this.call('history/tasks', {
      method: 'POST',
      json: {
        start: 0,
        length: HISTORY_PAGE_SIZE,
        order_by: 'finish_time',
        order_direction: 'desc',
      },
    });
    return this.expect('history/tasks', answer, (a) => Array.isArray(a.results));
  }

  setWorkerPaused(workerId, paused) {
    return this.call(`workers/worker/${paused ? 'pause' : 'resume'}`, {
      method: 'POST',
      json: { worker_id: workerId },
    });
  }

  setAllPaused(paused) {
    return this.call(`workers/worker/${paused ? 'pause' : 'resume'}/all`, {
      method: 'POST',
      json: {},
    });
  }
}
