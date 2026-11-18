// <Builder>: the visual form builder. Holds the schema and its history, and lays out the tabs and panels.
import { createElement as h, Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import { lint } from '../core/lint.ts'
import { text } from '../core/form.ts'
import { Form } from '../react.ts'
import { PALETTE } from './palette.ts'
import { SAMPLES } from '../samples.ts'
import type { Field, Fields, FormSchema, Layout, Text, Values } from '../core/schema.ts'
import { Canvas } from './canvas.ts'
import { type Clip, copyPart, type Part, pasteClip } from './clipboard.ts'
import { EMPTY, itemOf, ITEMS, KINDS } from './items.ts'
import { fits, type Ip, ipOf, isContainer, layoutEdits, nodeAt, relocate } from './layout-edits.ts'
import { Help } from './panels/help.ts'
import { ImagePicker } from './panels/image-picker.ts'
import { OptionsEditor } from './panels/options-editor.ts'
import { TableDesigner } from './panels/table-designer.ts'
import { edits, fieldAt, freeKey } from './schema-edits.ts'
import { asColumn, fromSettings, SETTINGS, toSettings } from './settings/field-settings.ts'
import { FORM_SETTINGS, formSettings, fromFormSettings } from './settings/form-settings.ts'
import { fromNodeSettings, NODE_SETTINGS, NODES, nodeSettings } from './settings/layout-settings.ts'
import { Tree } from './tabs/fields-tab.ts'
import { JsonTab } from './tabs/import-tab.ts'
import { LayoutTab } from './tabs/layout-tab.ts'
import { BUILDER_LABELS, type BuilderProps, type BuilderTab, fill, type Path } from './types.ts'
import { nameFor } from './a11y.ts'

export function Builder(props: BuilderProps) {
  const [past, setPast] = useState<FormSchema[]>([])
  const [future, setFuture] = useState<FormSchema[]>([])
  const [schema, setSchema] = useState<FormSchema>(props.schema ?? EMPTY)
  const [selected, setSelected] = useState<Path | null>(null)
  const [panel, setPanel] = useState(0) // remounts the settings form
  const L = { ...BUILDER_LABELS, ...props.labels }
  const tabs = props.tabs?.length ? props.tabs : (['design', 'build', 'layout', 'preview', 'json'] as BuilderTab[])
  const [tab, setTab] = useState<BuilderTab>(tabs[0])
  const shows = (id: string, group: string) => !props.palette || props.palette.includes(id) || props.palette.includes(group)
  /** The canvas alone, palette and form settings put away. */
  const [wide, setWide] = useState(false)
  const [help, setHelp] = useState(false)
  /** Full width: the palette opened again with "+ Add". */
  const [adding, setAdding] = useState(false)
  /** On the canvas: a selected section, grid, page or text, by its place in the layout. */
  const [node, setNode] = useState<Ip | null>(null)
  const [find, setFind] = useState('')
  /** A key typed in the settings that another field here already has. */
  const [clash, setClash] = useState<string | null>(null)
  const lastPush = useRef(0)
  const issues = useMemo(() => lint(schema), [schema])
  const first = useRef(true)
  useEffect(() => {
    if (!first.current) props.onChange?.(schema, issues)
    first.current = false
  }, [schema])

  /** Typing in the settings panel makes one undo step per pause, not per key. */
  const commit = (next: FormSchema, sel: Path | null = selected, typing = false) => {
    const now = Date.now()
    if (!typing || now - lastPush.current > 800) {
      setPast((p) => [...p.slice(-99), schema])
      setFuture([])
    }
    lastPush.current = typing ? now : 0
    setSchema(next)
    setSelected(sel)
  }
  const travel = (from: FormSchema[], to: (f: (s: FormSchema[]) => FormSchema[]) => void, setFrom: (s: FormSchema[]) => void) => {
    if (!from.length) return
    to((t) => [...t, schema])
    setSchema(from[from.length - 1])
    setFrom(from.slice(0, -1))
    if (selected && !fieldAt(from[from.length - 1].fields, selected)) setSelected(null)
    setPanel((n) => n + 1)
  }
  const undo = () => travel(past, setFuture, setPast)
  const redo = () => travel(future, setPast, setFuture)

  const select = (path: Path | null) => {
    setSelected(path)
    setNode(null)
    setClash(null)
    setPanel((n) => n + 1)
  }
  const selectNode = (ip: Ip | null) => {
    setSelected(null)
    setNode(ip)
    setPanel((n) => n + 1)
  }
  /** Where a new top-level field or layout piece goes: into the selected container, after the selected thing, or at the end. */
  const spot = (s: FormSchema, n: Layout): [Ip, number] | undefined => {
    const items = s.layout
    if (!items) return
    const at = node ?? (selected && ipOf(items, selected[0]))
    if (!at) return
    const there = nodeAt(items, at)
    if (node && isContainer(there) && fits(items, at, n)) return [at, there.children.length]
    if (fits(items, at.slice(0, -1), n)) return [at.slice(0, -1), at.at(-1)! + 1]
  }
  const add = (id: string) => {
    const it = itemOf(id)
    const target = selected ? fieldAt(schema.fields, selected) : undefined
    // into a selected group or list, else after the selected field
    const inside = target && (target.type === 'group' || target.type === 'list')
    const parent = !selected ? [] : inside ? selected : selected.slice(0, -1)
    const key = freeKey(schema.fields, parent, it.base)
    let next = edits.add(schema, parent, key, it.make(), inside ? undefined : selected?.at(-1))
    const to = parent.length ? undefined : spot(schema, key)
    if (to) next = relocate(next, key, ...to)
    commit(next, [...parent, key])
    setNode(null)
    setPanel((n) => n + 1)
  }
  /** A section, grid, steps or text from the canvas palette. A form without a layout gets one, its fields in order. */
  const addNode = (n: Layout) => {
    const s = schema.layout ? schema : { ...schema, layout: Object.keys(schema.fields) }
    const [parent, index] = spot(s, n) ?? [[], s.layout!.length]
    commit({ ...s, layout: layoutEdits.insert(s.layout!, parent, index, n) }, null)
    selectNode([...parent, index])
  }
  /** A drop on the canvas: `on` is the field or layout piece under the pointer. */
  const canvasDrop = (data: DataTransfer, on: { path?: Path; ip?: Ip }) => {
    const kind = data.getData('text/x-fw-kind')
    const made = data.getData('text/x-fw-new')
    const from = data.getData('text/x-fw-path')
    const moved = data.getData('text/x-fw-node')
    const target = on.path && fieldAt(schema.fields, on.path)
    // where in the layout: into a container, else before the thing dropped on
    const s = schema.layout || made || moved ? { ...schema, layout: schema.layout ?? Object.keys(schema.fields) } : schema
    const ip = on.ip ?? (on.path && s.layout ? ipOf(s.layout, on.path[0]) : undefined)
    const box = ip && !on.path ? nodeAt(s.layout!, ip) : undefined
    const where = (n: Layout): [Ip, number] | undefined =>
      !ip ? undefined : isContainer(box) && fits(s.layout!, ip, n) ? [ip, box.children.length] : [ip.slice(0, -1), ip.at(-1)!]
    if (kind) {
      const it = itemOf(kind)
      const into = target && (target.type === 'group' || target.type === 'list')
      const parent = into ? on.path! : on.path?.slice(0, -1) ?? []
      const key = freeKey(schema.fields, parent, it.base)
      let next = edits.add(s, parent, key, it.make())
      if (!into && on.path) next = edits.move(next, [...parent, key], on.path.at(-1)!)
      const to = parent.length ? undefined : where(key)
      if (to) next = relocate(next, key, ...to)
      commit(next, [...parent, key])
      return setPanel((n) => n + 1)
    }
    if (made) {
      const n = JSON.parse(made) as Layout
      const [parent, index] = where(n) ?? [[], s.layout!.length]
      if (!fits(s.layout!, parent, n)) return
      commit({ ...s, layout: layoutEdits.insert(s.layout!, parent, index, n) }, null)
      return selectNode([...parent, index])
    }
    if (moved) {
      const fromIp = moved.split('.').map(Number)
      const to = where(nodeAt(s.layout!, fromIp)!)
      const next = to && layoutEdits.move(s.layout!, fromIp, ...to)
      if (next) { commit({ ...s, layout: next }, null); selectNode(null) }
      return
    }
    if (!from) return
    const path = from.split('.')
    if (path.join('.') === on.path?.join('.')) return
    if (path.length === 1 && s.layout) {
      const to = where(path[0])
      if (to) commit(relocate(s, path[0], ...to), path)
    } else if (on.path && path.slice(0, -1).join('.') === on.path.slice(0, -1).join('.')) commit(edits.move(schema, path, on.path.at(-1)!), path)
  }
  /** A field dragged from the palette: into `parent`, before `before` (null = the end). */
  const place = (id: string, parent: Path, before: string | null) => {
    const it = itemOf(id)
    const key = freeKey(schema.fields, parent, it.base)
    const added = edits.add(schema, parent, key, it.make())
    commit(before === null ? added : edits.move(added, [...parent, key], before), [...parent, key])
    setPanel((n) => n + 1)
  }
  /** The last thing copied in this builder; Ctrl+V also takes one copied in another tab or builder. */
  const [clip, setClip] = useState<Clip | null>(null)
  const [note, setNote] = useState('')
  const say = (m: string) => { setNote(m); setTimeout(() => setNote((x) => (x === m ? '' : x)), 2500) }
  const picked = (): Part => (selected ? { path: selected } : node ? { ip: node } : 'all')
  const CLIP_MARK = 'formweave-clip'
  const copy = (part: Part = picked(), data?: DataTransfer) => {
    const c = copyPart(schema, part)
    if (!c) return
    setClip(c)
    const textOut = JSON.stringify({ [CLIP_MARK]: 1, ...c })
    if (data) data.setData('text/plain', textOut)
    else navigator.clipboard?.writeText(textOut).catch(() => {})
    const n = Object.keys(c.fields).length
    say(part === 'all' ? `Copied the whole form (${n} fields)` : `Copied ${n === 1 && 'path' in part ? 'the field' : `it with ${n} field${n === 1 ? '' : 's'}`}. Paste with Ctrl+V or Paste.`)
  }
  /** Pastes after what is picked (inside a picked group or list, or a picked section on the canvas), else at the end. */
  const paste = (c: Clip | null = clip, at?: { parent: Path; after?: string; place?: [Ip, number] }) => {
    if (!c) return
    const target = selected ? fieldAt(schema.fields, selected) : undefined
    const intoField = !c.layout?.some((n) => typeof n === 'object') && target && (target.type === 'group' || target.type === 'list')
    const parent = at?.parent ?? (!selected || c.layout?.some((n) => typeof n === 'object') ? [] : intoField ? selected : selected.slice(0, -1))
    const after = at ? at.after : parent.length && !intoField ? selected!.at(-1) : !parent.length && selected?.length === 1 ? selected[0] : undefined
    // a pasted section or grid goes after the picked one, not into it
    const first = c.layout?.[0]
    const afterNode: [Ip, number] | undefined = node && typeof first === 'object' && first.type !== 'content' ? [node.slice(0, -1), node.at(-1)! + 1] : undefined
    const place = at?.place ?? (parent.length ? undefined : afterNode ?? spot(schema.layout ? schema : { ...schema, layout: Object.keys(schema.fields) }, first ?? 'x'))
    const { schema: next, keys, placed } = pasteClip(schema, c, parent, after, place)
    const piece = c.layout?.length === 1 && typeof c.layout[0] === 'object'
    commit(next, piece || !keys.length ? null : [...parent, keys[0]])
    if (piece) selectNode(placed ?? null)
    else setPanel((n) => n + 1)
    say(`Pasted ${keys.length} field${keys.length === 1 ? '' : 's'}${keys.length ? `: ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '…' : ''}` : ''}. Change the keys in the settings if you like.`)
  }
  /** A copy right after the original, without touching what was copied. */
  const duplicate = (path?: Path) => {
    const part: Part = path ? { path } : picked()
    const c = copyPart(schema, part)
    if (!c || part === 'all') return
    if ('path' in part) paste(c, { parent: part.path.slice(0, -1), after: part.path.at(-1), place: part.path.length === 1 && schema.layout ? (() => { const ip = ipOf(schema.layout!, part.path[0]); return ip ? [ip.slice(0, -1), ip.at(-1)! + 1] as [Ip, number] : undefined })() : undefined })
    else paste(c, { parent: [], place: [part.ip.slice(0, -1), part.ip.at(-1)! + 1] })
  }
  const remove = (path: Path) => {
    commit(edits.remove(schema, path), null)
  }
  const move = (path: Path, by: -1 | 1) => {
    const parent = path.slice(0, -1)
    const keys = Object.keys(parent.length ? (fieldAt(schema.fields, parent) as { fields: Fields }).fields : schema.fields)
    const i = keys.indexOf(path.at(-1)!)
    const j = i + by
    if (j < 0 || j >= keys.length) return
    commit(edits.move(schema, path, by < 0 ? keys[j] : (keys[j + 1] ?? null)))
  }

  const onSettings = (values: Values) => {
    if (!selected) return
    const wanted = String(values.key ?? '')
    const sibs = selected.length > 1 ? (fieldAt(schema.fields, selected.slice(0, -1)) as { fields: Fields }).fields : schema.fields
    setClash(wanted !== selected.at(-1) && Object.hasOwn(sibs, wanted) ? wanted : null)
    const f = fieldAt(schema.fields, selected)
    if (!f) return
    let next = edits.replace(schema, selected, fromSettings(f, values))
    let path = selected
    const key = String(values.key ?? '')
    const siblings = selected.length > 1 ? (fieldAt(schema.fields, selected.slice(0, -1)) as { fields: Fields }).fields : schema.fields
    if (key !== selected.at(-1) && /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && !Object.hasOwn(siblings, key)) {
      next = edits.rename(next, selected, key)
      path = [...selected.slice(0, -1), key]
    }
    // compare ignoring prop order: the panel rebuilds a field's props in its own order
    const stable = (x: unknown) => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v))
    if (path !== selected || stable(next) !== stable(schema)) commit(next, path, true)
  }

  const typingIn = (t: EventTarget) => (t as HTMLElement).closest?.('input, textarea, select, [contenteditable]')
  const onKey = (e: KeyboardEvent) => {
    if (typingIn(e.target) || !(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) undo()
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo()
    else if (k === 'd' && (selected || node)) duplicate()
    else return
    e.preventDefault()
  }
  // Ctrl+C / Ctrl+V outside a text box copy and paste parts of the form, through the system clipboard
  const onCopy = (e: ClipboardEvent) => {
    if (typingIn(e.target) || window.getSelection()?.toString()) return
    e.preventDefault()
    copy(picked(), e.clipboardData)
  }
  const onPaste = (e: ClipboardEvent) => {
    if (typingIn(e.target)) return
    try {
      const c = JSON.parse(e.clipboardData.getData('text/plain'))
      if (!c?.[CLIP_MARK] || typeof c.fields !== 'object') return
      e.preventDefault()
      const { [CLIP_MARK]: _, ...rest } = c
      paste(rest as Clip)
    } catch {}
  }

  const field = selected ? fieldAt(schema.fields, selected) : undefined
  const paletteButton = (id: string) => h('button', {
    key: id, type: 'button', draggable: true, title: 'Click to add, or drag it into place',
    onClick: () => add(id), onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-kind', id),
  }, '+ ', itemOf(id).label)
  /** Is this field a column of a table? */
  const inTable = (path: Path) => {
    const up = path.length > 1 ? fieldAt(schema.fields, path.slice(0, -1)) : undefined
    return up?.type === 'list' && up.widget === 'table'
  }
  const design = tab === 'design'
  const palette = h('div', { className: 'fw-b-palette', 'aria-label': 'Add a field' },
    h('h3', null, field && (field.type === 'group' || field.type === 'list') ? fill(L.addTo, { name: text(field.label, 'en') || selected!.at(-1)! }) : L.add),
    h('input', { type: 'search', className: 'fw-b-find', placeholder: fill(L.find, { n: ITEMS.filter((i) => shows(i.id, i.group)).length }), 'aria-label': fill(L.find, { n: '' }).replace(/\s*\(\)/, ''), value: find, onChange: (e: ChangeEvent<HTMLInputElement>) => setFind(e.target.value) }),
    [...PALETTE, ...(design ? [['Layout', NODES] as const] : [])].map(([group, list]) => {
      const hits = (list as [string, string, unknown][]).filter(([base, label]) => (group === 'Layout' || shows(base, group)) && (!find || `${label} ${group} ${base}`.toLowerCase().includes(find.toLowerCase())))
      // an accordion: Text starts open; while searching, every group with a hit opens (the key resets them after)
      return hits.length > 0 && h('details', { key: `${group}${find ? '?' : ''}`, className: 'fw-b-group', open: !!find || group === 'Text', name: find ? undefined : 'fw-palette' },
        h('summary', null, group === 'Layout' ? L.layoutPieces : group, h('small', null, ` ${hits.length}`)),
        h('div', null, group === 'Layout'
          ? (hits as typeof NODES).map(([k, label, make]) => h('button', { key: k, type: 'button', draggable: true, title: 'Click to add, or drag it into place', onClick: () => addNode(make()), onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-new', JSON.stringify(make())) }, '+ ', label))
          : hits.map(([base]) => paletteButton(base))))
    }),
    !design && tabs.includes('layout') && h('button', { type: 'button', className: 'fw-b-scan-go', onClick: () => setTab('layout') }, 'Steps, sections, columns…'),
    props.scan && tabs.includes('json') && h('button', { type: 'button', className: 'fw-b-scan-go', onClick: () => setTab('json') }, 'From a PDF or photo…'))
  /** Copy, Paste and Duplicate for what is picked; with nothing picked, Copy takes the whole form. */
  const tool = (label: string, title: string, onClick: () => void, disabled = false) =>
    h('button', { type: 'button', title, 'aria-label': nameFor(label, title), disabled, onClick, className: 'fw-b-clip' }, label)
  const clipTools = h(Fragment, null,
    tool(L.copy, selected || node ? `${L.copy} (Ctrl+C)` : `${L.copy}: the whole form (Ctrl+C)`, () => copy()),
    tool(L.paste, clip ? 'Paste after what is picked (Ctrl+V)' : 'Copy something first', () => paste(), !clip),
    (selected || node) && tool('⧉', `${L.duplicate} (Ctrl+D)`, () => duplicate()))
  const fieldSettings = field && selected && h(Fragment, null,
    h('div', { className: 'fw-b-head' }, h('h3', null, fill(L.settings, { kind: KINDS.find(([k]) => k === field.type)![1] })),
      h('span', { className: 'fw-b-tools' }, clipTools, h('button', { type: 'button', 'aria-label': 'Delete', title: 'Delete', onClick: () => remove(selected) }, '✕'))),
    field.type === 'list' && (field.widget === 'table' || field.widget === 'matrix') && h(TableDesigner, {
      field, pick: (k) => select([...selected, k]),
      set: (f) => { commit(edits.replace(schema, selected, f), selected, true); setPanel((n) => n + 1) },
    }),
    clash && h('p', { className: 'fw-b-clash', role: 'alert' }, `The key "${clash}" is already used by another field here. Keys must be unique, so this field keeps "${selected.at(-1)}" until you type a free one.`),
    h(Form, { key: panel, schema: inTable(selected) ? asColumn(SETTINGS[field.type]) : SETTINGS[field.type], values: toSettings(selected.at(-1)!, field), labels: { submit: 'Done' }, widgets: { options: OptionsEditor }, onChange: (s) => onSettings(s.values), onSubmit: () => select(null) }))
  const piece = node && schema.layout ? nodeAt(schema.layout, node) : undefined
  /** Words typed over a label on the canvas: a field's label, a column heading, a section title, a heading or text. */
  const relabel = (on: { path?: Path; ip?: Ip }, words: string) => {
    const keep = (old: unknown) => (old && typeof old === 'object' ? { ...old, en: words } : words) // other languages stay
    if (on.path) {
      const f = fieldAt(schema.fields, on.path)
      if (!f || text(f.label, 'en') === words) return
      const next = { ...f } as Field
      if (words) next.label = keep(f.label) as Field['label']
      else delete next.label
      commit(edits.replace(schema, on.path, next), on.path)
    } else if (on.ip && schema.layout) {
      const n = nodeAt(schema.layout, on.ip)
      if (typeof n !== 'object' || (n.type !== 'section' && n.type !== 'content')) return
      const next = n.type === 'section' ? { ...n, title: keep(n.title) as Text } : { ...n, text: keep(n.text) as Text }
      commit({ ...schema, layout: layoutEdits.replace(schema.layout, on.ip, next) }, null)
      setNode(on.ip)
    }
    setPanel((n) => n + 1)
  }
  /** A section or grid goes but what was in it stays; a text or field place just goes. */
  const removeNode = () => {
    if (!node || !schema.layout) return
    commit({ ...schema, layout: isContainer(piece) ? layoutEdits.unwrap(schema.layout, node) : layoutEdits.remove(schema.layout, node) }, null)
    selectNode(null)
  }
  return h('div', { className: `fw-builder${props.className ? ` ${props.className}` : ''}`, style: props.vars as CSSProperties, onKeyDown: onKey, onCopy, onPaste },
    h('div', { className: 'fw-b-bar' },
      h('div', { role: 'tablist' },
        tabs.map((t) => h('button', { key: t, type: 'button', role: 'tab', 'aria-selected': tab === t, onClick: () => setTab(t) }, t === 'json' && props.scan ? L.jsonScan : L[t]))),
      h('div', null,
        h('button', { type: 'button', onClick: undo, disabled: !past.length, title: 'Ctrl+Z' }, L.undo),
        h('button', { type: 'button', onClick: redo, disabled: !future.length, title: 'Ctrl+Shift+Z' }, L.redo),
        props.help !== false && h('button', { type: 'button', 'aria-haspopup': 'dialog', onClick: () => setHelp(true) }, L.help))),
    help && h(Help, { close: () => setHelp(false), title: L.helpTitle, closeLabel: L.closeHelp }),
    note && h('p', { className: 'fw-b-note', role: 'status' }, note),
    issues.length > 0 && h('ul', { className: 'fw-b-issues', role: 'status' }, issues.map((i, n) => h('li', { key: n }, h('code', null, i.path || 'schema'), ' ', i.message))),
    design && h('div', { className: `fw-b-main fw-b-design${wide ? ' fw-b-wide' : ''}` },
      (!wide || adding) && palette,
      h(Canvas, { schema, issues: issues.length > 0, selected, node, select, selectNode, drop: canvasDrop, remove: () => (selected ? remove(selected) : removeNode()), wide, setWide, adding, setAdding, relabel, labels: L }),
      // full width: the settings come back only while something is picked
      (!wide || field || typeof piece === 'object') && h('div', { className: 'fw-b-settings' },
        fieldSettings
          || (typeof piece === 'object' && h(Fragment, null,
            h('div', { className: 'fw-b-head' }, h('h3', null, piece.type === 'content' ? 'Content' : piece.type, ' settings'),
              h('span', { className: 'fw-b-tools' }, clipTools, h('button', { type: 'button', 'aria-label': isContainer(piece) ? 'Remove, keep what is inside' : 'Delete', title: isContainer(piece) ? 'Remove, keep what is inside' : 'Delete', onClick: removeNode }, '✕'))),
            h(Form, { key: panel, schema: NODE_SETTINGS[piece.type], values: nodeSettings(piece), widgets: { image: ImagePicker }, labels: { submit: 'Done' }, onSubmit: () => selectNode(null),
              onChange: (st) => { const next = fromNodeSettings(piece, st.values); if (JSON.stringify(next) !== JSON.stringify(piece)) commit({ ...schema, layout: layoutEdits.replace(schema.layout!, node!, next) }, null, true) } })))
          || h(Fragment, null, h('div', { className: 'fw-b-head' }, h('h3', null, L.formSettings), h('span', { className: 'fw-b-tools' }, clipTools)),
            h(Form, { key: panel, schema: FORM_SETTINGS, values: formSettings(schema), labels: { submit: 'Done' }, onSubmit: () => {},
              onChange: (st) => { const next = fromFormSettings(schema, st.values); if (JSON.stringify(next) !== JSON.stringify(schema)) commit(next, null, true) } }),
            h('p', { className: 'fw-help' }, 'Click a field or section on the form to change it. Drag them to move them; drag from the left to add.')))),
    tab === 'build' && h('div', { className: 'fw-b-main' },
      palette,
      h('div', { className: 'fw-b-tree' },
        h('h3', null, L.fields),
        h(Tree, { fields: schema.fields, parent: [], selected, select, move, remove, duplicate, place, drop: (path, before) => commit(edits.move(schema, path, before)) })),
      h('div', { className: 'fw-b-settings' },
        fieldSettings || h('p', { className: 'fw-help' }, L.selectField))),
    tab === 'layout' && h(LayoutTab, { schema, commit: (layout: Layout[] | undefined, typing?: boolean) => commit({ ...schema, layout }, selected, typing), panel, bump: () => setPanel((n) => n + 1) }),
    tab === 'preview' && h('div', { className: 'fw-b-preview' },
      issues.length ? h('p', { className: 'fw-error' }, 'Fix the issues above to preview.') : h(Form, { schema, onSubmit: () => {} })),
    tab === 'json' && h(JsonTab, { schema, scan: props.scan, samples: props.samples === false ? [] : (props.samples ?? SAMPLES), heading: L.samples, load: (s) => commit(s, null) }))
}

/**
 * A choice's options, one line each: value, label, remove. Enter adds the next, "Paste a list" takes many at once
 * (a line each, `value | label`), and "Conditions" shows a "show only when" box per option for cascading choices.
 */
