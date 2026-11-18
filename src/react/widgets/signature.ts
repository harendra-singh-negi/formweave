// A signature drawn with a finger, pen or mouse, kept as an SVG drawing.
import { createElement as h, useRef, useState, type PointerEvent } from 'react'
import { useCtx, type WidgetProps } from '../context.ts'
import { textValue } from '../shell.ts'

export const SIGN_W = 400
export const SIGN_H = 150
/** Drawn with a finger, pen or mouse. The value is an SVG drawing: show it with <img src={'data:image/svg+xml,' + encodeURIComponent(value)}>. */
export function Signature(p: WidgetProps) {
  const c = useCtx()
  const [d, setD] = useState(() => /d="([^"]*)"/.exec(textValue(p.value))?.[1] ?? '')
  const last = useRef<[number, number] | null>(null)
  const at = (e: PointerEvent<SVGSVGElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [Math.round(((e.clientX - r.left) / r.width) * SIGN_W), Math.round(((e.clientY - r.top) / r.height) * SIGN_H)]
  }
  const svg = (path: string) =>
    path &&
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIGN_W} ${SIGN_H}"><path d="${path}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const draw = !p.readOnly && {
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      last.current = at(e)
      setD((x) => `${x}M${last.current!.join(' ')}`)
    },
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      if (!last.current) return
      const pt = at(e)
      if (Math.abs(pt[0] - last.current[0]) + Math.abs(pt[1] - last.current[1]) < 3) return // fewer points, a shorter value
      last.current = pt
      setD((x) => `${x}L${pt.join(' ')}`)
    },
    onPointerUp: () => {
      last.current = null
      p.set(svg(d) || null)
      p.touch()
    },
  }
  // ponytail: drawn only with a pointer; people who can't draw need another way in (a typed name field next to it)
  return h(
    'div',
    { className: 'fw-signature' },
    h(
      'svg',
      {
        id: p.id,
        role: 'img',
        'aria-label': p.label,
        'aria-invalid': p.error ? true : undefined,
        'aria-describedby': p.describedBy,
        viewBox: `0 0 ${SIGN_W} ${SIGN_H}`,
        className: p.className,
        ...draw,
      },
      h('path', { d, fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    ),
    !p.readOnly &&
      d &&
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            setD('')
            p.set(null)
          },
        },
        c.labels.clear,
      ),
  )
}
