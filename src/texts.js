// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the command
// errors and the summary sentence. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './unmanic/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Unmanic server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Unmanic dans la configuration.",
    de: 'Gib die Adresse deines Unmanic-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Unmanic en la configuración.',
  },
  invalid: {
    en: 'The address of the Unmanic server is not valid (e.g. http://192.168.1.2:8888).',
    fr: "L'adresse du serveur Unmanic n'est pas valide (ex. http://192.168.1.2:8888).",
    de: 'Die Adresse des Unmanic-Servers ist ungültig (z. B. http://192.168.1.2:8888).',
    es: 'La dirección del servidor Unmanic no es válida (p. ej. http://192.168.1.2:8888).',
  },
};

// One explanation per error kind (src/unmanic/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Unmanic does not answer: check the address and the port (8888).',
    fr: "Unmanic ne répond pas : vérifiez l'adresse et le port (8888).",
    de: 'Unmanic antwortet nicht: Prüfe die Adresse und den Port (8888).',
    es: 'Unmanic no responde: compruebe la dirección y el puerto (8888).',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: use the http:// address on your network.',
    fr: 'Certificat refusé : utilisez l’adresse en http:// de votre réseau.',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk.',
    es: 'Certificado rechazado: use la dirección http:// de su red.',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'Access refused: check the user name and password of your reverse proxy.',
    fr: "Accès refusé : vérifiez l'identifiant et le mot de passe de votre proxy inverse.",
    de: 'Zugriff verweigert: Prüfe Benutzername und Passwort deines Reverse-Proxys.',
    es: 'Acceso denegado: compruebe el usuario y la contraseña de su proxy inverso.',
  },
  [ERROR_KINDS.NOT_UNMANIC]: {
    en: 'No Unmanic server at this address (web interface port, 8888 by default).',
    fr: "Aucun serveur Unmanic à cette adresse (port de l'interface web, 8888 par défaut).",
    de: 'Kein Unmanic-Server unter dieser Adresse (Port der Weboberfläche, standardmäßig 8888).',
    es: 'No hay ningún servidor Unmanic en esta dirección (puerto de la interfaz web, 8888).',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'The address redirects: enter the final address of the Unmanic server.',
    fr: "L'adresse redirige : saisissez l'adresse finale du serveur Unmanic.",
    de: 'Die Adresse leitet um: Gib die endgültige Adresse des Unmanic-Servers ein.',
    es: 'La dirección redirige: introduzca la dirección final del servidor Unmanic.',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from Unmanic, see the logs of the integration.',
    fr: "Réponse inattendue d'Unmanic, voir les logs de l'intégration.",
    de: 'Unerwartete Antwort von Unmanic, sieh in den Protokollen der Integration nach.',
    es: 'Respuesta inesperada de Unmanic, consulte los registros de la integración.',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `OK, Unmanic ${version}`,
    workers: (count) => `${count} worker(s)`,
    pending: (count) => `${count} task(s) waiting`,
  },
  fr: {
    ok: (version) => `OK, Unmanic ${version}`,
    workers: (count) => `${count} worker(s)`,
    pending: (count) => `${count} tâche(s) en attente`,
  },
  de: {
    ok: (version) => `OK, Unmanic ${version}`,
    workers: (count) => `${count} Worker`,
    pending: (count) => `${count} wartende Aufgabe(n)`,
  },
  es: {
    ok: (version) => `OK, Unmanic ${version}`,
    workers: (count) => `${count} worker(s)`,
    pending: (count) => `${count} tarea(s) en espera`,
  },
};

// The sentence of the "Read the summary" scene action.
export const SUMMARY_TEXT = {
  en: {
    pending: (count) => `${count} task(s) waiting`,
    inProgress: (count) => `${count} in progress`,
    completed: (count) => `${count} completed today`,
    failed: (count) => `${count} failed today`,
    paused: 'all workers paused',
    down: 'Unmanic does not answer.',
  },
  fr: {
    pending: (count) => `${count} tâche(s) en attente`,
    inProgress: (count) => `${count} en cours`,
    completed: (count) => `${count} terminée(s) aujourd'hui`,
    failed: (count) => `${count} en échec aujourd'hui`,
    paused: 'tous les workers en pause',
    down: 'Unmanic ne répond pas.',
  },
  de: {
    pending: (count) => `${count} wartende Aufgabe(n)`,
    inProgress: (count) => `${count} in Arbeit`,
    completed: (count) => `${count} heute abgeschlossen`,
    failed: (count) => `${count} heute fehlgeschlagen`,
    paused: 'alle Worker pausiert',
    down: 'Unmanic antwortet nicht.',
  },
  es: {
    pending: (count) => `${count} tarea(s) en espera`,
    inProgress: (count) => `${count} en curso`,
    completed: (count) => `${count} completada(s) hoy`,
    failed: (count) => `${count} fallida(s) hoy`,
    paused: 'todos los workers en pausa',
    down: 'Unmanic no responde.',
  },
};

// Errors of the commands (scene actions, widget button, switches).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Unmanic server is configured.',
    fr: "Aucun serveur Unmanic n'est configuré.",
    de: 'Kein Unmanic-Server ist konfiguriert.',
    es: 'No hay ningún servidor Unmanic configurado.',
  },
  controlOff: {
    en: 'Pause and resume are turned off in the configuration of the integration.',
    fr: "La pause et la reprise sont désactivées dans la configuration de l'intégration.",
    de: 'Pause und Fortsetzen sind in der Konfiguration der Integration ausgeschaltet.',
    es: 'La pausa y la reanudación están desactivadas en la configuración de la integración.',
  },
  notAWorker: {
    en: 'Choose an Unmanic worker, or leave the field empty for every worker.',
    fr: 'Choisissez un worker Unmanic, ou laissez le champ vide pour tous les workers.',
    de: 'Wähle einen Unmanic-Worker oder lass das Feld leer für alle Worker.',
    es: 'Elija un worker de Unmanic, o deje el campo vacío para todos los workers.',
  },
  workerGone: {
    en: 'This worker no longer exists on the Unmanic server.',
    fr: "Ce worker n'existe plus sur le serveur Unmanic.",
    de: 'Dieser Worker existiert auf dem Unmanic-Server nicht mehr.',
    es: 'Este worker ya no existe en el servidor Unmanic.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
