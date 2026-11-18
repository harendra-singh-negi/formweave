// The form's own settings: its title and its look.
import { text } from '../../core/form.ts'
import type { FormSchema, Values } from '../../core/schema.ts'

export const FORM_SETTINGS: FormSchema = { version: 1, fields: {
  title: { type: 'string', label: 'Title', help: 'The name it is saved under. The paper look prints it on top; otherwise your app shows it.' },
  theme: { type: 'choice', widget: 'radio', label: 'Look', required: true, options: [
    { value: 'plain', label: 'Plain: takes your app\'s fonts and colours' },
    { value: 'paper', label: 'Paper: a printed form, boxed sections, lines to write on' },
  ] },
} }
export const formSettings = (s: FormSchema): Values => ({ title: text(s.title, 'en') || null, theme: s.theme ?? 'plain' })
export function fromFormSettings(s: FormSchema, v: Values): FormSchema {
  const out: FormSchema = { ...s }
  if (v.theme === 'paper') out.theme = 'paper'
  else delete out.theme
  if (v.title) out.title = s.title && typeof s.title === 'object' ? { ...s.title, en: String(v.title) } : String(v.title)
  else delete out.title
  return out
}
