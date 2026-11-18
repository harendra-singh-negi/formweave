// The palette as a list to add from: every input with its group, and a fresh copy of it.
import { PALETTE } from './palette.ts'
import type { Field, FormSchema } from '../core/schema.ts'
import { edits } from './schema-edits.ts'
import type { Kind } from './types.ts'

export const KINDS: [Kind, string][] = [
  ['string', 'Text'], ['number', 'Number'], ['boolean', 'Yes / No'], ['choice', 'Choice'],
  ['date', 'Date'], ['file', 'File'], ['group', 'Group'], ['list', 'List / table'],
]
export interface Item { id: string; label: string; base: string; group: string; make(): Field }
export const ITEMS: Item[] = PALETTE.flatMap(([group, list]) => list.map(([base, label, f]) => ({ id: base, label, base, group, make: () => structuredClone(f) })))
export const itemOf = (id: string) => ITEMS.find((i) => i.id === id)!
export const EMPTY: FormSchema = { version: 1, fields: {} }

// ---- schema edits: each returns a new schema ----
