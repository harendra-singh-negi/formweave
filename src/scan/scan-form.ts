// Forms from photos, scans and PDFs, read on the device: no AI service, no account, nothing uploaded.
// OCR (tesseract.js) reads the printed words; ./vision finds the lines, boxes and tables and pairs them up.
import type { Imported } from '../core/jsonschema.ts'
import { erase, findShapes, readPage, toSketch, type Gray, type Item, type Word } from './vision/index.ts'
import { sketchToForm, words } from './sketch-to-form.ts'

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
export const LONG_SIDE = 2500
export const MAX_PAGES = 50

/** A form from pictures of its pages (photos, scans, screenshots) or a PDF. Runs in the browser. */
export async function scanForm(files: File[], opts: ScanOptions = {}): Promise<Imported> {
  const say = opts.progress ?? (() => {})
  const pages: Page[] = []
  for (const file of files) {
    say(`Opening ${file.name}…`)
    pages.push(...(await pictures(file, opts)))
  }
  if (!pages.length) throw new Error('Pick a picture of the form, or a PDF')
  if (pages.length > MAX_PAGES) throw new Error(`At most ${MAX_PAGES} pages at a time`)

  // a PDF made on a computer carries its words: read those, exactly and at once; OCR only the pages without them
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined
  let tesseract: typeof import('tesseract.js') | undefined
  if (pages.some((p) => !p.words)) {
    say('Getting the text reader ready… (the first time it downloads its language files)')
    const T = await import('tesseract.js')
    tesseract = (T.default ?? T) as typeof import('tesseract.js') // a CommonJS package: its exports arrive as `default`
    worker = await tesseract.createWorker(opts.languages?.length ? opts.languages : ['eng'], tesseract.OEM.LSTM_ONLY, { ...opts.tesseract })
    // forms are mostly scattered words, not paragraphs
    await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
  }
  try {
    const read: Item[][] = []
    for (const [i, { canvas, words: own }] of pages.entries()) {
      say(`Reading page ${i + 1} of ${pages.length}…`)
      const gray = toGray(canvas)
      const shapes = findShapes(gray)
      if (own) {
        read.push(readPage(shapes, own))
        continue
      }
      // small print is read better a little larger
      const scale = shapes.em < 18 ? Math.min(2.5, 24 / shapes.em) : 1
      const { data } = await worker!.recognize(toCanvas(erase(gray, shapes), scale), {}, { blocks: true })
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
    await worker?.terminate()
  }
}

/** A page to read: its picture, and its words when the PDF has them. */
export interface Page {
  canvas: HTMLCanvasElement
  words?: Word[]
}

/** The words a PDF page carries, in the canvas's pixels. Undefined for a scanned page (no text, or almost none). */
export async function pdfWords(page: import('pdfjs-dist').PDFPageProxy, viewport: import('pdfjs-dist').PageViewport, pdfjs: typeof import('pdfjs-dist')): Promise<Word[] | undefined> {
  const { items } = await page.getTextContent()
  const out: Word[] = []
  for (const it of items) {
    if (!('str' in it) || !it.str.trim()) continue
    const t = pdfjs.Util.transform(viewport.transform, it.transform)
    const size = Math.hypot(t[2], t[3])
    if (!size || Math.abs(t[1]) > 0.1 * size) continue // turned text (a stamp, a margin note)
    const width = it.width * viewport.scale
    // a run of text holds several words: share its width out by characters
    const per = width / Math.max(1, it.str.length)
    let x = t[4]
    for (const part of it.str.split(/(\s+)/)) {
      if (part.trim()) out.push({ text: part, confidence: 99, x0: x, x1: x + per * part.length, y0: t[5] - size * 0.85, y1: t[5] + size * 0.2 })
      x += per * part.length
    }
  }
  return out.filter((w) => /\p{L}/u.test(w.text)).length >= 5 ? out : undefined
}

export async function pictures(file: File, opts: ScanOptions): Promise<Page[]> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (!opts.pdfjs) throw new Error(`${file.name}: reading PDFs needs pdf.js (the pdfjs option)`)
    const task = opts.pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const pdf = await task.promise
    const out: Page[] = []
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES + 1); n++) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: LONG_SIDE / Math.max(base.width, base.height) })
      const canvas = blank(Math.round(viewport.width), Math.round(viewport.height))
      await page.render({ canvas, viewport }).promise
      out.push({ canvas, words: await pdfWords(page, viewport, opts.pdfjs).catch(() => undefined) })
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
  return [{ canvas }]
}

/** A white canvas: transparent parts of a picture must not read as black. */
export function blank(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  return canvas
}

export function toGray(canvas: HTMLCanvasElement): Gray {
  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height)
  const gray = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  return { data: gray, width: canvas.width, height: canvas.height }
}

export function toCanvas(g: Gray, scale: number): HTMLCanvasElement {
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
