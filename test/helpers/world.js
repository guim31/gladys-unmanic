// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Unmanic server on a
// fake network, a temporary /data and a manual clock, with the integration
// wired on top through registerHandlers. No timer runs unless `timers: true`:
// the tests read the server with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeUnmanic, createNetwork } from './fakeUnmanic.js';

process.env.LOG_LEVEL ??= 'silent';
// The counts of the day follow local midnight: one time zone for every machine.
process.env.TZ = 'Europe/Paris';

export const UNMANIC_URL = 'http://192.0.2.10:8888';

/** A manual clock, just after the real captures (15/11/2026, 09:30 UTC). */
export function createClock(start = Date.parse('2026-11-15T09:40:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: '192.0.2.10', allow_control: true, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeUnmanic} [options.unmanic]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  unmanic = new FakeUnmanic(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-unmanic-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [UNMANIC_URL]: unmanic });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, unmanic, app, hub: app.hub, clock, dataDir };
}

export const serverFeature = (gladys, key) => gladys.externalIds('server', 'main').feature(key);
export const queueDevice = (gladys) => gladys.externalIds('queue', 'main').device;
export const queueFeature = (gladys, key) => gladys.externalIds('queue', 'main').feature(key);
export const workerDevice = (gladys, slug = 'default-0') =>
  gladys.externalIds('worker', slug).device;
export const workerFeature = (gladys, key, slug = 'default-0') =>
  gladys.externalIds('worker', slug).feature(key);

export { FakeUnmanic };
