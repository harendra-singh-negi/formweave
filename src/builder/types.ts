// The builder's props, its tabs and its own words.
import { lint, type Issue } from '../core/lint.ts'
import type { Imported } from '../core/jsonschema.ts'
import { SAMPLES, type Sample } from '../samples.ts'
import type { Field, FormSchema } from '../core/schema.ts'
import { Builder } from './builder.ts'
import { Help } from './panels/help.ts'
import { formSettings } from './settings/form-settings.ts'

export type Path = string[]
export type Kind = Field['type']

export interface BuilderProps {
  /** Where to start. Later changes to this prop are ignored; the builder keeps its own history. */
  schema?: FormSchema
  /** Every change, with what lint() finds. Save it only when `issues` is empty. */
  onChange?(schema: FormSchema, issues: Issue[]): void
  /**
   * Reads photos, scans or PDFs into a form: usually `(files, progress) => scanForm(files, { progress })`
   * from formweave/scan. Without it, the Import tab has no "from a photo" part.
   */
  scan?(files: File[], progress: (message: string) => void): Promise<Imported>
  /** Which tabs show, in this order; the first one opens. Default: all of them. */
  tabs?: BuilderTab[]
  /** Only these palette inputs or groups, by key or group name: ['email', 'phone', 'Choices']. Default: all. */
  palette?: string[]
  /** The samples on the Import tab: your own forms, or false for none. Default: formweave's SAMPLES. */
  samples?: Sample[] | false
  /** Your words for the builder's own tabs, buttons and headings, e.g. in another language. */
  labels?: Partial<BuilderLabels>
  /** false hides the Help button. */
  help?: boolean
  /** Added to the builder's root, next to `fw-builder`, to style it from your CSS. */
  className?: string
  /** CSS variables on the builder's root: { '--fw-accent': '#7c3aed', '--fw-b-font': 'Georgia', '--fw-b-palette': '16rem' }. README → Builder looks. */
  vars?: Record<string, string>
}

export type BuilderTab = 'design' | 'build' | 'layout' | 'preview' | 'json'

/** The builder's own words. Pass `labels` to change any of them. */
export const BUILDER_LABELS = {
  design: 'Design', build: 'Fields', layout: 'Layout', preview: 'Preview', json: 'Import / JSON', jsonScan: 'Scan / Import',
  undo: 'Undo', redo: 'Redo', help: '? Help', closeHelp: 'Close help', helpTitle: 'How to use the builder',
  add: 'Add', addTo: 'Add to {name}', find: 'Find an input ({n})', fields: 'Fields', formSettings: 'Form settings', settings: '{kind} settings',
  selectField: 'Select a field to change it.', copy: 'Copy', paste: 'Paste', duplicate: 'Duplicate', remove: 'Delete',
  desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone', fullWidth: '⤢ Full width', exitFullWidth: '⤡ Exit full width', openPalette: '+ Add', closePalette: '✕ Close palette',
  samples: 'Samples', layoutPieces: 'Layout',
}
export type BuilderLabels = typeof BUILDER_LABELS
export const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
