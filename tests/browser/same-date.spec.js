import { test, expect } from '@playwright/test';

const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');
async function create(page, kind, date) {
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Type', { exact: true })).toBeFocused();
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.locator('#mistake').fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill(date);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('unselected duplicates stack; selected duplicates use a right row then stack above the highest outgoing destination', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/');
  await create(page, 'Action', '30/11/26');
  await create(page, 'Goal', '30/11/26');
  const root = nodes(page).first();
  const rootBox = await root.boundingBox();
  const independent = await nodes(page).nth(1).boundingBox();
  expect(independent.x).toBeCloseTo(rootBox.x, 0);
  expect(independent.y).toBeCloseTo(rootBox.y - 128, 0);
  await expect(edges(page)).toHaveCount(0);
  await root.click();
  for (const [index, kind] of ['Goal', 'Blocked', 'Milestone'].entries()) {
    await create(page, kind, '30/11/26');
    const child = await nodes(page).nth(index + 2).boundingBox();
    expect(child.x - rootBox.x).toBeCloseTo(264, 0);
    expect(child.y).toBeCloseTo(rootBox.y - 128 * index, 0);
    await expect(edges(page)).toHaveCount(index + 1);
    await expect(edges(page).nth(index).locator('.edge-label')).toContainText('0days');
  }
  await nodes(page).nth(4).dblclick();
  await expect(page.locator('.react-flow__node.chain-highlighted')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge.chain-highlighted')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await create(page, 'Success', '30/11/26');
  const unselected = await nodes(page).last().boundingBox();
  const highest = await nodes(page).nth(4).boundingBox();
  expect(unselected.x).toBeCloseTo(highest.x, 0);
  expect(unselected.y).toBeCloseTo(highest.y - 128, 0);
  await expect(edges(page)).toHaveCount(3);
  await create(page, 'Action', '31/12/26');
  const checkMonth = async () => {
    for (const axis of ['horizontal', 'vertical']) {
      const marker = page.getByTestId(`${axis}-axis`).locator('[data-month="12/26"]');
      await expect(marker).toHaveCount(1);
      const tick = await marker.boundingBox();
      for (let i = 0; i < 5; i++) {
        const box = await nodes(page).nth(i).boundingBox();
        if (axis === 'horizontal') expect(box.x + box.width / 2).toBeLessThan(tick.x + tick.width / 2);
        else expect(box.y + box.height / 2).toBeGreaterThan(tick.y + tick.height / 2);
      }
    }
  };
  await checkMonth();
  await page.mouse.move(1300, 950); await page.mouse.down(); await page.mouse.move(1220, 1020, { steps: 10 }); await page.mouse.up();
  await checkMonth();
  await page.screenshot({ path: 'test-results/selected-same-date.png' });
  const before = await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform));
  await edges(page).last().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(7);
  await expect(edges(page)).toHaveCount(2);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(before);
  expect(errors).toEqual([]);
});

test('a duplicate date uses the highest outgoing destination height and keeps its own date column', async ({ page }) => {
  await page.goto('/');
  await create(page, 'Action', '01/11/26');
  const root = nodes(page).first();
  await root.click();
  await create(page, 'Goal', '03/11/26');
  await create(page, 'Goal', '05/11/26');
  await create(page, 'Milestone', '03/11/26');
  const first = await nodes(page).nth(1).boundingBox();
  const highest = await nodes(page).nth(2).boundingBox();
  const duplicate = await nodes(page).nth(3).boundingBox();
  expect(duplicate.x).toBeCloseTo(first.x, 0);
  expect(duplicate.x).toBeLessThan(highest.x);
  expect(duplicate.y).toBeCloseTo(highest.y - 128, 0);
  await expect(edges(page)).toHaveCount(3);
  const rootId = await root.getAttribute('data-id');
  const childId = await nodes(page).nth(3).getAttribute('data-id');
  await expect(edges(page).last()).toHaveAttribute('data-id', `edge-${rootId}-${childId}`);
  await expect(edges(page).last().locator('.edge-label')).toContainText('2days');
  await page.screenshot({ path: 'test-results/selected-duplicate-date-column.png' });
});
