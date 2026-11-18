// JSON Schema in and out. Covers OpenAPI request bodies and Zod (z.toJSONSchema()), which are JSON Schema too.
import { text } from './form.ts'
import type { ChoiceField, DateField, Field, Fields, FormSchema, Option } from './schema.ts'

type JS = Record<string, any>
const isObj = (x: unknown): x is JS => typeof x === 'object' && x !== null && !Array.isArray(x)
const KEY = /^[A-Za-z][A-Za-z0-9_]*$/
const RESERVED = new Set(['context', 'and', 'or', 'not', 'true', 'false', 'null'])

export interface Imported {
  schema: FormSchema
  /** What could not be carried over, by property path. */
  warnings: string[]
}

/** A form from a JSON Schema object (draft 7 / 2019-09 / 2020-12). */
export function fromJsonSchema(root: unknown): Imported {
  const warnings: string[] = []
  if (!isObj(root)) return { schema: { version: 1, fields: {} }, warnings: ['Not a JSON Schema object'] }

  const resolve = (s: JS, seen: Set<string>): JS => {
    if (typeof s.$ref !== 'string') return s
    const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(s.$ref)
    const name = m && decodeURIComponent(m[2]).replace(/~1/g, '/').replace(/~0/g, '~')
    const target = m && root[m[1]]?.[name!]
    if (!isObj(target) || seen.has(s.$ref)) return {}
    seen.add(s.$ref)
    return { ...resolve(target, seen), ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== '$ref')) }
  }
  /** ['string', 'null'] → 'string'; a nullable anyOf → its one real branch. */
  const unwrap = (s: JS, seen: Set<string>): JS => {
    s = resolve(s, seen)
    for (const k of ['anyOf', 'oneOf'] as const) {
      const real = Array.isArray(s[k]) ? s[k].map((b: JS) => resolve(b, seen)).filter((b: JS) => b.type !== 'null') : []
      if (real.length === 1) return unwrap({ ...s, [k]: undefined, ...real[0] }, seen)
    }
    if (Array.isArray(s.allOf)) return s.allOf.reduce((acc: JS, b: JS) => ({ ...acc, ...unwrap(b, seen), properties: { ...acc.properties, ...unwrap(b, seen).properties }, required: [...(acc.required ?? []), ...(unwrap(b, seen).required ?? [])] }), { ...s, allOf: undefined })
    const type = Array.isArray(s.type) ? s.type.filter((t: string) => t !== 'null') : s.type
    return { ...s, type: Array.isArray(type) ? (type.length === 1 ? type[0] : undefined) : type }
  }
  const keyOf = (name: string, taken: Set<string>, at: string) => {
    let k = name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]+/, '') || 'field'
    if (RESERVED.has(k)) k += '_'
    for (let base = k, n = 2; taken.has(k); n++) k = base + n
    if (k !== name) warnings.push(`${at}: key "${name}" became "${k}"`)
    taken.add(k)
    return k
  }
  /** const / enum branches of oneOf/anyOf: [{ const: 'IN', title: 'India' }] */
  const choices = (s: JS): Option[] | undefined => {
    if (Array.isArray(s.enum)) return s.enum.filter((v: unknown) => v !== null).map(String)
    const branches = s.oneOf ?? s.anyOf
    if (Array.isArray(branches) && branches.length && branches.every((b: JS) => isObj(b) && 'const' in b))
      return branches.map((b: JS) => (b.title ? { value: String(b.const), label: b.title } : String(b.const)))
  }

  const fields = (s: JS, at: string, seen: Set<string>): Fields => {
    const out: Fields = {}
    const taken = new Set<string>()
    const required = new Set<string>(Array.isArray(s.required) ? s.required : [])
    for (const [name, raw] of Object.entries(isObj(s.properties) ? s.properties : {})) {
      const path = at ? `${at}.${name}` : name
      const f = field(isObj(raw) ? raw : {}, path, new Set(seen))
      if (!f) continue
      if (required.has(name) && f.type !== 'group' && f.type !== 'list') (f as { required?: boolean }).required = true
      if (required.has(name) && f.type === 'list' && f.min === undefined) f.min = 1
      out[keyOf(name, taken, path)] = f
    }
    return out
  }

  const field = (raw: JS, path: string, seen: Set<string>): Field | undefined => {
    const s = unwrap(raw, seen)
    const base = {
      ...(s.title ? { label: String(s.title) } : {}),
      ...(s.description ? { help: String(s.description) } : {}),
      ...(s.readOnly ? { readOnly: true } : {}),
    }
    const options = choices(s)
    if (options && s.type !== 'array') return { type: 'choice', ...base, options, ...(typeof s.default === 'string' ? { default: s.default } : {}) }
    switch (s.type) {
      case 'string': {
        const date = ({ date: 'date', 'date-time': 'datetime', time: 'time' } as Record<string, DateField['format']>)[s.format]
        if (date) return { type: 'date', ...base, ...(date !== 'date' ? { format: date } : {}) }
        if (s.contentEncoding === 'base64' || s.format === 'binary') return { type: 'file', ...base }
        const format = ({ email: 'email', 'idn-email': 'email', uri: 'url', url: 'url' } as Record<string, 'email' | 'url'>)[s.format]
        if (s.format && !format) warnings.push(`${path}: format "${s.format}" is not checked`)
        return {
          type: 'string', ...base,
          ...(format ? { format } : {}),
          ...(s.minLength !== undefined ? { minLength: s.minLength } : {}),
          ...(s.maxLength !== undefined ? { maxLength: s.maxLength } : {}),
          ...(typeof s.pattern === 'string' ? { pattern: s.pattern.replace(/^\^/, '').replace(/\$$/, '') } : {}),
          ...(typeof s.default === 'string' ? { default: s.default } : {}),
          ...(s.maxLength > 200 ? { widget: 'textarea' } : {}),
        }
      }
      case 'number':
      case 'integer': {
        const min = s.minimum ?? (typeof s.exclusiveMinimum === 'number' ? s.exclusiveMinimum : undefined)
        const max = s.maximum ?? (typeof s.exclusiveMaximum === 'number' ? s.exclusiveMaximum : undefined)
        if (typeof s.exclusiveMinimum === 'number' || typeof s.exclusiveMaximum === 'number') warnings.push(`${path}: exclusive limits became inclusive`)
        const decimals = s.type === 'integer' ? 0 : typeof s.multipleOf === 'number' && s.multipleOf < 1 ? Math.round(-Math.log10(s.multipleOf)) : undefined
        return {
          type: 'number', ...base,
          ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}),
          ...(decimals !== undefined ? { decimals } : {}),
          ...(typeof s.default === 'number' ? { default: s.default } : {}),
        }
      }
      case 'boolean':
        return { type: 'boolean', ...base, ...(typeof s.default === 'boolean' ? { default: s.default } : {}) }
      case 'object':
        return { type: 'group', ...base, fields: fields(s, path, seen) }
      case 'array': {
        const items = unwrap(isObj(s.items) ? s.items : {}, seen)
        const opts = choices(items)
        const counts = { ...(s.minItems ? { min: s.minItems } : {}), ...(s.maxItems !== undefined ? { max: s.maxItems } : {}) }
        if (opts) return { type: 'choice', ...base, options: opts, multiple: true, ...counts } satisfies ChoiceField
        if (items.type === 'object') return { type: 'list', ...base, widget: 'table', ...counts, fields: fields(items, `${path}[]`, seen) }
        if (items.type === 'string' && (items.contentEncoding === 'base64' || items.format === 'binary')) return { type: 'file', ...base, multiple: true, ...counts }
        // a list of plain values becomes rows with one column
        const one = field(items, `${path}[]`, seen)
        if (!one) return
        warnings.push(`${path}: a list of plain values became rows with one "value" column`)
        return { type: 'list', ...base, ...counts, fields: { value: one } }
      }
    }
    warnings.push(`${path}: no single type, skipped`)
  }

  const top = unwrap(root, new Set())
  if (top.type !== 'object' && !isObj(top.properties)) warnings.push('The top level is not an object')
  const schema: FormSchema = { version: 1, fields: fields(top, '', new Set()) }
  if (top.title) schema.title = String(top.title)
  return { schema, warnings }
}

/**
 * A JSON Schema (2020-12) of what validate() returns, for backends in any language.
 * A field with a condition is never "required" here (it may be hidden); validate() still checks it.
 */
export function toJsonSchema(form: FormSchema): JS {
  const one = (f: Field): JS => {
    const s: JS = {}
    if (f.label) s.title = text(f.label, 'en')
    if (f.help) s.description = text(f.help, 'en')
    if ('value' in f && f.value) s.readOnly = true
    const nullable = (t: string) => [t, 'null']
    switch (f.type) {
      case 'string':
        Object.assign(s, { type: nullable('string'), maxLength: f.maxLength ?? 10_000 })
        if (f.minLength !== undefined) s.minLength = f.minLength
        if (f.pattern) s.pattern = `^(?:${f.pattern})$`
        if (f.format) s.format = f.format === 'url' ? 'uri' : f.format === 'email' ? 'email' : undefined
        if (s.format === undefined) delete s.format
        break
      case 'number':
        s.type = nullable(f.decimals === 0 ? 'integer' : 'number')
        if (f.min !== undefined) s.minimum = f.min
        if (f.max !== undefined) s.maximum = f.max
        break
      case 'boolean':
        s.type = nullable('boolean')
        break
      case 'choice': {
        const values = f.options.map((o) => (typeof o === 'string' ? o : o.value))
        if (f.multiple) Object.assign(s, { type: 'array', items: { enum: values }, uniqueItems: true }, f.min !== undefined ? { minItems: f.min } : {}, f.max !== undefined ? { maxItems: f.max } : {})
        else s.enum = [...values, null]
        break
      }
      case 'date': {
        const fmt = f.format ?? 'date'
        Object.assign(s, { type: nullable('string') }, fmt === 'date' ? { format: 'date' } : fmt === 'time' ? { pattern: '^\\d{2}:\\d{2}(:\\d{2})?$' } : fmt === 'datetime' ? { pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$' } : {})
        break
      }
      case 'file': {
        const ref = { type: 'object', required: ['id', 'name', 'size', 'type'], properties: { id: { type: 'string' }, name: { type: 'string' }, size: { type: 'number' }, type: { type: 'string' } } }
        Object.assign(s, f.multiple ? { type: 'array', items: ref } : { anyOf: [ref, { type: 'null' }] })
        break
      }
      case 'group':
        Object.assign(s, object(f.fields))
        break
      case 'list':
        Object.assign(s, { type: 'array', items: object(f.fields) }, f.min !== undefined ? { minItems: f.min } : {}, f.max !== undefined ? { maxItems: f.max } : {})
        break
    }
    return s
  }
  const object = (fs: Fields): JS => {
    const required = Object.entries(fs)
      .filter(([, f]) => 'required' in f && f.required === true && f.visible === undefined)
      .map(([k]) => k)
    return {
      type: 'object',
      properties: Object.fromEntries(Object.entries(fs).map(([k, f]) => [k, one(f)])),
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    }
  }
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', ...(form.title ? { title: text(form.title, 'en') } : {}), ...object(form.fields) }
}
