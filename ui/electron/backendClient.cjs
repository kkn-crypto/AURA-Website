const http = require('node:http');
const { spawn: defaultSpawn } = require('node:child_process');

const CAMERA_ENV = [
  'AURA_LEFT_CAMERA', 'AURA_RIGHT_CAMERA', 'AURA_FACE_CAMERA',
  'AURA_CAMERA_WIDTH', 'AURA_CAMERA_HEIGHT', 'AURA_MAX_STEREO_SKEW_S',
  'AURA_MAX_FRAME_AGE_S', 'AURA_FACE_MATCH_THRESHOLD', 'AURA_YUNET_MODEL',
  'AURA_SFACE_MODEL', 'AURA_IDENTITY_DATABASE',
];

function makeChildEnvironment(parent = process.env) {
  const env = {
    PATH: parent.PATH || '/usr/bin:/bin', HOME: parent.HOME, TMPDIR: parent.TMPDIR,
    LANG: parent.LANG, LC_ALL: parent.LC_ALL, PYTHONUNBUFFERED: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  for (const key of CAMERA_ENV) if (typeof parent[key] === 'string') env[key] = parent[key];
  return env;
}

function createBackendClient({
  spawn = defaultSpawn, httpModule = http, executable = process.env.AURA_PYTHON_EXECUTABLE || 'python3',
  script, cwd, env = makeChildEnvironment(), createToken = () => require('node:crypto').randomBytes(32).toString('hex'),
  startupTimeoutMs = 15000, requestTimeoutMs = 5000, readinessRetryMs = 75,
  onState = () => {}, log = () => {},
}) {
  let child = null, port = null, token = null, starting = null, stopping = null;
  let state = { status: 'disconnected', error: null };
  let generation = 0;

  function setState(next) { state = next; onState({ ...state }); }
  function getState() { return { ...state }; }
  function validPort(value) { return Number.isInteger(value) && value > 0 && value <= 65535; }

  function request(method, route, body, timeoutMs = requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      if (!port || !token) return reject(new Error('Python backend is disconnected'));
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = httpModule.request({ hostname: '127.0.0.1', port, path: route, method, timeout: timeoutMs,
        headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) } }, (res) => {
        const chunks = []; let length = 0;
        res.on('data', (chunk) => { length += chunk.length; if (length > 12 * 1024 * 1024) req.destroy(new Error('Backend response too large')); else chunks.push(chunk); });
        res.on('end', () => {
          let result;
          try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { return reject(new Error(`Backend returned invalid JSON (HTTP ${res.statusCode})`)); }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = result?.error_info?.message || result?.error || `Backend returned HTTP ${res.statusCode}`;
            const error = new Error(message);
            error.statusCode = res.statusCode;
            return reject(error);
          }
          resolve(result);
        });
      });
      req.on('timeout', () => req.destroy(new Error(`Python backend request timed out after ${timeoutMs} ms`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  function childExited(instance, code, signal, stderr) {
    if (child !== instance) return;
    child = null; port = null; token = null;
    const message = `Python backend exited (${code ?? signal ?? 'unknown'})${stderr ? `: ${stderr.slice(-800).trim()}` : ''}`;
    if (state.status !== 'stopping' && state.status !== 'disconnected') setState({ status: 'error', error: message });
    else setState({ status: 'disconnected', error: null });
  }

  async function startBackend() {
    if (state.status === 'connected' && child && port && token) return getState();
    if (starting) return starting;
    if (child) await stopBackend();
    const ownGeneration = ++generation;
    setState({ status: 'starting', error: null });
    token = createToken();
    let instance;
    try {
      instance = spawn(executable, [script, '--port', '0', '--token', token], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    } catch (error) {
      token = null;
      setState({ status: 'error', error: `Could not launch Python backend with ${executable}: ${error.message}` });
      log(`Python backend spawn failed: ${error.stack || error.message}`);
      throw new Error(state.error);
    }
    child = instance;
    starting = new Promise((resolve, reject) => {
      let stdout = '', stderr = '', settled = false;
      const deadline = Date.now() + startupTimeoutMs;
      let retryTimer;
      const finishError = (error) => {
        if (settled) return;
        settled = true; clearTimeout(deadlineTimer); clearTimeout(retryTimer);
        log(`Backend startup failed: ${error.message}${stderr ? `\n${stderr.slice(-4000)}` : ''}`);
        if (child === instance) { setState({ status: 'error', error: error.message }); instance.kill('SIGTERM'); }
        reject(error);
      };
      const deadlineTimer = setTimeout(() => finishError(new Error(`Timed out waiting for authenticated backend readiness${stderr ? `: ${stderr.slice(-800).trim()}` : ''}`)), startupTimeoutMs);
      const probe = async () => {
        if (settled || ownGeneration !== generation) return finishError(new Error('Backend startup was cancelled'));
        if (Date.now() >= deadline) return finishError(new Error('Timed out waiting for authenticated backend readiness'));
        if (port) {
          try {
            const snapshot = await request('GET', '/api/snapshot', undefined, Math.min(1000, requestTimeoutMs));
            if (snapshot?.api_schema_version !== 1 || snapshot?.backend?.status !== 'running') throw new Error('Backend readiness response did not contain a running AURA snapshot');
            if (!settled) { settled = true; clearTimeout(deadlineTimer); setState({ status: 'connected', error: null }); resolve(getState()); }
            return;
          } catch (error) {
            if ((error.statusCode >= 400 && error.statusCode < 500) || /invalid JSON|readiness response/.test(error.message)) return finishError(new Error(`Backend readiness check failed: ${error.message}`));
          }
        }
        retryTimer = setTimeout(probe, readinessRetryMs);
      };
      instance.stdout.on('data', (chunk) => {
        stdout = `${stdout}${chunk.toString()}`.slice(-8000);
        const match = stdout.match(/(?:^|\n)READY_PORT=(\d+)(?:\r?\n|$)/);
        if (match) {
          const candidate = Number(match[1]);
          if (!validPort(candidate)) return finishError(new Error(`Python backend announced an invalid port: ${match[1]}`));
          if (port && port !== candidate) return finishError(new Error('Python backend announced conflicting ports'));
          port = candidate;
          probe();
        }
      });
      instance.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-4000); log(chunk.toString().trim()); });
      instance.once('error', finishError);
      instance.once('exit', (code, signal) => {
        const error = new Error(`Python backend exited before readiness (${code ?? signal ?? 'unknown'})${stderr ? `: ${stderr.slice(-800).trim()}` : ''}`);
        if (!settled) finishError(error);
        childExited(instance, code, signal, stderr);
      });
    }).finally(() => { starting = null; });
    return starting;
  }

  async function stopBackend() {
    if (stopping) return stopping;
    ++generation;
    const instance = child;
    if (!instance) { port = null; token = null; setState({ status: 'disconnected', error: null }); return getState(); }
    setState({ status: 'stopping', error: null });
    stopping = new Promise((resolve) => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearTimeout(forceTimer); if (child === instance) { child = null; port = null; token = null; } setState({ status: 'disconnected', error: null }); resolve(getState()); };
      instance.once('exit', finish);
      const forceTimer = setTimeout(() => { instance.kill('SIGKILL'); finish(); }, 3000);
      instance.kill('SIGTERM');
    }).finally(() => { stopping = null; });
    return stopping;
  }

  async function requestBackend(method, route, body) {
    try {
      const result = await request(method, route, body);
      if (child && state.status !== 'stopping') setState({ status: 'connected', error: null });
      return result;
    } catch (error) {
      if (child && state.status !== 'stopping') setState({ status: 'error', error: error.message });
      log(`Backend ${method} ${route} failed: ${error.message}`);
      throw error;
    }
  }

  return {
    getState,
    startBackend,
    stopBackend,
    requestBackend,
    async snapshot() { return requestBackend('GET', '/api/snapshot'); },
    async command(command) { return (await requestBackend('POST', '/api/command', command)).snapshot; },
  };
}

module.exports = { CAMERA_ENV, makeChildEnvironment, createBackendClient };
