# Unmanic for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
brings an [Unmanic](https://docs.unmanic.app) server (self-hosted optimizer of a
video library) into Gladys, over the local network.

![Unmanic for Gladys](cover.png)

## What it does

- **The server**: online, version, and a switch that pauses every worker.
- **The queue**: tasks waiting, tasks in progress, tasks completed and failed
  today.
- **Each worker**: active, a pause switch, the progress of its task (%) and the
  file in progress.
- **Scene triggers**: the queue is emptied (everything processed), a task
  failed (with its file name).
- **Scene actions**: pause Unmanic and resume Unmanic (one worker or every
  worker, during peak hours for example), read a summary sentence for a
  message or a voice announcement.
- **Dashboard widget**: waiting, in progress, completed and failed today, one
  row per worker, and a button to pause or resume every worker (each block can
  be hidden).
- The pause and resume commands are **off by default**: the integration only
  reads until you allow them in the configuration.

The user documentation, in English, French, German and Spanish, is in
[`docs/`](docs/en.md) and is shown by Gladys.

Tested against a real Unmanic 0.4.1 server (the official `josh5/unmanic` Docker
image, with real tasks, a failed one and paused workers), not yet in a real
Gladys installation: feedback welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-unmanic/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- An Unmanic server reachable from Gladys, on the port of its web interface
  (`8888` by default).
- Unmanic has no authentication of its own. Behind a reverse proxy with Basic
  auth, its user name and password.

## Installation

In Gladys: **Integrations** → **Install from GitHub**, with the address of this
repository: `https://github.com/guim31/gladys-unmanic`. Then enter the address
of the Unmanic server in the configuration, and add the devices from the
**Discover** tab.

## How it works

The integration reads the Unmanic API (`/unmanic/api/v2`) at the chosen
interval (1 minute by default): `workers/status`, `pending/tasks`,
`history/tasks` (the 250 latest completed tasks, to count the tasks of the day
and spot the new failures) and, hourly, `version/read`. The pause switches use
`workers/worker/pause|resume` (one worker) and `workers/worker/pause/all|resume/all`.
Only the changes are sent to Gladys. Nothing is changed in Unmanic besides the
pause, and nothing is deleted.

## Limits

- One Unmanic server per integration.
- A worker is known by its Unmanic id (worker group and rank, `Default-0`):
  renaming a worker group creates new devices.
- The progress needs a plugin that reports it (most ffmpeg plugins do).
- The tasks of the day are counted from the 250 latest tasks of the history
  (the date filter of the API is ignored by Unmanic 0.4.1).
- A short task can start and finish between two readings; at most ten failed
  tasks are announced per reading, and failures older than an hour are not
  announced.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and an in-memory Unmanic
server built from real answers of Unmanic 0.4.1 (`test/fixtures/unmanic/`). See
[`CLAUDE.md`](CLAUDE.md) for the architecture and the pitfalls.

## Credits

- [Unmanic](https://github.com/Unmanic/unmanic) by Josh.5 (GPL-3.0). The logo
  of the cover comes from the official repository
  ([`logo.png`](https://github.com/Unmanic/unmanic/blob/master/logo.png)).
- The API routes were read in the source of Unmanic (no code copied) and
  checked against a real Unmanic 0.4.1 server.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and SDK of Gladys Assistant.

Not affiliated with Unmanic or its authors. Licensed under the
[Apache License 2.0](LICENSE).
