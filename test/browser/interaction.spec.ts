import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  await page.goto('/')
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

async function drag(page: Page, target: Locator, x: number, y: number) {
  const box = await target.boundingBox()
  if (!box) throw new Error('Drag target was not measurable')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + x, startY + y, { steps: 8 })
  await page.mouse.up()
}

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

test('reduced motion preserves dismissal completion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const card = page.locator('.hero-demo .demo-card')

  await drag(page, card, 120, 0)

  await expect(page.getByText('The surface departed.').first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reset demo' }).first(),
  ).toBeVisible()
})

test('editable descendants keep pointer and text interaction', async ({
  page,
}) => {
  const card = page.locator('.hero-demo .demo-card')
  await card.evaluate((node) => {
    const input = document.createElement('input')
    input.setAttribute('aria-label', 'Inline editor')
    node.append(input)
  })
  const input = page.getByRole('textbox', { name: 'Inline editor' })
  const box = await input.boundingBox()
  if (!box) throw new Error('Inline editor was not measurable')
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + box.height / 2)
  await page.mouse.up()
  await input.fill('Editable value')

  await expect(input).toHaveValue('Editable value')
  await expect(card).toHaveAttribute('data-state', 'idle')
})

test('claimed drag from a button suppresses only its release click', async ({
  page,
}) => {
  const card = page.locator('.hero-demo .demo-card')
  const button = card.getByRole('button', {
    name: 'Dismiss demo notification',
  })

  await drag(page, button, 12, 0)

  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute('data-state', 'idle')
  await button.click()
  await expect(page.getByText('The surface departed.').first()).toBeVisible()
})

test('vertical direction claims vertical motion and abandons horizontal motion', async ({
  page,
}) => {
  await page.getByLabel('Direction').selectOption('down')
  const card = page.locator('#lab .demo-card')
  await card.scrollIntoViewIfNeeded()
  await expect(card).toHaveCSS('touch-action', 'pan-x')

  await drag(page, card, 55, 2)
  await expect(card).toHaveAttribute('data-state', 'idle')

  const box = await card.boundingBox()
  if (!box) throw new Error('Lab card was not measurable')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX, startY + 20)
  await expect(card).toHaveAttribute('data-state', 'dragging')
  await page.mouse.move(startX, startY + box.height, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByText('The surface departed.').last()).toBeVisible()
})

test('lost pointer capture returns the surface and permits another gesture', async ({
  page,
}) => {
  const card = page.locator('.hero-demo .demo-card')
  const box = await card.boundingBox()
  if (!box) throw new Error('Demo card was not measurable')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await card.evaluate((node) => {
    node.addEventListener(
      'pointerdown',
      (event) => {
        if (!(event instanceof PointerEvent)) return
        node.setAttribute('data-test-pointer-id', String(event.pointerId))
      },
      { once: true },
    )
  })
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 30, startY, { steps: 4 })
  await card.evaluate((node) => {
    const pointerId = Number(node.getAttribute('data-test-pointer-id'))
    node.dispatchEvent(
      new PointerEvent('lostpointercapture', {
        bubbles: true,
        pointerId,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    )
  })
  await expect(card).toHaveAttribute('data-state', 'settling')
  await page.mouse.up()

  await expect(card).toHaveAttribute('data-state', 'idle')
  await drag(page, card, 120, 0)
  await expect(page.getByText('The surface departed.').first()).toBeVisible()
})

test('RTL logical start moves right', async ({ page }) => {
  await page.getByLabel('Direction').selectOption('start')
  await page.getByRole('checkbox', { name: 'RTL context' }).check()
  const card = page.locator('#lab .demo-card')

  await drag(page, card, 120, 0)

  await expect(page.getByText('The surface departed.').last()).toBeVisible()
})
