// The settings panel of a field: itself a formweave form, one per type, and the way values go to and from the field.
import { text } from '../../core/form.ts'
import { DATE_FORMATS, type Field, type Fields, type FormSchema, type Values } from '../../core/schema.ts'
import { KINDS } from '../items.ts'
import type { Kind } from '../types.ts'

export const cssClasses: Field = { type: 'string', label: 'CSS classes', placeholder: 'my-class another', help: 'Your own classes, separated by spaces. Style them in your app.', pattern: '[A-Za-z0-9_ :/.\\[\\]-]*', messages: { pattern: 'Class names only' } }
export const formula = (label: string, placeholder: string): Field => ({ type: 'string', label, placeholder, help: 'A formula. Leave empty for none.' })

export function settingsSchema(kind: Kind): FormSchema {
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
        options: { type: 'list', label: 'Options', widget: 'options', min: 1, fields: { value: { type: 'string', label: 'Value', required: true }, label: { type: 'string', label: 'Label (if different)' }, visible: { type: 'string', label: 'Show only when' } },
          help: 'Value is what is saved; Label is what people see, when it should read differently. Enter adds the next one.' },
        columns: { type: 'number', label: 'Options per row', min: 1, max: 12, decimals: 0, placeholder: 'As many as fit',
          help: 'Radios and tick boxes break into this many columns by themselves, like a printed form. Phones show one.', visible: "widget == 'radio' or (multiple and widget != 'select' and widget != 'tags' and widget != 'buttons')" },
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
export const asColumn = (s: FormSchema): FormSchema => ({ ...s, fields: { ...s.fields, label: { type: 'string', label: 'Column heading', help: 'Shown at the top of the column, and above the box on a phone.' } } })
export const SETTINGS = Object.fromEntries(KINDS.map(([k]) => [k, settingsSchema(k)])) as Record<Kind, FormSchema>

/** Settings names that map 1:1 onto field props. */
export const PLAIN = ['format', 'widget', 'minLength', 'maxLength', 'pattern', 'min', 'max', 'decimals', 'multiple', 'accept', 'maxSize', 'className', 'currency', 'allowOther', 'country', 'columns']

export function toSettings(key: string, f: Field): Values {
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

export function fromSettings(f: Field, s: Values): Field {
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
