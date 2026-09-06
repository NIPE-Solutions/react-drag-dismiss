import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('hero commits a sufficiently long drag and can reset', async ({
  page,
}) => {
  const card = page.locator('.hero-demo .demo-card')
  const box = await card.boundingBox()
  if (!box) throw new Error('Demo card was not measurable')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, {
    steps: 8,
  })
  await page.mouse.up()
  await expect(page.getByText('The surface departed.').first()).toBeVisible()
  await page.getByRole('button', { name: 'Reset demo' }).first().click()
  await expect(card).toBeVisible()
})

test('wrong-axis movement is abandoned and controls remain interactive', async ({
  page,
}) => {
  const card = page.locator('.hero-demo .demo-card')
  const box = await card.boundingBox()
  if (!box) throw new Error('Demo card was not measurable')
  await page.mouse.move(box.x + box.width / 2, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + 100)
  await page.mouse.up()
  await expect(card).toHaveAttribute('data-state', 'idle')
  await card.getByRole('button', { name: 'Dismiss demo notification' }).click()
  await expect(page.getByText('The surface departed.').first()).toBeVisible()
})

test('RTL logical end moves left and the page has no serious axe violations', async ({
  page,
}) => {
  await page.getByRole('checkbox', { name: 'RTL context' }).check()
  const lab = page.locator('#lab .demo-card')
  const box = await lab.boundingBox()
  if (!box) throw new Error('Lab card was not measurable')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 6 })
  await expect(lab).toHaveAttribute('data-state', 'dragging')
  await page.mouse.up()
  await expect(page.getByText('The surface departed.').last()).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([])
})

test('drag translation preserves a consumer CSS transform', async ({
  page,
}) => {
  const card = page.locator('.hero-demo .demo-card')
  const box = await card.boundingBox()
  if (!box) throw new Error('Demo card was not measurable')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2)
  await expect(card).toHaveAttribute('data-state', 'dragging')
  const styles = await card.evaluate((node) => {
    const computed = getComputedStyle(node)
    return { transform: computed.transform, translate: computed.translate }
  })
  expect(styles.transform).not.toBe('none')
  expect(styles.translate).not.toBe('none')
  await page.mouse.up()
})
