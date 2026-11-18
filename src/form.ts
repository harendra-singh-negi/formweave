import { empty, evaluate, parse, round, str, truthy, numeric, type Get, type Node } from './expr.ts'
import { lint, type Issue } from './lint.ts'
import {
  DATE_FORMATS, STRING_FORMATS,
  type Errors, type Field, type FieldError, type Fields, type FileRef, type FormSchema, type Layout, type ListField, type StringField, type Text, type Values, type When,
} from './schema.ts'
import { DIAL } from './countries.ts'

export interface Options {
  /** What formulas read as `context.x`: role, today's date, user id… */
  context?: Record<string, unknown>
  /** Your own checks, named in a field's `validators`. Return an error message, or nothing. */
  validators?: Record<string, Validator>
  /** For labels and messages given per locale. */
  locale?: string
}

export type Validator = (value: unknown, info: { path: string; values: Values; context: unknown }) => string | null | undefined | void

export interface Result {
  ok: boolean
  /** Typed, calculated values, without hidden fields or keys the schema doesn't have. */
  values: Values
  errors: Errors
}

export interface FieldState {
  visible: boolean
  required: boolean
  readOnly: boolean
  /** For a choice with options shown only sometimes: the values offered now. */
  options?: string[]
}

export interface FormState {
  /** Hidden fields keep what was typed here, so showing them again brings it back. submit() leaves them out. */
  values: Values
  errors: Errors
  /** By path: 'name', 'items.0.qty'. */
  fields: Record<string, FieldState>
  touched: Record<string, true>
  submitted: boolean
}

export interface Form {
  getState(): FormState
  /** Fits React's useSyncExternalStore. */
  subscribe(listener: (state: FormState) => void): () => void
  /** path: 'name', 'address.city', 'items.0.qty'. Throws for a path the schema doesn't have. */
  set(path: string, value: unknown): void
  touch(path: string): void
  addRow(path: string, row?: Values): void
  removeRow(path: string, index: number): void
  setContext(context: Record<string, unknown>): void
  reset(values?: Values): void
  submit(): Result
}

export class SchemaError extends Error {
  issues: Issue[]
  constructor(issues: Issue[]) {
    super('Invalid form schema:\n' + issues.map((i) => `  ${i.path || '(schema)'}: ${i.message}`).join('\n'))
    this.name = 'SchemaError'
    this.issues = issues
  }
}

/** Checks a pattern can't do. */
const FORMAT_CHECKS: Partial<Record<keyof typeof STRING_FORMATS, (v: string) => boolean>> = {
  country: (v) => Object.hasOwn(DIAL, v),
  card: (v) => [...v].reverse().reduce((sum, ch, i) => sum + (i % 2 ? [0, 2, 4, 6, 8, 1, 3, 5, 7, 9][+ch] : +ch), 0) % 10 === 0,
  iban: (v) => [...(v.slice(4) + v.slice(0, 4))].reduce((r, ch) => Number(String(r) + parseInt(ch, 36)) % 97, 0) === 1,
  json: (v) => { try { JSON.parse(v); return true } catch { return false } },
}

/** Default most characters for a string field: keeps huge payloads out. */
const MAX_LENGTH = 10_000
/** A drawn signature is an SVG drawing, longer than typed text. */
const maxLength = (f: StringField) => f.maxLength ?? (f.widget === 'signature' || f.widget === 'richtext' ? 200_000 : MAX_LENGTH)
/** Fixed rows make the row count exact. */
const rowLimits = (f: ListField) => (f.rows ? { min: f.rows.length, max: f.rows.length } : f)

const MESSAGES: Record<string, string> = {
  required: 'Required',
  type: 'Invalid value',
  format: 'Invalid format',
  pattern: 'Invalid format',
  minLength: 'At least {n} characters',
  maxLength: 'At most {n} characters',
  min: 'At least {n}',
  max: 'At most {n}',
  'date.min': 'Not before {n}',
  'date.max': 'Not after {n}',
  decimals: 'At most {n} decimal places',
  option: 'Choose one of the options',
  minItems: 'Choose at least {n}',
  maxItems: 'Choose at most {n}',
  'list.minItems': 'Add at least {n} rows',
  'list.maxItems': 'At most {n} rows',
  'file.minItems': 'Add at least {n} files',
  'file.maxItems': 'At most {n} files',
  fileSize: 'File is larger than {n} bytes',
  fileType: 'Allowed: {n}',
  check: 'Invalid value',
}

/** Picks the locale's words: 'hi-IN' → hi → en → the first given. */
export function text(t: Text | undefined, locale?: string): string {
  if (t === undefined) return ''
  if (typeof t === 'string') return t
  for (const k of [locale, locale?.split('-')[0], 'en']) if (k && Object.hasOwn(t, k)) return t[k]
  return Object.values(t)[0] ?? ''
}

/** Checks answers (from a browser, an API call, a CSV row…) the same way everywhere. Never trust the client's own check. */
export function validate(schema: FormSchema, input: unknown, opts: Options = {}): Result {
  const { kids, calcs } = compile(schema)
  return result(kids, run(kids, calcs, input, opts))
}

/** A form's state for any UI: set values, read errors and what is visible, subscribe to changes. */
export function createForm(schema: FormSchema, opts: Options & { values?: Values } = {}): Form {
  const { kids, calcs } = compile(schema)
  let options: Options = opts
  let values = initial(kids, opts.values)
  let touched: Record<string, true> = {}
  let submitted = false
  let last: Run
  let state: FormState
  const listeners = new Set<(s: FormState) => void>()
  const emit = () => {
    state = { values: last.values, errors: last.errors, fields: last.fields, touched, submitted }
    for (const l of listeners) l(state)
  }
  const update = () => {
    last = run(kids, calcs, values, options)
    values = last.values
    emit()
  }
  const change = (path: string, fn: (old: unknown, c: C) => unknown) => {
    values = edit(kids, values, path.split('.'), fn, path)
    update()
  }
  const list = (c: C, path: string) => {
    if (c.f.type !== 'list') throw new Error(`"${path}" is not a list`)
    return c.f
  }
  update()
  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    set: (path, value) => change(path, () => value),
    touch(path) {
      touched = { ...touched, [path]: true }
      emit()
    },
    addRow: (path, row) =>
      change(path, (rows, c) => {
        const f = list(c, path)
        const old = rows as Values[]
        const { max } = rowLimits(f)
        return max != null && old.length >= max ? old : [...old, initial(c.kids!, row)]
      }),
    removeRow(path, index) {
      // row numbers after it shift, so forget what was touched in the list
      touched = Object.fromEntries(Object.entries(touched).filter(([k]) => !k.startsWith(path + '.'))) as Record<string, true>
      change(path, (rows, c) => (list(c, path), (rows as Values[]).filter((_, i) => i !== index)))
    },
    setContext(context) {
      options = { ...options, context }
      update()
    },
    reset(v) {
      values = initial(kids, v ?? opts.values)
      touched = {}
      submitted = false
      update()
    },
    submit() {
      submitted = true
      emit()
      return result(kids, last)
    },
  }
}

// ---- engine ----

/** A field, compiled. */
interface C {
  f: Field
  visible?: boolean | Node
  readOnly?: boolean | Node
  required?: boolean | Node
  value?: Node
  check?: Node
  pattern?: RegExp
  options?: Set<string>
  /** Options shown only when their formula holds (cascading choices). */
  optionWhen?: Map<string, boolean | Node>
  kids?: Level
  /** Visibility of the layout sections around a top-level field. */
  layout?: Node[]
}
type Level = Map<string, C>
interface Scope {
  kids: Level
  values: Values
  up?: Scope
}
interface Run {
  values: Values
  fields: Record<string, FieldState>
  errors: Errors
}

const isObj = (x: unknown): x is Values => typeof x === 'object' && x !== null && !Array.isArray(x)
const when = (w: When | undefined) => (typeof w === 'string' ? parse(w) : w)
const is = (w: boolean | Node | undefined, get: Get, otherwise: boolean) =>
  w === undefined ? otherwise : typeof w === 'boolean' ? w : truthy(evaluate(w, get))

// Schemas are read as immutable: change one by making a new object.
const compiled = new WeakMap<FormSchema, { kids: Level; calcs: number }>()

function compile(schema: FormSchema) {
  const cached = compiled.get(schema)
  if (cached) return cached
  const issues = lint(schema)
  if (issues.length) throw new SchemaError(issues)
  let calcs = 0
  const level = (fields: Fields): Level =>
    new Map(
      Object.entries(fields).map(([key, f]) => {
        const input = f.type !== 'group' && f.type !== 'list' ? f : undefined
        if (input?.value) calcs++
        const c: C = {
          f,
          visible: when(f.visible),
          readOnly: when(f.readOnly),
          required: when(input?.required),
          value: input?.value ? parse(input.value) : undefined,
          check: f.check ? parse(f.check) : undefined,
          pattern: f.type === 'string' && f.pattern ? new RegExp(`^(?:${f.pattern})$`, 'u') : undefined,
          options: f.type === 'choice' ? new Set(f.options.map((o) => (typeof o === 'string' ? o : o.value))) : undefined,
          kids: f.type === 'group' || f.type === 'list' ? level(f.fields) : undefined,
        }
        if (f.type === 'choice' && f.options.some((o) => typeof o === 'object' && o.visible !== undefined))
          c.optionWhen = new Map(f.options.map((o) => (typeof o === 'string' ? [o, true] : [o.value, when(o.visible) ?? true])))
        return [key, c]
      }),
    )
  const kids = level(schema.fields)
  const around = (items: Layout[], conds: Node[]) => {
    for (const item of items) {
      if (typeof item === 'string') {
        const c = kids.get(item)
        if (c && conds.length) c.layout = conds
      } else if (item.type !== 'content') {
        const v = when(item.visible)
        around(item.children, v === undefined || v === true ? conds : [...conds, v === false ? { t: 'lit', v: false } : v])
      }
    }
  }
  around(schema.layout ?? [], [])
  const done = { kids, calcs }
  compiled.set(schema, done)
  return done
}

function run(kids: Level, calcs: number, input: unknown, opts: Options): Run {
  const values = coerce(kids, input)
  const context = opts.context ?? {}
  // ponytail: every formula re-runs until nothing changes (at most one pass per calculated field); dependency order if huge forms lag
  for (let pass = 0; pass <= calcs && compute(kids, values, undefined, context); pass++);
  const out: Run = { values, fields: {}, errors: {} }
  inspect(kids, values, undefined, '', false, false, out, opts, values)
  return out
}

function lookup(scope: Scope, context: unknown): Get {
  return (path) => {
    if (path[0] === 'context') return dig(context, path, 1)
    for (let s: Scope | undefined = scope; s; s = s.up) if (s.kids.has(path[0])) return dig(s.values, path, 0)
    return null
  }
}

/** Own keys only. Through a list it gives every row's value: items.total → [10, 20]. */
function dig(v: unknown, path: string[], i: number): unknown {
  if (i === path.length) return v
  if (Array.isArray(v)) return v.map((x) => dig(x, path, i))
  return isObj(v) && Object.hasOwn(v, path[i]) ? dig(v[path[i]], path, i + 1) : null
}

/** Only the schema's keys, each as its type when it can be (a form post's '12' → 12). */
function coerce(kids: Level, input: unknown): Values {
  const src = isObj(input) ? input : {}
  const out: Values = {}
  for (const [key, c] of kids) out[key] = coerceOne(c, Object.hasOwn(src, key) ? src[key] : null)
  return out
}

function coerceOne({ f, kids }: C, v: unknown): unknown {
  if (f.type === 'group') return coerce(kids!, v)
  if (f.type === 'list') return Array.isArray(v) ? v.map((row) => coerce(kids!, row)) : []
  const multiple = (f.type === 'choice' || f.type === 'file') && f.multiple
  if (v === undefined || v === null || v === '') return multiple ? [] : null
  const text = (x: unknown) => (typeof x === 'number' ? String(x) : x)
  switch (f.type) {
    case 'number': return typeof v === 'string' && numeric(v) ? Number(v) : v
    case 'boolean': return v === 'true' ? true : v === 'false' ? false : v
    case 'string': return text(v)
    case 'choice': return multiple ? (Array.isArray(v) ? v : [v]).map(text) : text(v)
    case 'file': return multiple && !Array.isArray(v) ? [v] : v
    default: return v
  }
}

/** One pass over the calculated fields. True if any changed. */
function compute(kids: Level, values: Values, up: Scope | undefined, context: unknown): boolean {
  const scope: Scope = { kids, values, up }
  const get = lookup(scope, context)
  let changed = false
  for (const [key, c] of kids) {
    if (c.value) {
      const v = fit(c.f, evaluate(c.value, get))
      if (JSON.stringify(v) !== JSON.stringify(values[key])) {
        values[key] = v
        changed = true
      }
    }
    if (c.f.type === 'group') changed = compute(c.kids!, values[key] as Values, scope, context) || changed
    else if (c.f.type === 'list') for (const row of values[key] as Values[]) changed = compute(c.kids!, row, scope, context) || changed
  }
  return changed
}

/** A formula's result as the field's type. */
function fit(f: Field, v: unknown): unknown {
  if (empty(v)) return null
  switch (f.type) {
    case 'number': {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? (f.decimals == null ? n : round(n, f.decimals)) : null
    }
    case 'boolean': return truthy(v)
    case 'string':
    case 'date': return str(v)
    default: return v
  }
}

function inspect(
  kids: Level, values: Values, up: Scope | undefined, prefix: string,
  hidden: boolean, locked: boolean, out: Run, opts: Options, root: Values,
) {
  const scope: Scope = { kids, values, up }
  const get = lookup(scope, opts.context ?? {})
  for (const [key, c] of kids) {
    const path = prefix + key
    const v = values[key]
    const visible = !hidden && is(c.visible, get, true) && (c.layout ?? []).every((n) => truthy(evaluate(n, get)))
    const readOnly = locked || c.value !== undefined || is(c.readOnly, get, false)
    const required = visible && is(c.required, get, false)
    out.fields[path] = { visible, required, readOnly }
    if (c.optionWhen) out.fields[path].options = offered(c, get)
    if (visible) {
      const e = check(c, v, required, get, path, opts, root)
      if (e) out.errors[path] = e
    }
    if (c.f.type === 'group') inspect(c.kids!, v as Values, scope, path + '.', !visible, readOnly, out, opts, root)
    else if (c.f.type === 'list')
      (v as Values[]).forEach((row, i) => inspect(c.kids!, row, scope, `${path}.${i}.`, !visible, readOnly, out, opts, root))
  }
}

const offered = (c: C, get: Get) => [...c.optionWhen!].filter(([, w]) => is(w, get, true)).map(([v]) => v)

function check(c: C, v: unknown, required: boolean, get: Get, path: string, opts: Options, root: Values): FieldError | undefined {
  const { f } = c
  const fail = (code: string, n?: unknown): FieldError => ({ code, message: message(f, code, n, opts.locale) })
  if (f.type === 'list') {
    const bad = count((v as Values[]).length, rowLimits(f))
    if (bad) return fail(...bad)
  } else if (f.type !== 'group') {
    const multiple = (f.type === 'choice' || f.type === 'file') && f.multiple
    const blank = v === null || (typeof v === 'string' && !v.trim()) || (f.type === 'boolean' && v === false) || (multiple && Array.isArray(v) && !v.length)
    if (blank) return required ? fail('required') : undefined
    const bad = invalid(c, v)
    if (bad) return fail(...bad)
  }
  if (c.optionWhen && v != null && !(c.f.type === 'choice' && c.f.allowOther)) {
    const now = offered(c, get)
    if (!(Array.isArray(v) ? v : [v]).every((p) => now.includes(p as string))) return fail('option')
  }
  if (c.check && !truthy(evaluate(c.check, get))) return fail('check')
  for (const name of f.validators ?? []) {
    const fn = opts.validators && Object.hasOwn(opts.validators, name) ? opts.validators[name] : undefined
    if (!fn) throw new Error(`No validator named "${name}": pass it in options.validators`)
    const msg = fn(v, { path, values: root, context: opts.context })
    if (msg) return { code: name, message: msg }
  }
}

/** What is wrong with a filled-in value, as [code, limit]. */
function invalid({ f, pattern, options }: C, v: unknown): [string, unknown?] | undefined {
  switch (f.type) {
    case 'string': {
      if (typeof v !== 'string') return ['type']
      const max = maxLength(f)
      if (v.length > max) return ['maxLength', max]
      if (f.minLength != null && v.length < f.minLength) return ['minLength', f.minLength]
      if (f.format && !(STRING_FORMATS[f.format].test(v) && (FORMAT_CHECKS[f.format]?.(v) ?? true))) return ['format']
      // ponytail: a pattern written by a form's author can still backtrack badly; run validate() with RE2 if authors are untrusted
      if (pattern && !pattern.test(v)) return ['pattern']
      return
    }
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return ['type']
      if (f.min != null && v < f.min) return ['min', f.min]
      if (f.max != null && v > f.max) return ['max', f.max]
      if (f.decimals != null && round(v, f.decimals) !== v) return ['decimals', f.decimals]
      return
    case 'boolean':
      return typeof v === 'boolean' ? undefined : ['type']
    case 'choice': {
      const picks = f.multiple ? v : [v]
      if (!Array.isArray(picks) || !picks.every((p) => typeof p === 'string') || new Set(picks).size !== picks.length) return ['type']
      if (!f.allowOther && !picks.every((p) => options!.has(p))) return ['option']
      return f.multiple ? count(picks.length, f) : undefined
    }
    case 'date': {
      if (typeof v !== 'string' || !DATE_FORMATS[f.format ?? 'date'].test(v) || !realDay(v)) return ['type']
      if (f.min && v < f.min) return ['min', f.min]
      if (f.max && v > f.max) return ['max', f.max]
      return
    }
    case 'file': {
      const files = f.multiple ? v : [v]
      if (!Array.isArray(files) || !files.every(isFileRef)) return ['type']
      // ponytail: size and type are what the client says; check the stored bytes on your server
      for (const x of files) {
        if (f.maxSize != null && x.size > f.maxSize) return ['fileSize', f.maxSize]
        if (f.accept && !accepts(f.accept, x)) return ['fileType', f.accept]
      }
      return f.multiple ? count(files.length, f) : undefined
    }
  }
}

const count = (n: number, f: { min?: number; max?: number }): [string, unknown] | undefined =>
  f.min != null && n < f.min ? ['minItems', f.min] : f.max != null && n > f.max ? ['maxItems', f.max] : undefined

/** 2026-02-30 is not a day. */
function realDay(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return true
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const isFileRef = (x: unknown): x is FileRef =>
  isObj(x) && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.size === 'number' && typeof x.type === 'string'

function accepts(accept: string, file: FileRef): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a))
}

function message(f: Field, code: string, n: unknown, locale?: string): string {
  const own = f.messages && Object.hasOwn(f.messages, code) ? text(f.messages[code], locale) : undefined
  const words = own ?? MESSAGES[`${f.type}.${code}`] ?? MESSAGES[code] ?? 'Invalid value'
  return words.replace('{n}', n === undefined ? '' : String(n))
}

function result(kids: Level, r: Run): Result {
  return { ok: Object.keys(r.errors).length === 0, values: strip(kids, r.values, r.fields, ''), errors: r.errors }
}

/** Leaves hidden fields out. */
function strip(kids: Level, values: Values, fields: Record<string, FieldState>, prefix: string): Values {
  const out: Values = {}
  for (const [key, c] of kids) {
    const path = prefix + key
    if (!fields[path]?.visible) continue
    const v = values[key]
    out[key] =
      c.f.type === 'group' ? strip(c.kids!, v as Values, fields, path + '.')
      : c.f.type === 'list' ? (v as Values[]).map((row, i) => strip(c.kids!, row, fields, `${path}.${i}.`))
      : v
  }
  return out
}

/** Defaults, with `given` on top. A list starts with its default rows, or `min` empty ones. */
function initial(kids: Level, given?: unknown): Values {
  const src = isObj(given) ? given : {}
  const out: Values = {}
  for (const [key, { f, kids: sub }] of kids) {
    const has = Object.hasOwn(src, key)
    if (f.type === 'group') out[key] = initial(sub!, src[key])
    else if (f.type === 'list') {
      let rows: unknown[] = has && Array.isArray(src[key]) ? src[key] : (f.default ?? Array.from({ length: f.min ?? 0 }, () => ({})))
      if (f.rows) rows = f.rows.map((_, i) => rows[i] ?? {})
      out[key] = rows.map((r) => initial(sub!, r))
    } else out[key] = has ? src[key] : ('default' in f ? f.default : null) ?? null
  }
  return out
}

/** A copy of values with the field at `segs` changed by fn. Throws for a path the schema doesn't have. */
function edit(kids: Level, values: Values, segs: string[], fn: (old: unknown, c: C) => unknown, path: string): Values {
  const unknown = () => new Error(`Unknown field "${path}"`)
  const c = kids.get(segs[0])
  if (!c) throw unknown()
  const old = values[segs[0]]
  if (segs.length === 1) return { ...values, [segs[0]]: fn(old, c) }
  if (c.f.type === 'group') return { ...values, [segs[0]]: edit(c.kids!, old as Values, segs.slice(1), fn, path) }
  if (c.f.type === 'list') {
    const rows = (old as Values[]).slice()
    const i = Number(segs[1])
    if (String(i) !== segs[1] || !(i in rows)) throw unknown()
    rows[i] = segs.length === 2 ? (fn(rows[i], c) as Values) : edit(c.kids!, rows[i], segs.slice(2), fn, path)
    return { ...values, [segs[0]]: rows }
  }
  throw unknown()
}
