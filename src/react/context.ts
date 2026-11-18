// What every part of a rendered form shares: the store, the state, the words and classes, and the widget contract.
import { createContext, useContext, type ComponentType } from 'react'
import type { Form as Store, FormState, Options } from '../core/form.ts'
import type { Field, FileRef, FormSchema, Values } from '../core/schema.ts'

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
  /** `classes.input` from <Form>, for your widget's control. */
  className?: string
  set(value: unknown): void
  touch(): void
}

/** Your own components, by widget name ('signature') or type ('string'). */
export type Widgets = Record<string, ComponentType<WidgetProps>>

/** Your own CSS classes for each kind of part, e.g. Bootstrap's { input: 'form-control', submit: 'btn btn-primary' }. */
export type Classes = Partial<Record<'field' | 'label' | 'input' | 'help' | 'error' | 'button' | 'submit', string>>

/** Joins class names, skipping empty ones. */
export const cx = (...names: unknown[]) => names.filter(Boolean).join(' ') || undefined

export const LABELS = { row: 'Row', clear: 'Clear', scan: 'Scan', addTag: 'Add', country: 'Country', useLocation: 'Use my location', dropFiles: 'or drop files here', submit: 'Submit', next: 'Next', back: 'Back', addRow: '+ Add row', removeRow: 'Remove row', remove: 'Remove', total: 'Total' }

export interface FormProps extends Options {
  schema: FormSchema
  values?: Values
  /** Your own store from createForm(), to read or change it from outside. */
  form?: Store
  widgets?: Widgets
  labels?: Partial<typeof LABELS>
  /** Added to the <form>, next to `fw-form`. */
  className?: string
  /** Your own classes on every field, label, input, help text, error and button. */
  classes?: Classes
  /**
   * Map tiles for widget 'map'. Default: OpenStreetMap's, fine for trying it out; their usage policy asks busy sites
   * to use their own or a provider's. `{z}/{x}/{y}` are filled in.
   */
  mapTiles?: { url: string; attribution: string }
  onSubmit?(values: Values): void | Promise<void>
  onChange?(state: FormState): void
  /** Stores a picked file and says how to find it. Without it, the file's name is its id. */
  onUpload?(file: File): Promise<FileRef>
  /**
   * For a builder's canvas: hidden fields and sections show (marked), any step can be opened without checks,
   * and each field and layout node carries `data-fw-path` / `data-fw-ip` so a click can tell which one it is.
   */
  design?: boolean
}

export interface Ctx {
  form: Store
  state: FormState
  schema: FormSchema
  widgets: Widgets
  labels: typeof LABELS
  classes: Classes
  mapTiles: NonNullable<FormProps['mapTiles']>
  locale?: string
  context?: Record<string, unknown>
  onUpload?: FormProps['onUpload']
  id: string
  compact: boolean
  page: number
  setPage(i: number): void
  busy: boolean
  design: boolean
}
export const Context = createContext<Ctx | null>(null)
export const useCtx = () => {
  const c = useContext(Context)
  if (!c) throw new Error('formweave widgets must be inside <Form>')
  return c
}
