// One pass over a form: formulas computed, visibility and required-ness worked out, values kept in shape.
import { empty, evaluate, parse, round, str, truthy, numeric, type Get, type Node } from './expr.ts'
import { lint } from './lint.ts'
import type { Errors, Field, Fields, FormSchema, Layout, Values, When } from './schema.ts'
import { check, inspect } from './checks.ts'
import { type FieldState, type Options, SchemaError, text } from './form.ts'
import { result } from './values.ts'

/** A field, compiled. */
export interface C {
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
export type Level = Map<string, C>
export interface Scope {
  kids: Level
  values: Values
  up?: Scope
}
export interface Run {
  values: Values
  fields: Record<string, FieldState>
  errors: Errors
}

export const isObj = (x: unknown): x is Values => typeof x === 'object' && x !== null && !Array.isArray(x)
export const when = (w: When | undefined) => (typeof w === 'string' ? parse(w) : w)
export const is = (w: boolean | Node | undefined, get: Get, otherwise: boolean) =>
  w === undefined ? otherwise : typeof w === 'boolean' ? w : truthy(evaluate(w, get))

// Schemas are read as immutable: change one by making a new object.
export const compiled = new WeakMap<FormSchema, { kids: Level; calcs: number }>()

export function compile(schema: FormSchema) {
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

export function run(kids: Level, calcs: number, input: unknown, opts: Options): Run {
  const values = coerce(kids, input)
  const context = opts.context ?? {}
  // ponytail: every formula re-runs until nothing changes (at most one pass per calculated field); dependency order if huge forms lag
  for (let pass = 0; pass <= calcs && compute(kids, values, undefined, context); pass++);
  const out: Run = { values, fields: {}, errors: {} }
  inspect(kids, values, undefined, '', false, false, out, opts, values)
  return out
}

export function lookup(scope: Scope, context: unknown): Get {
  return (path) => {
    if (path[0] === 'context') return dig(context, path, 1)
    for (let s: Scope | undefined = scope; s; s = s.up) if (s.kids.has(path[0])) return dig(s.values, path, 0)
    return null
  }
}

/** Own keys only. Through a list it gives every row's value: items.total → [10, 20]. */
export function dig(v: unknown, path: string[], i: number): unknown {
  if (i === path.length) return v
  if (Array.isArray(v)) return v.map((x) => dig(x, path, i))
  return isObj(v) && Object.hasOwn(v, path[i]) ? dig(v[path[i]], path, i + 1) : null
}

/** Only the schema's keys, each as its type when it can be (a form post's '12' → 12). */
export function coerce(kids: Level, input: unknown): Values {
  const src = isObj(input) ? input : {}
  const out: Values = {}
  for (const [key, c] of kids) out[key] = coerceOne(c, Object.hasOwn(src, key) ? src[key] : null)
  return out
}

export function coerceOne({ f, kids }: C, v: unknown): unknown {
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
export function compute(kids: Level, values: Values, up: Scope | undefined, context: unknown): boolean {
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
export function fit(f: Field, v: unknown): unknown {
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
