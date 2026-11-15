// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Pause or resume the workers (one worker, or every worker: during peak
// hours, for example), and read the summary sentence (for a "say" or a
// notification). Nothing destructive: a paused worker resumes its task where
// it stopped. The commands need "Allow pause and resume" (off by default).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async pause_workers(hub, { fields = {} }) {
    await hub.setPaused(fields.device || null, true);
    return {};
  },

  async resume_workers(hub, { fields = {} }) {
    await hub.setPaused(fields.device || null, false);
    return {};
  },

  async read_summary(hub) {
    hub.ensureServer();
    // Read now: the sentence says what is true at the time of the scene.
    await hub.refresh();
    const totals = hub.totals();
    return {
      summary: hub.summary(),
      pending: totals.pending,
      in_progress: totals.inProgress,
      completed_today: totals.completedToday,
      failed_today: totals.failedToday,
    };
  },
};
