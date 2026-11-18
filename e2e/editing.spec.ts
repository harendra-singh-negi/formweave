// Copy and paste, the option list, the table designer, the help dialog and the samples.
import { expect, test } from '@playwright/test'
import { onCanvas, openBuilder, pieceOnCanvas, saved } from './helpers.ts'

test('a section duplicated: its fields come along with unique keys and formulas that follow', async ({ page }) => {
  await openBuilder(page, {
    version: 1,
    fields: { qty: { type: 'number', label: 'Qty' }, price: { type: 'number', label: 'Price' }, total: { type: 'number', label: 'Total', value: 'qty * price' } },
    layout: [{ type: 'section', title: 'Order', children: ['qty', 'price', 'total'] }],
  })
  await pieceOnCanvas(page, '0').locator('> h3').click()
  await page.getByRole('button', { name: /Duplicate/ }).click()
  const s = await saved(page)
  expect(Object.keys(s.fields)).toEqual(['qty', 'price', 'total', 'qty1', 'price1', 'total1'])
  expect(s.fields.total1).toMatchObject({ value: 'qty1 * price1' })
  expect(s.layout![1]).toMatchObject({ type: 'section', children: ['qty1', 'price1', 'total1'] })
})

test('Ctrl+C and Ctrl+V paste a field right after the picked one', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openBuilder(page, { version: 1, fields: { email: { type: 'string', label: 'Email' }, note: { type: 'string', label: 'Note' } } })
  await onCanvas(page, 'email').click()
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  expect(Object.keys((await saved(page)).fields)).toEqual(['email', 'email1', 'note'])
})

test('options: a pasted list, then three per row on the form', async ({ page }) => {
  await openBuilder(page, { version: 1, fields: { ops: { type: 'choice', label: 'Operations', multiple: true, options: ['a', 'b'] } } })
  await onCanvas(page, 'ops').click()
  await page.getByRole('button', { name: 'Paste a list' }).click()
  await page.getByRole('textbox', { name: 'Options, one per line' }).fill('Loading\nDischarging\nBunkering\nIdle | At rest')
  await page.getByRole('button', { name: /Use these/ }).click()
  await page.locator('.fw-b-settings input[id$="columns"]').fill('3')
  await expect(onCanvas(page, 'ops').locator('.fw-options-cols')).toHaveCSS('grid-template-columns', /^\S+ \S+ \S+$/)
  expect((await saved(page)).fields.ops).toMatchObject({ options: ['Loading', 'Discharging', 'Bunkering', { value: 'Idle', label: 'At rest' }], columns: 3 })
})

test('the table designer adds a column and a Sum row', async ({ page }) => {
  await openBuilder(page, { version: 1, fields: { items: { type: 'list', widget: 'table', label: 'Items', min: 1, fields: { item: { type: 'string', label: 'Item' } } } } })
  await onCanvas(page, 'items').click({ position: { x: 5, y: 5 } })
  await page.getByRole('combobox', { name: 'New column type' }).selectOption('number')
  await page.getByRole('button', { name: '+ Column' }).click()
  await page.getByRole('textbox', { name: 'Column 2 heading' }).fill('Qty')
  await page.locator('.fw-b-td-totals input[type=checkbox]').check()
  expect((await saved(page)).fields.items).toMatchObject({ fields: { item: {}, number1: { type: 'number', label: 'Qty' } }, totals: ['number1'] })
  await expect(onCanvas(page, 'items').locator('tfoot')).toContainText('Total')
})

test('Help opens in a dialog and Esc closes it', async ({ page }) => {
  await openBuilder(page)
  await page.getByRole('button', { name: '? Help' }).click()
  const dialog = page.getByRole('dialog', { name: 'How to use the builder' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('every sample opens on the canvas without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openBuilder(page)
  const samples = page.locator('.fw-b-samples button')
  await page.getByRole('tab', { name: /Import/ }).click()
  const n = await samples.count()
  expect(n).toBeGreaterThanOrEqual(6)
  for (let i = 0; i < n; i++) {
    await page.getByRole('tab', { name: /Import/ }).click()
    await samples.nth(i).click()
    await page.getByRole('tab', { name: 'Design' }).click()
    await expect(page.locator('.fw-b-canvas form')).toBeVisible()
    await expect(page.locator('.fw-b-issues')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
