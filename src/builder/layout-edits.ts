// Changes to a schema's layout, by place: insert, remove, replace, unwrap and move, keeping pages to sections.
import type { FormSchema, Layout } from '../core/schema.ts'

/** A node in the layout, by index: [0, 2] is the third child of the first item. */
export type Ip = number[]
export type Container = Exclude<Layout, string | { type: 'content' }>
export const isContainer = (n: Layout | undefined): n is Container => typeof n === 'object' && n.type !== 'content'

export function nodeAt(items: Layout[], ip: Ip): Layout | undefined {
  let list: Layout[] | undefined = items
  let n: Layout | undefined
  for (const i of ip) {
    n = list?.[i]
    list = isContainer(n) ? n.children : undefined
  }
  return n
}

/** Changes the children list at `parent` ([] = the top). */
export function inList(items: Layout[], parent: Ip, fn: (l: Layout[]) => Layout[]): Layout[] {
  if (!parent.length) return fn(items)
  const [i, ...rest] = parent
  return items.map((n, j) => (j === i && isContainer(n) ? ({ ...n, children: inList(n.children, rest, fn) } as Layout) : n))
}

/** May `node` go into the list at `parent`? Pages hold only sections. */
export const fits = (items: Layout[], parent: Ip, node: Layout) => {
  const p = parent.length ? nodeAt(items, parent) : undefined
  if (parent.length && !isContainer(p)) return false
  return !(isContainer(p) && p.type === 'pages') || (typeof node === 'object' && node.type === 'section')
}

export const layoutEdits = {
  insert: (items: Layout[], parent: Ip, index: number, node: Layout) => inList(items, parent, (l) => [...l.slice(0, index), node, ...l.slice(index)]),
  remove: (items: Layout[], ip: Ip) => inList(items, ip.slice(0, -1), (l) => l.filter((_, i) => i !== ip.at(-1))),
  replace: (items: Layout[], ip: Ip, node: Layout) => inList(items, ip.slice(0, -1), (l) => l.map((n, i) => (i === ip.at(-1) ? node : n))),
  /** Removes a container but keeps what was in it, in its place. */
  unwrap: (items: Layout[], ip: Ip) => inList(items, ip.slice(0, -1), (l) => l.flatMap((n, i) => (i === ip.at(-1) && isContainer(n) ? n.children : [n]))),
  /** Moves a node into `parent` before `index`. Undefined when the move isn't allowed. */
  move(items: Layout[], from: Ip, parent: Ip, index: number): Layout[] | undefined {
    const node = nodeAt(items, from)
    if (node === undefined || from.every((x, i) => parent[i] === x)) return // into itself
    if (!fits(items, parent, node)) return
    const to = [...parent]
    const fp = from.slice(0, -1)
    const last = from.at(-1)!
    // removing `from` shifts later siblings (and the path to `parent` through them) up by one
    if (to.length > fp.length && fp.every((x, i) => to[i] === x) && to[fp.length] > last) to[fp.length]--
    if (to.length === fp.length && fp.every((x, i) => to[i] === x) && index > last) index--
    return layoutEdits.insert(layoutEdits.remove(items, from), to, index, node)
  },
}

/** Where a top-level field is placed in the layout. */
export function ipOf(items: Layout[], key: string): Ip | undefined {
  for (let i = 0; i < items.length; i++) {
    const n = items[i]
    if (n === key) return [i]
    const inner = isContainer(n) ? ipOf(n.children, key) : undefined
    if (inner) return [i, ...inner]
  }
}

/** Moves a top-level field's place in the layout to `parent` before `index` (counted before it leaves its old place). */
export function relocate(s: FormSchema, key: string, parent: Ip, index: number): FormSchema {
  const items = s.layout ?? []
  const from = ipOf(items, key)
  const next = from ? layoutEdits.move(items, from, parent, index) : fits(items, parent, key) ? layoutEdits.insert(items, parent, index, key) : undefined
  return next ? { ...s, layout: next } : s
}

// ---- copy and paste ----



export const placedKeys = (items: Layout[]): string[] => items.flatMap((n) => (typeof n === 'string' ? [n] : isContainer(n) ? placedKeys(n.children) : []))
