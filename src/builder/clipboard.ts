// Copy and paste: a field, a layout piece with its fields, or a whole form, pasted with unique keys.
import type { Field, Fields, FormSchema, Layout } from '../core/schema.ts'
import { fits, type Ip, layoutEdits, nodeAt, placedKeys } from './layout-edits.ts'
import { fieldAt, inMap } from './schema-edits.ts'
import type { Path } from './types.ts'

/** What Copy keeps: fields by key, and for a layout piece or a whole form, where they were placed. */
export interface Clip {
  fields: Fields
  /** Layout pieces to paste, naming the keys in `fields`. Absent for a field inside a group or list. */
  layout?: Layout[]
}
/** What a part of a schema is: a field by path, a layout piece by place, or the whole form. */
export type Part = { path: Path } | { ip: Ip } | 'all'

/** A copy of a field, a layout piece with the fields placed in it, or the whole form. */
export function copyPart(s: FormSchema, part: Part): Clip | undefined {
  if (part === 'all') return structuredClone({ fields: s.fields, layout: s.layout ?? Object.keys(s.fields) })
  if ('path' in part) {
    const f = fieldAt(s.fields, part.path)
    return f && structuredClone({ fields: { [part.path.at(-1)!]: f }, ...(part.path.length === 1 ? { layout: [part.path[0]] } : {}) })
  }
  const n = s.layout && nodeAt(s.layout, part.ip)
  if (n === undefined) return
  const keys = placedKeys([n]).filter((k) => Object.hasOwn(s.fields, k))
  return structuredClone({ fields: Object.fromEntries(keys.map((k) => [k, s.fields[k]])), layout: [n] })
}

/** Field names in a formula renamed by `map`; words in quotes and the parts after a dot stay as they are. */
export function renameRefs(src: string, map: Record<string, string>): string {
  return src.split(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/).map((part, i) =>
    i % 2 ? part : part.replace(/(^|[^.\w])([A-Za-z_][A-Za-z0-9_]*)/g, (m, before: string, name: string) => (Object.hasOwn(map, name) ? before + map[name] : m))).join('')
}

export function renameIn<T>(x: T, map: Record<string, string>): T {
  const r = (v: unknown) => (typeof v === 'string' ? renameRefs(v, map) : v)
  const o = { ...(x as Record<string, unknown>) }
  for (const k of ['visible', 'readOnly', 'required', 'check', 'value']) if (k in o) o[k] = r(o[k])
  if (Array.isArray(o.options)) o.options = o.options.map((op) => (op && typeof op === 'object' ? { ...op, visible: r(op.visible) } : op))
  // ponytail: a name inside a group that its own row also has is renamed too; fine unless a pasted key shadows a column
  if (o.fields && typeof o.fields === 'object') o.fields = Object.fromEntries(Object.entries(o.fields as Fields).map(([k, f]) => [k, renameIn(f, map)]))
  if (Array.isArray(o.children)) o.children = o.children.map((c) => (typeof c === 'string' ? (map[c] ?? c) : renameIn(c, map)))
  return o as T
}

/**
 * Puts a copy into `s`: its fields into `parent` after `after` (or at the end), every key made unique (email → email1),
 * and the formulas and layout among them following the new keys. Pasted at the top, its layout goes at `at`
 * ([parent place, index]) or the end. Returns the schema and the keys it got.
 */
export function pasteClip(s: FormSchema, clip: Clip, parent: Path = [], after?: string, at?: [Ip, number]): { schema: FormSchema; keys: string[]; placed?: Ip } {
  const top = parent.length === 0
  const map: Record<string, string> = {}
  const taken = new Set(Object.keys(top ? s.fields : (fieldAt(s.fields, parent) as { fields: Fields }).fields))
  for (const k of Object.keys(clip.fields)) {
    let key = k
    for (let n = 1; taken.has(key); n++) key = k.replace(/\d+$/, '') + n
    taken.add(key)
    map[k] = key
  }
  const added = Object.entries(clip.fields).map(([k, f]): [string, Field] => [map[k], renameIn(f, map)])
  const fields = inMap(s.fields, parent, (m) => {
    const i = after === undefined ? m.length : m.findIndex(([k]) => k === after) + 1
    return [...m.slice(0, i), ...added, ...m.slice(i)]
  })
  let layout = s.layout
  let placed: Ip | undefined
  if (top && (s.layout || clip.layout?.some((n) => typeof n === 'object'))) {
    const items = layout ?? Object.keys(s.fields)
    const pieces = (clip.layout ?? Object.keys(clip.fields)).map((n) => (typeof n === 'string' ? map[n] ?? n : renameIn(n, map)))
    const [where, index] = at && fits(items, at[0], pieces[0]) ? at : [[], items.length] as [Ip, number]
    layout = pieces.reduce((l, n, i) => layoutEdits.insert(l, where, index + i, n), items)
    placed = [...where, index]
  }
  return { schema: { ...s, fields, layout }, keys: added.map(([k]) => k), placed }
}
