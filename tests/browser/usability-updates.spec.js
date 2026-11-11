import { test, expect } from '@playwright/test';
const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');
async function open(page) { await page.getByRole('button', { name: 'Create node', exact: true }).click(); }
async function create(page, kind, date, text = kind) {
  await open(page); const dialog = page.getByRole('dialog', { name: 'New node' });
  await dialog.getByLabel('Type', { exact: true }).selectOption(kind); await dialog.getByLabel(kind, { exact: true }).fill(text);
  await dialog.getByLabel('Time', { exact: true }).fill(date); await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
}
async function connect(page, source, target) {
  const a = await nodes(page).nth(source).locator('[data-handleid="right"]').boundingBox();
  const b = await nodes(page).nth(target).locator('[data-handleid="left"]').boundingBox();
  await page.mouse.move(a.x + 5, a.y + 5); await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 5, { steps: 2 }); await page.mouse.move(b.x + 5, b.y + 5, { steps: 12 }); await page.mouse.up();
}

test('Consequence -> Consequence uses the same creation popup, date rules, manual links, undo and redo', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1400 }); await page.goto('/');
  await create(page, 'Mistake', '08/11/26'); await nodes(page).first().click(); await create(page, 'Consequence', '08/11/26');
  await nodes(page).nth(1).click(); await create(page, 'Consequence', '08/11/26');
  const ids = await nodes(page).evaluateAll(elements => elements.map(n => n.dataset.id));
  await expect(edges(page)).toHaveCount(2); await expect(edges(page).last()).toHaveAttribute('data-id', `edge-${ids[1]}-${ids[2]}`);
  const a = await nodes(page).nth(1).boundingBox(), b = await nodes(page).nth(2).boundingBox();
  expect(b.y).toBeCloseTo(a.y); expect(b.x).toBeGreaterThan(a.x);
  await edges(page).last().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await connect(page, 1, 2); await expect(edges(page)).toHaveCount(2);
  await page.keyboard.press('Control+Z'); await expect(edges(page)).toHaveCount(1);
  await page.keyboard.press('Control+Y'); await expect(edges(page)).toHaveCount(2);
  await nodes(page).nth(2).click(); await create(page, 'Consequence', '10/11/26');
  await expect(nodes(page)).toHaveCount(4); await expect(edges(page)).toHaveCount(3);
  await expect(edges(page).last()).toContainText('2days');
  await nodes(page).nth(3).click(); await create(page, 'Consequence', '09/11/26');
  const allIds = await nodes(page).evaluateAll(elements => elements.map(n => n.dataset.id));
  await expect(edges(page).last()).toHaveAttribute('data-id', `edge-${allIds[4]}-${allIds[3]}`);
});

test('every type clamps long text to two lines without changing full text; shapes retain minimal curved corners', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1600 }); await page.goto('/');
  const long = 'Đây là nội dung dài cần giữ đầy đủ trong dữ liệu của người dùng. '.repeat(4);
  for (const [index, kind] of ['Mistake', 'Consequence', 'Action', 'Blocked', 'Goal', 'Milestone', 'Success'].entries()) {
    if (kind === 'Consequence') await nodes(page).first().click();
    await create(page, kind, '10/11/26', long);
    const node = nodes(page).nth(index), text = node.locator('.node-mistake');
    await expect(text).toHaveText(long.trim());
    const dimensions = await text.evaluate(el => ({ height: el.clientHeight, line: parseFloat(getComputedStyle(el).lineHeight),
      scroll: el.scrollHeight, clamp: getComputedStyle(el).webkitLineClamp }));
    expect(dimensions.clamp).toBe('2'); expect(dimensions.height).toBeLessThanOrEqual(dimensions.line * 2 + 1);
    expect(dimensions.height).toBeGreaterThan(dimensions.line); expect(dimensions.scroll).toBeGreaterThan(dimensions.height);
    if (!['Goal', 'Success'].includes(kind)) await expect(node.locator('.node-shape')).toHaveAttribute('d', / Q /u);
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('status', { name: 'All changes saved locally' })).toBeVisible();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('trace.whiteboard.v1')).graph.nodes.map(n => n.data.mistake));
  expect(original).toEqual(Array(7).fill(long.trim()));
  await page.screenshot({ path: 'test-results/two-line-rounded-nodes.png' });
});

test('desktop plus and keyboard shortcut open the identical focused form without changing the selected context', async ({ page }) => {
  await page.goto('/'); await create(page, 'Mistake', '10/11/26'); await nodes(page).first().click();
  await open(page); const dialog = page.getByRole('dialog', { name: 'New node' });
  await expect(dialog.getByLabel('Type', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Type', { exact: true })).toHaveValue('Consequence');
  const form = await dialog.locator('form').innerHTML(); await page.keyboard.press('Escape');
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  expect(await dialog.locator('form').innerHTML()).toBe(form);
});

test.describe('mobile creation and backup access', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('plus is tappable and the same form has a mobile submit; settings exposes only backup actions', async ({ page }) => {
    await page.goto('/'); const plus = page.getByRole('button', { name: 'Create node', exact: true });
    const box = await plus.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    await plus.tap(); const dialog = page.getByRole('dialog', { name: 'New node' });
    await expect(dialog.getByLabel('Type', { exact: true })).toBeFocused();
    await dialog.getByLabel('Type', { exact: true }).selectOption('Action');
    await dialog.getByLabel('Action', { exact: true }).fill('Created on a phone');
    await dialog.getByLabel('Time', { exact: true }).fill('10/11/26');
    await dialog.getByRole('button', { name: 'Create node', exact: true }).tap(); await expect(nodes(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible(); await expect(settings.getByRole('button')).toHaveText(['×', 'Export Data', 'Import Data']);
    expect(await settings.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile-backup-settings.png' });
  });
});
