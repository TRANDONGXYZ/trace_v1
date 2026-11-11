import { test, expect } from '@playwright/test';

const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');

async function create(page, date, kind = 'Action') {
  await expect(page.getByRole('main')).toBeVisible();
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.locator('#mistake').fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill(date);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

async function connect(page, from, sourcePort, to, targetPort) {
  const source = nodes(page).nth(from).locator(`[data-handleid="${sourcePort}"]`);
  const target = nodes(page).nth(to).locator(`[data-handleid="${targetPort}"]`);
  await expect(source).toBeVisible(); await expect(target).toBeVisible();
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 5, a.y + a.height / 2 - 5, { steps: 2 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
}

async function diamond(page) {
  await page.setViewportSize({ width: 2000, height: 2000 });
  await page.goto('/');
  for (const [i, date] of ['01/11/26', '03/11/26', '05/11/26', '07/11/26', '09/11/26', '11/11/26'].entries()) {
    await create(page, date, i % 2 ? 'Goal' : 'Action');
  }
  const before = await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform));
  await connect(page, 0, 'top', 1, 'left');
  await expect(edges(page)).toHaveCount(1);
  await connect(page, 0, 'left', 2, 'top');
  await expect(edges(page)).toHaveCount(2);
  // Reverse the gesture: the stored arrow must still point from B to D.
  await connect(page, 3, 'right', 1, 'right');
  await expect(edges(page)).toHaveCount(3);
  await connect(page, 2, 'top', 3, 'left');
  await expect(edges(page)).toHaveCount(4);
  await connect(page, 3, 'left', 4, 'right');
  await expect(edges(page)).toHaveCount(5);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(before);
  const ids = await nodes(page).evaluateAll(elements => elements.map(el => el.getAttribute('data-id')));
  return { ids, before };
}

test('top and both side ports support fan-out and merging; edge deletion preserves nodes and other connections', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { ids, before } = await diamond(page);
  const reverse = page.locator(`.react-flow__edge[data-id="edge-${ids[1]}-${ids[3]}"]`);
  await expect(reverse).toHaveCount(1);
  await expect(reverse).toHaveAttribute('aria-label', '03/11/26 to 07/11/26');
  for (const edge of await edges(page).all()) {
    await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('marker-end', /url\(#arrow-/);
    await expect(edge.locator('.edge-label')).toBeVisible();
  }
  // Duplicate and self gestures add no extra edge.
  await connect(page, 0, 'right', 1, 'top');
  await connect(page, 0, 'top', 0, 'right');
  await expect(edges(page)).toHaveCount(5);
  const edgeIds = await edges(page).evaluateAll(elements => elements.map(el => el.getAttribute('data-id')));
  const removed = edges(page).first();
  const removedId = await removed.getAttribute('data-id');
  await removed.locator('.edge-label').click();
  await page.keyboard.press('Delete');
  await expect(edges(page)).toHaveCount(4);
  await expect(nodes(page)).toHaveCount(6);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(before);
  expect(await edges(page).evaluateAll(elements => elements.map(el => el.getAttribute('data-id')))).toEqual(edgeIds.filter(id => id !== removedId));
  await page.keyboard.press('Delete');
  await expect(edges(page)).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('double-click highlights every incoming path, excludes descendants, clears outside, and updates after edge deletion', async ({ page }) => {
  const { ids } = await diamond(page);
  const target = nodes(page).nth(3);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await target.dblclick();
  await expect(page.locator('.react-flow__node.chain-highlighted')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge.chain-highlighted')).toHaveCount(4);
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport);
  await expect(nodes(page).nth(4)).not.toHaveClass(/chain-highlighted/);
  await expect(nodes(page).nth(5)).not.toHaveClass(/chain-highlighted/);
  for (const edge of await page.locator('.react-flow__edge.chain-highlighted').all()) {
    await expect(edge.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(36, 89, 203)');
    await expect(edge.locator('marker path')).toHaveCSS('fill', 'rgb(36, 89, 203)');
    await expect(edge.locator('..')).toHaveCSS('z-index', '1000');
  }
  await nodes(page).nth(1).click();
  await expect(page.locator('.react-flow__node.chain-highlighted')).toHaveCount(4);
  await nodes(page).nth(5).click();
  await expect(page.locator('.chain-highlighted')).toHaveCount(0);
  await target.dblclick();
  const downstream = page.locator(`.react-flow__edge[data-id="edge-${ids[3]}-${ids[4]}"]`);
  await downstream.locator('.edge-label').click();
  await expect(page.locator('.chain-highlighted')).toHaveCount(0);
  await target.dblclick();
  await page.mouse.click(1700, 1200);
  await expect(page.locator('.chain-highlighted')).toHaveCount(0);
  await expect(page.locator('.selection-outline')).toHaveCount(0);
  await target.dblclick();
  const broken = page.locator(`.react-flow__edge[data-id="edge-${ids[1]}-${ids[3]}"]`);
  await broken.locator('.edge-label').click();
  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(6);
  await expect(edges(page)).toHaveCount(4);
  await expect(page.locator('.react-flow__node.chain-highlighted')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge.chain-highlighted')).toHaveCount(2);
  await expect(nodes(page).nth(1)).not.toHaveClass(/chain-highlighted/);
  await page.screenshot({ path: 'test-results/upstream-chain.png' });
});

test('automatic edges delete individually and node deletion preserves all descendants and their other connections', async ({ page }) => {
  await page.goto('/');
  await create(page, '01/11/26');
  await nodes(page).first().click(); await create(page, '03/11/26', 'Action');
  await create(page, '05/11/26');
  const transforms = await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform));
  await edges(page).first().locator('.edge-label').click();
  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(3);
  await expect(edges(page)).toHaveCount(1);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(transforms);
  const { before, ids } = await diamond(page);
  await nodes(page).nth(3).dblclick();
  await nodes(page).first().click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(5);
  await expect(edges(page)).toHaveCount(3);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(before.slice(1));
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.getAttribute('data-id')))).toEqual(ids.slice(1));
  await expect(page.locator('.chain-highlighted')).toHaveCount(0);
});
