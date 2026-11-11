import { test, expect } from '@playwright/test';
import { phaseFixture } from '../phase-fixtures.js';
import { serializeDiagram, STORAGE_KEY } from '../../src/persistence.js';

test.use({ timezoneId: 'Asia/Bangkok' });
async function setup(page, graph = phaseFixture(), date = '2026-11-10T17:30:00Z') {
  if (date) await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, text) {
      if (this === localStorage && name === key) window.diagramWrites++;
      return original.call(this, name, text);
    };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph) });
  const inference = [];
  page.on('request', req => { if (/api\/ai|11434/u.test(req.url())) inference.push(req.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('main', { name: 'Analytics', exact: true })).toBeVisible();
  return inference;
}
const bar = (page, kind, count) => page.getByRole('button', { name: `${kind}: ${count} events`, exact: true });
const list = (page, kind) => page.getByRole('list', { name: `${kind} events`, exact: true });

test('fixed phase chart counts all types and each bar filters the list; other tabs are visibly unavailable', async ({ page }) => {
  const inference = await setup(page);
  await expect(page.locator('.phase-range')).toHaveText('01/11/2026 – 31/12/2026');
  await expect(page.getByRole('tab')).toHaveText(['2 Months', '6 Months', '1 Year', 'Custom']);
  await expect(page.getByRole('tab', { name: '2 Months', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const name of ['6 Months', '1 Year', 'Custom']) await expect(page.getByRole('tab', { name, exact: true })).toBeDisabled();
  const { NODE_APPEARANCE } = await import('../../src/node-types.js');
  for (const [kind, count] of [['Mistake', 5], ['Consequence', 4], ['Action', 2], ['Milestone', 1], ['Goal', 1], ['Blocked', 1], ['Success', 1]]) {
    const button = bar(page, kind, count);
    await expect(button.locator('.phase-bar-count')).toHaveText(String(count)); await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(list(page, kind).locator('li')).toHaveCount(count);
    const color = await button.locator('.phase-bar-fill').evaluate(el => el.style.backgroundColor);
    const hex = NODE_APPEARANCE[kind].fill;
    expect(color).toBe(`rgb(${[1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`);
    if (!['Mistake', 'Consequence'].includes(kind)) {
      await expect(list(page, kind).locator('.phase-reachable-count')).toHaveCount(0);
      expect(await list(page, kind).evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
    }
  }
  await bar(page, 'Mistake', 5).click(); await expect(list(page, 'Mistake')).toContainText('m-december');
  await expect(list(page, 'Mistake')).not.toContainText('Recorded old:');
  await expect(list(page, 'Mistake')).not.toContainText('Recorded next:');
  const columns = await page.locator('.phase-columns').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
  expect(columns[0] / columns[2]).toBeCloseTo(1.5, 2);
  expect(inference).toEqual([]); expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('ranked lists show distinct full-graph counts, complete text/dates/descriptions and one continuous gradient', async ({ page }) => {
  await setup(page);
  for (const [kind, count, ids, counts, color] of [
    ['Mistake', 5, ['m-high', 'm-low', 'm-tie', 'm-zero', 'm-december'], [3, 1, 1, 0, 0], 'rgb(246, 170, 166)'],
    ['Consequence', 4, ['c-one', 'c-two', 'c-small', 'c-zero'], [3, 3, 1, 0], 'rgb(246, 178, 107)'],
  ]) {
    await bar(page, kind, count).click();
    const items = list(page, kind).locator('li');
    expect(await items.evaluateAll(elements => elements.map(el => el.dataset.nodeId))).toEqual(ids);
    await expect(items.locator('.phase-reachable-count')).toHaveText(counts.map(n => `Reachable ${kind === 'Mistake' ? 'Consequence' : 'Action'} nodes: ${n}`));
    await expect(items.first()).toContainText('nội dung đầy đủ');
    await expect(items.first().locator('p')).toHaveText(`Details for ${ids[0]}\nSecond line`);
    await expect(items.first().locator('time')).toHaveText(kind === 'Mistake' ? '01/11/26' : '02/11/26');
    const gradient = await list(page, kind).evaluate(el => getComputedStyle(el).backgroundImage);
    expect(gradient).toContain('linear-gradient'); expect(gradient).toContain(color);
    expect(await items.evaluateAll(elements => elements.every(el => getComputedStyle(el).backgroundImage === 'none'))).toBe(true);
  }
  await page.screenshot({ path: 'test-results/phase-analytics.png' });
});

test('December retains the full phase and waking after local New Year updates an open page', async ({ page }) => {
  await setup(page, phaseFixture(), '2026-12-12T05:00:00Z');
  await expect(page.locator('.phase-range')).toHaveText('01/11/2026 – 31/12/2026');
  await expect(bar(page, 'Mistake', 5)).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-12-31T17:00:00Z'));
  // Refresh on focus also covers a suspended tab waking after a month boundary.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.phase-range')).toHaveText('01/01/2027 – 28/02/2027');
  await expect(bar(page, 'Mistake', 1)).toBeVisible();
  await expect(list(page, 'Mistake')).toContainText('Recorded next:');
  await expect(list(page, 'Mistake')).not.toContainText('m-high');
});

test('an open page updates at device-local midnight without a reload or focus event', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-12-31T16:59:59.000Z') });
  await page.clock.pauseAt(new Date('2026-12-31T16:59:59.100Z'));
  await setup(page, phaseFixture(), null); await page.clock.runFor(32);
  await expect(page.locator('.phase-range')).toHaveText('01/11/2026 – 31/12/2026');
  await page.clock.runFor(1000);
  await expect(page.locator('.phase-range')).toHaveText('01/01/2027 – 28/02/2027');
  await expect(bar(page, 'Consequence', 1)).toBeVisible();
});

test('empty diagrams and zero categories are clickable and do not invoke inference', async ({ page }) => {
  const inference = await setup(page, { nodes: [], edges: [] });
  for (const kind of ['Mistake', 'Consequence', 'Action', 'Milestone', 'Goal', 'Blocked', 'Success']) {
    await bar(page, kind, 0).click();
    await expect(list(page, kind).locator('li')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(`No ${kind} events in this phase.`);
  }
  expect(inference).toEqual([]); expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('analytics navigation uses unsaved live data, preserves board viewport/history and leaves debounce unchanged', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T05:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-11T05:00:01Z'));
  const inference = [];
  page.on('request', req => { if (/api\/ai|11434/u.test(req.url())) inference.push(req.url()); });
  await page.goto('/'); await page.clock.runFor(32);
  await page.getByRole('button', { name: 'Create node', exact: true }).click();
  await page.getByLabel('Type', { exact: true }).selectOption('Action');
  await page.getByLabel('Action', { exact: true }).fill('Latest unsaved Action');
  await page.getByLabel('Time', { exact: true }).fill('31/12/26'); await page.keyboard.press('Enter');
  const snapshot = await page.locator('.react-flow__node').evaluate(el => el.getAttribute('style'));
  await page.mouse.move(1100, 800); await page.mouse.wheel(100, -200); await page.clock.runFor(32);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.clock.runFor(1968);
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await bar(page, 'Action', 1).click(); await expect(list(page, 'Action')).toContainText('Latest unsaved Action');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  // Whiteboard keyboard shortcuts must not mutate content while reading analytics.
  await page.keyboard.press('Control+Z'); await page.keyboard.press('Delete'); await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(bar(page, 'Action', 1)).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.runFor(1000);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.graph.nodes[0].data.mistake).toBe('Latest unsaved Action');
  await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click();
  await page.clock.runFor(32);
  await expect(page.getByRole('button', { name: 'Analytics', exact: true })).toBeFocused();
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport);
  expect(await page.locator('.react-flow__node').getAttribute('style')).toBe(snapshot);
  await page.keyboard.press('Control+Z'); await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.keyboard.press('Control+Y'); await expect(page.locator('.react-flow__node')).toHaveCount(1);
  expect(inference).toEqual([]);
});

test.describe('mobile analytics access', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('toolbar and chart/list remain reachable without horizontal overflow', async ({ page }) => {
    await setup(page);
    await bar(page, 'Consequence', 4).tap(); await expect(list(page, 'Consequence')).toBeVisible();
    expect(await page.getByRole('main', { name: 'Analytics', exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).tap();
    const button = page.getByRole('button', { name: 'Analytics', exact: true });
    const box = await button.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(64); expect(box.height).toBeGreaterThanOrEqual(44);
    await button.tap(); await expect(page.getByRole('main', { name: 'Analytics', exact: true })).toBeVisible();
  });
});
