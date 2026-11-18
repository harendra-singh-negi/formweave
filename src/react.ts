// No JSX, so tests run in plain Node without a build step.
import {
  createContext, createElement as h, Fragment, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type ChangeEvent, type ComponentType, type CSSProperties, type FormEvent, type ReactNode,
} from 'react'
import { evaluate, parse, truthy, type Node } from './expr.ts'
import { createForm, text, type Form as Store, type FormState, type Options } from './form.ts'
import type {
  ChoiceField, DateField, Field, FileField, FileRef, FormSchema, Grid, Layout, ListField, NumberField, Pages, Section, StringField, Values, When,
} from './schema.ts'

/** What a widget gets. It draws only the control; label, help and error are drawn around it. */
export interface WidgetProps {
  field: Field
  path: string
  id: string
  value: unknown
  label: string
  required: boolean
  readOnly: boolean
  /** Shown once the field was touched or the form submitted. */
  error?: string
  describedBy?: string
  locale?: string
  set(value: unknown): void
  touch(): void
}

/** Your own components, by widget name ('signature') or type ('string'). */
export type Widgets = Record<string, ComponentType<WidgetProps>>

const LABELS = { submit: 'Submit', next: 'Next', back: 'Back', addRow: '+ Add row', removeRow: 'Remove row', remove: 'Remove' }

export interface FormProps extends Options {
  schema: FormSchema
  values?: Values
  /** Your own store from createForm(), to read or change it from outside. */
  form?: Store
  widgets?: Widgets
  labels?: Partial<typeof LABELS>
  onSubmit?(values: Values): void | Promise<void>
  onChange?(state: FormState): void
  /** Stores a picked file and says how to find it. Without it, the file's name is its id. */
  onUpload?(file: File): Promise<FileRef>
}

interface Ctx {
  form: Store
  state: FormState
  schema: FormSchema
  widgets: Widgets
  labels: typeof LABELS
  locale?: string
  context?: Record<string, unknown>
  onUpload?: FormProps['onUpload']
  id: string
  compact: boolean
  page: number
  setPage(i: number): void
  busy: boolean
}
const Context = createContext<Ctx | null>(null)
const useCtx = () => {
  const c = useContext(Context)
  if (!c) throw new Error('formweave widgets must be inside <Form>')
  return c
}

/** The form's store and state, for a UI of your own. */
export function useForm(schema: FormSchema, opts: Options & { values?: Values; form?: Store } = {}) {
  const form = useMemo(() => opts.form ?? createForm(schema, opts), [schema, opts.form])
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState)
  const contextKey = JSON.stringify(opts.context ?? null)
  useEffect(() => {
    if (opts.context) form.setContext(opts.context)
  }, [form, contextKey])
  return { form, state }
}

export function Form(props: FormProps) {
  const { schema } = props
  const { form, state } = useForm(schema, props)
  const id = useId()
  const ref = useRef<HTMLFormElement>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => props.onChange?.(state), [state])
  const layout = schema.layout ?? Object.keys(schema.fields)
  const pages = layout.find((l): l is Pages => typeof l === 'object' && l.type === 'pages')
  const focusError = () => setTimeout(() => ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = form.submit()
    if (!r.ok) {
      const first = Object.keys(r.errors)[0].split('.')[0]
      const i = pages ? visiblePages(pages, state, props.context).findIndex((s) => keysOf(s).includes(first)) : -1
      if (i >= 0) setPage(i)
      return focusError()
    }
    setBusy(true)
    try {
      await props.onSubmit?.(r.values)
    } finally {
      setBusy(false)
    }
  }

  const ctx: Ctx = {
    form, state, schema, id, page, setPage, busy,
    widgets: { ...WIDGETS, ...props.widgets },
    labels: { ...LABELS, ...props.labels },
    locale: props.locale,
    context: props.context,
    onUpload: props.onUpload,
    compact: false,
  }
  return h(Context.Provider, { value: ctx },
    h('form', { ref, className: 'fw-form', noValidate: true, onSubmit: submit },
      h(Nodes, { items: layout }),
      !pages && h(SubmitButton)))
}

// ---- layout ----

function Nodes({ items }: { items: Layout[] }) {
  return h(Fragment, null, items.map((item, i) => h(LayoutView, { key: i, item })))
}

function LayoutView({ item }: { item: Layout }): ReactNode {
  const c = useCtx()
  if (typeof item === 'string') return h(Shell, { path: item, field: c.schema.fields[item] })
  if (!shown(item.visible, c.state, c.context)) return null
  switch (item.type) {
    case 'content':
      return item.as === 'divider' ? h('hr', { className: 'fw-divider' })
        : h(item.as === 'heading' ? 'h3' : 'p', { className: 'fw-content' }, text(item.text, c.locale))
    case 'section':
      return h('section', { className: 'fw-section' }, item.title && h('h3', null, text(item.title, c.locale)), h(Nodes, { items: item.children }))
    case 'grid':
      return h('div', { className: 'fw-grid', style: gridVars(item.cols) }, h(Nodes, { items: item.children }))
    case 'pages':
      return h(PagesView, { item })
  }
}

/** A plain number is that many columns from medium width up, one on phones. */
function gridVars(cols: Grid['cols']): CSSProperties {
  const c = typeof cols === 'number' ? { base: 1, md: cols } : (cols ?? {})
  return { '--fw-cols': c.base ?? 1, '--fw-cols-sm': c.sm, '--fw-cols-md': c.md, '--fw-cols-lg': c.lg } as CSSProperties
}

function PagesView({ item }: { item: Pages }) {
  const c = useCtx()
  const pages = visiblePages(item, c.state, c.context)
  const i = Math.max(0, Math.min(c.page, pages.length - 1))
  const body = useRef<HTMLElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (moved.current) body.current?.focus() // say where we are after Next / Back
    moved.current = true
  }, [i])
  const title = (s: Section, j: number) => text(s.title, c.locale) || `${j + 1}`

  if (item.display === 'accordion')
    return h('div', { className: 'fw-accordion' },
      pages.map((s, j) => h('details', { key: j, open: j === 0 }, h('summary', null, title(s, j)), h(Nodes, { items: s.children }))),
      h(SubmitButton))
  if (!pages.length) return h(SubmitButton)

  const next = () => {
    const keys = keysOf(pages[i])
    const bad = Object.keys(c.state.errors).some((p) => keys.includes(p.split('.')[0]))
    if (!bad) return c.setPage(i + 1)
    for (const k of keys) c.form.touch(k)
    setTimeout(() => body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }
  const tabs = item.display === 'tabs'
  return h('div', { className: 'fw-pages' },
    tabs
      ? h('div', { role: 'tablist', className: 'fw-tabs' },
          pages.map((s, j) => h('button', { key: j, type: 'button', role: 'tab', 'aria-selected': j === i, onClick: () => c.setPage(j) }, title(s, j))))
      : h('ol', { className: 'fw-steps' },
          pages.map((s, j) => h('li', { key: j, 'aria-current': j === i ? 'step' : undefined }, title(s, j)))),
    h('section', { ref: body, tabIndex: -1, className: 'fw-page', role: tabs ? 'tabpanel' : undefined, 'aria-label': title(pages[i], i) },
      h(Nodes, { items: pages[i].children })),
    tabs ? h(SubmitButton)
      : h('div', { className: 'fw-nav' },
          i > 0 && h('button', { type: 'button', onClick: () => c.setPage(i - 1) }, c.labels.back),
          i < pages.length - 1 ? h('button', { type: 'button', onClick: next }, c.labels.next) : h(SubmitButton)))
}

function SubmitButton() {
  const c = useCtx()
  return h('button', { type: 'submit', className: 'fw-submit', disabled: c.busy }, c.labels.submit)
}

const visiblePages = (p: Pages, state: FormState, context?: Values) => p.children.filter((s) => shown(s.visible, state, context))

/** Top-level field keys placed under a layout node. */
function keysOf(item: Layout): string[] {
  if (typeof item === 'string') return [item]
  return item.type === 'content' ? [] : item.children.flatMap(keysOf)
}

const parsed = new Map<string, Node>()
/** A section's or content's `visible`, read against the form's values. */
function shown(w: When | undefined, state: FormState, context?: Values): boolean {
  if (w === undefined || typeof w === 'boolean') return w !== false
  let n = parsed.get(w)
  if (!n) parsed.set(w, (n = parse(w)))
  return truthy(evaluate(n, (path) => (path[0] === 'context' ? dig(context, path.slice(1)) : dig(state.values, path))))
}

function dig(v: unknown, path: string[]): unknown {
  if (!path.length) return v
  if (Array.isArray(v)) return v.map((x) => dig(x, path))
  return v && typeof v === 'object' && Object.hasOwn(v, path[0]) ? dig((v as Values)[path[0]], path.slice(1)) : null
}

// ---- fields ----

const humanize = (key: string) => key.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase()).replace(/ \w/g, (s) => s.toLowerCase())
const at = (values: Values, path: string) => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Values)[k] : undefined), values)

/** Label, help and error around a widget. */
function Shell({ path, field }: { path: string; field: Field }) {
  const c = useCtx()
  const st = c.state.fields[path]
  if (!st?.visible) return null
  const id = `${c.id}${path}`
  const parts = path.split('.')
  const touched = c.state.submitted || parts.some((_, i) => c.state.touched[parts.slice(0, i + 1).join('.')])
  const e = c.state.errors[path]
  const error = e && touched ? e.message : undefined
  const label = text(field.label, c.locale) || humanize(parts[parts.length - 1])
  const help = text(field.help, c.locale)
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const Widget = c.widgets[field.widget ?? ''] ?? c.widgets[field.type]
  const control = h(Widget, {
    field, path, id, label, error, describedBy, locale: c.locale,
    value: at(c.state.values, path), required: st.required, readOnly: st.readOnly,
    set: (v: unknown) => c.form.set(path, v), touch: () => c.form.touch(path),
  })
  const mark = st.required && h('span', { className: 'fw-required', 'aria-hidden': true }, ' *')
  const notes = h(Fragment, null,
    help && h('div', { id: `${id}-help`, className: 'fw-help' }, help),
    error && h('div', { id: `${id}-error`, className: 'fw-error' }, error))
  if (field.type === 'group' || field.type === 'list')
    return h('fieldset', { className: `fw-field fw-${field.type}` }, h('legend', null, label, mark), control, notes)
  if (field.type === 'boolean')
    return h('div', { className: 'fw-field fw-check' }, h('label', { htmlFor: id }, control, ' ', label, mark), notes)
  return h('div', { className: 'fw-field' }, h('label', { htmlFor: id, className: c.compact ? 'fw-sr' : undefined }, label, mark), control, notes)
}

const aria = (p: WidgetProps) => ({
  id: p.id,
  'aria-invalid': p.error ? true : undefined,
  'aria-describedby': p.describedBy,
  'aria-required': p.required || undefined,
})
const textValue = (v: unknown) => (v == null ? '' : String(v))

function StringInput(p: WidgetProps) {
  const f = p.field as StringField
  const attrs = {
    ...aria(p), readOnly: p.readOnly, value: textValue(p.value), maxLength: f.maxLength, minLength: f.minLength,
    placeholder: text(f.placeholder, p.locale) || undefined, onBlur: p.touch,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => p.set(e.target.value),
  }
  if (f.widget === 'textarea') return h('textarea', { ...attrs, rows: 4 })
  const type = f.widget === 'password' ? 'password' : f.format === 'email' ? 'email' : f.format === 'url' ? 'url' : f.format === 'phone' ? 'tel' : 'text'
  return h('input', { ...attrs, type, autoComplete: f.widget === 'password' ? 'off' : undefined })
}

function NumberInput(p: WidgetProps) {
  const f = p.field as NumberField
  return h('input', {
    ...aria(p), type: 'number', inputMode: 'decimal', readOnly: p.readOnly, value: textValue(p.value),
    min: f.min, max: f.max, step: f.decimals != null ? 10 ** -f.decimals : 'any',
    placeholder: text(f.placeholder, p.locale) || undefined,
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value), onBlur: p.touch,
  })
}

function BooleanInput(p: WidgetProps) {
  return h('input', {
    ...aria(p), type: 'checkbox', role: p.field.widget === 'toggle' ? 'switch' : undefined, disabled: p.readOnly, checked: p.value === true,
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.checked), onBlur: p.touch,
  })
}

function ChoiceInput(p: WidgetProps) {
  const f = p.field as ChoiceField
  const opts = f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: text(o.label, p.locale) || o.value }))
  if (f.multiple && f.widget !== 'select') {
    const picked = Array.isArray(p.value) ? (p.value as string[]) : []
    return h('div', { ...aria(p), role: 'group', 'aria-label': p.label, className: 'fw-options' },
      opts.map((o) => h('label', { key: o.value },
        h('input', {
          type: 'checkbox', disabled: p.readOnly, checked: picked.includes(o.value), onBlur: p.touch,
          onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.checked ? [...picked, o.value] : picked.filter((x) => x !== o.value)),
        }), ' ', o.label)))
  }
  if (f.widget === 'radio')
    return h('div', { ...aria(p), role: 'radiogroup', 'aria-label': p.label, className: 'fw-options' },
      opts.map((o) => h('label', { key: o.value },
        h('input', { type: 'radio', name: p.id, disabled: p.readOnly, checked: p.value === o.value, onChange: () => p.set(o.value), onBlur: p.touch }),
        ' ', o.label)))
  if (f.multiple)
    return h('select', {
      ...aria(p), multiple: true, disabled: p.readOnly, value: Array.isArray(p.value) ? (p.value as string[]) : [], onBlur: p.touch,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => p.set(Array.from(e.target.selectedOptions, (o) => o.value)),
    }, opts.map((o) => h('option', { key: o.value, value: o.value }, o.label)))
  return h('select', {
    ...aria(p), disabled: p.readOnly, value: textValue(p.value), onBlur: p.touch,
    onChange: (e: ChangeEvent<HTMLSelectElement>) => p.set(e.target.value),
  }, h('option', { value: '' }, text(f.placeholder, p.locale) || '—'), opts.map((o) => h('option', { key: o.value, value: o.value }, o.label)))
}

const DATE_INPUTS = { date: 'date', time: 'time', datetime: 'datetime-local', month: 'month', week: 'week', year: 'number' }

function DateInput(p: WidgetProps) {
  const f = p.field as DateField
  return h('input', {
    ...aria(p), type: DATE_INPUTS[f.format ?? 'date'], readOnly: p.readOnly, value: textValue(p.value), min: f.min, max: f.max,
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value), onBlur: p.touch,
  })
}

function FileInput(p: WidgetProps) {
  const f = p.field as FileField
  const c = useCtx()
  const files = (f.multiple ? (Array.isArray(p.value) ? p.value : []) : p.value ? [p.value] : []) as FileRef[]
  const pick = async (list: FileList | null) => {
    // ponytail: a failed upload rejects to your onUpload caller; no retry UI yet
    const refs = await Promise.all(Array.from(list ?? [], (x) => c.onUpload?.(x) ?? Promise.resolve({ id: x.name, name: x.name, size: x.size, type: x.type })))
    p.set(f.multiple ? [...files, ...refs] : (refs[0] ?? null))
    p.touch()
  }
  return h('div', { className: 'fw-files' },
    h('input', { ...aria(p), type: 'file', accept: f.accept, multiple: f.multiple, disabled: p.readOnly, onChange: (e: ChangeEvent<HTMLInputElement>) => pick(e.target.files) }),
    files.map((x, i) => h('div', { key: `${x.id}-${i}`, className: 'fw-file' }, x.name,
      !p.readOnly && h('button', { type: 'button', 'aria-label': `${c.labels.remove} ${x.name}`, onClick: () => p.set(f.multiple ? files.filter((_, j) => j !== i) : null) }, '×'))))
}

function GroupInput(p: WidgetProps) {
  const fields = (p.field as { fields: Record<string, Field> }).fields
  return h(Fragment, null, Object.entries(fields).map(([k, f]) => h(Shell, { key: k, path: `${p.path}.${k}`, field: f })))
}

function ListInput(p: WidgetProps) {
  const f = p.field as ListField
  const c = useCtx()
  const rows = Array.isArray(p.value) ? p.value : []
  const cols = Object.entries(f.fields)
  const add = !p.readOnly && (f.max == null || rows.length < f.max) &&
    h('button', { type: 'button', className: 'fw-add', onClick: () => c.form.addRow(p.path) }, c.labels.addRow)
  const remove = (i: number) => !p.readOnly && rows.length > (f.min ?? 0) &&
    h('button', { type: 'button', className: 'fw-remove', 'aria-label': `${c.labels.removeRow} ${i + 1}`, onClick: () => c.form.removeRow(p.path, i) }, '×')
  const cell = (i: number, k: string, field: Field) => h(Shell, { key: k, path: `${p.path}.${i}.${k}`, field })
  if (f.widget === 'table')
    return h(Fragment, null,
      h('div', { className: 'fw-table-wrap' },
        h('table', { className: 'fw-table' },
          h('thead', null, h('tr', null, cols.map(([k, sf]) => h('th', { key: k }, text(sf.label, c.locale) || humanize(k))), h('th'))),
          h('tbody', null, rows.map((_, i) => h('tr', { key: i },
            cols.map(([k, sf]) => h('td', { key: k }, h(Context.Provider, { value: { ...c, compact: true } }, cell(i, k, sf)))),
            h('td', null, remove(i))))))),
      add)
  return h(Fragment, null,
    rows.map((_, i) => h('div', { key: i, className: 'fw-row' }, cols.map(([k, sf]) => cell(i, k, sf)), remove(i))),
    add)
}

/** The built-in widgets, by type. */
export const WIDGETS: Widgets = {
  string: StringInput,
  number: NumberInput,
  boolean: BooleanInput,
  choice: ChoiceInput,
  date: DateInput,
  file: FileInput,
  group: GroupInput,
  list: ListInput,
}
