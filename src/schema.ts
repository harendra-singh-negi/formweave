/** Words people read: one string, or one per locale, e.g. { en: 'Name', hi: 'नाम' }. */
export type Text = string | Record<string, string>

/**
 * A formula such as `employment == 'Self Employed'` or `qty * price`.
 * Names are field keys; inside a group or list row the row's own fields come first,
 * and `context.role` reads what your app passes in. Syntax: README → Formulas.
 */
export type Expr = string

/** true, false, or a formula that gives one. */
export type When = boolean | Expr

interface Base {
  label?: Text
  help?: Text
  /** How it looks: 'textarea', 'radio', 'toggle', 'table', 'hidden'… Up to the renderer; the engine ignores it. */
  widget?: string
  /** When false the field is not shown, not checked, and left out of submitted values. */
  visible?: When
  /** On a group or list: every field in it. Calculated fields are always read-only. */
  readOnly?: When
  /** Must come out true, e.g. `end >= start`. Fails with code 'check'. */
  check?: Expr
  /** Names of your own validators, given to validate() / createForm() as `validators`. */
  validators?: string[]
  /** Your own error text per code, e.g. { required: 'Tell us your name' }. `{n}` is the limit. */
  messages?: Record<string, Text>
  /** Your own CSS classes on the field's wrapper, separated by spaces. */
  className?: string
}

interface Input extends Base {
  placeholder?: Text
  required?: When
  /** Calculated: always this formula's result, never what was typed or sent. */
  value?: Expr
}

export interface StringField extends Input {
  type: 'string'
  default?: string
  format?: keyof typeof STRING_FORMATS
  minLength?: number
  /** Default 10 000. */
  maxLength?: number
  /** Must match the whole value, as in <input pattern>. */
  pattern?: string
}

export interface NumberField extends Input {
  type: 'number'
  default?: number
  min?: number
  max?: number
  /** Most digits after the point (0 = whole numbers). Calculated values are rounded to it. */
  decimals?: number
  format?: 'currency' | 'percent'
  /** ISO code for format 'currency': 'INR', 'USD'. */
  currency?: string
}

/** `required` means it must be ticked, as with <input type=checkbox required>. */
export interface BooleanField extends Input {
  type: 'boolean'
  default?: boolean
}

export type Option = string | { value: string; label?: Text }

export interface ChoiceField extends Input {
  type: 'choice'
  options: Option[]
  multiple?: boolean
  default?: string | string[]
  /** Fewest / most picks, when multiple. */
  min?: number
  max?: number
}

export interface DateField extends Input {
  type: 'date'
  /** Default 'date'. See DATE_FORMATS. */
  format?: keyof typeof DATE_FORMATS
  default?: string
  /** Earliest / latest, in the same format. */
  min?: string
  max?: string
}

/** What your app keeps for an uploaded file. The engine never sees the bytes. */
export interface FileRef {
  id: string
  name: string
  size: number
  type: string
}

export interface FileField extends Input {
  type: 'file'
  multiple?: boolean
  /** As in <input accept>: 'image/*,.pdf'. */
  accept?: string
  /** Bytes, per file. */
  maxSize?: number
  /** Fewest / most files, when multiple. */
  min?: number
  max?: number
}

export interface GroupField extends Base {
  type: 'group'
  fields: Fields
}

export interface ListField extends Base {
  type: 'list'
  fields: Fields
  /** Fewest / most rows. A new form starts with `min` empty rows. */
  min?: number
  max?: number
  default?: Values[]
  /**
   * Fixed rows: one per text, shown in a first column people can't type in (Monday, Tuesday…).
   * The list then always has exactly these rows, in this order; no rows are added or removed.
   */
  rows?: Text[]
  /** The heading over the fixed rows' column. */
  rowHeading?: Text
}

export type Field =
  | StringField
  | NumberField
  | BooleanField
  | ChoiceField
  | DateField
  | FileField
  | GroupField
  | ListField

export type Fields = Record<string, Field>

/** Where fields go on screen. A string places that field. */
export type Layout = string | Section | Grid | Pages | Content

/** Hiding a section, grid or page hides the fields in it. */
export interface Section {
  type: 'section'
  title?: Text
  visible?: When
  /** Your own CSS classes, separated by spaces. */
  className?: string
  children: Layout[]
}

export interface Grid {
  type: 'grid'
  cols?: number | { base?: number; sm?: number; md?: number; lg?: number }
  visible?: When
  /** Your own CSS classes, separated by spaces. */
  className?: string
  children: Layout[]
}

export interface Pages {
  type: 'pages'
  display?: 'steps' | 'tabs' | 'accordion'
  /** Where the stepper or tabs sit. Left and right fall back to top when the form is narrow. Default top. */
  position?: 'top' | 'left' | 'right' | 'bottom'
  visible?: When
  /** Your own CSS classes, separated by spaces. */
  className?: string
  children: Section[]
}

export interface Content {
  type: 'content'
  as?: 'heading' | 'text' | 'divider'
  text?: Text
  visible?: When
  /** Your own CSS classes, separated by spaces. */
  className?: string
}

export interface FormSchema {
  $schema?: string
  /** The format's version. Schemas are migrated when it changes. */
  version: 1
  title?: Text
  fields: Fields
  /** Without one, fields show in order. */
  layout?: Layout[]
}

export type Values = Record<string, unknown>

export interface FieldError {
  code: string
  message: string
}

/** By path: 'name', 'address.city', 'items.0.qty'. */
export type Errors = Record<string, FieldError>

/** Formats a string field can require. Each is linear-time (no ReDoS). */
export const STRING_FORMATS = {
  email: /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/,
  /** http(s) only, so a stored link can't run script (javascript:). */
  url: /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i,
  phone: /^\+?(?:[\s().-]*\d){6,15}[\s().-]*$/,
  color: /^#[0-9a-fA-F]{6}$/,
}

/** How a date field stores its value: text, never a timestamp, so it can't shift with time zones. */
export const DATE_FORMATS = {
  date: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/,
  time: /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
  datetime: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
  month: /^\d{4}-(?:0[1-9]|1[0-2])$/,
  year: /^\d{4}$/,
  week: /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/,
}
