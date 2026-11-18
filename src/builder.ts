// The visual builder. Its settings panel is itself a formweave form.
import { createElement as h, Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { lint, type Issue } from './lint.ts'
import { text } from './form.ts'
import { fromJsonSchema, type Imported } from './jsonschema.ts'
import { Form } from './react.ts'
import { DATE_FORMATS, type ChoiceField, type Field, type Fields, type FormSchema, type Grid, type Layout, type ListField, type Values } from './schema.ts'

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
/** Every input, ready-made and grouped, so people find a radio group or a signature pad without knowing the settings behind it. */
const opts2 = ['Option 1', 'Option 2']
const range = (f: Field, label: string): Field => ({ type: 'group', label, fields: {
  from: { ...f, label: 'From' } as Field,
  to: { ...f, label: 'To', check: 'empty(from) or empty(to) or to >= from', messages: { check: 'Must not be before From' } } as Field,
} })
const id = (label: string, pattern: string, example: string): Field => ({ type: 'string', label, pattern, placeholder: example, messages: { pattern: `Like ${example}` } })
const PALETTE: [string, [string, string, Field][]][] = [
  ['Text', [
    ['text', 'Short text', { type: 'string', label: 'Text' }],
    ['longText', 'Long text', { type: 'string', label: 'Long text', widget: 'textarea' }],
    ['email', 'Email', { type: 'string', label: 'Email', format: 'email' }],
    ['phone', 'Phone', { type: 'string', label: 'Phone', format: 'phone' }],
    ['intlPhone', 'Phone + country code', { type: 'string', label: 'Phone', widget: 'phone', format: 'phone', country: 'IN' }],
    ['website', 'Website', { type: 'string', label: 'Website', format: 'url' }],
    ['password', 'Password', { type: 'string', label: 'Password', widget: 'password' }],
    ['search', 'Search', { type: 'string', label: 'Search', widget: 'search' }],
  ]],
  ['Numbers', [
    ['number', 'Number', { type: 'number', label: 'Number' }],
    ['stepper', 'Number with − / +', { type: 'number', label: 'Quantity', widget: 'stepper', min: 0, decimals: 0 }],
    ['amount', 'Amount (₹)', { type: 'number', label: 'Amount', format: 'currency', currency: 'INR', decimals: 2, min: 0 }],
    ['percent', 'Percent', { type: 'number', label: 'Percent', format: 'percent', min: 0, max: 100 }],
    ['slider', 'Slider', { type: 'number', label: 'Slider', widget: 'slider', min: 0, max: 100 }],
    ['numberRange', 'Number range', range({ type: 'number' }, 'Range')],
    ['rating', 'Rating (stars)', { type: 'number', label: 'Rating', widget: 'rating', min: 1, max: 5, decimals: 0 }],
  ]],
  ['Choices', [
    ['radio', 'Radio group', { type: 'choice', label: 'Pick one', widget: 'radio', options: opts2 }],
    ['checkboxes', 'Checkbox group', { type: 'choice', label: 'Pick any', multiple: true, options: opts2 }],
    ['dropdown', 'Dropdown', { type: 'choice', label: 'Dropdown', widget: 'select', options: opts2 }],
    ['multiSelect', 'Multi-select dropdown', { type: 'choice', label: 'Pick several', multiple: true, widget: 'select', options: opts2 }],
    ['buttonGroup', 'Button group', { type: 'choice', label: 'Pick one', widget: 'buttons', options: ['Low', 'Medium', 'High'] }],
    ['yesNo', 'Yes / No buttons', { type: 'choice', label: 'Yes or no', widget: 'buttons', options: ['Yes', 'No'] }],
    ['checkbox', 'Single checkbox', { type: 'boolean', label: 'I agree' }],
    ['toggle', 'Switch', { type: 'boolean', label: 'Switch', widget: 'toggle' }],
    ['autocomplete', 'Autocomplete', { type: 'choice', label: 'Search and pick', widget: 'autocomplete', options: opts2 }],
    ['tags', 'Tags', { type: 'choice', label: 'Tags', widget: 'tags', multiple: true, allowOther: true, options: ['Urgent', 'Follow up'] }],
    ['country', 'Country', { type: 'string', label: 'Country', format: 'country' }],
    ['matrix', 'Matrix (rate each row)', { type: 'list', label: 'Rate each', widget: 'matrix', rows: ['Quality', 'Speed', 'Support'], fields: { rating: { type: 'choice', label: 'Rating', options: ['Poor', 'Fair', 'Good', 'Excellent'] } } }],
    ['cascading', 'Cascading dropdowns', { type: 'group', label: 'Place', fields: {
      state: { type: 'choice', label: 'State', widget: 'select', options: ['Maharashtra', 'Karnataka'] },
      city: { type: 'choice', label: 'City', widget: 'select', options: [
        { value: 'Mumbai', visible: "state == 'Maharashtra'" }, { value: 'Pune', visible: "state == 'Maharashtra'" },
        { value: 'Bengaluru', visible: "state == 'Karnataka'" }, { value: 'Mysuru', visible: "state == 'Karnataka'" },
      ] },
    } }],
  ]],
  ['Date & time', [
    ['date', 'Date', { type: 'date', label: 'Date' }],
    ['time', 'Time', { type: 'date', label: 'Time', format: 'time' }],
    ['dateTime', 'Date & time', { type: 'date', label: 'Date & time', format: 'datetime' }],
    ['dateRange', 'Date range', range({ type: 'date' }, 'Dates')],
    ['timeRange', 'Time range', range({ type: 'date', format: 'time' }, 'Times')],
    ['month', 'Month', { type: 'date', label: 'Month', format: 'month' }],
    ['week', 'Week', { type: 'date', label: 'Week', format: 'week' }],
    ['year', 'Year', { type: 'date', label: 'Year', format: 'year' }],
  ]],
  ['Files', [
    ['file', 'File', { type: 'file', label: 'File' }],
    ['images', 'Images', { type: 'file', label: 'Images', accept: 'image/*', multiple: true }],
    ['photo', 'Photo / camera', { type: 'file', label: 'Photo', widget: 'camera', accept: 'image/*' }],
    ['document', 'Document', { type: 'file', label: 'Document', accept: '.pdf,.doc,.docx,.xls,.xlsx' }],
    ['video', 'Video', { type: 'file', label: 'Video', accept: 'video/*' }],
    ['audio', 'Audio', { type: 'file', label: 'Audio', accept: 'audio/*' }],
  ]],
  ['Advanced', [
    ['richText', 'Rich text', { type: 'string', label: 'Description', widget: 'richtext' }],
    ['map', 'Map location', { type: 'string', label: 'Location', widget: 'map', pattern: '-?\\d{1,2}(\\.\\d+)?, ?-?\\d{1,3}(\\.\\d+)?', messages: { pattern: 'Like 28.6139,77.2090' } }],
    ['signature', 'Signature', { type: 'string', label: 'Signature', widget: 'signature' }],
    ['otp', 'OTP / code', { type: 'string', label: 'OTP', widget: 'otp', minLength: 6, maxLength: 6, pattern: '[0-9]*', messages: { pattern: 'Digits only' } }],
    ['location', 'Location', { type: 'string', label: 'Location', widget: 'location', pattern: '-?\\d{1,2}(\\.\\d+)?, ?-?\\d{1,3}(\\.\\d+)?', messages: { pattern: 'Like 28.6139,77.2090' } }],
    ['barcode', 'QR / barcode', { type: 'string', label: 'Code', widget: 'barcode' }],
    ['color', 'Colour', { type: 'string', label: 'Colour', format: 'color' }],
    ['markdown', 'Markdown', { type: 'string', label: 'Notes', widget: 'markdown', help: 'Markdown: **bold**, _italic_, - lists' }],
    ['code', 'Code', { type: 'string', label: 'Code', widget: 'code' }],
    ['json', 'JSON', { type: 'string', label: 'JSON', widget: 'json', format: 'json' }],
    ['hidden', 'Hidden value', { type: 'string', label: 'Hidden', widget: 'hidden' }],
  ]],
  ['Money & IDs', [
    ['card', 'Card number', { type: 'string', label: 'Card number', format: 'card' }],
    ['iban', 'IBAN', { type: 'string', label: 'IBAN', format: 'iban' }],
    ['account', 'Bank account', id('Account number', '\\d{9,18}', '123456789012')],
    ['ifsc', 'IFSC', id('IFSC', '[A-Z]{4}0[A-Z0-9]{6}', 'SBIN0001234')],
    ['pan', 'PAN', id('PAN', '[A-Z]{5}\\d{4}[A-Z]', 'ABCDE1234F')],
    ['aadhaar', 'Aadhaar', id('Aadhaar', '\\d{12}', '123412341234')],
    ['gstin', 'GSTIN', id('GSTIN', '\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]', '27ABCDE1234F1Z5')],
    ['pincode', 'PIN code', id('PIN code', '[1-9]\\d{5}', '411001')],
  ]],
  ['Groups & tables', [
    ['group', 'Group', NEW.group()],
    ['fullName', 'Full name', { type: 'group', label: 'Name', fields: { first: { type: 'string', label: 'First name' }, last: { type: 'string', label: 'Last name' } } }],
    ['address', 'Address', { type: 'group', label: 'Address', fields: {
      line1: { type: 'string', label: 'Address line 1' }, line2: { type: 'string', label: 'Address line 2' },
      city: { type: 'string', label: 'City' }, state: { type: 'string', label: 'State' },
      pincode: { type: 'string', label: 'PIN code', pattern: '[1-9]\\d{5}' }, country: { type: 'string', label: 'Country', format: 'country', default: 'IN' },
    } }],
    ['table', 'Table (add rows)', NEW.list()],
    ['fixedTable', 'Table with fixed rows', { type: 'list', label: 'Table', widget: 'table', rows: ['Row 1', 'Row 2'], rowHeading: 'Item', fields: { value: { type: 'string', label: 'Answer' } } }],
    ['cards', 'Repeating cards', { type: 'list', label: 'Entries', min: 1, fields: {} }],
  ]],
]

interface Item { id: string; label: string; base: string; group: string; make(): Field }
const ITEMS: Item[] = PALETTE.flatMap(([group, list]) => list.map(([base, label, f]) => ({ id: base, label, base, group, make: () => structuredClone(f) })))
const itemOf = (id: string) => ITEMS.find((i) => i.id === id)!
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

const cssClasses: Field = { type: 'string', label: 'CSS classes', placeholder: 'my-class another', help: 'Your own classes, separated by spaces. Style them in your app.', pattern: '[A-Za-z0-9_ :/.\\[\\]-]*', messages: { pattern: 'Class names only' } }
const formula = (label: string, placeholder: string): Field => ({ type: 'string', label, placeholder, help: 'A formula. Leave empty for none.' })

function settingsSchema(kind: Kind): FormSchema {
  const input = kind !== 'group' && kind !== 'list'
  const f: Fields = {
    key: { type: 'string', label: 'Key', required: true, pattern: '[A-Za-z][A-Za-z0-9_]*', help: 'Its name in the submitted data', messages: { pattern: 'Letters, digits and _, starting with a letter' } },
    label: { type: 'string', label: 'Label' },
    help: { type: 'string', label: 'Help text' },
  }
  if (input) f.required = { type: 'boolean', widget: 'toggle', label: 'Required' }
  f.readOnly = { type: 'boolean', widget: 'toggle', label: 'Read-only', help: 'Shown but can\'t be changed.' }
  f.visible = formula('Show only when', "employment == 'Self Employed'")
  if (input) f.value = formula('Calculated value', 'qty * price')
  const num = (label: string): Field => ({ type: 'number', label })
  const pick = (label: string, options: string[]): Field => ({ type: 'choice', label, options })
  switch (kind) {
    case 'string':
      Object.assign(f, { format: pick('Format', ['email', 'url', 'phone', 'color', 'country', 'card', 'iban', 'json']), widget: pick('Shown as', ['textarea', 'password', 'search', 'phone', 'otp', 'signature', 'location', 'map', 'barcode', 'richtext', 'markdown', 'code', 'json', 'hidden']), minLength: num('Fewest characters'), maxLength: num('Most characters'), pattern: { type: 'string', label: 'Pattern (regular expression)' } })
      break
    case 'number':
      Object.assign(f, {
        min: num('Smallest'), max: num('Largest'), decimals: num('Decimal places'), format: pick('Format', ['currency', 'percent']),
        currency: { type: 'string', label: 'Currency code', placeholder: 'INR', help: 'Shown in front of the box, e.g. INR shows ₹.', pattern: '[A-Z]{3}', visible: "format == 'currency'" },
        widget: { ...pick('Shown as', ['stepper', 'slider', 'rating', 'hidden']), help: 'A rating has as many stars as Largest (5 when empty).' },
      })
      break
    case 'choice':
      Object.assign(f, {
        options: { type: 'list', label: 'Options', widget: 'table', min: 1, fields: { value: { type: 'string', label: 'Value', required: true }, label: { type: 'string', label: 'Label (if different)' }, visible: { type: 'string', label: 'Show only when', placeholder: "state == 'Maharashtra'" } },
          help: '"Show only when" makes cascading choices: the option is offered only while its formula holds.' },
        multiple: { type: 'boolean', widget: 'toggle', label: 'Allow several' },
        widget: pick('Shown as', ['radio', 'select', 'buttons', 'autocomplete', 'tags']),
        allowOther: { type: 'boolean', widget: 'toggle', label: 'Allow other answers', help: 'People may type answers that aren\'t in the list (tags, "Other").' },
      })
      break
    case 'boolean':
      Object.assign(f, { widget: pick('Shown as', ['toggle']) })
      break
    case 'date':
      Object.assign(f, { format: pick('Format', Object.keys(DATE_FORMATS)), min: { type: 'string', label: 'Earliest' }, max: { type: 'string', label: 'Latest' } })
      break
    case 'file':
      Object.assign(f, { widget: { ...pick('Shown as', ['camera']), help: 'Camera opens the camera on a phone.' }, accept: { type: 'string', label: 'Allowed types', placeholder: 'image/*,.pdf' }, multiple: { type: 'boolean', widget: 'toggle', label: 'Allow several' }, maxSize: num('Largest file (bytes)') })
      break
    case 'list':
      Object.assign(f, {
        widget: { type: 'choice', widget: 'radio', label: 'Shown as', required: true, options: [
          { value: 'table', label: 'Table: a row per line, fields as columns' },
          { value: 'list', label: 'List: each row a card, fields stacked' },
          { value: 'matrix', label: 'Matrix: a statement per row, the first choice\'s options as columns (needs fixed rows)' },
        ] },
        rows: { type: 'string', widget: 'textarea', label: 'Fixed rows (one per line)', placeholder: 'Monday\nTuesday\nWednesday',
          help: 'Each line is a row with that text in its first column, which people can\'t change. Leave empty to let people add rows.' },
        rowHeading: { type: 'string', label: 'Heading over the fixed rows', placeholder: 'Day', visible: 'not empty(rows)' },
        min: { ...num('Rows at the start'), help: 'Also the fewest allowed. People add more with "+ Add row" while filling it in.', visible: 'empty(rows)' },
        max: { ...num('Most rows'), help: 'Leave empty for no limit.', visible: 'empty(rows)' },
      })
      break
  }
  f.className = cssClasses
  return { version: 1, fields: f }
}
/** A table's column: its label is the column heading. */
const asColumn = (s: FormSchema): FormSchema => ({ ...s, fields: { ...s.fields, label: { type: 'string', label: 'Column heading', help: 'Shown at the top of the column, and above the box on a phone.' } } })
const SETTINGS = Object.fromEntries(KINDS.map(([k]) => [k, settingsSchema(k)])) as Record<Kind, FormSchema>

/** Settings names that map 1:1 onto field props. */
const PLAIN = ['format', 'widget', 'minLength', 'maxLength', 'pattern', 'min', 'max', 'decimals', 'multiple', 'accept', 'maxSize', 'className', 'currency', 'allowOther', 'country']

function toSettings(key: string, f: Field): Values {
  const any = f as unknown as Record<string, unknown>
  const s: Values = { key, label: text(f.label, 'en'), help: text(f.help, 'en'), visible: typeof f.visible === 'string' ? f.visible : null }
  if ('required' in f) s.required = !!f.required
  s.readOnly = !!f.readOnly
  if ('value' in f) s.value = f.value ?? null
  for (const k of PLAIN) if (any[k] !== undefined) s[k] = any[k]
  if (f.type === 'list') Object.assign(s, { widget: f.widget ?? 'list', rows: f.rows?.map((r) => text(r, 'en')).join('\n') || null, rowHeading: text(f.rowHeading, 'en') || null })
  if (f.type === 'choice') s.options = f.options.map((o) => (typeof o === 'string' ? { value: o, label: null, visible: null } : { value: o.value, label: text(o.label, 'en') || null, visible: typeof o.visible === 'string' ? o.visible : null }))
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
  if ('readOnly' in s) put('readOnly', s.readOnly ? (typeof f.readOnly === 'string' ? f.readOnly : true) : null)
  if ('required' in s) put('required', s.required ? (typeof (f as { required?: unknown }).required === 'string' ? (f as { required?: unknown }).required : true) : null)
  if ('value' in s) put('value', s.value)
  for (const k of PLAIN) if (k in s) put(k, s[k])
  if (f.type === 'list' && s.widget === 'list') put('widget', null)
  if (f.type === 'list' && 'rows' in s) {
    const rows = String(s.rows ?? '').split('\n').map((r) => r.trim()).filter(Boolean)
    put('rows', rows.length ? rows : null)
    put('rowHeading', rows.length ? s.rowHeading : null)
  }
  if (f.type === 'choice' && Array.isArray(s.options))
    out.options = (s.options as Values[]).filter((o) => o.value).map((o) => (o.label || o.visible ? { value: o.value, ...(o.label ? { label: o.label } : {}), ...(o.visible ? { visible: o.visible } : {}) } : o.value))
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
  const [tab, setTab] = useState<'design' | 'build' | 'layout' | 'preview' | 'json'>('design')
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
    h('h3', null, field && (field.type === 'group' || field.type === 'list') ? `Add to ${text(field.label, 'en') || selected!.at(-1)}` : 'Add'),
    h('input', { type: 'search', className: 'fw-b-find', placeholder: `Find an input (${ITEMS.length})`, 'aria-label': 'Find an input', value: find, onChange: (e: ChangeEvent<HTMLInputElement>) => setFind(e.target.value) }),
    [...PALETTE, ...(design ? [['Layout', NODES] as const] : [])].map(([group, list]) => {
      const hits = (list as [string, string, unknown][]).filter(([base, label]) => !find || `${label} ${group} ${base}`.toLowerCase().includes(find.toLowerCase()))
      // an accordion: Text starts open; while searching, every group with a hit opens (the key resets them after)
      return hits.length > 0 && h('details', { key: `${group}${find ? '?' : ''}`, className: 'fw-b-group', open: !!find || group === 'Text', name: find ? undefined : 'fw-palette' },
        h('summary', null, group, h('small', null, ` ${hits.length}`)),
        h('div', null, group === 'Layout'
          ? (hits as typeof NODES).map(([k, label, make]) => h('button', { key: k, type: 'button', draggable: true, title: 'Click to add, or drag it into place', onClick: () => addNode(make()), onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-new', JSON.stringify(make())) }, '+ ', label))
          : hits.map(([base]) => paletteButton(base))))
    }),
    !design && h('button', { type: 'button', className: 'fw-b-scan-go', onClick: () => setTab('layout') }, 'Steps, sections, columns…'),
    props.scan && h('button', { type: 'button', className: 'fw-b-scan-go', onClick: () => setTab('json') }, 'From a PDF or photo…'))
  const fieldSettings = field && selected && h(Fragment, null,
    h('div', { className: 'fw-b-head' }, h('h3', null, KINDS.find(([k]) => k === field.type)![1], ' settings'),
      design && h('span', { className: 'fw-b-tools' },
        h('button', { type: 'button', 'aria-label': 'Duplicate', title: 'Duplicate', onClick: () => duplicate(selected) }, '⧉'),
        h('button', { type: 'button', 'aria-label': 'Delete', title: 'Delete', onClick: () => remove(selected) }, '✕'))),
    field.type === 'list' && (field.widget === 'table' || field.widget === 'matrix') && h(TableDesigner, {
      field, pick: (k) => select([...selected, k]),
      set: (f) => { commit(edits.replace(schema, selected, f), selected, true); setPanel((n) => n + 1) },
    }),
    clash && h('p', { className: 'fw-b-clash', role: 'alert' }, `The key "${clash}" is already used by another field here. Keys must be unique, so this field keeps "${selected.at(-1)}" until you type a free one.`),
    h(Form, { key: panel, schema: inTable(selected) ? asColumn(SETTINGS[field.type]) : SETTINGS[field.type], values: toSettings(selected.at(-1)!, field), labels: { submit: 'Done' }, onChange: (s) => onSettings(s.values), onSubmit: () => select(null) }))
  const piece = node && schema.layout ? nodeAt(schema.layout, node) : undefined
  /** A section or grid goes but what was in it stays; a text or field place just goes. */
  const removeNode = () => {
    if (!node || !schema.layout) return
    commit({ ...schema, layout: isContainer(piece) ? layoutEdits.unwrap(schema.layout, node) : layoutEdits.remove(schema.layout, node) }, null)
    selectNode(null)
  }
  return h('div', { className: 'fw-builder', onKeyDown: onKey },
    h('div', { className: 'fw-b-bar' },
      h('div', { role: 'tablist' },
        (['design', 'build', 'layout', 'preview', 'json'] as const).map((t) => h('button', { key: t, type: 'button', role: 'tab', 'aria-selected': tab === t, onClick: () => setTab(t) }, { design: 'Design', build: 'Fields', layout: 'Layout', preview: 'Preview', json: props.scan ? 'Scan / Import' : 'Import / JSON' }[t]))),
      h('div', null,
        h('button', { type: 'button', onClick: undo, disabled: !past.length, title: 'Ctrl+Z' }, 'Undo'),
        h('button', { type: 'button', onClick: redo, disabled: !future.length, title: 'Ctrl+Shift+Z' }, 'Redo'))),
    issues.length > 0 && h('ul', { className: 'fw-b-issues', role: 'status' }, issues.map((i, n) => h('li', { key: n }, h('code', null, i.path || 'schema'), ' ', i.message))),
    design && h('div', { className: 'fw-b-main fw-b-design' },
      palette,
      h(Canvas, { schema, issues: issues.length > 0, selected, node, select, selectNode, drop: canvasDrop, remove: () => (selected ? remove(selected) : removeNode()) }),
      h('div', { className: 'fw-b-settings' },
        fieldSettings
          || (typeof piece === 'object' && h(Fragment, null,
            h('div', { className: 'fw-b-head' }, h('h3', null, piece.type === 'content' ? 'Content' : piece.type, ' settings'),
              h('span', { className: 'fw-b-tools' }, h('button', { type: 'button', 'aria-label': isContainer(piece) ? 'Remove, keep what is inside' : 'Delete', title: isContainer(piece) ? 'Remove, keep what is inside' : 'Delete', onClick: removeNode }, '✕'))),
            h(Form, { key: panel, schema: NODE_SETTINGS[piece.type], values: nodeSettings(piece), labels: { submit: 'Done' }, onSubmit: () => selectNode(null),
              onChange: (st) => { const next = fromNodeSettings(piece, st.values); if (JSON.stringify(next) !== JSON.stringify(piece)) commit({ ...schema, layout: layoutEdits.replace(schema.layout!, node!, next) }, null, true) } })))
          || h(Fragment, null, h('h3', null, 'Form settings'),
            h(Form, { key: panel, schema: FORM_SETTINGS, values: formSettings(schema), labels: { submit: 'Done' }, onSubmit: () => {},
              onChange: (st) => { const next = fromFormSettings(schema, st.values); if (JSON.stringify(next) !== JSON.stringify(schema)) commit(next, null, true) } }),
            h('p', { className: 'fw-help' }, 'Click a field or section on the form to change it. Drag them to move them; drag from the left to add.')))),
    tab === 'build' && h('div', { className: 'fw-b-main' },
      palette,
      h('div', { className: 'fw-b-tree' },
        h('h3', null, 'Fields'),
        h(Tree, { fields: schema.fields, parent: [], selected, select, move, remove, duplicate, place, drop: (path, before) => commit(edits.move(schema, path, before)) })),
      h('div', { className: 'fw-b-settings' },
        fieldSettings || h('p', { className: 'fw-help' }, 'Select a field to change it.'))),
    tab === 'layout' && h(LayoutTab, { schema, commit: (layout: Layout[] | undefined, typing?: boolean) => commit({ ...schema, layout }, selected, typing), panel, bump: () => setPanel((n) => n + 1) }),
    tab === 'preview' && h('div', { className: 'fw-b-preview' },
      issues.length ? h('p', { className: 'fw-error' }, 'Fix the issues above to preview.') : h(Form, { schema, onSubmit: () => {} })),
    tab === 'json' && h(JsonTab, { schema, scan: props.scan, load: (s) => commit(s, null) }))
}

const NEW_COLUMNS: [string, string, Field][] = [
  ['text', 'Text', { type: 'string', label: 'Text' }],
  ['number', 'Number', { type: 'number', label: 'Number' }],
  ['amount', 'Amount', { type: 'number', label: 'Amount', decimals: 2 }],
  ['date', 'Date', { type: 'date', label: 'Date' }],
  ['choice', 'Dropdown', { type: 'choice', label: 'Choice', widget: 'select', options: ['Option 1', 'Option 2'] }],
  ['yesNo', 'Yes / No', { type: 'choice', label: 'Yes / No', widget: 'buttons', options: ['Yes', 'No'] }],
  ['check', 'Tick box', { type: 'boolean', label: 'Done' }],
]

interface TableDesignerProps {
  field: ListField
  set(f: ListField): void
  /** Opens a column's own settings. */
  pick(key: string): void
}

/**
 * A table drawn as it will look, with its headings and rows typed in place: add, move and remove columns and rows,
 * and tick the number columns that get a total. For a matrix the columns are the options of its choice.
 */
function TableDesigner({ field: f, set, pick }: TableDesignerProps) {
  const cols = Object.entries(f.fields)
  const scale = f.widget === 'matrix' ? (cols.find(([, x]) => x.type === 'choice') as [string, ChoiceField] | undefined) : undefined
  const rows = f.rows?.map((r) => text(r, 'en'))
  const swap = <T,>(list: T[], i: number, j: number) => (j < 0 || j >= list.length ? list : list.map((x, k) => (k === i ? list[j] : k === j ? list[i] : x)))
  const withCols = (entries: [string, Field][], extra: Partial<ListField> = {}) => {
    const keys = new Set(entries.map(([k]) => k))
    const totals = f.totals?.filter((k) => keys.has(k) && entries.find(([x]) => x === k)![1].type === 'number')
    const next: ListField = { ...f, ...extra, fields: Object.fromEntries(entries) }
    if (totals?.length) next.totals = totals
    else delete next.totals
    set(next)
  }
  const setRows = (r: string[]) => {
    const next: ListField = { ...f }
    if (r.length) next.rows = r
    else { delete next.rows; delete next.rowHeading }
    set(next)
  }
  const [kind, setKind] = useState('text')
  // a column of a table, or an option of a matrix
  const heads = scale
    ? scale[1].options.map((o) => (typeof o === 'string' ? o : text(o.label, 'en') || o.value))
    : cols.map(([k, x]) => text(x.label, 'en') || k)
  const setOptions = (opts: ChoiceField['options']) => withCols(cols.map(([k, x]) => [k, k === scale![0] ? { ...x, options: opts } as Field : x]))
  const rename = (i: number, v: string) => {
    if (scale) return setOptions(scale[1].options.map((o, j) => (j !== i ? o : typeof o === 'string' ? v : { ...o, label: v })))
    withCols(cols.map(([k, x], j) => [k, j === i ? ({ ...x, label: v } as Field) : x]))
  }
  const shift = (i: number, by: number) => (scale ? setOptions(swap(scale[1].options, i, i + by)) : withCols(swap(cols, i, i + by)))
  const drop = (i: number) => (scale ? scale[1].options.length > 2 && setOptions(scale[1].options.filter((_, j) => j !== i)) : withCols(cols.filter((_, j) => j !== i)))
  const addCol = () => {
    if (scale) return setOptions([...scale[1].options, `Option ${scale[1].options.length + 1}`])
    const [base, , make] = NEW_COLUMNS.find(([k]) => k === kind)!
    let n = 1
    while (Object.hasOwn(f.fields, base + n)) n++
    withCols([...cols, [base + n, structuredClone(make)]])
  }
  const tool = (label: string, title: string, onClick: () => void, disabled = false) =>
    h('button', { type: 'button', title, 'aria-label': title, disabled, onClick }, label)
  const numbers = cols.filter(([k, x]) => x.type === 'number' && k !== scale?.[0])
  return h('div', { className: 'fw-b-td' },
    h('h3', null, scale ? 'Matrix' : 'Table', ' designer'),
    h('div', { className: 'fw-b-td-wrap' },
      h('table', null,
        h('thead', null, h('tr', null,
          rows && h('th', null, h('input', { 'aria-label': 'Heading over the rows', placeholder: 'Row heading', value: text(f.rowHeading, 'en'),
            onChange: (e: ChangeEvent<HTMLInputElement>) => { const next: ListField = { ...f, rowHeading: e.target.value }; if (!e.target.value) delete next.rowHeading; set(next) } })),
          heads.map((label, i) => h('th', { key: i },
            h('input', { 'aria-label': `${scale ? 'Option' : 'Column'} ${i + 1} heading`, value: label, onChange: (e: ChangeEvent<HTMLInputElement>) => rename(i, e.target.value) }),
            h('span', { className: 'fw-b-tools' },
              tool('←', 'Move left', () => shift(i, -1), i === 0),
              tool('→', 'Move right', () => shift(i, 1), i === heads.length - 1),
              !scale && tool('⚙', 'Column settings', () => pick(cols[i][0])),
              tool('✕', scale ? 'Remove option' : 'Remove column', () => drop(i), scale ? heads.length <= 2 : false)),
            !scale && h('small', null, cols[i][0], ' · ', cols[i][1].type))),
          h('th', { className: 'fw-b-td-add' },
            !scale && h('select', { 'aria-label': 'New column type', value: kind, onChange: (e: ChangeEvent<HTMLSelectElement>) => setKind(e.target.value) },
              NEW_COLUMNS.map(([k, label]) => h('option', { key: k, value: k }, label))),
            tool(scale ? '+ Option' : '+ Column', scale ? 'Add an option' : 'Add a column', addCol)))),
        h('tbody', null,
          rows?.map((r, i) => h('tr', { key: i },
            h('th', null,
              h('input', { 'aria-label': `Row ${i + 1}`, value: r, onChange: (e: ChangeEvent<HTMLInputElement>) => setRows(rows.map((x, j) => (j === i ? e.target.value : x))) }),
              h('span', { className: 'fw-b-tools' },
                tool('↑', 'Move up', () => setRows(swap(rows, i, i - 1)), i === 0),
                tool('↓', 'Move down', () => setRows(swap(rows, i, i + 1)), i === rows.length - 1),
                tool('✕', 'Remove row', () => setRows(rows.filter((_, j) => j !== i)), f.widget === 'matrix' && rows.length <= 1))),
            heads.map((_, j) => h('td', { key: j }, scale ? '○' : '')),
            h('td'))),
          !rows && h('tr', null, h('td', { colSpan: heads.length + 1, className: 'fw-help' },
            `People add rows with "+ Add row". It starts with ${f.min ?? 0} and allows ${f.max ?? 'any number'}.`)),
          !scale && numbers.length > 0 && h('tr', { className: 'fw-b-td-totals' },
            rows && h('th', null, 'Total'),
            cols.filter(([k]) => k !== scale?.[0]).map(([k, x]) => h('td', { key: k }, x.type === 'number' && h('label', null,
              h('input', { type: 'checkbox', checked: !!f.totals?.includes(k), onChange: (e: ChangeEvent<HTMLInputElement>) => {
                const t = e.target.checked ? [...(f.totals ?? []), k] : (f.totals ?? []).filter((x) => x !== k)
                const next: ListField = { ...f, totals: t }
                if (!t.length) delete next.totals
                set(next)
              } }), ' Sum'))),
            h('td'))))),
    h('div', { className: 'fw-b-bar' },
      rows
        ? h(Fragment, null,
            tool('+ Row', 'Add a row', () => setRows([...rows, `Row ${rows.length + 1}`])),
            f.widget !== 'matrix' && tool('Let people add rows', 'Remove the fixed rows: people add rows while filling it in', () => setRows([])))
        : tool('Use fixed rows', 'Rows you name, the same for everyone (Monday, Tuesday…)', () => setRows(['Row 1', 'Row 2']))))
}

const FORM_SETTINGS: FormSchema = { version: 1, fields: {
  title: { type: 'string', label: 'Title', help: 'The name it is saved under. The paper look prints it on top; otherwise your app shows it.' },
  theme: { type: 'choice', widget: 'radio', label: 'Look', required: true, options: [
    { value: 'plain', label: 'Plain: takes your app\'s fonts and colours' },
    { value: 'paper', label: 'Paper: a printed form, boxed sections, lines to write on' },
  ] },
} }
const formSettings = (s: FormSchema): Values => ({ title: text(s.title, 'en') || null, theme: s.theme ?? 'plain' })
function fromFormSettings(s: FormSchema, v: Values): FormSchema {
  const out: FormSchema = { ...s }
  if (v.theme === 'paper') out.theme = 'paper'
  else delete out.theme
  if (v.title) out.title = s.title && typeof s.title === 'object' ? { ...s.title, en: String(v.title) } : String(v.title)
  else delete out.title
  return out
}

interface CanvasProps {
  schema: FormSchema
  issues: boolean
  selected: Path | null
  node: Ip | null
  select(p: Path | null): void
  selectNode(ip: Ip | null): void
  drop(data: DataTransfer, on: { path?: Path; ip?: Ip }): void
  remove(): void
}

/** The form as people will see it. A click picks the field or section under it; dragging moves things or drops new ones in. */
/** Widths the canvas shows the form at. The form follows its own width, so a phone's width gives the phone layout. */
const DEVICES = [['desktop', 'Desktop', 1024], ['tablet', 'Tablet', 768], ['phone', 'Phone', 375]] as const

function Canvas(p: CanvasProps) {
  const [device, setDevice] = useState<(typeof DEVICES)[number][0]>('desktop')
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [p.issues])
  const width = DEVICES.find(([k]) => k === device)![2]
  // wider than the room there is: drawn at that width, then shrunk to fit, so it is the real layout, only smaller
  const outer = width + (device === 'desktop' ? 0 : 48) // the tablet / phone frame around it (see .fw-b-device)
  const zoom = room && room < outer ? room / outer : 1
  const over = useRef<Element | null>(null)
  const mark = (el: Element | null) => {
    over.current?.classList.remove('fw-b-over')
    over.current = el
    el?.classList.add('fw-b-over')
  }
  const hit = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-fw-path], [data-fw-ip]') : null)
  const read = (el: Element | null): { path?: Path; ip?: Ip } =>
    !el ? {} : el.hasAttribute('data-fw-path') ? { path: el.getAttribute('data-fw-path')!.split('.') } : { ip: el.getAttribute('data-fw-ip')!.split('.').map(Number) }
  if (p.issues) return h('div', { ref: box, className: 'fw-b-canvas' }, h('p', { className: 'fw-error' }, 'Fix the issues above to see the form.'))
  // keys and places are checked by lint() (letters, digits, _), so they are safe inside the selector
  const sel = p.selected ? `[data-fw-path="${p.selected.join('.')}"]` : p.node ? `[data-fw-ip="${p.node.join('.')}"]` : ''
  return h('div', {
    ref: box, className: 'fw-b-canvas', tabIndex: -1, 'aria-label': 'The form: click a part to change it',
    onClickCapture: (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest('.fw-steps button, [role=tab], summary, .fw-nav button, .fw-b-devices')) return // moving between pages still works
      e.preventDefault()
      e.stopPropagation()
      const at = read(hit(t))
      if (at.path) p.select(at.path)
      else if (at.ip) p.selectNode(at.ip)
      else p.select(null)
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Delete' || (e.target as Element).closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      p.remove()
    },
    onDragStart: (e: DragEvent) => {
      const at = read(hit(e.target))
      if (at.path) e.dataTransfer.setData('text/x-fw-path', at.path.join('.'))
      else if (at.ip) e.dataTransfer.setData('text/x-fw-node', at.ip.join('.'))
      e.stopPropagation()
    },
    onDragOver: (e: DragEvent) => { e.preventDefault(); mark(hit(e.target) ?? e.currentTarget) },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) mark(null) },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      mark(null)
      p.drop(e.dataTransfer, read(hit(e.target)))
    },
  },
    sel && h('style', null, `.fw-b-canvas ${sel} { outline: 2px solid var(--fw-accent) !important; outline-offset: 3px; }`),
    h('div', { className: 'fw-b-devices', role: 'group', 'aria-label': 'Show it as on' },
      DEVICES.map(([k, label, w]) => h('button', { key: k, type: 'button', 'aria-pressed': device === k, title: `${w}px wide`, onClick: () => setDevice(k) }, label)),
      h('small', null, `${width}px${zoom < 1 ? ` · ${Math.round(zoom * 100)}%` : ''}`)),
    h('div', { className: 'fw-b-device', 'data-device': device, style: { width, zoom } }, h(Form, { schema: p.schema, design: true })))
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
  place(id: string, parent: Path, before: string | null): void
  /** What an empty group or list says. */
  empty?: string
  /** These fields are a table's columns. */
  columns?: boolean
}

function Tree(p: TreeProps): ReactNode {
  const same = (a: Path | null, b: Path) => !!a && a.join('.') === b.join('.')
  const onDrop = (e: DragEvent, before: string | null) => {
    dragEnd(e)
    const kind = e.dataTransfer.getData('text/x-fw-kind')
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
      p.parent.length ? p.empty : 'Drag a field here, or click one on the left'),
    Object.entries(p.fields).map(([key, f]): ReactNode => {
      const path = [...p.parent, key]
      const on = same(p.selected, path)
      return h('li', { key, onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => onDrop(e, key) },
        h('div', { className: 'fw-b-item', 'aria-current': on || undefined },
          h('button', {
            type: 'button', className: 'fw-b-pick', draggable: true, onClick: () => p.select(path),
            onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-path', path.join('.')),
          }, h('span', null, text(f.label, 'en') || key), h('small', null, ` ${key} · ${f.type}${p.columns ? ' · column' : ''}`)),
          on && h('span', { className: 'fw-b-tools' },
            h('button', { type: 'button', 'aria-label': 'Move up', onClick: () => p.move(path, -1) }, '↑'),
            h('button', { type: 'button', 'aria-label': 'Move down', onClick: () => p.move(path, 1) }, '↓'),
            h('button', { type: 'button', 'aria-label': 'Duplicate', onClick: () => p.duplicate(path) }, '⧉'),
            h('button', { type: 'button', 'aria-label': 'Delete', onClick: () => p.remove(path) }, '✕'))),
        (f.type === 'group' || f.type === 'list') && h(Tree, { ...p, fields: f.fields, parent: path, columns: f.type === 'list' && f.widget === 'table', empty: f.type === 'list' && f.widget === 'table'
          ? 'No columns yet. Each field you add here is a column: select the table and click a field type, or drag one here.'
          : 'Empty. Select it and click a field type, or drag one here.' }))
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

const placedKeys = (items: Layout[]): string[] => items.flatMap((n) => (typeof n === 'string' ? [n] : isContainer(n) ? placedKeys(n.children) : []))

const NODES: [string, string, () => Layout][] = [
  ['section', 'Section', () => ({ type: 'section', title: 'Section', children: [] })],
  ['grid', 'Grid (columns)', () => ({ type: 'grid', cols: 2, children: [] })],
  ['pages', 'Steps / tabs', () => ({ type: 'pages', display: 'steps', children: [{ type: 'section', title: 'Step 1', children: [] }] })],
  ['heading', 'Heading', () => ({ type: 'content', as: 'heading', text: 'Heading' })],
  ['text', 'Text', () => ({ type: 'content', as: 'text', text: 'Some text' })],
  ['rich', 'Rich text', () => ({ type: 'content', as: 'rich', text: '<p><strong>Please note:</strong> write in capital letters.</p>' })],
  ['divider', 'Divider', () => ({ type: 'content', as: 'divider' })],
]

const showWhen = formula('Show only when', "employment == 'Self Employed'")
const cols = (label: string): Field => ({ type: 'number', label, min: 1, max: 12, decimals: 0 })
const NODE_SETTINGS: Record<string, FormSchema> = {
  section: { version: 1, fields: {
    title: { type: 'string', label: 'Title' },
    look: { type: 'choice', widget: 'buttons', label: 'Style', required: true, options: [{ value: 'plain', label: 'Plain' }, { value: 'box', label: 'Box' }, { value: 'band', label: 'Title band' }, { value: 'line', label: 'Underlined' }] },
    visible: showWhen, className: cssClasses,
  } },
  grid: { version: 1, fields: {
    base: cols('Columns on phones'), sm: cols('Columns from 480px'), md: cols('Columns from 640px'), lg: cols('Columns from 960px'), visible: showWhen, className: cssClasses,
  }, layout: [{ type: 'grid', cols: 2, children: ['base', 'sm', 'md', 'lg'] }, 'visible', 'className'] },
  pages: { version: 1, fields: {
    display: { type: 'choice', label: 'Shown as', options: ['steps', 'tabs', 'accordion'], required: true },
    position: { type: 'choice', widget: 'radio', label: 'Where the steps go', options: ['top', 'left', 'right', 'bottom'], required: true, visible: "display != 'accordion'",
      help: 'Left and right show at the top when the form is narrow, like on a phone.' },
    visible: showWhen,
    className: cssClasses,
  } },
  content: { version: 1, fields: {
    as: { type: 'choice', label: 'Kind', options: [{ value: 'heading', label: 'Heading' }, { value: 'text', label: 'Text' }, { value: 'rich', label: 'Rich text (bold, lists, links)' }, { value: 'divider', label: 'Divider' }], required: true },
    text: { type: 'string', widget: 'textarea', label: 'Text', visible: "as == 'heading' or as == 'text'" },
    html: { type: 'string', widget: 'richtext', label: 'Text', visible: "as == 'rich'" },
    visible: showWhen, className: cssClasses,
  } },
}

function nodeSettings(n: Container | Extract<Layout, { type: 'content' }>): Values {
  return { ...nodeOwn(n), className: n.className ?? null }
}
function nodeOwn(n: Container | Extract<Layout, { type: 'content' }>): Values {
  const visible = typeof n.visible === 'string' ? n.visible : null
  switch (n.type) {
    case 'section': return { title: text(n.title, 'en') || null, look: n.look ?? 'plain', visible }
    case 'grid': {
      const c = typeof n.cols === 'number' ? { base: 1, md: n.cols } : (n.cols ?? {})
      return { base: c.base ?? null, sm: c.sm ?? null, md: c.md ?? null, lg: c.lg ?? null, visible }
    }
    case 'pages': return { display: n.display ?? 'steps', position: n.position ?? 'top', visible }
    case 'content': return { as: n.as ?? 'text', text: n.as === 'rich' ? null : text(n.text, 'en') || null, html: n.as === 'rich' ? text(n.text, 'en') || null : null, visible }
  }
}

function fromNodeSettings(n: Exclude<Layout, string>, s: Values): Layout {
  const out: Record<string, unknown> = { ...n }
  const put = (k: string, v: unknown) => (v === null || v === undefined || v === '' ? delete out[k] : (out[k] = v))
  const words = (old: unknown, v: unknown) => (v && old && typeof old === 'object' ? { ...old, en: v } : v)
  put('visible', s.visible)
  put('className', s.className)
  if (n.type === 'section') { put('title', words(n.title, s.title)); put('look', s.look === 'plain' ? null : s.look) }
  if (n.type === 'pages') { put('display', s.display); put('position', s.position === 'top' ? null : s.position) }
  if (n.type === 'content') {
    put('as', s.as)
    // rich text is typed in its own box; switching kinds keeps the words (without formatting when leaving rich)
    const plain = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null
    const typed = s.as === 'rich' ? (s.html ?? (n.as === 'rich' ? null : s.text)) : (s.text ?? (n.as === 'rich' ? plain(s.html) : null))
    put('text', s.as === 'divider' ? null : words(n.text, typed))
  }
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
      h('div', { className: 'fw-b-bar' },
        h('button', { type: 'button', onClick: () => commit([{ type: 'pages', display: 'steps', children: [{ type: 'section', title: 'Step 1', children: Object.keys(schema.fields) }] }]) }, 'Make it a stepper'),
        h('button', { type: 'button', onClick: () => commit(Object.keys(schema.fields)) }, 'Start a layout')))

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
      case 'pages': return ['Pages', ` ${n.display ?? 'steps'}${n.position && n.display !== 'accordion' ? ` · ${n.position}` : ''}`]
      case 'content': return [n.as === 'divider' ? '———' : text(n.text, 'en').replace(/<[^>]*>/g, ' ').trim().slice(0, 40) || '…', ` ${n.as ?? 'text'}`]
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
