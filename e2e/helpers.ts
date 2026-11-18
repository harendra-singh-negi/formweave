// Shared steps for the browser tests: open the demo's builder with a given form, and read what it saved.
import { expect, type Page } from '@playwright/test'
import type { FormSchema } from '../src/index.ts'

const STORE = 'formweave-demo-schema' // where the demo keeps the builder's form (demo/main.ts)

/** Opens the builder on `schema` (or the demo's sample form). */
export async function openBuilder(page: Page, schema?: FormSchema) {
  await page.goto('/#builder')
  await page.evaluate(([key, s]) => { localStorage.clear(); if (s) localStorage.setItem(key, s) }, [STORE, schema ? JSON.stringify(schema) : ''] as const)
  await page.reload()
  await expect(page.locator('.fw-b-canvas form')).toBeVisible()
}

/** The form as the builder last saved it. */
export async function saved(page: Page): Promise<FormSchema> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORE)
}

/** The canvas element of a field (data-fw-path) or a layout piece (data-fw-ip). */
export const onCanvas = (page: Page, path: string) => page.locator(`.fw-b-canvas [data-fw-path="${path}"]`).first()
export const pieceOnCanvas = (page: Page, ip: string) => page.locator(`.fw-b-canvas [data-fw-ip="${ip}"]`).first()
