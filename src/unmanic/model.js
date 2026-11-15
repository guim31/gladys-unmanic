// -----------------------------------------------------------------------------
// Parsers of the Unmanic answers (shapes taken from a real Unmanic 0.4.1
// server, see test/fixtures/unmanic/). Each one keeps what the integration
// shows and tolerates a missing field (older or newer Unmanic): a number it
// cannot read becomes null, never NaN.
// -----------------------------------------------------------------------------

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};

const text = (value, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * workers/status: one entry per worker. The id (`Default-0`: worker group
 * and rank) is stable while the group keeps its name; `percent` is a string,
 * "0" when the plugin gives no progress parser.
 */
export function parseWorkers(answer) {
  const list = Array.isArray(answer?.workers_status) ? answer.workers_status : [];
  const workers = [];
  for (const worker of list) {
    if (!worker || typeof worker !== 'object') {
      continue;
    }
    const id = text(String(worker.id ?? ''), 60);
    if (!id) {
      continue;
    }
    const busy = worker.idle === false;
    const percent = Number(worker.subprocess?.percent);
    workers.push({
      id,
      name: text(worker.name, 60) || id,
      busy,
      paused: worker.paused === true,
      progress:
        busy && Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0,
      file: busy ? text(worker.current_file, 300) : '',
    });
  }
  return workers.sort((a, b) => a.id.localeCompare(b.id));
}

/** pending/tasks: tasks waiting for a worker (the ones in progress are not counted). */
export const parsePending = (answer) => count(answer?.recordsFiltered);

/**
 * history/tasks, newest first.
 * @param {number} midnight start of the day, ms
 */
export function parseHistory(answer, midnight) {
  const rows = (Array.isArray(answer?.results) ? answer.results : [])
    .filter((row) => row && Number.isInteger(row.id) && Number.isFinite(Number(row.finish_time)))
    .map((row) => ({
      id: row.id,
      file: text(row.task_label, 300),
      success: row.task_success === true,
      at: Math.round(Number(row.finish_time) * 1000),
    }));
  const today = rows.filter((row) => row.at >= midnight);
  return {
    rows,
    completedToday: today.filter((row) => row.success).length,
    failedToday: today.filter((row) => !row.success).length,
  };
}
