// Records the demo walkthrough as docs/demo.gif for the README.
//   npm run demo:gif   (needs ffmpeg; starts its own demo server)
import { chromium } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 5191
const URL = `http://127.0.0.1:${PORT}/`
const W = 1280
const H = 800
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => process.kill(-server.pid)
for (let i = 0; ; i++) {
  try {
    if ((await fetch(URL)).ok) break
  } catch {}
  if (i > 100) throw new Error('demo server did not start')
  await new Promise((r) => setTimeout(r, 200))
}

const dir = mkdtempSync(join(tmpdir(), 'fw-rec-'))
const browser = await chromium.launch()
try {
  // Clear saved state first, off camera.
  const pre = await browser.newPage()
  await pre.goto(URL)
  await pre.evaluate(() => localStorage.clear())
  await pre.close()

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'light', recordVideo: { dir, size: { width: W, height: H } } })
  const page = await ctx.newPage()
  // Video has no mouse pointer: draw one.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div')
      c.style.cssText =
        'position:fixed;z-index:99999;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(9,105,218,.35);border:2px solid #0969da;pointer-events:none;transition:transform .1s'
      document.body.append(c)
      addEventListener('mousemove', (e) => (c.style.left = e.clientX + 'px') && (c.style.top = e.clientY + 'px'), true)
      addEventListener('dragover', (e) => (c.style.left = e.clientX + 'px') && (c.style.top = e.clientY + 'px'), true)
      addEventListener('mousedown', () => (c.style.transform = 'scale(.7)'), true)
      addEventListener('mouseup', () => (c.style.transform = ''), true)
    })
  })
  const wait = (ms) => page.waitForTimeout(ms)
  const moveTo = async (loc) => {
    const b = await loc.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 })
  }
  const click = async (loc) => {
    await moveTo(loc)
    await wait(150)
    await loc.click()
  }
  const type = async (loc, text) => {
    await click(loc)
    await loc.pressSequentially(text, { delay: 55 })
  }

  await page.goto(URL + '#builder')
  await page.locator('.fw-b-canvas form').waitFor()
  await page.mouse.move(W / 2, H / 2)
  await wait(1200)

  // Builder: add an input from the palette by dragging it.
  await type(page.locator('.fw-b-find'), 'long text')
  const item = page.locator('.fw-b-palette .fw-b-group button', { hasText: 'Long text' })
  await moveTo(item)
  await wait(300)
  await item.dragTo(page.locator('.fw-b-canvas [data-fw-path="phone"]').first())
  await page.mouse.move(W / 2, H / 2, { steps: 15 })
  await wait(900)

  // Pick a field and rename it.
  const email = page.locator('.fw-b-canvas [data-fw-path="email"]').first()
  await click(email)
  await wait(500)
  const label = page.locator('.fw-b-settings input[id$="label"]').first()
  await click(label)
  await label.fill('')
  await label.pressSequentially('Work email', { delay: 60 })
  await wait(800)

  // Restyle: accent colour and corners.
  await moveTo(page.locator('#accent'))
  await page.locator('#accent').fill('#8250df')
  await wait(500)
  await click(page.locator('#radius'))
  await page.locator('#radius').selectOption('14px')
  await wait(1000)

  // Fill it in.
  await click(page.locator('nav a[href="#fill"]'))
  const form = page.locator('#fill form')
  await form.waitFor()
  await wait(700)
  await type(form.getByLabel('Full name'), 'Asha Verma')
  await type(form.getByLabel('Work email'), 'asha@example.com')
  await wait(300)
  await click(form.getByRole('button', { name: 'Next' }))
  await wait(600)
  await click(form.getByRole('radio', { name: 'Self Employed' }))
  await wait(500)
  await type(form.getByLabel('Business name'), 'Verma Bakery')
  await type(form.getByLabel('GSTIN'), '22AAAAA0000A1Z5')
  await click(form.getByRole('button', { name: 'Next' }))
  await wait(600)
  await type(form.locator('input[id$="items.0.item"]'), 'Cake')
  await type(form.locator('input[id$="items.0.qty"]'), '3')
  await type(form.locator('input[id$="items.0.price"]'), '450')
  await wait(900)
  await click(form.getByRole('switch'))
  await wait(400)
  await click(form.getByRole('button', { name: 'Submit' }))
  await moveTo(page.locator('#sent'))
  await wait(2500)

  await ctx.close()
} finally {
  await browser.close()
  stop()
}

const video = join(
  dir,
  readdirSync(dir).find((f) => f.endsWith('.webm')),
)
mkdirSync('docs', { recursive: true })
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    '1',
    '-i',
    video,
    '-vf',
    'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    'docs/demo.gif',
  ],
  { stdio: 'inherit' },
)
rmSync(dir, { recursive: true, force: true })
console.log('docs/demo.gif')
