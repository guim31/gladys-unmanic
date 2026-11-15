// -----------------------------------------------------------------------------
// The Gladys devices of an Unmanic server:
//   - the server (`server:main`): online, a switch that pauses every worker,
//     the version;
//   - the queue (`queue:main`): tasks waiting, in progress, completed today,
//     failed today;
//   - one device per worker (`worker:<id>`): active, a pause switch, the
//     progress of its task and the file in progress. Unmanic names a worker
//     after its group and rank (`Default-0`): that id is its identity.
//
// Feature category/type couples come from the core table (see
// test/gladys-rules.test.js); the progress uses the percent level couple, as
// gladys-octoprint does. should_poll: false: the hub reads the server on its
// own timer (src/hub.js). The switches are read-only when the configuration
// forbids the commands.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';

export const DEVICE_TYPES = Object.freeze({
  SERVER: 'server',
  QUEUE: 'queue',
  WORKER: 'worker',
});

export const SERVER_ID = 'main';
export const URL_PARAM = 'UNMANIC_URL';
export const WORKER_PARAM = 'UNMANIC_WORKER';

// Shown in the "file in progress" text of an idle worker (a text is never empty).
export const NO_FILE = '—';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  PAUSED: 'paused',
  VERSION: 'version',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED_TODAY: 'completed_today',
  FAILED_TODAY: 'failed_today',
  ACTIVE: 'active',
  PROGRESS: 'progress',
  FILE: 'file',
});

const K = FEATURE_KEYS;

// Feature names, per device type and language (Gladys does not tell a device
// integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  [DEVICE_TYPES.SERVER]: {
    en: { [K.ONLINE]: 'Online', [K.PAUSED]: 'All workers paused', [K.VERSION]: 'Version' },
    fr: {
      [K.ONLINE]: 'En ligne',
      [K.PAUSED]: 'Tous les workers en pause',
      [K.VERSION]: 'Version',
    },
    de: { [K.ONLINE]: 'Online', [K.PAUSED]: 'Alle Worker pausiert', [K.VERSION]: 'Version' },
    es: {
      [K.ONLINE]: 'En línea',
      [K.PAUSED]: 'Todos los workers en pausa',
      [K.VERSION]: 'Versión',
    },
  },
  [DEVICE_TYPES.QUEUE]: {
    en: {
      [K.PENDING]: 'Waiting tasks',
      [K.IN_PROGRESS]: 'Tasks in progress',
      [K.COMPLETED_TODAY]: 'Completed today',
      [K.FAILED_TODAY]: 'Failed today',
    },
    fr: {
      [K.PENDING]: 'Tâches en attente',
      [K.IN_PROGRESS]: 'Tâches en cours',
      [K.COMPLETED_TODAY]: "Terminées aujourd'hui",
      [K.FAILED_TODAY]: "Échecs aujourd'hui",
    },
    de: {
      [K.PENDING]: 'Wartende Aufgaben',
      [K.IN_PROGRESS]: 'Laufende Aufgaben',
      [K.COMPLETED_TODAY]: 'Heute abgeschlossen',
      [K.FAILED_TODAY]: 'Heute fehlgeschlagen',
    },
    es: {
      [K.PENDING]: 'Tareas en espera',
      [K.IN_PROGRESS]: 'Tareas en curso',
      [K.COMPLETED_TODAY]: 'Completadas hoy',
      [K.FAILED_TODAY]: 'Fallidas hoy',
    },
  },
  [DEVICE_TYPES.WORKER]: {
    en: {
      [K.ACTIVE]: 'Active',
      [K.PAUSED]: 'Paused',
      [K.PROGRESS]: 'Progress',
      [K.FILE]: 'File in progress',
    },
    fr: {
      [K.ACTIVE]: 'Actif',
      [K.PAUSED]: 'En pause',
      [K.PROGRESS]: 'Progression',
      [K.FILE]: 'Fichier en cours',
    },
    de: {
      [K.ACTIVE]: 'Aktiv',
      [K.PAUSED]: 'Pausiert',
      [K.PROGRESS]: 'Fortschritt',
      [K.FILE]: 'Aktuelle Datei',
    },
    es: {
      [K.ACTIVE]: 'Activo',
      [K.PAUSED]: 'En pausa',
      [K.PROGRESS]: 'Progreso',
      [K.FILE]: 'Archivo en curso',
    },
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1_000_000;

const sensor = (category, type, extra = {}) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const DEFINITIONS = {
  binary: sensor(DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    min: 0,
    max: 1,
  }),
  counter: sensor(DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, {
    min: 0,
    max: COUNTER_MAX,
  }),
  progress: sensor(
    DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
    DEVICE_FEATURE_TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
    { unit: DEVICE_FEATURE_UNITS.PERCENT, min: 0, max: 100, keep_history: false },
  ),
  pause: (allowControl) => ({
    category: DEVICE_FEATURE_CATEGORIES.SWITCH,
    type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
    read_only: !allowControl,
    has_feedback: true,
    keep_history: true,
    min: 0,
    max: 1,
  }),
  text: {
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: 0,
  },
};

// Order = display order in Gladys. `value` reads the snapshot of the hub.
const FEATURES = {
  [DEVICE_TYPES.SERVER]: [
    { key: K.ONLINE, definition: 'binary', value: (s) => bit(s.reachable) },
    { key: K.PAUSED, definition: 'pause', value: (s) => bit(s.allPaused) },
    { key: K.VERSION, definition: 'text', value: (s) => s.version || null },
  ],
  [DEVICE_TYPES.QUEUE]: [
    { key: K.PENDING, definition: 'counter', value: (s) => s.pending },
    { key: K.IN_PROGRESS, definition: 'counter', value: (s) => s.inProgress },
    { key: K.COMPLETED_TODAY, definition: 'counter', value: (s) => s.completedToday },
    { key: K.FAILED_TODAY, definition: 'counter', value: (s) => s.failedToday },
  ],
  [DEVICE_TYPES.WORKER]: [
    { key: K.ACTIVE, definition: 'binary', value: (w) => (w.online ? bit(w.busy) : null) },
    { key: K.PAUSED, definition: 'pause', value: (w) => (w.online ? bit(w.paused) : null) },
    { key: K.PROGRESS, definition: 'progress', value: (w) => (w.online ? w.progress : null) },
    {
      key: K.FILE,
      definition: 'text',
      value: (w) => (w.online ? w.file || NO_FILE : null),
    },
  ],
};

function bit(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value ? 1 : 0;
}

/** A worker id as an id part: lower case, letters, digits and dashes. */
export const workerSlug = (id) =>
  id
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'worker';

export const serverIds = (gladys) => gladys.externalIds(DEVICE_TYPES.SERVER, SERVER_ID);
export const queueIds = (gladys) => gladys.externalIds(DEVICE_TYPES.QUEUE, SERVER_ID);
export const workerIds = (gladys, id) => gladys.externalIds(DEVICE_TYPES.WORKER, workerSlug(id));

function features(type, ids, language, allowControl) {
  const names = NAMES[type][language] ?? NAMES[type].en;
  return FEATURES[type].map(({ key, definition }) => ({
    ...(definition === 'pause' ? DEFINITIONS.pause(allowControl) : DEFINITIONS[definition]),
    name: names[key],
    external_id: ids.feature(key),
  }));
}

const QUEUE_NAME = { en: 'queue', fr: 'file', de: 'Warteschlange', es: 'cola' };

/** The server device. */
export function buildServer(gladys, config) {
  const ids = serverIds(gladys);
  return {
    name: `Unmanic ${hostOf(config.url)}`.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: config.url }],
    features: features(DEVICE_TYPES.SERVER, ids, config.language, config.allowControl),
  };
}

/** The queue device. */
export function buildQueue(gladys, config) {
  const ids = queueIds(gladys);
  return {
    name: `Unmanic ${QUEUE_NAME[config.language] ?? QUEUE_NAME.en}`,
    external_id: ids.device,
    should_poll: false,
    features: features(DEVICE_TYPES.QUEUE, ids, config.language, config.allowControl),
  };
}

/** A worker device. */
export function buildWorker(gladys, config, worker) {
  const ids = workerIds(gladys, worker.id);
  return {
    name: `Unmanic ${worker.name}`.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: WORKER_PARAM, value: worker.id }],
    features: features(DEVICE_TYPES.WORKER, ids, config.language, config.allowControl),
  };
}

/**
 * The value of every feature of a device (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(type, ids, source) {
  return FEATURES[type].map(({ key, definition, value }) => {
    const read = value(source);
    return {
      key,
      externalId: ids.feature(key),
      value: read === undefined ? null : read,
      text: definition === 'text',
    };
  });
}
