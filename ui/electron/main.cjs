const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createBackendClient } = require('./backendClient.cjs');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

const projectRoot = path.resolve(__dirname, '..', '..');
const backendScript = path.join(projectRoot, 'backend', 'server.py');
const devUrl = process.env.AURA_DEV_SERVER_URL || null;
let mainWindow;
let isQuitting = false;

const backend = createBackendClient({
  script: backendScript,
  cwd: projectRoot,
  onState: (state) => { backendState = state; },
  log: (message) => console.error(`[AURA backend] ${message}`),
});
let backendState = backend.getState();

function makeWindow() {
  const useDevServer = Boolean(devUrl) && !app.isPackaged;
  mainWindow = new BrowserWindow({
    width: 1512,
    height: 960,
    minWidth: 800,
    minHeight: 620,
    title: 'AURA Control Room',
    backgroundColor: '#0a0c0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    const expected = useDevServer ? devUrl : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
    if (!target.startsWith(expected)) event.preventDefault();
  });
  if (useDevServer) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function assertTrustedFrame(event) {
  const frameUrl = event.senderFrame?.url || '';
  const valid = !devUrl || app.isPackaged
    ? frameUrl.startsWith('file://') && frameUrl.includes('/ui/dist/index.html')
    : frameUrl.startsWith(devUrl);
  if (!valid || event.sender !== mainWindow?.webContents) throw new Error('Untrusted renderer');
}

function validateIpcCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new TypeError('Command must be an object');
  const allowed = new Set(['motion.start', 'motion.stop', 'tracking.set', 'recognition.set', 'vision.start', 'vision.stop', 'pan_tilt.reset', 'pan_tilt.nudge']);
  if (!allowed.has(command.type)) throw new TypeError('Unsupported command');
  const keys = Object.keys(command).sort().join(',');
  if (command.type === 'pan_tilt.nudge') {
    if (keys !== 'axis,direction,type' || !['pan', 'tilt'].includes(command.axis) || ![-1, 1].includes(command.direction)) throw new TypeError('Invalid pan/tilt command');
  } else if (command.type.endsWith('.set')) {
    if (keys !== 'enabled,type' || typeof command.enabled !== 'boolean') throw new TypeError('Invalid toggle command');
  } else if (keys !== 'type') throw new TypeError('Unexpected command fields');
  return command;
}

function stopBackend() { return backend.stopBackend(); }
function startBackend() { return backend.startBackend(); }

const ipc = (channel, handler) => ipcMain.handle(channel, async (event, ...args) => {
  assertTrustedFrame(event);
  return handler(...args);
});

ipc('aura:status', () => backendState);
ipc('aura:start', () => startBackend());
ipc('aura:stop', () => stopBackend());
ipc('aura:snapshot', async () => {
  if (backendState.status === 'disconnected' || backendState.status === 'stopping') return { connection: backendState, snapshot: null };
  try {
    const snapshot = await backend.snapshot();
    return { connection: backend.getState(), snapshot };
  } catch (error) {
    backendState = backend.getState();
    return { connection: backendState, snapshot: null };
  }
});
ipc('aura:command', async (command) => {
  const valid = validateIpcCommand(command);
  if (backendState.status !== 'connected') throw new Error(backendState.error || 'Connect the Python backend before sending live commands');
  try { return await backend.command(valid); }
  catch (error) { backendState = backend.getState(); throw error; }
});

app.whenReady().then(() => {
  if (hasSingleInstanceLock) makeWindow();
  else app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) makeWindow(); });
app.on('window-all-closed', () => {
  stopBackend().finally(() => { if (process.platform !== 'darwin') app.quit(); });
});
app.on('before-quit', (event) => {
  if (isQuitting) return;
  isQuitting = true;
  if (backendState.status !== 'disconnected') {
    event.preventDefault();
    stopBackend().finally(() => app.quit());
  }
});
