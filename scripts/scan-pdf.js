// Reads PDFs the way the browser scan does, in Node, and prints what it found: to see and compare detection changes.
//   node --experimental-strip-types scripts/scan-pdf.ts form.pdf [more.pdf…] [--json]
// Pages come from poppler's pdftoppm, words from the PDF's own text (pdftotext -bbox), like scanForm does for PDFs with text.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sketchToForm } from '../src/scan.js'
import { findShapes, readPage, toSketch } from '../src/scan/vision/index.js'
const LONG_SIDE = 2500
function pgm(file) {
  const buf = readFileSync(file)
  // P5\n<w> <h>\n<max>\n<bytes>
  let i = 0
  const token = () => {
    while (/\s/.test(String.fromCharCode(buf[i]))) i++
    let s = ''
    while (!/\s/.test(String.fromCharCode(buf[i]))) s += String.fromCharCode(buf[i++])
    return s
  }
  if (token() !== 'P5') throw new Error('not a PGM')
  const width = +token()
  const height = +token()
  token()
  i++
  return { width, height, data: new Uint8Array(buf.subarray(i, i + width * height)) }
}
function words(pdf, page, dir, w) {
  const out = join(dir, `w${page}.html`)
  execFileSync('pdftotext', ['-bbox', '-f', String(page), '-l', String(page), pdf, out])
  const html = readFileSync(out, 'utf8')
  const pw = +(/<page width="([\d.]+)"/.exec(html)?.[1] ?? 1)
  const s = w / pw
  const ent = (t) =>
    t
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  return [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({
    x0: +m[1] * s,
    y0: +m[2] * s,
    x1: +m[3] * s,
    y1: +m[4] * s,
    text: ent(m[5]),
    confidence: 99,
  }))
}
export function readPdf(pdf) {
  const dir = mkdtempSync(join(tmpdir(), 'fw-scan-'))
  try {
    const n = +(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))?.[1] ?? 0)
    const pages = []
    for (let p = 1; p <= n; p++) {
      execFileSync('pdftoppm', ['-gray', '-scale-to', String(LONG_SIDE), '-f', String(p), '-l', String(p), '-singlefile', pdf, join(dir, `p${p}`)])
      const gray = pgm(join(dir, `p${p}.pgm`))
      pages.push(readPage(findShapes(gray), words(pdf, p, dir, gray.width)))
    }
    return pages
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** One line per field: the outline people would see in the builder. */
export function outline(schema) {
  const out = []
  const field = (key, f, pad) => {
    const label = typeof f.label === 'string' ? f.label : ''
    const extra =
      f.type === 'choice'
        ? ` [${f.options.map((o) => (typeof o === 'string' ? o : o.value)).join(' | ')}]${f.multiple ? ' many' : ''}`
        : f.type === 'list'
          ? ` rows=${f.rows ? JSON.stringify(f.rows) : `+${f.min ?? 0}`}`
          : ''
    out.push(`${pad}${f.type}${f.widget ? `/${f.widget}` : ''} "${label}"${extra}`)
    if (f.type === 'list' || f.type === 'group') for (const [k, c] of Object.entries(f.fields)) field(k, c, pad + '    ')
  }
  const node = (n, pad) => {
    if (typeof n === 'string') return field(n, schema.fields[n], pad)
    if (n.type === 'content') return out.push(`${pad}— ${n.text}`)
    out.push(`${pad}${n.type === 'section' ? `## ${n.title ?? ''}` : n.type === 'grid' ? `grid ${JSON.stringify(n.cols)}` : n.type}`)
    for (const c of n.children) node(c, pad + '  ')
  }
  for (const n of schema.layout ?? Object.keys(schema.fields)) node(n, '')
  return out.join('\n')
}
if (process.argv[1]?.endsWith('scan-pdf.ts')) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  for (const pdf of files) {
    const { schema, warnings } = sketchToForm(toSketch(readPdf(pdf)))
    console.log(`# ${pdf}  (${Object.keys(schema.fields).length} fields)`)
    console.log(process.argv.includes('--json') ? JSON.stringify(schema, null, 1) : outline(schema))
    if (warnings.length) console.log(warnings.map((w) => `! ${w}`).join('\n'))
  }
}
