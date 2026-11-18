// A sample form: an id, what it is called, what it shows off, and the schema itself.
import type { FormSchema } from '../core/schema.ts'

export interface Sample {
  id: string
  title: string
  /** What it shows off. */
  about: string
  schema: FormSchema
}
