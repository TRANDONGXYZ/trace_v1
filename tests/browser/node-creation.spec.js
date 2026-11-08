import { test, expect } from '@playwright/test';

const nodes = page => page.locator('.react-flow__node');
const types = ['Mistake', 'Consequence', 'Action', 'Blocked', 'Goal', 'Milestone', 'Success'];

async function open(page) {
  await expect(page.getByRole('main')).toBeVisible();
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Type', { exact: true })).toBeFocused();
}

async function create(page, kind, date, mistake = 'Lost focus') {
  await open(page);
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.getByLabel('Mistake', { exact: true }).fill(mistake);
  await page.getByLabel('Time', { exact: true }).fill(date);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('Type receives initial focus, Tab follows field order, required text/date validate, and Enter submits', async ({ page }) => {
  await page.goto('/'); await open(page);
  const type = page.getByLabel('Type', { exact: true });
  const mistake = page.getByLabel('Mistake', { exact: true });
  const time = page.getByLabel('Time', { exact: true });
  const description = page.getByLabel('Description', { exact: true });
  await expect(type.locator('option')).toHaveText(types);
  await page.keyboard.press('Tab'); await expect(mistake).toBeFocused();
  await page.keyboard.press('Tab'); await expect(time).toBeFocused();
  await page.keyboard.press('Tab'); await expect(description).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(type).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(description).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(mistake).toBeFocused();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(nodes(page)).toHaveCount(0);
  await mistake.fill('   '); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Enter a mistake.');
  await expect(nodes(page)).toHaveCount(0);
  await mistake.fill('Lost my composure');
  await page.keyboard.press('Tab'); await time.fill('31/02/27'); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Enter a valid date in DD/MM/YY format.');
  await time.fill('07/11/26');
  await page.keyboard.press('Tab'); await description.fill('I interrupted another person.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(nodes(page)).toHaveCount(1);
  await expect(nodes(page).first().locator('.node-mistake')).toHaveText('Lost my composure');
  await expect(nodes(page).first().locator('.node-time')).toHaveText('07/11/26');
  await expect(nodes(page).first().locator('.event-node')).toHaveAttribute('title', 'Mistake\nLost my composure\n07/11/26\nI interrupted another person.');
});

test('all seven node shapes, colors, selection outlines, and connection points render correctly', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1400 });
  await page.goto('/');
  const expected = [
    ['arrow-rectangle', 'rgb(246, 170, 166)'], ['rectangle', 'rgb(255, 240, 161)'],
    ['hexagon', 'rgb(118, 167, 238)'], ['triangle', 'rgb(255, 240, 161)'],
    ['cylinder', 'rgb(201, 233, 248)'], ['diamond', 'rgb(203, 234, 197)'],
    ['circle', 'rgb(25, 107, 58)'],
  ];
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Consequence') await nodes(page).first().click();
    await open(page);
    await page.getByLabel('Type', { exact: true }).selectOption(types[i]);
    await page.getByLabel('Mistake', { exact: true }).fill(`Lost focus ${i + 1}`);
    await page.getByLabel('Time', { exact: true }).fill('07/11/26');
    // A fully filled form must also submit when Enter is pressed from Type.
    if (i === types.length - 1) await page.getByLabel('Type', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const node = nodes(page).nth(i);
    await expect(node.locator('.event-node')).toHaveAttribute('data-shape', expected[i][0]);
    await expect(node.locator('.node-shape')).toHaveCSS('fill', expected[i][1]);
    await expect(node.locator('strong')).toHaveText(types[i]);
    await expect(node.locator('.node-mistake')).toHaveText(`Lost focus ${i + 1}`);
    await page.keyboard.press('Escape');
  }
  const circle = await nodes(page).nth(6).locator('.node-shape').evaluate(el => {
    const box = el.getBBox(); return { width: box.width, height: box.height };
  });
  expect(circle.width).toBeCloseTo(62, 1);
  expect(circle.height).toBeCloseTo(circle.width, 1);
  await expect(nodes(page).nth(4).locator('.node-detail')).toHaveCount(1);
  for (const [index, left, right] of [[3, 40, 120], [6, 49, 111]]) {
    const node = nodes(page).nth(index);
    const body = await node.boundingBox();
    for (const [handle, expectedX] of [['left', left], ['right', right]]) {
      const box = await node.locator(`[data-handleid="${handle}"]`).boundingBox();
      expect(box.x + box.width / 2 - body.x).toBeCloseTo(expectedX, 0);
    }
  }
  await page.screenshot({ path: 'test-results/seven-node-types.png' });
  for (const node of await nodes(page).all()) {
    await node.click();
    await expect(page.locator('.selection-outline')).toHaveCount(1);
    await expect(node.locator('.selection-outline')).toHaveCSS('stroke', 'rgb(36, 89, 203)');
    await expect(node.locator('.selection-outline')).toHaveCSS('stroke-width', '3px');
  }
});

test('Description is optional and enforces 500 characters for typing, pasted words, and Unicode text', async ({ page }) => {
  await page.goto('/'); await open(page);
  const description = page.getByLabel('Description', { exact: true });
  await description.fill('a'.repeat(501));
  await expect(description).toHaveValue('a'.repeat(500));
  await description.fill('word '.repeat(101));
  await expect(description).toHaveValue('word '.repeat(100));
  await description.fill('e\u0301'.repeat(501));
  await expect(description).toHaveValue('e\u0301'.repeat(500));
  const emoji = '👍🏽'.repeat(500);
  await description.fill(emoji + 'extra');
  await expect(description).toHaveValue(emoji);
  await page.getByLabel('Mistake', { exact: true }).fill('Defended my opinion');
  await page.getByLabel('Time', { exact: true }).fill('07/11/26');
  await description.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(nodes(page).first().locator('.event-node')).toHaveAttribute('title', `Mistake\nDefended my opinion\n07/11/26\n${emoji}`);
  await create(page, 'Goal', '08/11/26');
  await expect(nodes(page)).toHaveCount(2);
});

test('new shape ports preserve automatic/manual connections, incoming-chain highlighting, and deletion', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/');
  await create(page, 'Goal', '01/11/26');
  await nodes(page).first().click(); await create(page, 'Success', '03/11/26');
  await nodes(page).nth(1).click(); await create(page, 'Blocked', '05/11/26');
  await create(page, 'Milestone', '07/11/26');
  const edges = page.locator('.react-flow__edge');
  await expect(edges).toHaveCount(3);
  // The circle and triangle's visible sides are inset from their layout boxes.
  // Verify actual SVG endpoints meet the visible connection ports.
  for (const [edgeIndex, targetIndex] of [[0, 1], [1, 2]]) {
    const end = await edges.nth(edgeIndex).locator('.react-flow__edge-path').evaluate(path => {
      const point = path.getPointAtLength(path.getTotalLength());
      const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
      return { x: screen.x, y: screen.y };
    });
    const target = await nodes(page).nth(targetIndex).locator('[data-handleid="left"]').boundingBox();
    expect(end.x).toBeCloseTo(target.x, 0);
    expect(end.y).toBeCloseTo(target.y + target.height / 2, 0);
  }
  const transforms = await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform));
  const source = await nodes(page).first().locator('[data-handleid="left"]').boundingBox();
  const target = await nodes(page).nth(2).locator('[data-handleid="top"]').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x, source.y, { steps: 2 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(edges).toHaveCount(4);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(transforms);
  await nodes(page).nth(2).dblclick();
  await expect(page.locator('.react-flow__node.chain-highlighted')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge.chain-highlighted')).toHaveCount(3);
  await expect(nodes(page).nth(3)).not.toHaveClass(/chain-highlighted/);
  await edges.last().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(4);
  await expect(edges).toHaveCount(3);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(transforms);
  await nodes(page).first().click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(0);
  await expect(edges).toHaveCount(0);
});

test.describe('computer-local date defaults', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('uses the local calendar day rather than UTC and refreshes the default for each new popup', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2027-01-01T02:30:00Z'));
    await page.goto('/'); await open(page);
    await expect(page.getByLabel('Time', { exact: true })).toHaveValue('31/12/26');
    await page.keyboard.press('Escape');
    await page.clock.setFixedTime(new Date('2027-01-01T09:30:00Z'));
    await open(page);
    await expect(page.getByLabel('Time', { exact: true })).toHaveValue('01/01/27');
    await expect(page.getByLabel('Mistake', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('');
  });
});
