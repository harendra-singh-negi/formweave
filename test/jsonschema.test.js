import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromJsonSchema, lint, toJsonSchema, validate } from '../src/index.js'
// what an OpenAPI request body or z.toJSONSchema() typically gives
const order = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Order',
  type: 'object',
  required: ['email', 'items', 'country'],
  properties: {
    email: { type: 'string', format: 'email', title: 'Email' },
    'full-name': { type: ['string', 'null'], maxLength: 80 },
    age: { type: 'integer', minimum: 18 },
    country: {
      oneOf: [
        { const: 'IN', title: 'India' },
        { const: 'AE', title: 'UAE' },
      ],
    },
    tags: { type: 'array', items: { enum: ['gift', 'urgent'] }, maxItems: 2 },
    delivery: { type: 'string', format: 'date' },
    address: { $ref: '#/$defs/Address' },
    items: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, qty: { type: 'integer', minimum: 1 } } },
    },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Anything else' },
  },
  $defs: { Address: { type: 'object', properties: { city: { type: 'string' }, pin: { type: 'string', pattern: '^[0-9]{6}$' } } } },
}
test('a JSON Schema becomes a valid form', () => {
  const { schema, warnings } = fromJsonSchema(order)
  assert.deepEqual(lint(schema), [])
  assert.deepEqual(Object.keys(schema.fields), ['email', 'full_name', 'age', 'country', 'tags', 'delivery', 'address', 'items', 'notes'])
  assert.deepEqual(warnings, ['full-name: key "full-name" became "full_name"'])
  const f = schema.fields
  assert.deepEqual(f.email, { type: 'string', label: 'Email', format: 'email', required: true })
  assert.deepEqual(f.age, { type: 'number', min: 18, decimals: 0 })
  assert.deepEqual(f.country.options, [
    { value: 'IN', label: 'India' },
    { value: 'AE', label: 'UAE' },
  ])
  assert.equal(f.tags.multiple, true)
  assert.equal(f.delivery.type, 'date')
  assert.equal(f.address.fields.pin.pattern, '[0-9]{6}')
  assert.equal(f.items.type, 'list')
  assert.equal(f.items.min, 1)
  assert.equal(f.items.fields.sku.required, true)
  assert.equal(f.notes.help, 'Anything else')
  const r = validate(schema, { email: 'a@b.co', country: 'IN', items: [{ sku: 'X1', qty: '2' }], address: { pin: '12345' } })
  assert.deepEqual(Object.keys(r.errors), ['address.pin'])
})
test('a form describes its submitted values as JSON Schema', () => {
  const { schema } = fromJsonSchema(order)
  const js = toJsonSchema(schema)
  assert.equal(js.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.deepEqual(js.required, ['email', 'country'])
  assert.equal(js.additionalProperties, false)
  assert.deepEqual(js.properties.country.enum, ['IN', 'AE', null])
  assert.deepEqual(js.properties.age.type, ['integer', 'null'])
  assert.equal(js.properties.items.items.properties.sku.type[0], 'string')
  // and back again gives the same fields
  assert.deepEqual(Object.keys(fromJsonSchema(js).schema.fields), Object.keys(schema.fields))
})
