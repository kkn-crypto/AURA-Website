const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { createBackendClient, makeChildEnvironment } = require('./backendClient.cjs');

class FakeChild extends EventEmitter {
  constructor() {
    super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter(); this.kills = [];
  }
  kill(signal) { this.kills.push(signal); queueMicrotask(() => this.emit('exit', 0, signal)); return true; }
}

function snapshot() {
  return { api_schema_version: 1, backend: { status: 'running' }, vision: { face: { status: 'unavailable' } } };
}

async function localServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

function fixture({ startupTimeoutMs = 500, requestTimeoutMs = 100, handler, config = {} } = {}) {
  let child, spawnArgs, spawnOptions;
  const spawn = (...args) => { spawnArgs = args; spawnOptions = args[2]; child = new FakeChild(); return child; };
  const client = createBackendClient({ spawn, script: '/app/backend/server.py', cwd: '/app', startupTimeoutMs, requestTimeoutMs, readinessRetryMs: 10, createToken: () => 'x'.repeat(64), log: () => {}, ...config });
  return { client, get child() { return child; }, get spawnArgs() { return spawnArgs; }, get spawnOptions() { return spawnOptions; } };
}

async function announceAndConnect(fx, server) {
  fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  return fx.client.startBackend();
}

test('waits for a valid authenticated readiness snapshot and uses configured cwd/interpreter', async (t) => {
  const server = await localServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${'x'.repeat(64)}`);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot()));
  }); t.after(server.close);
  const fx = fixture({ config: { executable: '/app/.venv/bin/python', env: makeChildEnvironment({ PATH: '/bin', AURA_LEFT_CAMERA: '1', AURA_RIGHT_CAMERA: '0', AURA_FACE_CAMERA: '1' }) } });
  const pending = fx.client.startBackend();
  assert.equal(fx.client.getState().status, 'starting');
  fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  assert.deepEqual(await pending, { status: 'connected', error: null });
  assert.equal(fx.spawnArgs[0], '/app/.venv/bin/python');
  assert.equal(fx.spawnOptions.cwd, '/app');
  assert.deepEqual([fx.spawnOptions.env.AURA_LEFT_CAMERA, fx.spawnOptions.env.AURA_RIGHT_CAMERA, fx.spawnOptions.env.AURA_FACE_CAMERA], ['1', '0', '1']);
  await fx.client.stopBackend();
  assert.equal(fx.client.getState().status, 'disconnected');
});

test('startup failure and missing or invalid readiness port fail closed', async (t) => {
  const launchFailure = createBackendClient({ spawn: () => { throw new Error('executable not found'); }, script: '/app/backend/server.py', cwd: '/app', log: () => {} });
  await assert.rejects(launchFailure.startBackend(), /executable not found/);
  assert.equal(launchFailure.getState().status, 'error');

  const fx = fixture({ startupTimeoutMs: 100 });
  const pending = fx.client.startBackend();
  fx.child.stderr.emit('data', Buffer.from('ModuleNotFoundError: cv2'));
  fx.child.emit('exit', 1, null);
  await assert.rejects(pending, /cv2|exited before readiness/i);
  assert.equal(fx.client.getState().status, 'error');

  const missing = fixture({ startupTimeoutMs: 50 });
  const waiting = missing.client.startBackend();
  await assert.rejects(waiting, /Timed out waiting for authenticated backend readiness/);
  assert.equal(missing.client.getState().status, 'error');

  const invalid = fixture();
  const invalidStart = invalid.client.startBackend();
  invalid.child.stdout.emit('data', Buffer.from('READY_PORT=70000\n'));
  await assert.rejects(invalidStart, /invalid port/);
});

test('does not mark a child ready when port or bearer token is wrong', async (t) => {
  const server = await localServer((_req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error_info: { message: 'unauthorized' } })); }); t.after(server.close);
  const fx = fixture();
  const pending = fx.client.startBackend();
  fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  await assert.rejects(pending, /unauthorized/i);
  assert.equal(fx.client.getState().status, 'error');
});

test('authenticated readiness can become available after a slow backend initialization', async (t) => {
  let ready = false;
  const server = await localServer((_req, res) => {
    if (!ready) { res.writeHead(503); res.end(JSON.stringify({ error: 'starting' })); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot()));
  }); t.after(server.close);
  const fx = fixture({ startupTimeoutMs: 1000 });
  const pending = fx.client.startBackend();
  fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  setTimeout(() => { ready = true; }, 50);
  assert.equal((await pending).status, 'connected');
  await fx.client.stopBackend();
});

test('request timeout and ECONNRESET mark connection unhealthy; a later snapshot recovers it', async (t) => {
  let slow = true, reset = false;
  const server = await localServer((req, res) => {
    if (req.url === '/reset' && reset) { req.socket.destroy(); return; }
    if (req.url === '/slow' && slow) { setTimeout(() => { if (!res.destroyed) { res.writeHead(200); res.end('{}'); } }, 150); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot()));
  }); t.after(server.close);
  const fx = fixture({ requestTimeoutMs: 40 });
  const pending = fx.client.startBackend(); fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`)); await pending;
  await assert.rejects(fx.client.requestBackend('POST', '/slow', { type: 'mock-command' }), /timed out/i);
  assert.equal(fx.client.getState().status, 'error');
  slow = false;
  await fx.client.snapshot();
  assert.equal(fx.client.getState().status, 'connected');
  reset = true;
  await assert.rejects(fx.client.requestBackend('GET', '/reset'), /reset|socket|hang up/i);
  assert.equal(fx.client.getState().status, 'error');
  reset = false;
  await fx.client.snapshot();
  assert.equal(fx.client.getState().status, 'connected');
  await fx.client.stopBackend();
});

test('deduplicates concurrent starts and shutdown restores disconnected state', async (t) => {
  const server = await localServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot())); }); t.after(server.close);
  const fx = fixture();
  const first = fx.client.startBackend(), second = fx.client.startBackend();
  assert.equal(fx.spawnArgs.length > 0, true);
  fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  await Promise.all([first, second]);
  await fx.client.stopBackend();
  assert.equal(fx.client.getState().status, 'disconnected');
  assert.deepEqual(fx.child.kills, ['SIGTERM']);
});

test('backend process exit clears connection data and allows a clean restart', async (t) => {
  const server = await localServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot())); }); t.after(server.close);
  const fx = fixture();
  const firstStart = fx.client.startBackend();
  const firstChild = fx.child;
  firstChild.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  await firstStart;
  firstChild.emit('exit', 3, null);
  assert.equal(fx.client.getState().status, 'error');
  const restart = fx.client.startBackend();
  assert.notEqual(fx.child, firstChild);
  fx.child.stdout.emit('data', Buffer.from(`READY_PORT=${server.port}\n`));
  assert.equal((await restart).status, 'connected');
  await fx.client.stopBackend();
});

test('child environment only forwards explicit AURA camera configuration', () => {
  const env = makeChildEnvironment({ PATH: '/bin', AURA_LEFT_CAMERA: '1', AURA_RIGHT_CAMERA: '0', AURA_FACE_CAMERA: '1', SECRET_VALUE: 'omit' });
  assert.deepEqual([env.AURA_LEFT_CAMERA, env.AURA_RIGHT_CAMERA, env.AURA_FACE_CAMERA], ['1', '0', '1']);
  assert.equal(env.SECRET_VALUE, undefined);
});
