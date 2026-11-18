// <formweave-form> for Angular, Vue, Svelte, server-rendered pages or plain HTML. Importing this file defines it.
import { createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Form, type FormProps } from './react.ts'
import { Builder, type BuilderProps } from './builder.ts'

/**
 * Set `schema` (and optionally `values`, `context`, `locale`, `validators`, `labels`, `classes`, `onUpload`) as properties.
 * Events: `fw-submit` (detail: values), `fw-change` (detail: state). Not `submit`: the inner <form>'s own event bubbles.
 */
export class FormweaveForm extends HTMLElement {
  #root?: Root
  #props: Partial<FormProps> = {}

  #set(key: keyof FormProps, value: unknown) {
    this.#props = { ...this.#props, [key]: value }
    this.#render()
  }
  set schema(v: FormProps['schema']) { this.#set('schema', v) }
  get schema() { return this.#props.schema! }
  set values(v: FormProps['values']) { this.#set('values', v) }
  set context(v: FormProps['context']) { this.#set('context', v) }
  set locale(v: FormProps['locale']) { this.#set('locale', v) }
  set validators(v: FormProps['validators']) { this.#set('validators', v) }
  set labels(v: FormProps['labels']) { this.#set('labels', v) }
  set onUpload(v: FormProps['onUpload']) { this.#set('onUpload', v) }
  /** Your own classes per part, e.g. { input: 'form-control' }. Classes on the element itself style its outside. */
  set classes(v: FormProps['classes']) { this.#set('classes', v) }

  connectedCallback() {
    this.#root ??= createRoot(this)
    this.#render()
  }
  disconnectedCallback() {
    this.#root?.unmount()
    this.#root = undefined
  }
  #render() {
    if (!this.#root || !this.#props.schema) return
    this.#root.render(h(Form, {
      ...(this.#props as FormProps),
      onSubmit: (values) => { this.dispatchEvent(new CustomEvent('fw-submit', { detail: values, bubbles: true })) },
      onChange: (state) => { this.dispatchEvent(new CustomEvent('fw-change', { detail: state })) },
    }))
  }
}

/** Set `schema` as a property. Event `fw-change` (detail: { schema, issues }); save when issues is empty. */
export class FormweaveBuilder extends HTMLElement {
  #root?: Root
  #schema?: BuilderProps['schema']
  #scan?: BuilderProps['scan']
  set schema(v: BuilderProps['schema']) {
    this.#schema = v
    this.#render(true)
  }
  /** (files, progress) => Promise<{ schema, warnings }>: see BuilderProps.scan. */
  set scan(v: BuilderProps['scan']) {
    this.#scan = v
    this.#render(false)
  }
  connectedCallback() {
    this.#root ??= createRoot(this)
    this.#render(false)
  }
  disconnectedCallback() {
    this.#root?.unmount()
    this.#root = undefined
  }
  #version = 0
  #render(fresh: boolean) {
    if (!this.#root) return
    if (fresh) this.#version++ // a new schema from outside starts a new history
    this.#root.render(h(Builder, {
      key: this.#version,
      schema: this.#schema,
      scan: this.#scan,
      onChange: (schema, issues) => { this.dispatchEvent(new CustomEvent('fw-change', { detail: { schema, issues } })) },
    }))
  }
}

if (typeof customElements !== 'undefined') {
  if (!customElements.get('formweave-form')) customElements.define('formweave-form', FormweaveForm)
  if (!customElements.get('formweave-builder')) customElements.define('formweave-builder', FormweaveBuilder)
}
