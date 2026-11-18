// <formweave-form> for Angular, Vue, Svelte, server-rendered pages or plain HTML. Importing this file defines it.
import { createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Form, type FormProps } from './react.ts'

/**
 * Set `schema` (and optionally `values`, `context`, `locale`, `validators`, `labels`, `onUpload`) as properties.
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

if (typeof customElements !== 'undefined' && !customElements.get('formweave-form')) customElements.define('formweave-form', FormweaveForm)
