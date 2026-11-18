// Forms from photos, scans and PDFs, read on the device: no AI service, no account, nothing uploaded.
// OCR (tesseract.js) reads the printed words; vision.ts finds the lines, boxes and tables and pairs them up.
import type { Imported } from './jsonschema.ts'
import { lint } from './lint.ts'
import type { Field, Fields, FormSchema, Layout } from './schema.ts'
import { erase, findShapes, readPage, toSketch, type Gray, type Item, type Kind, type Word } from './vision.ts'

export type { Sketch, SketchField } from './vision.ts'

export interface ScanOptions {
  /** Tesseract language codes, e.g. ['eng', 'hin']. Default ['eng']. */
  languages?: string[]
  /** pdf.js (pdfjs-dist) with its worker set up, to read PDFs. Without it, only pictures can be read. */
  pdfjs?: typeof import('pdfjs-dist')
  /**
   * Where tesseract.js loads its worker, engine and language files from. By default a public CDN (jsDelivr);
   * serve them yourself to work offline.
   */
  tesseract?: { workerPath?: string; corePath?: string; langPath?: string }
  /** Short messages to show while it works ("Reading page 2 of 3…"). */
  progress?(message: string): void
}

/** Pages are read at this size: big enough for small print, small enough to be quick. */
const LONG_SIDE = 2500
const MAX_PAGES = 50

/** A form from pictures of its pages (photos, scans, screenshots) or a PDF. Runs in the browser. */
export async function scanForm(files: File[], opts: ScanOptions = {}): Promise<Imported> {
  const say = opts.progress ?? (() => {})
  const pages: HTMLCanvasElement[] = []
  for (const file of files) {
    say(`Opening ${file.name}…`)
    pages.push(...(await pictures(file, opts)))
  }
  if (!pages.length) throw new Error('Pick a picture of the form, or a PDF')
  if (pages.length > MAX_PAGES) throw new Error(`At most ${MAX_PAGES} pages at a time`)

  say('Getting the text reader ready… (the first time it downloads its language files)')
  const T = await import('tesseract.js')
  const tesseract = T.default ?? T // a CommonJS package: its exports arrive as `default`
  const worker = await tesseract.createWorker(opts.languages?.length ? opts.languages : ['eng'], tesseract.OEM.LSTM_ONLY, {
    ...opts.tesseract,
  })
  try {
    // forms are mostly scattered words, not paragraphs
    await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
    const read: Item[][] = []
    for (const [i, canvas] of pages.entries()) {
      say(`Reading page ${i + 1} of ${pages.length}…`)
      const gray = toGray(canvas)
      const shapes = findShapes(gray)
      // small print is read better a little larger
      const scale = shapes.em < 18 ? Math.min(2.5, 24 / shapes.em) : 1
      const { data } = await worker.recognize(toCanvas(erase(gray, shapes), scale), {}, { blocks: true })
      const words: Word[] = (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) =>
          p.lines.flatMap((l) =>
            l.words.map((w) => ({ text: w.text, confidence: w.confidence, x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale })),
          ),
        ),
      )
      read.push(readPage(shapes, words))
    }
    return sketchToForm(toSketch(read))
  } finally {
    await worker.terminate()
  }
}

async function pictures(file: File, opts: ScanOptions): Promise<HTMLCanvasElement[]> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (!opts.pdfjs) throw new Error(`${file.name}: reading PDFs needs pdf.js (the pdfjs option)`)
    const task = opts.pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const pdf = await task.promise
    const out: HTMLCanvasElement[] = []
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES + 1); n++) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: LONG_SIDE / Math.max(base.width, base.height) })
      const canvas = blank(Math.round(viewport.width), Math.round(viewport.height))
      await page.render({ canvas, viewport }).promise
      out.push(canvas)
    }
    await task.destroy()
    return out
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: pick a picture or a PDF`)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`${file.name}: this browser can't open the picture; try JPEG or PNG`)
  }
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = blank(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return [canvas]
}

/** A white canvas: transparent parts of a picture must not read as black. */
function blank(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  return canvas
}

function toGray(canvas: HTMLCanvasElement): Gray {
  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height)
  const gray = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  return { data: gray, width: canvas.width, height: canvas.height }
}

function toCanvas(g: Gray, scale: number): HTMLCanvasElement {
  const canvas = blank(g.width, g.height)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(g.width, g.height)
  for (let i = 0; i < g.data.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g.data[i]
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  if (scale === 1) return canvas
  const big = blank(Math.round(g.width * scale), Math.round(g.height * scale))
  big.getContext('2d')!.drawImage(canvas, 0, 0, big.width, big.height)
  return big
}

// ---- outline → schema ----

const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x)
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const words = (x: unknown, max = 200) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const RESERVED = new Set(['context', 'and', 'or', 'not', 'true', 'false', 'null'])

/** A safe, unique key: the given one if usable, else one made from the label, else field1… */
function keyFor(key: unknown, label: string, taken: Set<string>): string {
  const camel = (s: string) =>
    s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 5)
      .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')
  let k = (typeof key === 'string' ? key.replace(/[^A-Za-z0-9_]/g, '') : '').replace(/^[^A-Za-z]+/, '')
  if (!k) k = camel(label).replace(/^[^A-Za-z]+/, '').replace(/^[A-Z]/, (c) => c.toLowerCase())
  if (!k) k = 'field'
  k = k.slice(0, 40)
  if (RESERVED.has(k)) k += '_'
  let out = k === 'field' ? 'field1' : k
  for (let n = 2; taken.has(out); n++) out = k + n
  taken.add(out)
  return out
}

function choices(raw: Record<string, any>): string[] {
  return [...new Set(list(raw.options).map((o) => words(o, 100)).filter(Boolean))].slice(0, 200)
}

function toField(raw: Record<string, any>, at: string, warnings: string[]): Field | undefined {
  const label = words(raw.label).replace(/[\s:：._…-]+$/, '')
  const help = words(raw.help, 500)
  const base = { ...(label ? { label } : {}), ...(help ? { help } : {}) }
  const req = raw.required === true ? { required: true } : {}
  const max = typeof raw.maxLength === 'number' && raw.maxLength > 0 ? { maxLength: Math.round(raw.maxLength) } : {}
  const pick = (multiple: boolean): Field => {
    const options = choices(raw)
    if (options.length < 2) {
      warnings.push(`${at}: fewer than two choices, so it became a text field`)
      return { type: 'string', ...base, ...req }
    }
    return multiple
      ? { type: 'choice', multiple: true, options, ...base, ...req }
      : { type: 'choice', ...(options.length <= 4 ? { widget: 'radio' } : {}), options, ...base, ...req }
  }
  switch (raw.kind as Kind) {
    case 'text': return { type: 'string', ...base, ...req, ...max }
    case 'long_text': return { type: 'string', widget: 'textarea', ...base, ...req }
    case 'number': return { type: 'number', ...base, ...req }
    case 'money': return { type: 'number', format: 'currency', decimals: 2, ...base, ...req }
    case 'date': return { type: 'date', ...base, ...req }
    case 'time': return { type: 'date', format: 'time', ...base, ...req }
    case 'email': return { type: 'string', format: 'email', ...base, ...req }
    case 'phone': return { type: 'string', format: 'phone', ...base, ...req }
    case 'yes_no': return { type: 'choice', widget: 'radio', options: ['Yes', 'No'], ...base, ...req }
    case 'checkbox': return { type: 'boolean', ...base, ...req }
    case 'one_of': return pick(false)
    case 'many_of': return pick(true)
    case 'signature': return { type: 'string', widget: 'signature', ...base, ...req }
    case 'file': return { type: 'file', ...base, ...req }
    case 'table': {
      const fields: Fields = {}
      const taken = new Set<string>()
      for (const c of list(raw.columns)) {
        if (!isObj(c)) continue
        const col = toField({ ...c, required: false, help: '', columns: [] }, `${at} → ${words(c.label) || 'column'}`, warnings)
        if (col && col.type !== 'list') fields[keyFor(c.key, words(c.label), taken)] = col
      }
      if (!Object.keys(fields).length) {
        warnings.push(`${at}: a table without columns was left out`)
        return
      }
      return { type: 'list', widget: 'table', min: 1, ...base, fields }
    }
  }
  warnings.push(`${at}: unknown kind ${JSON.stringify(raw.kind)}, so it became a text field`)
  return { type: 'string', ...base, ...req }
}

/** A formweave schema from a form outline. Anything odd in it is fixed or left out, with a warning. */
export function sketchToForm(sketch: unknown): Imported {
  const warnings: string[] = []
  const s = isObj(sketch) ? sketch : {}
  const fields: Fields = {}
  const layout: Layout[] = []
  const taken = new Set<string>()
  for (const section of list(s.sections).slice(0, 100)) {
    if (!isObj(section)) continue
    const children: string[] = []
    for (const raw of list(section.fields).slice(0, 500)) {
      if (!isObj(raw)) continue
      const label = words(raw.label)
      const f = toField(raw, label || 'a field', warnings)
      if (!f) continue
      const key = keyFor(raw.key, label, taken)
      fields[key] = f
      children.push(key)
    }
    const title = words(section.title)
    if (children.length) layout.push({ type: 'section', ...(title ? { title } : {}), children })
  }
  if (!Object.keys(fields).length) warnings.push('No fields were found')
  const title = words(s.title)
  // one untitled part needs no layout
  const plain = layout.length <= 1 && !layout.some((l) => typeof l === 'object' && l.type === 'section' && l.title)
  const schema: FormSchema = { version: 1, ...(title ? { title } : {}), fields, ...(plain ? {} : { layout }) }
  const issues = lint(schema)
  if (issues.length) throw new Error(`Could not build a valid form: ${issues[0].path}: ${issues[0].message}`)
  return { schema, warnings }
}
