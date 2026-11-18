// Changes to a schema's fields, each returning a new schema: replace, rename, remove, add, move.
import type { Field, Fields, FormSchema, Layout } from '../core/schema.ts'
import type { Path } from './types.ts'

export function fieldAt(fields: Fields, path: Path): Field | undefined {
  let map: Fields | undefined = fields
  let f: Field | undefined
  for (const k of path) {
    f = map && Object.hasOwn(map, k) ? map[k] : undefined
    map = f && (f.type === 'group' || f.type === 'list') ? f.fields : undefined
  }
  return f
}

/** Changes the map of fields that `parent` points at ([] = the top). */
export function inMap(fields: Fields, parent: Path, fn: (m: [string, Field][]) => [string, Field][]): Fields {
  if (!parent.length) return Object.fromEntries(fn(Object.entries(fields)))
  const [k, ...rest] = parent
  const f = fields[k] as Extract<Field, { fields: Fields }>
  return { ...fields, [k]: { ...f, fields: inMap(f.fields, rest, fn) } }
}

/** Keeps the layout pointing at top-level keys: rename (to a key) or drop (to null). */
export function relayout(items: Layout[] | undefined, fn: (key: string) => string | null): Layout[] | undefined {
  return items?.flatMap((it): Layout[] => {
    if (typeof it === 'string') {
      const k = fn(it)
      return k === null ? [] : [k]
    }
    return it.type === 'content' ? [it] : [{ ...it, children: relayout(it.children, fn) } as Layout]
  })
}

export const edits = {
  replace: (s: FormSchema, path: Path, field: Field): FormSchema => ({
    ...s, fields: inMap(s.fields, path.slice(0, -1), (m) => m.map(([k, f]) => [k, k === path.at(-1) ? field : f])),
  }),
  rename(s: FormSchema, path: Path, key: string): FormSchema {
    const old = path.at(-1)!
    const fields = inMap(s.fields, path.slice(0, -1), (m) => m.map(([k, f]) => [k === old ? key : k, f]))
    return { ...s, fields, layout: path.length === 1 ? relayout(s.layout, (k) => (k === old ? key : k)) : s.layout }
  },
  remove(s: FormSchema, path: Path): FormSchema {
    const old = path.at(-1)!
    const fields = inMap(s.fields, path.slice(0, -1), (m) => m.filter(([k]) => k !== old))
    return { ...s, fields, layout: path.length === 1 ? relayout(s.layout, (k) => (k === old ? null : k)) : s.layout }
  },
  /** Adds after `after` in `parent`, or at the end. A new top-level field also goes at the end of the layout. */
  add(s: FormSchema, parent: Path, key: string, field: Field, after?: string): FormSchema {
    const fields = inMap(s.fields, parent, (m) => {
      const i = after === undefined ? m.length : m.findIndex(([k]) => k === after) + 1
      return [...m.slice(0, i), [key, field], ...m.slice(i)]
    })
    // ponytail: a new top-level field lands at the layout's end (after any pages); placing into sections comes with layout editing
    return { ...s, fields, layout: parent.length === 0 && s.layout ? [...s.layout, key] : s.layout }
  },
  /** Moves a field before a sibling, or to the end when `before` is null. */
  move: (s: FormSchema, path: Path, before: string | null): FormSchema => ({
    ...s,
    fields: inMap(s.fields, path.slice(0, -1), (m) => {
      const item = m.find(([k]) => k === path.at(-1))!
      const rest = m.filter((e) => e !== item)
      const i = before === null ? rest.length : rest.findIndex(([k]) => k === before)
      return [...rest.slice(0, i < 0 ? rest.length : i), item, ...rest.slice(i < 0 ? rest.length : i)]
    }),
  }),
}

export function freeKey(fields: Fields, parent: Path, base: string): string {
  const map = parent.length ? (fieldAt(fields, parent) as { fields: Fields }).fields : fields
  for (let n = 1; ; n++) if (!Object.hasOwn(map, base + n)) return base + n
}

// ---- the settings panel: a form describing a field ----
