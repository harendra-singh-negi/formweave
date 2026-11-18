// The demo uses the custom elements, the way an Angular, Vue or plain-HTML app would.
import '../src/element.ts'
import '../src/style.css'
import type { FormweaveBuilder, FormweaveForm } from '../src/element.ts'
import { lint } from '../src/lint.ts'
import { scanForm } from '../src/scan.ts'
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { FormSchema } from '../src/schema.ts'

const SAMPLE: FormSchema = {
  version: 1,
  title: 'Loan application',
  fields: {
    name: { type: 'string', label: { en: 'Full name', hi: 'पूरा नाम' }, required: true, minLength: 2 },
    email: { type: 'string', format: 'email', label: { en: 'Email', hi: 'ईमेल' }, required: true },
    phone: { type: 'string', format: 'phone', label: { en: 'Phone', hi: 'फ़ोन' } },
    dob: { type: 'date', label: { en: 'Date of birth', hi: 'जन्म तिथि' }, max: '2008-12-31' },
    employment: { type: 'choice', widget: 'radio', label: { en: 'Employment', hi: 'रोज़गार' }, options: ['Salaried', 'Self Employed'], required: true },
    business: { type: 'string', label: { en: 'Business name', hi: 'व्यवसाय का नाम' }, visible: "employment == 'Self Employed'", required: true },
    gstin: {
      type: 'string', label: 'GSTIN', visible: "employment == 'Self Employed'",
      pattern: '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]', messages: { pattern: { en: 'Like 22AAAAA0000A1Z5', hi: 'जैसे 22AAAAA0000A1Z5' } },
    },
    items: {
      type: 'list', widget: 'table', min: 1, max: 5, label: { en: 'Items', hi: 'सामान' },
      fields: {
        item: { type: 'string', label: { en: 'Item', hi: 'सामान' }, required: true },
        qty: { type: 'number', label: { en: 'Qty', hi: 'मात्रा' }, min: 1, decimals: 0, required: true },
        price: { type: 'number', label: { en: 'Price ₹', hi: 'दाम ₹' }, decimals: 2, required: true },
        total: { type: 'number', label: { en: 'Total ₹', hi: 'कुल ₹' }, value: 'qty * price', decimals: 2 },
      },
    },
    gst: { type: 'number', label: 'GST 18% ₹', value: 'sum(items.total) * 18 / 100', decimals: 2 },
    grandTotal: { type: 'number', label: { en: 'Grand total ₹', hi: 'कुल योग ₹' }, value: 'sum(items.total) + gst', decimals: 2 },
    agree: { type: 'boolean', widget: 'toggle', label: { en: 'I agree to the terms', hi: 'मैं शर्तें मानता/मानती हूँ' }, required: true },
  },
  layout: [{
    type: 'pages', display: 'steps',
    children: [
      { type: 'section', title: { en: 'About you', hi: 'आपके बारे में' }, children: [{ type: 'grid', cols: 2, children: ['name', 'email', 'phone', 'dob'] }] },
      { type: 'section', title: { en: 'Work', hi: 'काम' }, children: ['employment', { type: 'grid', cols: 2, children: ['business', 'gstin'] }] },
      { type: 'section', title: { en: 'Order', hi: 'ऑर्डर' }, children: ['items', { type: 'grid', cols: 2, children: ['gst', 'grandTotal'] }, 'agree'] },
    ],
  }],
}
const HINDI = { submit: 'जमा करें', next: 'आगे', back: 'पीछे', addRow: '+ पंक्ति जोड़ें', removeRow: 'पंक्ति हटाएँ', remove: 'हटाएँ' }
const STORE = 'formweave-demo-schema'

// The builder saves here as you work; a broken or missing save falls back to the sample.
function saved(): FormSchema {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    if (s && lint(s).length === 0) return s
  } catch {}
  return SAMPLE
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const builder = $<FormweaveBuilder>('b')
const form = $<FormweaveForm>('f')
const start = saved()
builder.schema = start
form.schema = start

// "From a photo, scan or PDF": read in this browser with OCR, nothing is uploaded
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker
builder.scan = (files, progress) => scanForm(files, { languages: ['eng', 'hin'], pdfjs, progress })

builder.addEventListener('fw-change', (e) => {
  const { schema, issues } = (e as CustomEvent).detail
  if (issues.length) return
  try { localStorage.setItem(STORE, JSON.stringify(schema)) } catch {}
  form.schema = schema
  $('sent').textContent = 'Nothing submitted yet.'
})
form.addEventListener('fw-change', (e) => {
  const { values, errors } = (e as CustomEvent).detail
  $('out').textContent = JSON.stringify({ values, errors }, null, 2)
})
form.addEventListener('fw-submit', (e) => {
  $('sent').textContent = JSON.stringify((e as CustomEvent).detail, null, 2)
})
$<HTMLSelectElement>('lang').addEventListener('change', (e) => {
  const locale = (e.target as HTMLSelectElement).value
  form.locale = locale
  form.labels = locale === 'hi' ? HINDI : {}
})
$('reset').addEventListener('click', () => {
  try { localStorage.removeItem(STORE) } catch {}
  location.reload()
})

function showTab() {
  const tab = location.hash === '#fill' ? 'fill' : 'builder'
  for (const id of ['builder', 'fill']) $(id).hidden = id !== tab
  for (const a of document.querySelectorAll('nav a')) a.toggleAttribute('aria-current', a.getAttribute('href') === `#${tab}`)
  document.querySelector('nav a[aria-current]')?.setAttribute('aria-current', 'page')
}
addEventListener('hashchange', showTab)
showTab()
