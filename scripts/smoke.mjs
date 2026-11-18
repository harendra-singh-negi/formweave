// npm run test:dist, after npm run build: uses the built package the way an app does, by its name and exports, in plain
// JavaScript, so it runs on every Node formweave supports (unit tests need Node 22.6+ to read TypeScript).
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'

const { lint, validate, createForm, toJsonSchema, fromJsonSchema } = await import('formweave')
const { Form } = await import('formweave/react')
const { Builder, pasteClip, copyPart } = await import('formweave/builder')
const { SAMPLES } = await import('formweave/samples')
const { sketchToForm } = await import('formweave/scan')
const element = await import('formweave/element') // must load on a server too
assert.equal(typeof element.FormweaveForm, 'function')

for (const css of ['formweave/style.css', 'formweave/builder.css']) assert.ok(existsSync(fileURLToPath(import.meta.resolve(css))), css)

assert.ok(SAMPLES.length >= 6)
for (const { id, schema } of SAMPLES) {
  assert.deepEqual(lint(schema), [], id)
  assert.match(renderToString(h(Form, { schema })), /<form class="fw-form/, id) // React 19 may put image preloads first
  assert.equal(validate(schema, {}).ok, false, `${id}: empty answers are refused`)
  assert.deepEqual(lint(fromJsonSchema(toJsonSchema(schema)).schema), [], `${id}: JSON Schema round trip`)
}
const order = SAMPLES.find((s) => s.id === 'cake-order').schema
const form = createForm(order)
form.set('items.0.qty', 2)
form.set('items.0.rate', 450)
assert.equal(form.getState().values.grandTotal, 945) // 900 + 5% tax
assert.match(renderToString(h(Builder, { schema: order })), /class="fw-builder"/)
assert.deepEqual(lint(pasteClip(order, copyPart(order, 'all')).schema), [])
assert.deepEqual(lint(sketchToForm({ title: 'x', sections: [{ title: 'A', fields: [{ label: 'Name', kind: 'text' }] }] }).schema), [])

console.log(`formweave works on Node ${process.version}: ${SAMPLES.length} samples render, validate and round-trip`)
