// Values in and out: defaults for a new form, a changed copy, and what gets submitted.
import type { Values } from './schema.ts'
import type { FieldState, Result } from './form.ts'
import { type C, isObj, type Level, type Run } from './run.ts'

export function result(kids: Level, r: Run): Result {
  return { ok: Object.keys(r.errors).length === 0, values: strip(kids, r.values, r.fields, ''), errors: r.errors }
}

/** Leaves hidden fields out. */
export function strip(kids: Level, values: Values, fields: Record<string, FieldState>, prefix: string): Values {
  const out: Values = {}
  for (const [key, c] of kids) {
    const path = prefix + key
    if (!fields[path]?.visible) continue
    const v = values[key]
    out[key] =
      c.f.type === 'group'
        ? strip(c.kids!, v as Values, fields, path + '.')
        : c.f.type === 'list'
          ? (v as Values[]).map((row, i) => strip(c.kids!, row, fields, `${path}.${i}.`))
          : v
  }
  return out
}

/** Defaults, with `given` on top. A list starts with its default rows, or `min` empty ones. */
export function initial(kids: Level, given?: unknown): Values {
  const src = isObj(given) ? given : {}
  const out: Values = {}
  for (const [key, { f, kids: sub }] of kids) {
    const has = Object.hasOwn(src, key)
    if (f.type === 'group') out[key] = initial(sub!, src[key])
    else if (f.type === 'list') {
      let rows: unknown[] = has && Array.isArray(src[key]) ? src[key] : (f.default ?? Array.from({ length: f.min ?? 0 }, () => ({})))
      if (f.rows) rows = f.rows.map((_, i) => rows[i] ?? {})
      out[key] = rows.map((r) => initial(sub!, r))
    } else out[key] = has ? src[key] : (('default' in f ? f.default : null) ?? null)
  }
  return out
}

/** A copy of values with the field at `segs` changed by fn. Throws for a path the schema doesn't have. */
export function edit(kids: Level, values: Values, segs: string[], fn: (old: unknown, c: C) => unknown, path: string): Values {
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
