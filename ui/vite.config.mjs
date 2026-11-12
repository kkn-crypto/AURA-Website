import { defineConfig } from 'vite';
export default defineConfig({
  clearScreen: false,
  server: { host: '127.0.0.1', port: Number(process.env.AURA_UI_PORT || 5178), strictPort: true },
});
