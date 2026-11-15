# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The Unmanic server in Gladys: online, version, and a switch that pauses
  every worker.
- The queue: tasks waiting, in progress, completed today and failed today.
- One device per worker: active, pause switch, progress of its task and file
  in progress.
- Scene triggers: the queue is emptied, a task failed.
- Scene actions: pause and resume Unmanic (one worker or every worker), read
  a summary sentence.
- An `overview` dashboard widget, with settings to hide the worker rows and
  the pause button.
- Optional Basic auth for an Unmanic behind a reverse proxy.
- Documentation in English, French, German and Spanish.
