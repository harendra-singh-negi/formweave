// The design canvas: picking, editing in place, dragging, devices and full width.
import { expect, test } from '@playwright/test'
import { onCanvas, openBuilder, pieceOnCanvas, saved } from './helpers.ts'

const FORM = {
  version: 1 as const,
  fields: {
    name: { type: 'string' as const, label: 'Name' },
    email: { type: 'string' as const, label: 'Email' },
    phone: { type: 'string' as const, label: 'Phone' },
  },
  layout: [{ type: 'section' as const, title: 'You', children: [{ type: 'grid' as const, cols: { base: 1, md: 2 }, children: ['name', 'email'] }, 'phone'] }],
}

test('a click picks a field; its settings change the form as you type', async ({ page }) => {
  await openBuilder(page, FORM)
  await onCanvas(page, 'email').click()
  await expect(page.locator('.fw-b-settings h3').first()).toHaveText('Text settings')
  await page.locator('.fw-b-settings input[id$="label"]').fill('Work email')
  await expect(onCanvas(page, 'email').locator('label')).toHaveText('Work email')
  expect((await saved(page)).fields.email.label).toBe('Work email')
})

test('a double-click retypes a label in place', async ({ page }) => {
  await openBuilder(page, FORM)
  await onCanvas(page, 'phone').dblclick()
  const box = page.locator('.fw-b-inline')
  await expect(box).toBeFocused()
  await box.fill('Mobile')
  await box.press('Enter')
  await expect(onCanvas(page, 'phone').locator('label')).toHaveText('Mobile')
  await pieceOnCanvas(page, '0').locator('> h3').dblclick() // a section title too
  await page.locator('.fw-b-inline').fill('About you')
  await page.locator('.fw-b-inline').press('Enter')
  expect((await saved(page)).layout![0]).toMatchObject({ title: 'About you' })
})

test('an input dragged from the palette lands where it is dropped', async ({ page }) => {
  await openBuilder(page, FORM)
  await page.locator('.fw-b-find').fill('long text')
  await page.locator('.fw-b-palette .fw-b-group button', { hasText: 'Long text' }).dragTo(onCanvas(page, 'phone'))
  const s = await saved(page)
  expect(s.fields.longText1).toMatchObject({ type: 'string', widget: 'textarea' })
  expect((s.layout![0] as { children: unknown[] }).children).toEqual([{ type: 'grid', cols: { base: 1, md: 2 }, children: ['name', 'email'] }, 'longText1', 'phone'])
})

test('a field dragged onto another moves before it, into its grid', async ({ page }) => {
  await openBuilder(page, FORM)
  await onCanvas(page, 'phone').dragTo(onCanvas(page, 'name'))
  expect((await saved(page)).layout![0]).toMatchObject({ children: [{ type: 'grid', children: ['phone', 'name', 'email'] }] })
})

test('Delete removes the picked field; Undo brings it back', async ({ page }) => {
  await openBuilder(page, FORM)
  await onCanvas(page, 'phone').click()
  await page.keyboard.press('Delete')
  await expect(onCanvas(page, 'phone')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(onCanvas(page, 'phone')).toBeVisible()
})

test('Phone and Tablet show the form at their width; the grid stacks on a phone', async ({ page }) => {
  await openBuilder(page, FORM)
  const grid = pieceOnCanvas(page, '0.0')
  const columns = () => grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(await columns()).toBe(2)
  await page.getByRole('button', { name: 'Phone', exact: true }).click()
  await expect(page.locator('.fw-b-device')).toHaveAttribute('data-device', 'phone')
  expect(await columns()).toBe(1)
  await page.getByRole('button', { name: 'Tablet', exact: true }).click()
  expect(await columns()).toBe(2)
})

test('Full width puts the panels away; + Add brings the palette back; Esc leaves', async ({ page }) => {
  await openBuilder(page, FORM)
  await page.getByRole('button', { name: /Full width/ }).click()
  await expect(page.locator('.fw-b-palette')).toHaveCount(0)
  await page.getByRole('button', { name: '+ Add' }).click()
  await expect(page.locator('.fw-b-palette')).toBeVisible()
  await page.locator('.fw-b-canvas').click({ position: { x: 5, y: 60 } })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Full width/ })).toBeVisible()
})
