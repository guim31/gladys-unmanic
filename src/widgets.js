// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `overview`.
//
// The use case: is Unmanic working, at a glance on the wall tablet. Four
// tiles (waiting, in progress, completed today, failed today), one status row
// per worker (progress, paused, idle) and one button that pauses every worker
// or resumes them, when the configuration allows the commands. The worker
// rows and the button each have a setting to hide them.
//
// The figures are sent as values, not bound to device features, so the widget
// works before the devices are added to Gladys. A worker row shows the name
// given to the device in Gladys, when it was added.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS } from './unmanic/client.js';
import { WIDGET_KEY } from './hub.js';
import { workerIds } from './devices.js';
import { ERROR_TEXT, pick } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  PAUSE_ALL: 'pause_all',
  RESUME_ALL: 'resume_all',
});

const MAX_ROWS = 10;

export const TEXT = {
  pick: {
    en: 'Enter the address of your Unmanic server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Unmanic dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Unmanic-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Unmanic en la configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first reading of Unmanic…',
    fr: "En attente de la première lecture d'Unmanic…",
    de: 'Warte auf die erste Abfrage von Unmanic…',
    es: 'Esperando la primera lectura de Unmanic…',
  },
  pending: { en: 'Waiting', fr: 'En attente', de: 'Wartend', es: 'En espera' },
  inProgress: { en: 'In progress', fr: 'En cours', de: 'In Arbeit', es: 'En curso' },
  completed: { en: 'Done today', fr: "Finies aujourd'hui", de: 'Heute fertig', es: 'Hechas hoy' },
  failed: { en: 'Failed today', fr: "Échecs aujourd'hui", de: 'Heute Fehler', es: 'Fallos hoy' },
  idle: { en: 'Idle', fr: 'Inactif', de: 'Untätig', es: 'Inactivo' },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  noWorker: { en: 'No worker', fr: 'Aucun worker', de: 'Kein Worker', es: 'Ningún worker' },
  pauseAll: {
    en: 'Pause all',
    fr: 'Tout mettre en pause',
    de: 'Alle pausieren',
    es: 'Pausar todo',
  },
  resumeAll: { en: 'Resume all', fr: 'Tout reprendre', de: 'Alle fortsetzen', es: 'Reanudar todo' },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  pauseAll: {
    en: 'Every Unmanic worker is paused: the tasks in progress stop where they are.',
    fr: 'Tous les workers Unmanic sont en pause : les tâches en cours s’arrêtent là où elles en sont.',
    de: 'Alle Unmanic-Worker sind pausiert: Laufende Aufgaben halten an, wo sie gerade sind.',
    es: 'Todos los workers de Unmanic están en pausa: las tareas en curso se detienen donde están.',
  },
  resumeAll: {
    en: 'Every Unmanic worker resumed.',
    fr: 'Tous les workers Unmanic ont repris.',
    de: 'Alle Unmanic-Worker laufen wieder.',
    es: 'Todos los workers de Unmanic se han reanudado.',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: fit(t(text, language), 300) }],
  };
}

/** The status row of one worker. */
export function workerRow(worker, label, language) {
  const name = fit(label, 40);
  if (!worker.online) {
    return {
      label: name,
      icon: 'wifi-off',
      value: t(TEXT.offline, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (worker.paused) {
    return {
      label: name,
      icon: 'pause',
      value: t(TEXT.paused, language),
      color: WIDGET_COLORS.WARNING,
    };
  }
  if (worker.busy) {
    const value = worker.progress ? `${worker.progress} % · ${worker.file}` : worker.file;
    return {
      label: name,
      icon: 'loader',
      value: fit(value || t(TEXT.inProgress, language), 40),
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return { label: name, icon: 'cpu', value: t(TEXT.idle, language), color: WIDGET_COLORS.NEUTRAL };
}

const shown = (value) => value !== false && value !== 'false';

async function get(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  if (hub.error) {
    const unreachable = hub.error.kind === ERROR_KINDS.UNREACHABLE;
    return {
      ttl_seconds: 120,
      components: [
        {
          type: 'status',
          items: [
            {
              label: 'Unmanic',
              icon: 'alert-triangle',
              value: t(unreachable ? TEXT.offline : TEXT.error, language),
              color: WIDGET_COLORS.DANGER,
            },
          ],
        },
        { type: 'text', variant: 'body', text: fit(t(ERROR_TEXT[hub.error.kind], language), 300) },
      ],
    };
  }
  if (!hub.server.reachable) {
    return message(TEXT.waiting, language);
  }
  const totals = hub.totals();
  const components = [
    { type: 'value', value: totals.pending, label: t(TEXT.pending, language), icon: 'list' },
    {
      type: 'value',
      value: totals.inProgress,
      label: t(TEXT.inProgress, language),
      icon: 'loader',
      color: totals.inProgress ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: totals.completedToday,
      label: t(TEXT.completed, language),
      icon: 'check-circle',
    },
    {
      type: 'value',
      value: totals.failedToday,
      label: t(TEXT.failed, language),
      icon: 'alert-circle',
      color: totals.failedToday ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (shown(settings?.show_workers)) {
    const workers = [...hub.workers.values()].sort(
      (a, b) => Number(b.online) - Number(a.online) || a.id.localeCompare(b.id),
    );
    const rows = workers
      .slice(0, MAX_ROWS)
      .map((worker) =>
        workerRow(
          worker,
          hub.displayName(workerIds(hub.gladys, worker.id).device, worker.name),
          language,
        ),
      );
    components.push({
      type: 'status',
      items: rows.length
        ? rows
        : [
            {
              label: 'Unmanic',
              icon: 'cpu',
              value: t(TEXT.noWorker, language),
              color: WIDGET_COLORS.WARNING,
            },
          ],
    });
  }
  if (hub.config.allowControl && shown(settings?.show_button) && hub.workers.size > 0) {
    components.push(
      hub.server.allPaused
        ? {
            type: 'button',
            label: t(TEXT.resumeAll, language),
            icon: 'play',
            style: 'secondary',
            action: { key: ACTIONS.RESUME_ALL },
          }
        : {
            type: 'button',
            label: t(TEXT.pauseAll, language),
            icon: 'pause',
            style: 'secondary',
            action: { key: ACTIONS.PAUSE_ALL },
          },
    );
  }
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey }) {
  if (actionKey === ACTIONS.PAUSE_ALL) {
    await hub.setPaused(null, true);
    return { message: DONE_TEXT.pauseAll };
  }
  if (actionKey === ACTIONS.RESUME_ALL) {
    await hub.setPaused(null, false);
    return { message: DONE_TEXT.resumeAll };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
