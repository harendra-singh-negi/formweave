// <Form> and useForm(): a schema shown as a working form, checked as people type, sent on submit.
import { createElement as h, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { createForm, text, type Form as Store, type Options } from '../core/form.ts'
import type { FormSchema, Pages, Values } from '../core/schema.ts'
import { Context, type Ctx, cx, type FormProps, LABELS } from './context.ts'
import { keysOf, Nodes, SubmitButton, visiblePages } from './layout.ts'
import { WIDGETS } from './widgets/index.ts'

/** The form's store and state, for a UI of your own. */
export function useForm(schema: FormSchema, opts: Options & { values?: Values; form?: Store } = {}) {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- a new store only for a new schema or store, not for each options object
  const form = useMemo(() => opts.form ?? createForm(schema, opts), [schema, opts.form])
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState)
  const contextKey = JSON.stringify(opts.context ?? null)
  useEffect(() => {
    if (opts.context) form.setContext(opts.context)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- contextKey stands for opts.context, compared by value
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
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- tells the app of each new state, whatever its onChange is
  useEffect(() => props.onChange?.(state), [state])
  const layout = schema.layout ?? Object.keys(schema.fields)
  const pages = layout.find((l): l is Pages => typeof l === 'object' && l.type === 'pages')
  const focusError = () =>
    setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      el?.closest('details')?.setAttribute('open', '') // an accordion panel that was closed
      el?.focus()
    })

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
    form,
    state,
    schema,
    id,
    page,
    setPage,
    busy,
    widgets: { ...WIDGETS, ...props.widgets },
    labels: { ...LABELS, ...props.labels },
    classes: props.classes ?? {},
    mapTiles: props.mapTiles ?? { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
    locale: props.locale,
    context: props.context,
    onUpload: props.onUpload,
    compact: false,
    design: !!props.design,
  }
  return h(
    Context.Provider,
    { value: ctx },
    h(
      'form',
      {
        ref,
        className: cx('fw-form', schema.theme && `fw-theme-${schema.theme}`, props.className),
        noValidate: true,
        onSubmit: props.design ? (e: FormEvent) => e.preventDefault() : submit,
      },
      schema.theme === 'paper' && schema.title && h('h2', { className: 'fw-title' }, text(schema.title, props.locale)),
      h(Nodes, { items: layout, ip: [] }),
      !pages && h(SubmitButton),
    ),
  )
}

// ---- layout ----
