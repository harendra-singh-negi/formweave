// A code typed in, or read from a QR code or barcode with the camera.
import { createElement as h, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useCtx, type WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

/** Typed, or read from a QR code or barcode with the camera where the browser can (BarcodeDetector). */
export function Barcode(p: WidgetProps) {
  const c = useCtx()
  const video = useRef<HTMLVideoElement>(null)
  const [on, setOn] = useState(false)
  const [note, setNote] = useState('')
  const can = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices
  useEffect(() => {
    if (!on) return
    let stop = false
    let stream: MediaStream | undefined
    const Detector = (window as unknown as { BarcodeDetector: new () => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(
      async (s) => {
        stream = s
        if (stop || !video.current) return
        video.current.srcObject = s
        await video.current.play()
        const detector = new Detector()
        // oxlint-disable-next-line no-unmodified-loop-condition -- the effect's cleanup sets it
        while (!stop) {
          const [hit] = await detector.detect(video.current).catch(() => [])
          if (hit) {
            p.set(hit.rawValue)
            p.touch()
            setOn(false)
            return
          }
          await new Promise((r) => setTimeout(r, 250))
        }
      },
      (err: Error) => {
        setNote(err.message)
        setOn(false)
      },
    )
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the camera starts and stops with `on` only
  }, [on])
  return h(
    'div',
    { className: 'fw-location' },
    h('input', {
      ...aria(p),
      type: 'text',
      readOnly: p.readOnly,
      value: textValue(p.value),
      onBlur: p.touch,
      onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value),
    }),
    can && !p.readOnly && h('button', { type: 'button', 'aria-pressed': on, onClick: () => setOn(!on) }, c.labels.scan),
    on && h('video', { ref: video, className: 'fw-scan-video', muted: true, playsInline: true }),
    note && h('span', { className: 'fw-help', role: 'status' }, note),
  )
}
