// What makes an answer wrong: required, lengths, limits, formats, patterns, files, and the error messages for each.
import { evaluate, round, truthy, type Get } from './expr.ts'
import { DATE_FORMATS, STRING_FORMATS, type Field, type FieldError, type FileRef, type ListField, type StringField, type Values } from './schema.ts'
import { DIAL } from './countries.ts'
import { type Options, text } from './form.ts'
import { type C, is, isObj, type Level, lookup, type Run, type Scope } from './run.ts'

/** Checks a pattern can't do. */
export const FORMAT_CHECKS: Partial<Record<keyof typeof STRING_FORMATS, (v: string) => boolean>> = {
  country: (v) => Object.hasOwn(DIAL, v),
  card: (v) => [...v].reverse().reduce((sum, ch, i) => sum + (i % 2 ? [0, 2, 4, 6, 8, 1, 3, 5, 7, 9][+ch] : +ch), 0) % 10 === 0,
  iban: (v) => [...(v.slice(4) + v.slice(0, 4))].reduce((r, ch) => Number(String(r) + parseInt(ch, 36)) % 97, 0) === 1,
  json: (v) => { try { JSON.parse(v); return true } catch { return false } },
}

/** Default most characters for a string field: keeps huge payloads out. */
export const MAX_LENGTH = 10_000
/** A drawn signature is an SVG drawing, longer than typed text. */
export const maxLength = (f: StringField) => f.maxLength ?? (f.widget === 'signature' || f.widget === 'richtext' ? 200_000 : MAX_LENGTH)
/** Fixed rows make the row count exact. */
export const rowLimits = (f: ListField) => (f.rows ? { min: f.rows.length, max: f.rows.length } : f)

export const MESSAGES: Record<string, string> = {
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

export function inspect(
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

export const offered = (c: C, get: Get) => [...c.optionWhen!].filter(([, w]) => is(w, get, true)).map(([v]) => v)

export function check(c: C, v: unknown, required: boolean, get: Get, path: string, opts: Options, root: Values): FieldError | undefined {
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
export function invalid({ f, pattern, options }: C, v: unknown): [string, unknown?] | undefined {
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

export const count = (n: number, f: { min?: number; max?: number }): [string, unknown] | undefined =>
  f.min != null && n < f.min ? ['minItems', f.min] : f.max != null && n > f.max ? ['maxItems', f.max] : undefined

/** 2026-02-30 is not a day. */
export function realDay(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return true
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

export const isFileRef = (x: unknown): x is FileRef =>
  isObj(x) && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.size === 'number' && typeof x.type === 'string'

export function accepts(accept: string, file: FileRef): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a))
}

export function message(f: Field, code: string, n: unknown, locale?: string): string {
  const own = f.messages && Object.hasOwn(f.messages, code) ? text(f.messages[code], locale) : undefined
  const words = own ?? MESSAGES[`${f.type}.${code}`] ?? MESSAGES[code] ?? 'Invalid value'
  return words.replace('{n}', n === undefined ? '' : String(n))
}
