// Drag helpers: mark the row under the pointer so people see where a drop lands.
import type { DragEvent } from 'react'

/** Drag helpers: mark the innermost row under the pointer so people see where a drop lands. */
export const dragOver = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  e.currentTarget.classList.add('fw-b-over')
}
export const dragLeave = (e: DragEvent) => {
  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.classList.remove('fw-b-over')
}
export const dragEnd = (e: DragEvent) => e.currentTarget.classList.remove('fw-b-over')
