// npm run test:e2e: the builder and forms in a real browser. Starts its own demo server on a spare port.
import { defineConfig, devices } from '@playwright/test'

const PORT = 5190
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}`, reuseExistingServer: false, timeout: 60_000 },
})
