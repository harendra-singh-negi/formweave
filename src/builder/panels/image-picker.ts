// A picture picked from the device (shrunk in the browser) or given by its address.
import { createElement as h, useState, type ChangeEvent } from 'react'
import type { WidgetProps } from '../../react.ts'
import { SAFE_IMAGE } from '../../core/schema.ts'

/** Pictures are kept inside the form, so a big one is made smaller first: at most this many pixels on its long side. */
export const IMAGE_SIDE = 1200

/** Reads a picked picture into a data: URL, shrunk to IMAGE_SIDE, in this browser: nothing is uploaded. */
export async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, IMAGE_SIDE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * k)
  canvas.height = Math.round(img.height * k)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/webp', 0.85) // keeps transparency, far smaller than png
}

/** An image's picture: picked from the device (or a phone's camera), or an https address. */
export function ImagePicker(p: WidgetProps) {
  const src = typeof p.value === 'string' ? p.value : ''
  const [note, setNote] = useState('')
  const inline = src.startsWith('data:')
  return h(
    'div',
    { className: 'fw-b-image' },
    src && SAFE_IMAGE.test(src) && h('img', { src, alt: '' }),
    h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/gif,image/webp',
      'aria-label': 'Pick a picture',
      disabled: p.readOnly,
      onChange: async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setNote('Reading…')
        try {
          p.set(await shrink(file))
          setNote('')
        } catch {
          setNote('That picture could not be read. Try a PNG or JPEG.')
        }
      },
    }),
    h('input', {
      type: 'url',
      placeholder: 'or its address: https://…',
      'aria-label': 'Picture address',
      value: inline ? '' : src,
      readOnly: p.readOnly,
      onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value.trim() || null),
    }),
    inline && h('p', { className: 'fw-help' }, `Kept inside the form (${Math.round((src.length * 3) / 4 / 1024)} KB).`),
    src && !SAFE_IMAGE.test(src) && h('p', { className: 'fw-error' }, 'Use an https:// address.'),
    note && h('p', { className: 'fw-help', role: 'status' }, note),
    src && h('button', { type: 'button', onClick: () => p.set(null) }, 'Remove the picture'),
  )
}
