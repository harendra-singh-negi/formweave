import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { Builder, edits, fieldAt, freeKey } from './builder.ts'
import { lint } from './lint.ts'
import type { FormSchema } from './schema.ts'

const base: FormSchema = {
  version: 1,
  fields: {
    name: { type: 'string' },
    items: { type: 'list', fields: { qty: { type: 'number' }, price: { type: 'number' } } },
  },
  layout: [{ type: 'section', children: ['name', 'items'] }],
}

test('edits keep order, nesting and the layout in step', () => {
  let s = edits.add(base, ['items'], 'total', { type: 'number', value: 'qty * price' }, 'price')
  assert.deepEqual(Object.keys((fieldAt(s.fields, ['items']) as any).fields), ['qty', 'price', 'total'])
  s = edits.rename(s, ['name'], 'fullName')
  assert.deepEqual(Object.keys(s.fields), ['fullName', 'items'])
  assert.deepEqual((s.layout![0] as any).children, ['fullName', 'items'])
  s = edits.move(s, ['items'], 'fullName')
  assert.deepEqual(Object.keys(s.fields), ['items', 'fullName'])
  s = edits.remove(s, ['fullName'])
  assert.deepEqual((s.layout![0] as any).children, ['items'])
  assert.deepEqual(lint(s), [])
  assert.equal(base.fields.name.type, 'string') // the original is untouched
  assert.equal(freeKey(s.fields, ['items'], 'qty'), 'qty1')
})

test('renders palette, field tree and an empty settings panel', () => {
  const html = renderToString(h(Builder, { schema: base }))
  assert.match(html, /\+ <!-- -->Text/)
  assert.match(html, /name · string/)
  assert.match(html, /qty · number/) // children of the list are shown
  assert.match(html, /Select a field to change it/)
})

test('layout edits move nodes between containers and keep pages to sections', async () => {
  const { layoutEdits, nodeAt } = await import('./builder.ts')
  const items: any[] = ['a', { type: 'section', children: ['b'] }, { type: 'pages', children: [{ type: 'section', children: [] }] }, 'c']
  // 'a' into the section, at its end
  let l: any[] = layoutEdits.move(items, [0], [1], 1)!
  assert.deepEqual(l[0].children, ['b', 'a'])
  // 'c' to the top, before everything (it shifts nothing else)
  l = layoutEdits.move(l, [2], [], 0)!
  assert.deepEqual(l.map((n: any) => (typeof n === 'string' ? n : n.type)), ['c', 'section', 'pages'])
  // a field can't sit directly in pages; a section can't go into itself
  assert.equal(layoutEdits.move(l, [0], [2], 0), undefined)
  assert.equal(layoutEdits.move(l, [1], [1], 0), undefined)
  // the section moves into pages as a second page
  l = layoutEdits.move(l, [1], [2], 1)!
  assert.equal((nodeAt(l, [1]) as any).children.length, 2)
  // removing a container keeps what was in it
  assert.deepEqual(layoutEdits.unwrap(l, [1]), ['c', { type: 'section', children: [] }, { type: 'section', children: ['b', 'a'] }])
})
