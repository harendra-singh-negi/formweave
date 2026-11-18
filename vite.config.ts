import { defineConfig } from 'vite'

// npm run demo: the demo app, served straight from src/ with live reload, on this computer only.
export default defineConfig({
  root: 'demo',
  server: { host: '127.0.0.1', port: 5180 },
})
