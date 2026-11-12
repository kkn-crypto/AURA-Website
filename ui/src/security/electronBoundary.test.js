import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(here, '../..');
const mainSource = readFileSync(resolve(uiRoot, 'electron/main.cjs'), 'utf8');
const backendClientSource = readFileSync(resolve(uiRoot, 'electron/backendClient.cjs'), 'utf8');
const preloadSource = readFileSync(resolve(uiRoot, 'electron/preload.cjs'), 'utf8');

test('Electron keeps context isolation, sandbox, and Node integration disabled', () => {
  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /sandbox:\s*true/);
});

test('preload exposes only the narrow AURA command and snapshot bridge', () => {
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('auraDesktop'/);
  assert.match(preloadSource, /getStatus:\s*\(\)\s*=>/);
  assert.match(preloadSource, /getSnapshot:\s*\(\)\s*=>/);
  assert.match(preloadSource, /startBackend:\s*\(\)\s*=>/);
  assert.match(preloadSource, /stopBackend:\s*\(\)\s*=>/);
  assert.match(preloadSource, /sendCommand:\s*\(command\)\s*=>/);
  assert.doesNotMatch(preloadSource, /backendToken|process\.env|require\(['"]node:/);
  assert.match(preloadSource, /'vision\.start', 'vision\.stop'/);
  assert.doesNotMatch(preloadSource, /camera\.reopen/);
});

test('local backend token is generated in Electron main process and HTTP stays on loopback', () => {
  assert.match(backendClientSource, /randomBytes\(32\)/);
  assert.match(backendClientSource, /hostname:\s*'127\.0\.0\.1'/);
  assert.doesNotMatch(preloadSource, /randomBytes|127\.0\.0\.1/);
});
