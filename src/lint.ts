import { parse, refs } from './expr.ts'
import { DATE_FORMATS, STRING_FORMATS } from './schema.ts'

export interface Issue {
  path: string
  message: string
}

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/
const RESERVED = new Set(['context', 'and', 'or', 'not', 'true', 'false', 'null'])
const TYPES = new Set(['string', 'number', 'boolean', 'choice', 'date', 'file', 'group', 'list'])
const LAYOUTS = new Set(['section', 'grid', 'pages', 'content'])
const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** The fields a name can be found in, innermost first. */
type Scope = { fields: Record<string, any>; prefix: string }[]

/** Everything wrong with a schema (from your database, a builder, an LLM…). Empty means it is safe to use. */
export function lint(schema: unknown): Issue[] {
  const issues: Issue[] = []
  const add = (path: string, message: string) => {
    issues.push({ path, message })
  }
  if (!isObj(schema)) return [{ path: '', message: 'A schema is an object' }]
  if (schema.version !== 1) add('version', `Unknown version ${JSON.stringify(schema.version)}: this formweave reads version 1`)
  if (!isObj(schema.fields)) return [...issues, { path: 'fields', message: 'fields is an object of fields' }]
  const root: Scope = [{ fields: schema.fields, prefix: '' }]
  const formulas = new Map<string, string[]>() // calculated field → the fields it reads

  const formula = (at: string, src: unknown, scope: Scope): string[] => {
    if (typeof src !== 'string') {
      add(at, 'Must be a formula (text)')
      return []
    }
    try {
      return refs(parse(src)).flatMap((ref) => {
        if (ref[0] === 'context') return []
        const bound = bind(ref, scope)
        if (bound === undefined) add(at, `Unknown field "${ref.join('.')}"`)
        return bound === undefined ? [] : [bound]
      })
    } catch (e) {
      add(at, (e as Error).message)
      return []
    }
  }

  const fields = (fs: Record<string, unknown>, scope: Scope) => {
    for (const [key, f] of Object.entries(fs)) {
      const path = scope[0].prefix + key
      if (!KEY.test(key) || RESERVED.has(key))
        add(path, `"${key}" can't be a key: use letters, digits and _, starting with a letter (and not a formula word)`)
      if (!isObj(f) || !TYPES.has(f.type)) {
        add(path, `Unknown type ${JSON.stringify(isObj(f) ? f.type : f)}`)
        continue
      }
      for (const prop of ['visible', 'readOnly', 'required'])
        if (f[prop] !== undefined && typeof f[prop] !== 'boolean') formula(`${path}.${prop}`, f[prop], scope)
      if (f.check !== undefined) formula(`${path}.check`, f.check, scope)
      if (f.value !== undefined) {
        if (f.type === 'group' || f.type === 'list') add(`${path}.value`, 'Only a single value can be calculated')
        else formulas.set(path, formula(`${path}.value`, f.value, scope))
      }
      if (f.validators !== undefined && !(Array.isArray(f.validators) && f.validators.every((v: unknown) => typeof v === 'string')))
        add(`${path}.validators`, 'A list of validator names')
      if (f.type === 'string') {
        if (f.format !== undefined && !Object.hasOwn(STRING_FORMATS, f.format))
          add(`${path}.format`, `One of: ${Object.keys(STRING_FORMATS).join(', ')}`)
        if (f.pattern !== undefined) {
          if (typeof f.pattern !== 'string' || f.pattern.length > 200) add(`${path}.pattern`, 'A regular expression of up to 200 characters')
          else
            try {
              new RegExp(f.pattern, 'u')
            } catch {
              add(`${path}.pattern`, 'Not a valid regular expression')
            }
        }
      }
      if (f.type === 'date' && f.format !== undefined && !Object.hasOwn(DATE_FORMATS, f.format))
        add(`${path}.format`, `One of: ${Object.keys(DATE_FORMATS).join(', ')}`)
      if (f.type === 'file' && f.accept !== undefined && typeof f.accept !== 'string') add(`${path}.accept`, "Like 'image/*,.pdf'")
      if (f.type === 'choice') {
        const values: unknown[] = Array.isArray(f.options) ? f.options.map((o: unknown) => (isObj(o) ? o.value : o)) : []
        if (!values.length) add(`${path}.options`, 'A choice needs options')
        else if (!values.every((v) => typeof v === 'string')) add(`${path}.options`, 'Option values are text')
        else if (new Set(values).size !== values.length) add(`${path}.options`, 'An option value repeats')
        if (Array.isArray(f.options))
          f.options.forEach((o: unknown, i: number) => { if (isObj(o) && o.visible !== undefined && typeof o.visible !== 'boolean') formula(`${path}.options.${i}.visible`, o.visible, scope) })
      }
      if (f.type === 'list' && f.rows !== undefined && !(Array.isArray(f.rows) && f.rows.length && f.rows.every((r: unknown) => typeof r === 'string' || isObj(r))))
        add(`${path}.rows`, 'Fixed rows are a list of texts')
      if (f.type === 'group' || f.type === 'list') {
        if (isObj(f.fields)) fields(f.fields, [{ fields: f.fields, prefix: path + '.' }, ...scope])
        else add(`${path}.fields`, `A ${f.type} needs fields`)
      }
    }
  }
  fields(schema.fields, root)

  // ponytail: reads of a whole group or list (count(items)) aren't followed here; the engine's pass limit still stops those
  const seen = new Map<string, 'open' | 'done'>()
  const visit = (path: string, trail: string[]): void => {
    if (seen.get(path) === 'done') return
    if (seen.get(path) === 'open') {
      add(path, `Circular formula: ${[...trail.slice(trail.indexOf(path)), path].join(' → ')}`)
      return
    }
    seen.set(path, 'open')
    for (const dep of formulas.get(path) ?? []) if (formulas.has(dep)) visit(dep, [...trail, path])
    seen.set(path, 'done')
  }
  for (const path of formulas.keys()) visit(path, [])

  const placed = new Set<string>()
  const layout = (items: unknown, at: string) => {
    if (!Array.isArray(items)) return add(at, 'A list of fields and sections')
    items.forEach((item, i) => {
      const path = `${at}.${i}`
      if (typeof item === 'string') {
        if (!Object.hasOwn(schema.fields, item)) add(path, `Unknown field "${item}"`)
        else if (placed.has(item)) add(path, `"${item}" is placed twice`)
        placed.add(item)
      } else if (!isObj(item) || !LAYOUTS.has(item.type)) add(path, `Unknown layout ${JSON.stringify(isObj(item) ? item.type : item)}`)
      else {
        if (item.visible !== undefined && typeof item.visible !== 'boolean') formula(`${path}.visible`, item.visible, root)
        if (item.type === 'pages' && !(Array.isArray(item.children) && item.children.every((c: unknown) => isObj(c) && c.type === 'section')))
          add(`${path}.children`, 'Each page is a section')
        if (item.type === 'pages' && item.position !== undefined && !['top', 'left', 'right', 'bottom'].includes(item.position as string))
          add(`${path}.position`, 'Position is top, left, right or bottom')
        if (item.type !== 'content') layout(item.children, `${path}.children`)
      }
    })
  }
  if (schema.layout !== undefined) layout(schema.layout, 'layout')
  return issues
}

/** The field a name points at ('items.total'), or undefined. */
function bind(ref: string[], scope: Scope): string | undefined {
  const home = scope.find((s) => Object.hasOwn(s.fields, ref[0]))
  if (!home) return
  let f = home.fields[ref[0]]
  let path = home.prefix + ref[0]
  for (const key of ref.slice(1)) {
    if (!isObj(f) || !isObj(f.fields) || !Object.hasOwn(f.fields, key)) return
    f = f.fields[key]
    path += '.' + key
  }
  return path
}
