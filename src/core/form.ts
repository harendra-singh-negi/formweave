// The form engine: createForm() for a live form, validate() for answers sent to a server. Same rules, both sides.
import type { Issue } from './lint.ts'
import type { Errors, FormSchema, Text, Values } from './schema.ts'
import { check, message, offered, rowLimits } from './checks.ts'
import { type C, compile, is, type Run, run } from './run.ts'
import { edit, initial, result } from './values.ts'

export interface Options {
  /** What formulas read as `context.x`: role, today's date, user id… */
  context?: Record<string, unknown>
  /** Your own checks, named in a field's `validators`. Return an error message, or nothing. */
  validators?: Record<string, Validator>
  /** For labels and messages given per locale. */
  locale?: string
}

export type Validator = (value: unknown, info: { path: string; values: Values; context: unknown }) => string | null | undefined | void

export interface Result {
  ok: boolean
  /** Typed, calculated values, without hidden fields or keys the schema doesn't have. */
  values: Values
  errors: Errors
}

export interface FieldState {
  visible: boolean
  required: boolean
  readOnly: boolean
  /** For a choice with options shown only sometimes: the values offered now. */
  options?: string[]
}

export interface FormState {
  /** Hidden fields keep what was typed here, so showing them again brings it back. submit() leaves them out. */
  values: Values
  errors: Errors
  /** By path: 'name', 'items.0.qty'. */
  fields: Record<string, FieldState>
  touched: Record<string, true>
  submitted: boolean
}

export interface Form {
  getState(): FormState
  /** Fits React's useSyncExternalStore. */
  subscribe(listener: (state: FormState) => void): () => void
  /** path: 'name', 'address.city', 'items.0.qty'. Throws for a path the schema doesn't have. */
  set(path: string, value: unknown): void
  touch(path: string): void
  addRow(path: string, row?: Values): void
  removeRow(path: string, index: number): void
  setContext(context: Record<string, unknown>): void
  reset(values?: Values): void
  submit(): Result
}

export class SchemaError extends Error {
  issues: Issue[]
  constructor(issues: Issue[]) {
    super('Invalid form schema:\n' + issues.map((i) => `  ${i.path || '(schema)'}: ${i.message}`).join('\n'))
    this.name = 'SchemaError'
    this.issues = issues
  }
}

/** Picks the locale's words: 'hi-IN' → hi → en → the first given. */
export function text(t: Text | undefined, locale?: string): string {
  if (t === undefined) return ''
  if (typeof t === 'string') return t
  for (const k of [locale, locale?.split('-')[0], 'en']) if (k && Object.hasOwn(t, k)) return t[k]
  return Object.values(t)[0] ?? ''
}

/** Checks answers (from a browser, an API call, a CSV row…) the same way everywhere. Never trust the client's own check. */
export function validate(schema: FormSchema, input: unknown, opts: Options = {}): Result {
  const { kids, calcs } = compile(schema)
  return result(kids, run(kids, calcs, input, opts))
}

/** A form's state for any UI: set values, read errors and what is visible, subscribe to changes. */
export function createForm(schema: FormSchema, opts: Options & { values?: Values } = {}): Form {
  const { kids, calcs } = compile(schema)
  let options: Options = opts
  let values = initial(kids, opts.values)
  let touched: Record<string, true> = {}
  let submitted = false
  let last: Run
  let state: FormState
  const listeners = new Set<(s: FormState) => void>()
  const emit = () => {
    state = { values: last.values, errors: last.errors, fields: last.fields, touched, submitted }
    for (const l of listeners) l(state)
  }
  const update = () => {
    last = run(kids, calcs, values, options)
    values = last.values
    emit()
  }
  const change = (path: string, fn: (old: unknown, c: C) => unknown) => {
    values = edit(kids, values, path.split('.'), fn, path)
    update()
  }
  const list = (c: C, path: string) => {
    if (c.f.type !== 'list') throw new Error(`"${path}" is not a list`)
    return c.f
  }
  update()
  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    set: (path, value) => change(path, () => value),
    touch(path) {
      touched = { ...touched, [path]: true }
      emit()
    },
    addRow: (path, row) =>
      change(path, (rows, c) => {
        const f = list(c, path)
        const old = rows as Values[]
        const { max } = rowLimits(f)
        return max != null && old.length >= max ? old : [...old, initial(c.kids!, row)]
      }),
    removeRow(path, index) {
      // row numbers after it shift, so forget what was touched in the list
      touched = Object.fromEntries(Object.entries(touched).filter(([k]) => !k.startsWith(path + '.'))) as Record<string, true>
      change(path, (rows, c) => (list(c, path), (rows as Values[]).filter((_, i) => i !== index)))
    },
    setContext(context) {
      options = { ...options, context }
      update()
    },
    reset(v) {
      values = initial(kids, v ?? opts.values)
      touched = {}
      submitted = false
      update()
    },
    submit() {
      submitted = true
      emit()
      return result(kids, last)
    },
  }
}

// ---- engine ----
