// Files picked or dropped, handed to your upload function.
import { createElement as h, type ChangeEvent, type DragEvent } from 'react'
import type { FileField, FileRef } from '../../core/schema.ts'
import { useCtx, type WidgetProps } from '../context.ts'
import { aria } from '../shell.ts'

export function FileInput(p: WidgetProps) {
  const f = p.field as FileField
  const c = useCtx()
  const files = (f.multiple ? (Array.isArray(p.value) ? p.value : []) : p.value ? [p.value] : []) as FileRef[]
  const pick = async (list: FileList | null) => {
    // ponytail: a failed upload rejects to your onUpload caller; no retry UI yet
    const refs = await Promise.all(Array.from(list ?? [], (x) => c.onUpload?.(x) ?? Promise.resolve({ id: x.name, name: x.name, size: x.size, type: x.type })))
    p.set(f.multiple ? [...files, ...refs] : (refs[0] ?? null))
    p.touch()
  }
  const camera = f.widget === 'camera'
  return h(
    'div',
    {
      className: 'fw-files',
      onDragOver: (e: DragEvent) => {
        if (!p.readOnly) {
          e.preventDefault()
          e.currentTarget.classList.add('fw-over')
        }
      },
      onDragLeave: (e: DragEvent) => e.currentTarget.classList.remove('fw-over'),
      onDrop: (e: DragEvent) => {
        e.currentTarget.classList.remove('fw-over')
        if (p.readOnly) return
        e.preventDefault()
        pick(e.dataTransfer.files)
      },
    },
    h('input', {
      ...aria(p),
      type: 'file',
      accept: f.accept ?? (camera ? 'image/*' : undefined),
      capture: camera ? 'environment' : undefined,
      multiple: f.multiple,
      disabled: p.readOnly,
      onChange: (e: ChangeEvent<HTMLInputElement>) => pick(e.target.files),
    }),
    !p.readOnly && !camera && h('span', { className: 'fw-help' }, c.labels.dropFiles),
    files.map((x, i) =>
      h(
        'div',
        { key: `${x.id}-${i}`, className: 'fw-file' },
        x.name,
        !p.readOnly &&
          h(
            'button',
            { type: 'button', 'aria-label': `${c.labels.remove} ${x.name}`, onClick: () => p.set(f.multiple ? files.filter((_, j) => j !== i) : null) },
            '×',
          ),
      ),
    ),
  )
}
