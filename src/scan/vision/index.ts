// Reads a printed form from a picture of a page: lines to write on, boxes to tick or fill in, tables, and the printed
// words OCR found next to them. No model and no network: geometry and a few rules about forms. Pure functions, so it
// runs (and is tested) anywhere.
export type * from './types.ts'
export { erase } from './pixels.ts'
export { findShapes } from './shapes.ts'
export { cleanLabel } from './words.ts'
export { readPage } from './read-page.ts'
export { toSketch } from './to-sketch.ts'
