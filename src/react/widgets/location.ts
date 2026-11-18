// A place as "lat,lng": typed, taken from the device, or picked on a small map.
import { createElement as h, useEffect, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode } from 'react'
import { useCtx, type WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

/** "lat,lng", typed or filled in from the device. */
export function Location(p: WidgetProps) {
  const c = useCtx()
  const [note, setNote] = useState('')
  const locate = () => {
    if (!navigator.geolocation) return setNote('This browser cannot tell where you are.')
    setNote('…')
    navigator.geolocation.getCurrentPosition(
      (pos) => { p.set(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); p.touch(); setNote('') },
      (err) => setNote(err.message || 'Could not get the location.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }
  return h('div', { className: 'fw-location' },
    h('input', { ...aria(p), type: 'text', inputMode: 'decimal', placeholder: '28.613900,77.209000', readOnly: p.readOnly, value: textValue(p.value), onBlur: p.touch, onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value) }),
    !p.readOnly && h('button', { type: 'button', onClick: locate }, c.labels.useLocation),
    note && h('span', { className: 'fw-help', role: 'status' }, note),
    p.field.widget === 'map' && h(MapPicker, p))
}

export const TILE = 256
/** Web Mercator: lat/lng ↔ pixels of the whole world at zoom z. */
export const project = (lat: number, lng: number, z: number): [number, number] => {
  const s = TILE * 2 ** z
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s]
}
export const unproject = (x: number, y: number, z: number): [number, number] => {
  const s = TILE * 2 ** z
  return [(180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / s)), ((((x / s) * 360) % 360) + 360) % 360 - 180]
}

/** A small map: drag to move, + / − to zoom, click to put the pin. The box above it stays the way to type or read it. */
export function MapPicker(p: WidgetProps) {
  const c = useCtx()
  const box = useRef<HTMLDivElement>(null)
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(textValue(p.value))
  const pin: [number, number] | null = m ? [+m[1], +m[2]] : null
  const [z, setZ] = useState(pin ? 14 : 4)
  const [center, setCenter] = useState<[number, number]>(() => project(...(pin ?? [22.6, 79]), pin ? 14 : 4))
  const [w, setW] = useState(480)
  const hgt = 280
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- recentres when the value changes, not when zoomed or panned
  useEffect(() => { if (pin) setCenter(project(pin[0], pin[1], z)) }, [p.value]) // follows "Use my location" and typing
  const zoom = (d: number) => {
    const nz = Math.max(2, Math.min(19, z + d))
    setCenter(([x, y]) => [x * 2 ** (nz - z), y * 2 ** (nz - z)])
    setZ(nz)
  }
  const left = center[0] - w / 2
  const top = center[1] - hgt / 2
  const n = 2 ** z
  const tiles: ReactNode[] = []
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++)
    for (let ty = Math.max(0, Math.floor(top / TILE)); ty <= Math.min(n - 1, Math.floor((top + hgt) / TILE)); ty++)
      tiles.push(h('img', {
        key: `${tx}/${ty}`, alt: '', draggable: false, width: TILE, height: TILE, style: { left: tx * TILE - left, top: ty * TILE - top },
        src: c.mapTiles.url.replace('{z}', String(z)).replace('{x}', String(((tx % n) + n) % n)).replace('{y}', String(ty)),
      }))
  const at = pin && project(pin[0], pin[1], z)
  return h('div', { className: 'fw-map' },
    h('div', {
      ref: box, className: 'fw-map-view', style: { height: hgt }, 'aria-hidden': true,
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, moved: false } },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
        d.moved = true
        d.x = e.clientX
        d.y = e.clientY
        setCenter(([x, y]) => [x - dx, y - dy])
      },
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current
        drag.current = null
        if (!d || d.moved || p.readOnly) return
        const r = e.currentTarget.getBoundingClientRect()
        const [lat, lng] = unproject(left + e.clientX - r.left, top + e.clientY - r.top, z)
        p.set(`${lat.toFixed(6)},${lng.toFixed(6)}`)
        p.touch()
      },
    },
      tiles,
      at && h('span', { className: 'fw-map-pin', style: { left: at[0] - left, top: at[1] - top } })),
    h('div', { className: 'fw-map-zoom' },
      h('button', { type: 'button', 'aria-label': `Zoom in ${p.label}`, onClick: () => zoom(1) }, '+'),
      h('button', { type: 'button', 'aria-label': `Zoom out ${p.label}`, onClick: () => zoom(-1) }, '−')),
    h('small', { className: 'fw-map-credit' }, c.mapTiles.attribution))
}
