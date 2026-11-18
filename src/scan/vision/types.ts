// What reading a page works with and gives back: pixels, shapes, words, and the sketch of a form.

export interface Gray {
  /** 0 = black … 255 = white, row by row */
  data: Uint8Array
  width: number
  height: number
}
/** Pixels; x1 and y1 are exclusive. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface Word extends Rect {
  text: string
  /** 0–100, as OCR reports it */
  confidence: number
}
/** A drawn rectangle. `cols` and `rows` are its inner lines: a table, or boxes for one character each. */
export interface Frame extends Rect {
  cols: number[]
  rows: number[]
  /** Another part of the same drawn frame follows right below: this part's words may be its title. */
  next?: boolean
}
export interface Shapes {
  width: number
  height: number
  /** typical text height in pixels */
  em: number
  /** lines to write on: solid, dashed, dotted or typed underscores */
  rules: Rect[]
  /** small square boxes to tick */
  ticks: Rect[]
  frames: Frame[]
  /** 1 on every pixel of these shapes (a little wider), to clear before OCR */
  mask: Uint8Array
}

export type Kind =
  | 'text'
  | 'long_text'
  | 'number'
  | 'money'
  | 'date'
  | 'time'
  | 'email'
  | 'phone'
  | 'yes_no'
  | 'checkbox'
  | 'one_of'
  | 'many_of'
  | 'signature'
  | 'file'
  | 'table'
export type ColumnKind = 'text' | 'long_text' | 'number' | 'money' | 'date' | 'yes_no' | 'one_of' | 'checkbox'
export interface SketchColumn {
  key: string
  label: string
  kind: ColumnKind
  options: string[]
  /** The whole printed heading, when the label is cut short */
  full?: string
  /** Choices to pick from, but typed answers are fine too (some rows ask for a value, some for Yes/No) */
  free?: boolean
}
/** One thing the form asks for. */
export interface SketchField {
  key: string
  label: string
  kind: Kind
  required: boolean
  help: string
  options: string[]
  columns: SketchColumn[]
  maxLength?: number
  /** For a table: fixed rows, one per text (what the first column of a question table said). */
  rows?: string[]
  /** For a table: rows shown at the start. */
  minRows?: number
  /** For fixed rows: the heading over their column. */
  rowHeading?: string
  /** Fields with the same number were printed side by side on one line. */
  line?: number
  /** For boxes to tick in rows and columns: how many options a row had. */
  perRow?: number
}
/** A form's outline: what scanning finds, before it becomes a formweave schema. */
export interface Sketch {
  title: string
  sections: { title: string; fields: SketchField[] }[]
  /** Lines or boxes left out because nothing printed said what they are for. */
  skipped?: number
}
/** What a page holds, in reading order. */
export type Item = { at: Rect; heading: string } | { at: Rect; field: SketchField }

export interface Comp extends Rect {
  id: number
  /** ink pixels */
  n: number
}

// ---- shapes ----

export type Own = (x: number, y: number) => boolean

export interface Chain extends Rect {
  yc: number
  ink: number
  parts: Comp[]
}

export interface Phrase extends Rect {
  text: string
  words: Word[]
  used: boolean
}
