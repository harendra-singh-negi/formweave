// An outline of a form (from scanning, or any source) turned into a schema that passes lint().
import type { Imported } from '../core/jsonschema.ts'
import { lint } from '../core/lint.ts'
import type { Field, Fields, FormSchema, Layout } from '../core/schema.ts'
import type { Kind } from './vision/index.ts'

export const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x)
export const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
export const words = (x: unknown, max = 200) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '')
export const RESERVED = new Set(['context', 'and', 'or', 'not', 'true', 'false', 'null'])

/** A safe, unique key: the given one if usable, else one made from the label, else field1… */
export function keyFor(key: unknown, label: string, taken: Set<string>): string {
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

export function choices(raw: Record<string, any>): string[] {
  return [...new Set(list(raw.options).map((o) => words(o, 100)).filter(Boolean))].slice(0, 200)
}

export function toField(raw: Record<string, any>, at: string, warnings: string[]): Field | undefined {
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
    // short answers side by side (1 2 3 4 5 N/S, Y N): buttons, as on paper and easy in a table row
    const short = options.length <= 7 && options.every((o) => o.length <= 4)
    // laid out on paper in rows and columns: keep the columns
    const cols = typeof raw.perRow === 'number' && raw.perRow >= 1 && raw.perRow <= 6 && options.length > raw.perRow ? { columns: Math.round(raw.perRow) } : {}
    return multiple
      ? { type: 'choice', multiple: true, options, ...cols, ...base, ...req }
      : { type: 'choice', ...(short ? { widget: 'buttons' } : options.length <= 4 || cols.columns ? { widget: 'radio' } : {}), options, ...cols, ...base, ...req }
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
        if (col && col.type === 'choice' && c.free === true) Object.assign(col, { widget: 'autocomplete', allowOther: true })
        if (col && col.type !== 'list') fields[keyFor(c.key, words(c.label), taken)] = col
      }
      if (!Object.keys(fields).length) {
        warnings.push(`${at}: a table without columns was left out`)
        return
      }
      const rows = list(raw.rows).map((r) => words(r, 200)).filter(Boolean).slice(0, 200)
      if (rows.length >= 2) {
        const rowHeading = words(raw.rowHeading)
        // a question per row answered from one short scale (Yes / No, Poor … Excellent): a matrix, as on paper
        const first = Object.values(fields)[0]
        const matrix = first.type === 'choice' && !first.multiple && !first.allowOther && first.options.length >= 2 && first.options.length <= 7
        return { type: 'list', widget: matrix ? 'matrix' : 'table', ...base, rows, ...(rowHeading ? { rowHeading } : {}), fields }
      }
      // as many rows to start with as the paper had, without making them all required
      const start = typeof raw.minRows === 'number' && raw.minRows > 1 ? Math.min(50, Math.round(raw.minRows)) : 1
      return { type: 'list', widget: 'table', min: 1, ...base, ...(start > 1 ? { default: Array.from({ length: start }, () => ({})) } : {}), fields }
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
    const children: Layout[] = []
    let row: { line: unknown; keys: string[] } = { line: undefined, keys: [] }
    // fields printed side by side on a line stay side by side: a grid of them (one column on a phone)
    const flush = () => {
      if (row.keys.length >= 2 && row.keys.length <= 4) children.push({ type: 'grid', cols: { base: 1, md: row.keys.length }, children: row.keys })
      else children.push(...row.keys)
      row = { line: undefined, keys: [] }
    }
    for (const raw of list(section.fields).slice(0, 500)) {
      if (!isObj(raw)) continue
      const label = words(raw.label)
      const f = toField(raw, label || 'a field', warnings)
      if (!f) continue
      const key = keyFor(raw.key, label, taken)
      fields[key] = f
      const side = typeof raw.line === 'number' && f.type !== 'list' && f.type !== 'group'
      if (!side || raw.line !== row.line) flush()
      row.line = side ? raw.line : undefined
      row.keys.push(key)
      if (!side) flush()
    }
    flush()
    const title = words(section.title)
    if (children.length) layout.push({ type: 'section', ...(title ? { title } : {}), children })
  }
  if (!Object.keys(fields).length) warnings.push('No fields were found')
  if (typeof s.skipped === 'number' && s.skipped > 0) warnings.push(`${s.skipped} lines or boxes had no words saying what they are for, so they were left out`)
  const title = words(s.title)
  // one untitled part needs no layout
  const plain = layout.length <= 1 && !layout.some((l) => typeof l === 'object' && l.type === 'section' && (l.title || l.children.some((c) => typeof c === 'object')))
  const schema: FormSchema = { version: 1, ...(title ? { title } : {}), fields, ...(plain ? {} : { layout }) }
  const issues = lint(schema)
  if (issues.length) throw new Error(`Could not build a valid form: ${issues[0].path}: ${issues[0].message}`)
  return { schema, warnings }
}
