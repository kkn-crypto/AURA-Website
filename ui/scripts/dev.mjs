import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const portServer = net.createServer();
await new Promise((resolve, reject) => {
  portServer.once('error', reject);
  portServer.listen(0, '127.0.0.1', resolve);
});
const { port } = portServer.address();
await new Promise((resolve) => portServer.close(resolve));
const url = `http://127.0.0.1:${port}`;
const viteCli = new URL('../node_modules/vite/bin/vite.js', import.meta.url);
const vite = spawn(process.execPath, [viteCli.pathname, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, AURA_UI_PORT: String(port) },
});
let electron;
let viteExited = false;
vite.on('exit', () => { viteExited = true; });

async function stop() {
  vite.kill('SIGTERM');
  electron?.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const response = await fetch(url);
    if (response.ok) break;
  } catch {}
  if (viteExited) process.exit(1);
  await delay(250);
}

if (viteExited) process.exit(1);
electron = spawn('node_modules/.bin/electron', ['.'], {
  stdio: 'inherit',
  env: { ...process.env, AURA_DEV_SERVER_URL: url },
});

electron.on('exit', (code) => {
  vite.kill('SIGTERM');
  process.exit(code ?? 0);
});
