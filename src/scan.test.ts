import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sketchToForm } from './scan.ts'
import { lint } from './lint.ts'

const outline = {
  title: 'Job application',
  sections: [
    {
      title: 'Personal details',
      fields: [
        { key: '', label: 'Full name:', kind: 'text', required: true, help: 'IN CAPITALS', options: [], columns: [] },
        { key: '', label: 'जन्म तिथि', kind: 'date', required: false, help: '', options: [], columns: [] },
        { key: '', label: 'Full name', kind: 'text', required: false, help: '', options: [], columns: [] },
        { key: '', label: 'Gender', kind: 'one_of', required: false, help: '', options: ['Male', 'Female', 'Other', 'Other'], columns: [] },
        { key: '', label: 'PAN', kind: 'text', required: false, help: '', options: [], columns: [], maxLength: 10 },
      ],
    },
    {
      title: 'Experience',
      fields: [
        { key: '', label: 'Previous jobs', kind: 'table', required: false, help: '', options: [], columns: [
          { key: '', label: 'Company', kind: 'text', options: [] },
          { key: '', label: 'From', kind: 'date', options: [] },
          { key: '', label: 'Salary', kind: 'money', options: [] },
        ] },
        { key: '', label: 'Willing to relocate?', kind: 'yes_no', required: true, help: '', options: [], columns: [] },
        { key: '', label: 'and', kind: 'one_of', required: false, help: '', options: ['Day'], columns: [] },
        { key: '', label: 'Signature', kind: 'signature', required: true, help: '', options: [], columns: [] },
        { key: '', label: 'Weird', kind: 'hologram', required: false, help: '', options: [], columns: [] },
      ],
    },
  ],
}

test('an outline becomes a valid form with sections', () => {
  const { schema, warnings } = sketchToForm(outline)
  assert.deepEqual(lint(schema), [])
  assert.equal(schema.title, 'Job application')
  assert.deepEqual(Object.keys(schema.fields), ['fullName', 'field1', 'fullName2', 'gender', 'pan', 'previousJobs', 'willingToRelocate', 'and_', 'signature', 'weird'])
  const f = schema.fields as any
  assert.deepEqual(f.fullName, { type: 'string', label: 'Full name', help: 'IN CAPITALS', required: true })
  assert.deepEqual(f.field1, { type: 'date', label: 'जन्म तिथि' })
  assert.deepEqual(f.gender.options, ['Male', 'Female', 'Other'])
  assert.equal(f.gender.widget, 'radio')
  assert.equal(f.pan.maxLength, 10)
  assert.deepEqual(Object.keys(f.previousJobs.fields), ['company', 'from', 'salary'])
  assert.equal(f.previousJobs.fields.salary.format, 'currency')
  assert.deepEqual(f.willingToRelocate, { type: 'choice', widget: 'radio', options: ['Yes', 'No'], label: 'Willing to relocate?', required: true })
  assert.equal(f.and_.type, 'string') // one choice is no choice
  assert.equal(f.signature.widget, 'signature')
  assert.deepEqual(warnings, ['and: fewer than two choices, so it became a text field', 'Weird: unknown kind "hologram", so it became a text field'])
  assert.deepEqual(schema.layout, [
    { type: 'section', title: 'Personal details', children: ['fullName', 'field1', 'fullName2', 'gender', 'pan'] },
    { type: 'section', title: 'Experience', children: ['previousJobs', 'willingToRelocate', 'and_', 'signature', 'weird'] },
  ])
})

test('anything that is not an outline gives an empty form, not a crash', () => {
  for (const junk of [null, 'nope', [], { sections: 'x' }, { sections: [{ fields: [null, 7, { kind: 'table', columns: [] }] }] }]) {
    const { schema, warnings } = sketchToForm(junk)
    assert.deepEqual(schema.fields, {})
    assert.ok(warnings.includes('No fields were found'))
  }
})

test('fields printed side by side stay side by side; tables keep fixed rows and starting rows', () => {
  const field = (label: string, line?: number, extra = {}) => ({ key: '', label, kind: 'text', required: false, help: '', options: [], columns: [], ...(line ? { line } : {}), ...extra })
  const { schema } = sketchToForm({ title: '', sections: [{ title: 'Ship', fields: [
    field('SHIP', 1), field('GT', 1), field('Place', 2),
    field('Week', 3, { kind: 'table', rows: ['Mon', 'Tue'], rowHeading: 'Day', columns: [{ key: '', label: 'Hours', kind: 'number', options: [] }] }),
    field('Crew', 4, { kind: 'table', minRows: 3, columns: [{ key: '', label: 'Answer', kind: 'one_of', options: ['Yes', 'No', 'NA'], free: true }] }),
  ] }] })
  const section = schema.layout![0] as { children: unknown[] }
  assert.deepEqual(section.children.slice(0, 2), [{ type: 'grid', cols: { base: 1, md: 2 }, children: ['ship', 'gt'] }, 'place'])
  assert.deepEqual((schema.fields.week as { rows: string[] }).rows, ['Mon', 'Tue'])
  const crew = schema.fields.crew as unknown as { default: unknown[]; fields: { answer: { widget: string; allowOther: boolean } } }
  assert.equal(crew.default.length, 3)
  assert.deepEqual([crew.fields.answer.widget, crew.fields.answer.allowOther], ['autocomplete', true])
})
