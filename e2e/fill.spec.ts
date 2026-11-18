// Filling in forms: a switch, a matrix, a table total, conditions and steps.
import { expect, test, type Page } from '@playwright/test'
import type { FormSchema } from '../src/index.ts'

async function fill(page: Page, schema: FormSchema) {
  await page.goto('/#fill')
  await page.evaluate((s) => { localStorage.setItem('formweave-demo-schema', s) }, JSON.stringify(schema))
  await page.reload()
  return page.locator('#fill form')
}
const state = (page: Page) => page.locator('#out').textContent().then((t) => JSON.parse(t ?? '{}'))

test('a switch slides on, a matrix takes one answer per row, a table adds itself up', async ({ page }) => {
  const form = await fill(page, { version: 1, fields: {
    sw: { type: 'boolean', widget: 'toggle', label: 'Notify me' },
    rate: { type: 'list', widget: 'matrix', label: 'Rate', rows: ['Speed', 'Quality'], fields: { score: { type: 'choice', options: ['Poor', 'Good'] } } },
    items: { type: 'list', widget: 'table', label: 'Items', min: 2, totals: ['qty'], fields: { qty: { type: 'number', label: 'Qty' } } },
  } })
  await form.getByRole('switch', { name: 'Notify me' }).click()
  await form.getByRole('radio', { name: 'Quality: Good' }).check()
  await form.locator('input[id$="items.0.qty"]').fill('4')
  await form.locator('input[id$="items.1.qty"]').fill('3')
  await expect(form.locator('tfoot .fw-total')).toHaveText('7')
  const { values } = await state(page)
  expect(values).toMatchObject({ sw: true, rate: [{ score: null }, { score: 'Good' }], items: [{ qty: 4 }, { qty: 3 }] })
})

test('"show only when" and steps: Next waits for the step to be right', async ({ page }) => {
  const form = await fill(page, { version: 1, fields: {
    kind: { type: 'choice', widget: 'radio', label: 'Kind', options: ['Shop', 'Other'], required: true },
    other: { type: 'string', label: 'Which?', visible: "kind == 'Other'", required: true },
    done: { type: 'boolean', label: 'Done' },
  }, layout: [{ type: 'pages', children: [{ type: 'section', title: 'One', children: ['kind', 'other'] }, { type: 'section', title: 'Two', children: ['done'] }] }] })
  await expect(form.getByLabel('Which?')).toHaveCount(0)
  await form.getByRole('radio', { name: 'Other' }).check()
  await form.getByRole('button', { name: 'Next' }).click()
  await expect(form.getByLabel('Which?')).toBeFocused() // required and empty: stays on the step
  await form.getByLabel('Which?').fill('A stall')
  await form.getByRole('button', { name: 'Next' }).click()
  await expect(form.getByLabel('Done')).toBeVisible()
})
