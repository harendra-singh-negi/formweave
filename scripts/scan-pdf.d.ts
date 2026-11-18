import { type Item } from '../src/scan/vision/index.ts'
import type { FormSchema } from '../src/core/schema.ts'
export declare function readPdf(pdf: string): Item[][]
/** One line per field: the outline people would see in the builder. */
export declare function outline(schema: FormSchema): string
