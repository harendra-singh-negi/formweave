// The visual builder. Its settings panel is itself a formweave form.
import { createElement as h, Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { lint, type Issue } from './lint.ts'
import { text } from './form.ts'
import { fromJsonSchema, type Imported } from './jsonschema.ts'
import { Form } from './react.ts'
import { DATE_FORMATS, type Field, type Fields, type FormSchema, type Layout, type Values, type Grid } from './schema.ts'

type Path = string[]
type Kind = Field['type']

export interface BuilderProps {
  /** Where to start. Later changes to this prop are ignored; the builder keeps its own history. */
  schema?: FormSchema
  /** Every change, with what lint() finds. Save it only when `issues` is empty. */
  onChange?(schema: FormSchema, issues: Issue[]): void
  /**
   * Reads photos, scans or PDFs into a form: usually `(files, progress) => scanForm(files, { progress })`
   * from formweave/scan. Without it, the Import tab has no "from a photo" part.
   */
  scan?(files: File[], progress: (message: string) => void): Promise<Imported>
}

const KINDS: [Kind, string][] = [
  ['string', 'Text'], ['number', 'Number'], ['boolean', 'Yes / No'], ['choice', 'Choice'],
  ['date', 'Date'], ['file', 'File'], ['group', 'Group'], ['list', 'List / table'],
]
const NEW: Record<Kind, () => Field> = {
  string: () => ({ type: 'string', label: 'Text' }),
  number: () => ({ type: 'number', label: 'Number' }),
  boolean: () => ({ type: 'boolean', label: 'Yes / No' }),
  choice: () => ({ type: 'choice', label: 'Choice', options: ['Option 1', 'Option 2'] }),
  date: () => ({ type: 'date', label: 'Date' }),
  file: () => ({ type: 'file', label: 'File' }),
  group: () => ({ type: 'group', label: 'Group', fields: {} }),
  list: () => ({ type: 'list', label: 'List', widget: 'table', min: 1, fields: {} }),
}
const EMPTY: FormSchema = { version: 1, fields: {} }

// ---- schema edits: each returns a new schema ----

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
function inMap(fields: Fields, parent: Path, fn: (m: [string, Field][]) => [string, Field][]): Fields {
  if (!parent.length) return Object.fromEntries(fn(Object.entries(fields)))
  const [k, ...rest] = parent
  const f = fields[k] as Extract<Field, { fields: Fields }>
  return { ...fields, [k]: { ...f, fields: inMap(f.fields, rest, fn) } }
}

/** Keeps the layout pointing at top-level keys: rename (to a key) or drop (to null). */
function relayout(items: Layout[] | undefined, fn: (key: string) => string | null): Layout[] | undefined {
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

const formula = (label: string, placeholder: string): Field => ({ type: 'string', label, placeholder, help: 'A formula. Leave empty for none.' })

function settingsSchema(kind: Kind): FormSchema {
  const input = kind !== 'group' && kind !== 'list'
  const f: Fields = {
    key: { type: 'string', label: 'Key', required: true, pattern: '[A-Za-z][A-Za-z0-9_]*', help: 'Its name in the submitted data', messages: { pattern: 'Letters, digits and _, starting with a letter' } },
    label: { type: 'string', label: 'Label' },
    help: { type: 'string', label: 'Help text' },
  }
  if (input) f.required = { type: 'boolean', widget: 'toggle', label: 'Required' }
  f.visible = formula('Show only when', "employment == 'Self Employed'")
  if (input) f.value = formula('Calculated value', 'qty * price')
  const num = (label: string): Field => ({ type: 'number', label })
  const pick = (label: string, options: string[]): Field => ({ type: 'choice', label, options })
  switch (kind) {
    case 'string':
      Object.assign(f, { format: pick('Format', ['email', 'url', 'phone']), widget: pick('Shown as', ['textarea', 'password']), minLength: num('Fewest characters'), maxLength: num('Most characters'), pattern: { type: 'string', label: 'Pattern (regular expression)' } })
      break
    case 'number':
      Object.assign(f, { min: num('Smallest'), max: num('Largest'), decimals: num('Decimal places'), format: pick('Format', ['currency', 'percent']) })
      break
    case 'choice':
      Object.assign(f, {
        options: { type: 'list', label: 'Options', widget: 'table', min: 1, fields: { value: { type: 'string', label: 'Value', required: true }, label: { type: 'string', label: 'Label (if different)' } } },
        multiple: { type: 'boolean', widget: 'toggle', label: 'Allow several' },
        widget: pick('Shown as', ['radio', 'select']),
      })
      break
    case 'date':
      Object.assign(f, { format: pick('Format', Object.keys(DATE_FORMATS)), min: { type: 'string', label: 'Earliest' }, max: { type: 'string', label: 'Latest' } })
      break
    case 'file':
      Object.assign(f, { accept: { type: 'string', label: 'Allowed types', placeholder: 'image/*,.pdf' }, multiple: { type: 'boolean', widget: 'toggle', label: 'Allow several' }, maxSize: num('Largest file (bytes)') })
      break
    case 'list':
      Object.assign(f, { min: num('Fewest rows'), max: num('Most rows'), widget: pick('Shown as', ['table']) })
      break
  }
  return { version: 1, fields: f }
}
const SETTINGS = Object.fromEntries(KINDS.map(([k]) => [k, settingsSchema(k)])) as Record<Kind, FormSchema>

/** Settings names that map 1:1 onto field props. */
const PLAIN = ['format', 'widget', 'minLength', 'maxLength', 'pattern', 'min', 'max', 'decimals', 'multiple', 'accept', 'maxSize']

function toSettings(key: string, f: Field): Values {
  const any = f as unknown as Record<string, unknown>
  const s: Values = { key, label: text(f.label, 'en'), help: text(f.help, 'en'), visible: typeof f.visible === 'string' ? f.visible : null }
  if ('required' in f) s.required = !!f.required
  if ('value' in f) s.value = f.value ?? null
  for (const k of PLAIN) if (any[k] !== undefined) s[k] = any[k]
  if (f.type === 'choice') s.options = f.options.map((o) => (typeof o === 'string' ? { value: o, label: null } : { value: o.value, label: text(o.label, 'en') || null }))
  return s
}

function fromSettings(f: Field, s: Values): Field {
  const out: Record<string, unknown> = { ...f }
  const put = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === '' || v === false) delete out[k]
    else out[k] = v
  }
  // a label kept per locale keeps its other languages
  const words = (old: unknown, v: unknown) => (old && typeof old === 'object' ? { ...old, en: v } : v)
  put('label', s.label ? words(f.label, s.label) : null)
  put('help', s.help ? words(f.help, s.help) : null)
  put('visible', s.visible)
  if ('required' in s) put('required', s.required ? (typeof (f as { required?: unknown }).required === 'string' ? (f as { required?: unknown }).required : true) : null)
  if ('value' in s) put('value', s.value)
  for (const k of PLAIN) if (k in s) put(k, s[k])
  if (f.type === 'choice' && Array.isArray(s.options))
    out.options = (s.options as Values[]).filter((o) => o.value).map((o) => (o.label ? { value: o.value, label: o.label } : o.value))
  return out as unknown as Field
}

// ---- the builder ----

/** Drag helpers: mark the innermost row under the pointer so people see where a drop lands. */
const dragOver = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  e.currentTarget.classList.add('fw-b-over')
}
const dragLeave = (e: DragEvent) => {
  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.classList.remove('fw-b-over')
}
const dragEnd = (e: DragEvent) => e.currentTarget.classList.remove('fw-b-over')


export function Builder(props: BuilderProps) {
  const [past, setPast] = useState<FormSchema[]>([])
  const [future, setFuture] = useState<FormSchema[]>([])
  const [schema, setSchema] = useState<FormSchema>(props.schema ?? EMPTY)
  const [selected, setSelected] = useState<Path | null>(null)
  const [panel, setPanel] = useState(0) // remounts the settings form
  const [tab, setTab] = useState<'build' | 'layout' | 'preview' | 'json'>('build')
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
    setPanel((n) => n + 1)
  }
  const add = (kind: Kind) => {
    const target = selected ? fieldAt(schema.fields, selected) : undefined
    // into a selected group or list, else after the selected field
    const inside = target && (target.type === 'group' || target.type === 'list')
    const parent = !selected ? [] : inside ? selected : selected.slice(0, -1)
    const key = freeKey(schema.fields, parent, kind === 'string' ? 'text' : kind)
    commit(edits.add(schema, parent, key, NEW[kind](), inside ? undefined : selected?.at(-1)), [...parent, key])
    setPanel((n) => n + 1)
  }
  /** A field dragged from the palette: into `parent`, before `before` (null = the end). */
  const place = (kind: Kind, parent: Path, before: string | null) => {
    const key = freeKey(schema.fields, parent, kind === 'string' ? 'text' : kind)
    const added = edits.add(schema, parent, key, NEW[kind]())
    commit(before === null ? added : edits.move(added, [...parent, key], before), [...parent, key])
    setPanel((n) => n + 1)
  }
  const duplicate = (path: Path) => {
    const parent = path.slice(0, -1)
    const key = freeKey(schema.fields, parent, path.at(-1)!.replace(/\d+$/, ''))
    commit(edits.add(schema, parent, key, structuredClone(fieldAt(schema.fields, path)!), path.at(-1)), [...parent, key])
    setPanel((n) => n + 1)
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

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, select, [contenteditable]') || !(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) undo()
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo()
    else return
    e.preventDefault()
  }

  const field = selected ? fieldAt(schema.fields, selected) : undefined
  return h('div', { className: 'fw-builder', onKeyDown: onKey },
    h('div', { className: 'fw-b-bar' },
      h('div', { role: 'tablist' },
        (['build', 'layout', 'preview', 'json'] as const).map((t) => h('button', { key: t, type: 'button', role: 'tab', 'aria-selected': tab === t, onClick: () => setTab(t) }, { build: 'Fields', layout: 'Layout', preview: 'Preview', json: 'Import / JSON' }[t]))),
      h('div', null,
        h('button', { type: 'button', onClick: undo, disabled: !past.length, title: 'Ctrl+Z' }, 'Undo'),
        h('button', { type: 'button', onClick: redo, disabled: !future.length, title: 'Ctrl+Shift+Z' }, 'Redo'))),
    issues.length > 0 && h('ul', { className: 'fw-b-issues', role: 'status' }, issues.map((i, n) => h('li', { key: n }, h('code', null, i.path || 'schema'), ' ', i.message))),
    tab === 'build' && h('div', { className: 'fw-b-main' },
      h('div', { className: 'fw-b-palette', 'aria-label': 'Add a field' },
        h('h3', null, 'Add'),
        KINDS.map(([k, label]) => h('button', { key: k, type: 'button', draggable: true, title: 'Click to add, or drag it into place', onClick: () => add(k), onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-kind', k) }, '+ ', label))),
      h('div', { className: 'fw-b-tree' },
        h('h3', null, 'Fields'),
        h(Tree, { fields: schema.fields, parent: [], selected, select, move, remove, duplicate, place, drop: (path, before) => commit(edits.move(schema, path, before)) })),
      h('div', { className: 'fw-b-settings' },
        field && selected
          ? h(Fragment, null, h('h3', null, KINDS.find(([k]) => k === field.type)![1], ' settings'),
              h(Form, { key: panel, schema: SETTINGS[field.type], values: toSettings(selected.at(-1)!, field), labels: { submit: 'Done' }, onChange: (s) => onSettings(s.values), onSubmit: () => select(null) }))
          : h('p', { className: 'fw-help' }, 'Select a field to change it.'))),
    tab === 'layout' && h(LayoutTab, { schema, commit: (layout: Layout[] | undefined, typing?: boolean) => commit({ ...schema, layout }, selected, typing), panel, bump: () => setPanel((n) => n + 1) }),
    tab === 'preview' && h('div', { className: 'fw-b-preview' },
      issues.length ? h('p', { className: 'fw-error' }, 'Fix the issues above to preview.') : h(Form, { schema, onSubmit: () => {} })),
    tab === 'json' && h(JsonTab, { schema, scan: props.scan, load: (s) => commit(s, null) }))
}

interface TreeProps {
  fields: Fields
  parent: Path
  selected: Path | null
  select(p: Path): void
  move(p: Path, by: -1 | 1): void
  remove(p: Path): void
  duplicate(p: Path): void
  drop(p: Path, before: string | null): void
  place(kind: Kind, parent: Path, before: string | null): void
}

function Tree(p: TreeProps): ReactNode {
  const same = (a: Path | null, b: Path) => !!a && a.join('.') === b.join('.')
  const onDrop = (e: DragEvent, before: string | null) => {
    dragEnd(e)
    const kind = e.dataTransfer.getData('text/x-fw-kind') as Kind
    if (kind) {
      e.preventDefault()
      e.stopPropagation()
      return p.place(kind, p.parent, before)
    }
    const from = e.dataTransfer.getData('text/x-fw-path').split('.')
    // only among siblings: moving between groups would change the data's shape
    if (from.slice(0, -1).join('.') !== p.parent.join('.')) return
    e.preventDefault()
    e.stopPropagation()
    if (from.at(-1) !== before) p.drop(from, before)
  }
  return h('ul', { className: 'fw-b-list', onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => onDrop(e, null) },
    Object.keys(p.fields).length === 0 && h('li', { className: 'fw-b-drop', onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => onDrop(e, null) },
      p.parent.length ? 'Empty: drag a field here' : 'Drag a field here, or click one on the left'),
    Object.entries(p.fields).map(([key, f]): ReactNode => {
      const path = [...p.parent, key]
      const on = same(p.selected, path)
      return h('li', { key, onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => onDrop(e, key) },
        h('div', { className: 'fw-b-item', 'aria-current': on || undefined },
          h('button', {
            type: 'button', className: 'fw-b-pick', draggable: true, onClick: () => p.select(path),
            onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-path', path.join('.')),
          }, h('span', null, text(f.label, 'en') || key), h('small', null, ` ${key} · ${f.type}`)),
          on && h('span', { className: 'fw-b-tools' },
            h('button', { type: 'button', 'aria-label': 'Move up', onClick: () => p.move(path, -1) }, '↑'),
            h('button', { type: 'button', 'aria-label': 'Move down', onClick: () => p.move(path, 1) }, '↓'),
            h('button', { type: 'button', 'aria-label': 'Duplicate', onClick: () => p.duplicate(path) }, '⧉'),
            h('button', { type: 'button', 'aria-label': 'Delete', onClick: () => p.remove(path) }, '✕'))),
        (f.type === 'group' || f.type === 'list') && h(Tree, { ...p, fields: f.fields, parent: path }))
    }))
}

function JsonTab({ schema, load, scan }: { schema: FormSchema; load(s: FormSchema): void; scan?: BuilderProps['scan'] }) {
  const [draft, setDraft] = useState(() => JSON.stringify(schema, null, 2))
  const [problems, setProblems] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [reading, setReading] = useState<string | null>(null)
  const read = async (picked: FileList | null) => {
    const files = Array.from(picked ?? [])
    if (!scan || !files.length) return
    setReading('Reading…')
    setProblems([])
    setNotes([])
    try {
      const r = await scan(files, setReading)
      load(r.schema)
      setDraft(JSON.stringify(r.schema, null, 2))
      setNotes([`Read ${Object.keys(r.schema.fields).length} fields. Check them on the Fields tab; Undo brings back the form you had.`, ...r.warnings])
    } catch (e) {
      setProblems([(e as Error).message])
    } finally {
      setReading(null)
    }
  }
  const apply = () => {
    try {
      let s = JSON.parse(draft)
      let notes: string[] = []
      // a JSON Schema (OpenAPI, Zod's z.toJSONSchema()…) is turned into a form
      if (s && typeof s === 'object' && s.version === undefined && (s.properties || s.$schema || s.type === 'object')) {
        const r = fromJsonSchema(s)
        s = r.schema
        notes = r.warnings.map((w) => `Imported with a change: ${w}`)
      }
      const found = lint(s)
      setProblems(found.map((i) => `${i.path || 'schema'}: ${i.message}`))
      setNotes(notes)
      if (!found.length) {
        load(s)
        setDraft(JSON.stringify(s, null, 2))
      }
    } catch (e) {
      setProblems([(e as Error).message])
    }
  }
  return h('div', { className: 'fw-b-json' },
    scan && h('div', { className: 'fw-b-scan' },
      h('h3', null, 'From a photo, scan or PDF'),
      h('p', { className: 'fw-help' }, 'Pick pictures of the pages (on a phone, take them with the camera) or a PDF. They are read on this device, nothing is uploaded, and the form found replaces this one.'),
      h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, disabled: reading !== null, 'aria-label': 'Pages to read', onChange: (e: { target: HTMLInputElement }) => { read(e.target.files); e.target.value = '' } }),
      reading && h('p', { role: 'status' }, reading)),
    h('h3', null, 'JSON'),
    h('p', { className: 'fw-help' }, 'Paste a formweave schema, or a JSON Schema (OpenAPI, Zod…) to turn it into a form.'),
    h('textarea', { 'aria-label': 'Schema JSON', value: draft, spellCheck: false, onChange: (e: { target: { value: string } }) => setDraft(e.target.value) }),
    problems.length > 0 && h('ul', { className: 'fw-error', role: 'alert' }, problems.map((m, i) => h('li', { key: i }, m))),
    notes.length > 0 && h('ul', { className: 'fw-help', role: 'status' }, notes.map((m, i) => h('li', { key: i }, m))),
    h('div', null,
      h('button', { type: 'button', onClick: apply }, 'Apply'), ' ',
      h('button', { type: 'button', onClick: () => navigator.clipboard?.writeText(JSON.stringify(schema, null, 2)) }, 'Copy')))
}

// ---- layout editing ----

/** A node in the layout, by index: [0, 2] is the third child of the first item. */
type Ip = number[]
type Container = Exclude<Layout, string | { type: 'content' }>
const isContainer = (n: Layout | undefined): n is Container => typeof n === 'object' && n.type !== 'content'

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
function inList(items: Layout[], parent: Ip, fn: (l: Layout[]) => Layout[]): Layout[] {
  if (!parent.length) return fn(items)
  const [i, ...rest] = parent
  return items.map((n, j) => (j === i && isContainer(n) ? ({ ...n, children: inList(n.children, rest, fn) } as Layout) : n))
}

/** May `node` go into the list at `parent`? Pages hold only sections. */
const fits = (items: Layout[], parent: Ip, node: Layout) => {
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

const placedKeys = (items: Layout[]): string[] => items.flatMap((n) => (typeof n === 'string' ? [n] : isContainer(n) ? placedKeys(n.children) : []))

const NODES: [string, string, () => Layout][] = [
  ['section', 'Section', () => ({ type: 'section', title: 'Section', children: [] })],
  ['grid', 'Grid (columns)', () => ({ type: 'grid', cols: 2, children: [] })],
  ['pages', 'Pages / steps', () => ({ type: 'pages', display: 'steps', children: [{ type: 'section', title: 'Step 1', children: [] }] })],
  ['heading', 'Heading', () => ({ type: 'content', as: 'heading', text: 'Heading' })],
  ['text', 'Text', () => ({ type: 'content', as: 'text', text: 'Some text' })],
  ['divider', 'Divider', () => ({ type: 'content', as: 'divider' })],
]

const showWhen = formula('Show only when', "employment == 'Self Employed'")
const cols = (label: string): Field => ({ type: 'number', label, min: 1, max: 12, decimals: 0 })
const NODE_SETTINGS: Record<string, FormSchema> = {
  section: { version: 1, fields: { title: { type: 'string', label: 'Title' }, visible: showWhen } },
  grid: { version: 1, fields: {
    base: cols('Columns on phones'), sm: cols('Columns from 480px'), md: cols('Columns from 640px'), lg: cols('Columns from 960px'), visible: showWhen,
  }, layout: [{ type: 'grid', cols: 2, children: ['base', 'sm', 'md', 'lg'] }, 'visible'] },
  pages: { version: 1, fields: { display: { type: 'choice', label: 'Shown as', options: ['steps', 'tabs', 'accordion'], required: true }, visible: showWhen } },
  content: { version: 1, fields: { as: { type: 'choice', label: 'Kind', options: ['heading', 'text', 'divider'], required: true }, text: { type: 'string', widget: 'textarea', label: 'Text' }, visible: showWhen } },
}

function nodeSettings(n: Container | Extract<Layout, { type: 'content' }>): Values {
  const visible = typeof n.visible === 'string' ? n.visible : null
  switch (n.type) {
    case 'section': return { title: text(n.title, 'en') || null, visible }
    case 'grid': {
      const c = typeof n.cols === 'number' ? { base: 1, md: n.cols } : (n.cols ?? {})
      return { base: c.base ?? null, sm: c.sm ?? null, md: c.md ?? null, lg: c.lg ?? null, visible }
    }
    case 'pages': return { display: n.display ?? 'steps', visible }
    case 'content': return { as: n.as ?? 'text', text: text(n.text, 'en') || null, visible }
  }
}

function fromNodeSettings(n: Exclude<Layout, string>, s: Values): Layout {
  const out: Record<string, unknown> = { ...n }
  const put = (k: string, v: unknown) => (v === null || v === undefined || v === '' ? delete out[k] : (out[k] = v))
  const words = (old: unknown, v: unknown) => (v && old && typeof old === 'object' ? { ...old, en: v } : v)
  put('visible', s.visible)
  if (n.type === 'section') put('title', words(n.title, s.title))
  if (n.type === 'pages') put('display', s.display)
  if (n.type === 'content') { put('as', s.as); put('text', s.as === 'divider' ? null : words(n.text, s.text)) }
  if (n.type === 'grid') {
    const c = Object.fromEntries(['base', 'sm', 'md', 'lg'].filter((k) => typeof s[k] === 'number').map((k) => [k, s[k]]))
    put('cols', Object.keys(c).length ? (c as Grid['cols']) : null)
  }
  return out as unknown as Layout
}

interface LayoutTabProps {
  schema: FormSchema
  commit(layout: Layout[] | undefined, typing?: boolean): void
  panel: number
  bump(): void
}

function LayoutTab({ schema, commit, panel, bump }: LayoutTabProps) {
  const [sel, setSel] = useState<Ip | null>(null)
  const items = schema.layout
  if (!items)
    return h('div', { className: 'fw-b-layout-empty' },
      h('p', null, 'Fields show one after another. Start a layout to group them into sections, columns or steps.'),
      h('button', { type: 'button', onClick: () => commit(Object.keys(schema.fields)) }, 'Start a layout'))

  const node = sel ? nodeAt(items, sel) : undefined
  const select = (ip: Ip | null) => { setSel(ip); bump() }
  /** Where a new node goes: into the selected container, else after the selected node, else at the end. */
  const target = (n: Layout): [Ip, number] => {
    if (sel && isContainer(node) && fits(items, sel, n)) return [sel, node.children.length]
    if (sel && fits(items, sel.slice(0, -1), n)) return [sel.slice(0, -1), sel.at(-1)! + 1]
    return [[], items.length]
  }
  const add = (n: Layout) => {
    const [parent, index] = target(n)
    commit(layoutEdits.insert(items, parent, index, n))
    select([...parent, index])
  }
  const unplaced = Object.keys(schema.fields).filter((k) => !placedKeys(items).includes(k))
  const move = (from: Ip, parent: Ip, index: number) => {
    const next = layoutEdits.move(items, from, parent, index)
    if (next) { commit(next); select(null) }
  }
  const insert = (parent: Ip, index: number, n: Layout) => {
    if (!fits(items, parent, n)) return
    commit(layoutEdits.insert(items, parent, index, n))
    select([...parent, index])
  }
  const newNode = (n: () => Layout) => ({ draggable: true, title: 'Click to add, or drag it into place', onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-new', JSON.stringify(n())) })
  const onSettings = (v: Values) => {
    if (!sel || typeof node !== 'object') return
    const next = fromNodeSettings(node, v)
    if (JSON.stringify(next) !== JSON.stringify(node)) commit(layoutEdits.replace(items, sel, next), true)
  }

  return h('div', { className: 'fw-b-main' },
    h('div', { className: 'fw-b-palette', 'aria-label': 'Add to the layout' },
      h('h3', null, 'Add'),
      NODES.map(([k, label, make]) => h('button', { key: k, type: 'button', onClick: () => add(make()), ...newNode(make) }, '+ ', label)),
      unplaced.length > 0 && h('h3', null, 'Not placed'),
      unplaced.map((k) => h('button', { key: k, type: 'button', onClick: () => add(k), ...newNode(() => k) }, '+ ', text(schema.fields[k].label, 'en') || k))),
    h('div', { className: 'fw-b-tree' },
      h('h3', null, 'Layout'),
      h(LayoutTree, { items: items, all: items, parent: [], sel, select, move, insert, schema,
            remove: (ip: Ip) => { commit(isContainer(nodeAt(items, ip)) ? layoutEdits.unwrap(items, ip) : layoutEdits.remove(items, ip)); select(null) } }),
      h('p', null, h('button', { type: 'button', onClick: () => { commit(undefined); select(null) } }, 'Remove the layout'))),
    h('div', { className: 'fw-b-settings' },
      typeof node === 'object'
        ? h(Fragment, null, h('h3', null, node.type === 'content' ? 'Content' : node.type, ' settings'),
            h(Form, { key: panel, schema: NODE_SETTINGS[node.type], values: nodeSettings(node), labels: { submit: 'Done' }, onChange: (s) => onSettings(s.values), onSubmit: () => select(null) }))
        : h('p', { className: 'fw-help' }, typeof node === 'string' ? 'A field. Change it on the Fields tab.' : 'Select a section, grid, page or text to change it. Drag anything to move it.')))
}

interface LayoutTreeProps {
  items: Layout[]
  all: Layout[]
  parent: Ip
  sel: Ip | null
  schema: FormSchema
  select(ip: Ip): void
  move(from: Ip, parent: Ip, index: number): void
  insert(parent: Ip, index: number, n: Layout): void
  remove(ip: Ip): void
}

function LayoutTree(p: LayoutTreeProps): ReactNode {
  const drop = (e: DragEvent, index: number) => {
    dragEnd(e)
    const made = e.dataTransfer.getData('text/x-fw-new')
    if (made) {
      e.preventDefault()
      e.stopPropagation()
      return p.insert(p.parent, index, JSON.parse(made))
    }
    const raw = e.dataTransfer.getData('text/x-fw-node')
    if (!raw) return
    e.preventDefault()
    e.stopPropagation()
    p.move(raw.split('.').map(Number), p.parent, index)
  }
  const name = (n: Layout) => {
    if (typeof n === 'string') return [text(p.schema.fields[n]?.label, 'en') || n, ` ${n} · field`]
    switch (n.type) {
      case 'section': return [text(n.title, 'en') || 'Section', ' section']
      case 'grid': return ['Columns', ` grid · ${typeof n.cols === 'number' ? n.cols : Object.values(n.cols ?? { base: 1 }).join('/')}`]
      case 'pages': return ['Pages', ` ${n.display ?? 'steps'}`]
      case 'content': return [n.as === 'divider' ? '———' : text(n.text, 'en').slice(0, 40) || '…', ` ${n.as ?? 'text'}`]
    }
  }
  return h('ul', { className: 'fw-b-list', onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => drop(e, p.items.length) },
    p.items.length === 0 && h('li', { className: 'fw-b-drop', onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => drop(e, 0) }, 'Empty: drag something here'),
    p.items.map((n, i): ReactNode => {
      const ip = [...p.parent, i]
      const on = !!p.sel && p.sel.join('.') === ip.join('.')
      const [title, kind] = name(n)
      const siblings = p.items.length
      return h('li', { key: i, onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => drop(e, i) },
        h('div', { className: 'fw-b-item', 'aria-current': on || undefined },
          h('button', {
            type: 'button', className: `fw-b-pick${isContainer(n) ? ' fw-b-box' : ''}`, draggable: true, onClick: () => p.select(ip),
            onDragStart: (e: DragEvent) => { e.stopPropagation(); e.dataTransfer.setData('text/x-fw-node', ip.join('.')) },
          }, h('span', null, title), h('small', null, kind)),
          on && h('span', { className: 'fw-b-tools' },
            h('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onClick: () => p.move(ip, p.parent, i - 1) }, '↑'),
            h('button', { type: 'button', 'aria-label': 'Move down', disabled: i === siblings - 1, onClick: () => p.move(ip, p.parent, i + 2) }, '↓'),
            h('button', { type: 'button', 'aria-label': isContainer(n) ? 'Remove, keep what is inside' : 'Remove from the layout', onClick: () => p.remove(ip) }, '✕'))),
        isContainer(n) && h(LayoutTree, { ...p, items: n.children, parent: ip }))
    }))
}
