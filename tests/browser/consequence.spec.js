import { test, expect } from '@playwright/test';

const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');

async function open(page) {
  await expect(page.getByRole('main')).toBeVisible();
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Type', { exact: true })).toBeFocused();
}

async function finish(page, date) {
  await page.getByLabel('Mistake', { exact: true }).fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill(date);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

async function create(page, kind, date) {
  await open(page);
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await finish(page, date);
}

async function drag(page, sourceIndex, sourceHandle, targetIndex, targetHandle) {
  const source = await nodes(page).nth(sourceIndex).locator(`[data-handleid="${sourceHandle}"]`).boundingBox();
  const target = await nodes(page).nth(targetIndex).locator(`[data-handleid="${targetHandle}"]`).boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x, source.y, { steps: 2 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
}

test('Consequence requires a selected Mistake/Action and Mistake offers only Consequence as its successor', async ({ page }) => {
  await page.goto('/'); await open(page);
  await expect(page.getByLabel('Type', { exact: true }).locator('option').filter({ hasText: /^Consequence$/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await create(page, 'Mistake', '07/11/26');
  await nodes(page).first().click(); await open(page);
  const type = page.getByLabel('Type', { exact: true });
  await expect(type).toHaveValue('Consequence');
  for (const kind of ['Mistake', 'Action', 'Blocked', 'Goal', 'Milestone', 'Success']) {
    await expect(type.locator('option').filter({ hasText: new RegExp(`^${kind}$`) })).toBeDisabled();
  }
  await expect(type.locator('option').filter({ hasText: /^Consequence$/ })).toBeEnabled();
  await finish(page, '07/11/26');
  await nodes(page).nth(1).click(); await open(page);
  await expect(page.getByLabel('Type', { exact: true }).locator('option').filter({ hasText: /^Consequence$/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(1100, 800);
  await create(page, 'Goal', '10/11/26');
  await nodes(page).nth(2).click(); await open(page);
  await expect(page.getByLabel('Type', { exact: true }).locator('option').filter({ hasText: /^Consequence$/ })).toBeDisabled();
  // A backdated Mistake would point to Goal, violating the outgoing type rule.
  await page.getByLabel('Mistake', { exact: true }).fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill('09/11/26');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Mistake nodes can only connect to Consequence nodes.');
  await expect(nodes(page)).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.mouse.click(1100, 800);
  await create(page, 'Action', '11/11/26');
  await nodes(page).nth(3).click(); await open(page);
  await expect(page.getByLabel('Type', { exact: true }).locator('option').filter({ hasText: /^Consequence$/ })).toBeEnabled();
  await page.getByLabel('Type', { exact: true }).selectOption('Consequence');
  await finish(page, '12/11/26');
  await expect(nodes(page)).toHaveCount(5);
  await expect(edges(page)).toHaveCount(2);
});

test('same-date Mistake Consequences use the required row and branch, zero-day labels, and unique transformed month markers', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/'); await create(page, 'Mistake', '30/11/26');
  const root = nodes(page).first();
  await root.click(); await create(page, 'Consequence', '30/11/26');
  const rootBox = await root.boundingBox();
  const first = await nodes(page).nth(1).boundingBox();
  expect(first.x - rootBox.x).toBeCloseTo(264, 0);
  expect(first.y).toBeCloseTo(rootBox.y, 0);
  await expect(edges(page)).toHaveCount(1);
  await expect(edges(page).first().locator('.edge-label')).toContainText('0days');
  await expect(edges(page).first().locator('.react-flow__edge-path')).toHaveAttribute('d', /^M .* L /);
  await create(page, 'Consequence', '30/11/26');
  const second = await nodes(page).nth(2).boundingBox();
  expect(second.x - rootBox.x).toBeCloseTo(264, 0);
  expect(rootBox.y - second.y).toBeCloseTo(88, 0);
  await expect(edges(page)).toHaveCount(2);
  await expect(edges(page).nth(1).locator('.edge-label')).toContainText('0days');
  await expect(edges(page).nth(1).locator('.react-flow__edge-path')).toHaveAttribute('d', / Q /);
  await nodes(page).nth(2).dblclick();
  await expect(page.locator('.react-flow__node.chain-highlighted')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge.chain-highlighted')).toHaveCount(1);
  await page.mouse.click(1300, 1000);
  await create(page, 'Action', '31/12/26');
  const checkMonths = async () => {
    for (const axis of ['horizontal', 'vertical']) {
      await expect(page.getByTestId(`${axis}-axis`).locator('[data-month="11/26"]')).toHaveCount(1);
      const december = page.getByTestId(`${axis}-axis`).locator('[data-month="12/26"]');
      await expect(december).toHaveCount(1);
      expect(Number(await december.getAttribute('data-time'))).toBe(Date.UTC(2026, 11, 1));
      const tick = await december.boundingBox();
      for (const node of (await nodes(page).all()).slice(0, 3)) {
        const box = await node.boundingBox();
        if (axis === 'horizontal') expect(box.x + box.width / 2).toBeLessThan(tick.x + tick.width / 2);
        else expect(box.y + box.height / 2).toBeGreaterThan(tick.y + tick.height / 2);
      }
    }
  };
  await checkMonths();
  await page.mouse.move(1300, 1000); await page.mouse.down(); await page.mouse.move(1220, 1070, { steps: 10 }); await page.mouse.up();
  await checkMonths();
  await page.screenshot({ path: 'test-results/same-date-consequences.png' });
  await root.click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(1);
  await expect(nodes(page).first()).toHaveAttribute('aria-label', 'Action, 31/12/26');
  await expect(edges(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('manual connections cannot bypass type rules and manual/deleted edges choose the correct same-date scenario', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1200 });
  await page.goto('/'); await create(page, 'Mistake', '07/11/26');
  await nodes(page).first().click(); await create(page, 'Consequence', '07/11/26');
  await page.mouse.click(1500, 1000);
  await create(page, 'Goal', '06/11/26');
  await create(page, 'Action', '08/11/26');
  await drag(page, 0, 'top', 3, 'left');
  await drag(page, 3, 'top', 0, 'left');
  await drag(page, 2, 'top', 1, 'left');
  await expect(edges(page)).toHaveCount(1);
  const before = await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform));
  await edges(page).first().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(4);
  await expect(edges(page)).toHaveCount(0);
  // Equal-date reverse gesture must still save a Mistake -> Consequence arrow.
  await drag(page, 1, 'top', 0, 'right');
  await expect(edges(page)).toHaveCount(1);
  const ids = await nodes(page).evaluateAll(elements => elements.map(el => el.getAttribute('data-id')));
  await expect(edges(page).first()).toHaveAttribute('data-id', `edge-${ids[0]}-${ids[1]}`);
  await expect(edges(page).first().locator('.edge-label')).toContainText('0days');
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(before);
  await nodes(page).first().click(); await create(page, 'Consequence', '07/11/26');
  const parent = await nodes(page).first().boundingBox();
  const branch = await nodes(page).last().boundingBox();
  expect(branch.x).toBeGreaterThan(parent.x);
  expect(branch.y).toBeLessThan(parent.y);
  // Removing both arrows preserves both Consequences. A replacement with no
  // outgoing edges must return to the parent's row in a free horizontal slot.
  for (let i = 0; i < 2; i++) { await edges(page).first().locator('.edge-label').click(); await page.keyboard.press('Delete'); }
  await nodes(page).first().click(); await create(page, 'Consequence', '07/11/26');
  const replacement = await nodes(page).last().boundingBox();
  const old = await nodes(page).nth(1).boundingBox();
  expect(replacement.y).toBeCloseTo((await nodes(page).first().boundingBox()).y, 0);
  expect(replacement.x).toBeGreaterThan(old.x + old.width);
  await expect(nodes(page)).toHaveCount(6);
  await expect(edges(page)).toHaveCount(1);
});
