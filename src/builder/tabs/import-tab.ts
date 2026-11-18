// The Import tab: samples, scanning a PDF or photos, and JSON in and out.
import { createElement as h, useState } from 'react'
import { lint } from '../../core/lint.ts'
import { fromJsonSchema, type Imported } from '../../core/jsonschema.ts'
import type { Sample } from '../../samples.ts'
import type { Fields, FormSchema } from '../../core/schema.ts'
import type { BuilderProps } from '../types.ts'

export function JsonTab({ schema, load, scan, samples, heading }: { schema: FormSchema; load(s: FormSchema): void; scan?: BuilderProps['scan']; samples: Sample[]; heading: string }) {
  const [draft, setDraft] = useState(() => JSON.stringify(schema, null, 2))
  const [problems, setProblems] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [reading, setReading] = useState<string | null>(null)
  const read = async (picked: FileList | null) => {
    const files = Array.from(picked ?? [])
    if (!scan || !files.length) return
    setReading('Reading…')
    setProblems([])
    setNotes([])
    try {
      const r = await scan(files, setReading)
      load(r.schema)
      setDraft(JSON.stringify(r.schema, null, 2))
      setNotes([`Read ${Object.keys(r.schema.fields).length} fields. Check them on the Fields tab; Undo brings back the form you had.`, ...r.warnings])
    } catch (e) {
      setProblems([(e as Error).message])
    } finally {
      setReading(null)
    }
  }
  const apply = () => {
    try {
      let s = JSON.parse(draft)
      let notes: string[] = []
      // a JSON Schema (OpenAPI, Zod's z.toJSONSchema()…) is turned into a form
      if (s && typeof s === 'object' && s.version === undefined && (s.properties || s.$schema || s.type === 'object')) {
        const r = fromJsonSchema(s)
        s = r.schema
        notes = r.warnings.map((w) => `Imported with a change: ${w}`)
      }
      const found = lint(s)
      setProblems(found.map((i) => `${i.path || 'schema'}: ${i.message}`))
      setNotes(notes)
      if (!found.length) {
        load(s)
        setDraft(JSON.stringify(s, null, 2))
      }
    } catch (e) {
      setProblems([(e as Error).message])
    }
  }
  return h('div', { className: 'fw-b-json' },
    samples.length > 0 && h('div', { className: 'fw-b-samples' },
      h('h3', null, heading),
      h('p', { className: 'fw-help' }, 'Ready-made forms that show every input and layout piece at work, with made-up data. Opening one replaces this form; Undo brings it back.'),
      h('div', null, samples.map((x) => h('button', { key: x.id, type: 'button', onClick: () => { load(structuredClone(x.schema)); setDraft(JSON.stringify(x.schema, null, 2)); setNotes([`Opened "${x.title}". Undo brings back the form you had.`]) } },
        h('strong', null, x.title), h('span', null, x.about))))),
    scan && h('div', { className: 'fw-b-scan' },
      h('h3', null, 'From a photo, scan or PDF'),
      h('p', { className: 'fw-help' }, 'Pick pictures of the pages (on a phone, take them with the camera) or a PDF. They are read on this device, nothing is uploaded, and the form found replaces this one.'),
      h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, disabled: reading !== null, 'aria-label': 'Pages to read', onChange: (e: { target: HTMLInputElement }) => { read(e.target.files); e.target.value = '' } }),
      reading && h('p', { role: 'status' }, reading)),
    h('h3', null, 'JSON'),
    h('p', { className: 'fw-help' }, 'Paste a formweave schema, or a JSON Schema (OpenAPI, Zod…) to turn it into a form.'),
    h('textarea', { 'aria-label': 'Schema JSON', value: draft, spellCheck: false, onChange: (e: { target: { value: string } }) => setDraft(e.target.value) }),
    problems.length > 0 && h('ul', { className: 'fw-error', role: 'alert' }, problems.map((m, i) => h('li', { key: i }, m))),
    notes.length > 0 && h('ul', { className: 'fw-help', role: 'status' }, notes.map((m, i) => h('li', { key: i }, m))),
    h('div', null,
      h('button', { type: 'button', onClick: apply }, 'Apply'), ' ',
      h('button', { type: 'button', onClick: () => navigator.clipboard?.writeText(JSON.stringify(schema, null, 2)) }, 'Copy')))
}

// ---- layout editing ----
