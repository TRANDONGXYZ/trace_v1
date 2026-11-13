import { test, expect } from '@playwright/test';
import { reactionFixture } from '../reaction-fixtures.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { APPEARANCE_KEY } from '../../src/appearance.js';
import { NODE_APPEARANCE } from '../../src/node-types.js';

test.use({ timezoneId: 'Asia/Bangkok' });
const analytics = page => page.getByRole('main', { name: 'Analytics', exact: true });
const detail = page => page.locator('#phase-detail');
const measured = page => page.getByRole('list', { name: 'Measured reaction times', exact: true });
const pending = page => page.getByRole('list', { name: 'Consequences without a recorded follow-up', exact: true });
const caseButton = (page, id) => page.getByTestId(`reaction-case-${id}`);
async function setup(page, { graph = reactionFixture(), date = '2026-11-13T05:00:00Z', mode = 'light' } = {}) {
  if (date) await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(({ key, value, mode, appearanceKey }) => {
    if (!sessionStorage.getItem('reaction-seeded')) {
      localStorage.setItem(key, value); localStorage.setItem(appearanceKey, mode); sessionStorage.setItem('reaction-seeded', 'yes');
    }
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key) window.diagramWrites++;
      return original.call(this, name, value);
    };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph), mode, appearanceKey: APPEARANCE_KEY });
  const requests = [];
  page.on('request', request => { if (/api\/ai|11434/u.test(request.url())) requests.push(request.url()); });
  await page.goto('/'); await openAnalytics(page);
  return requests;
}
async function openAnalytics(page) { await page.getByRole('button', { name: 'Analytics', exact: true }).click(); }
async function back(page) { await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click(); }
const rgb = hex => `rgb(${[1, 3, 5].map(n => parseInt(hex.slice(n, n + 2), 16)).join(', ')})`;

test('reaction list sits below the chart, keeps two panels, sorts durations and uses one scale with clear zero-day markers', async ({ page }) => {
  const requests = await setup(page);
  await expect(page.locator('.phase-columns > section')).toHaveCount(2);
  await expect(page.getByRole('separator', { name: 'Resize analytics panels', exact: true })).toHaveCount(1);
  const chart = await page.getByRole('list', { name: 'Event count chart', exact: true }).boundingBox();
  const reaction = await page.locator('.reaction-analysis').boundingBox(); expect(reaction.y).toBeGreaterThanOrEqual(chart.y + chart.height);
  expect(await measured(page).locator('button').evaluateAll(elements => elements.map(el => el.dataset.testid))).toEqual([
    'reaction-case-c-long', 'reaction-case-c-mid', 'reaction-case-c-short', 'reaction-case-c-same',
  ]);
  await expect(measured(page).locator('.reaction-case-heading strong')).toHaveText(['12 days', '7 days', '5 days', '0 days']);
  const widths = await measured(page).locator('.reaction-duration').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
  expect(widths[1] / widths[0]).toBeCloseTo(7 / 12, 2); expect(widths[2] / widths[0]).toBeCloseTo(5 / 12, 2); expect(widths[3]).toBe(0);
  await expect(caseButton(page, 'c-same')).toContainText('Same day');
  await expect(caseButton(page, 'c-same').locator('.consequence-marker')).toHaveCSS('width', '18px');
  await expect(caseButton(page, 'c-same').locator('.action-marker')).toHaveCSS('width', '8px');
  await expect(caseButton(page, 'c-long').locator('.consequence-marker')).toHaveCSS('background-color', rgb(NODE_APPEARANCE.Consequence.fill));
  await expect(caseButton(page, 'c-long').locator('.action-marker')).toHaveCSS('background-color', rgb(NODE_APPEARANCE.Action.fill));
  await expect(caseButton(page, 'c-long')).toContainText('Consequence 01/11/26 → Action 13/11/26');
  const summary = caseButton(page, 'c-long').locator('.reaction-summary'); await expect(summary).toHaveCSS('-webkit-line-clamp', '2');
  expect(requests).toEqual([]); expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('a selected case replaces the entire existing detail view with full original records and one actual path', async ({ page }) => {
  await setup(page); await caseButton(page, 'c-long').click();
  await expect(caseButton(page, 'c-long')).toHaveAttribute('aria-pressed', 'true');
  await expect(caseButton(page, 'c-long')).toHaveCSS('background-color', 'rgb(237, 243, 255)');
  await expect(detail(page).getByRole('heading', { name: 'Time to First Recorded Action', exact: true })).toBeVisible();
  await expect(detail(page).locator('.reaction-total')).toHaveText('12 days');
  const path = detail(page).getByRole('list', { name: 'Recorded event path', exact: true });
  expect(await path.locator('li').evaluateAll(elements => elements.map(el => el.dataset.nodeId))).toEqual(['c-long', 'c-mid', 'a-long']);
  await expect(path.locator('.journey-gap')).toHaveText(['5 days since previous event', '7 days since previous event']);
  const graph = reactionFixture();
  for (const id of ['c-long', 'c-mid', 'a-long']) {
    const node = graph.nodes.find(node => node.id === id), row = path.locator(`[data-node-id="${id}"]`);
    await expect(row.locator('.journey-main-text')).toHaveText(node.data.mistake);
    await expect(row.locator('.journey-description')).toHaveText(node.data.description);
    await expect(row.locator('.journey-marker')).toHaveCSS('background-color', rgb(NODE_APPEARANCE[node.data.kind].fill));
  }
  await expect(detail(page)).not.toContainText('An unrelated Action'); await expect(detail(page)).not.toContainText('An unrelated Goal');
  await expect(detail(page)).toContainText('No reason for this interval is inferred.');
  await expect(detail(page).locator('.phase-event-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Consequence: 7 events', exact: true }).click();
  await expect(detail(page).getByRole('list', { name: 'Consequence events', exact: true }).locator('li')).toHaveCount(7);
  await expect(caseButton(page, 'c-long')).toHaveAttribute('aria-pressed', 'false');
  await expect(detail(page).locator('.reaction-journey')).toHaveCount(0);
  await caseButton(page, 'c-short').click(); await expect(detail(page).locator('.reaction-total')).toHaveText('5 days');
});

test('no-action and future-only groups exclude future Consequences, never display a false zero and handle missing descriptions', async ({ page }) => {
  await setup(page);
  await expect(pending(page).locator('button')).toHaveCount(2);
  await expect(caseButton(page, 'c-not-observed')).toHaveCount(0); await expect(caseButton(page, 'c-old')).toHaveCount(0);
  await caseButton(page, 'c-none').click();
  await expect(detail(page).getByRole('heading', { name: 'No Recorded Follow-up Action', exact: true })).toBeVisible();
  await expect(detail(page)).toContainText('No qualifying subsequent Action is recorded in the graph as of today.');
  await expect(detail(page)).toContainText('No Description recorded.');
  await expect(detail(page).locator('.reaction-total')).toHaveCount(0); await expect(detail(page)).not.toContainText('0 days');
  await caseButton(page, 'c-future-only').click();
  await expect(caseButton(page, 'c-future-only')).toContainText('14/11/26 · not completed');
  await expect(detail(page)).toContainText('The earliest qualifying connected Action is future-dated: 14/11/26.');
  await expect(detail(page)).toContainText('It is not a completed response.');
  await expect(detail(page).locator('.reaction-total')).toHaveCount(0);
  await caseButton(page, 'c-same').click(); await expect(detail(page).locator('.reaction-total')).toHaveText('0 days');
  await expect(detail(page).locator('.journey-missing-description')).toHaveCount(2);
});

test('local midnight within the same phase refreshes completion and observed roots while retaining the selected case', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T16:59:59.000Z') }); await page.clock.pauseAt(new Date('2026-11-13T16:59:59.100Z'));
  await setup(page, { date: null }); await page.clock.runFor(32);
  await caseButton(page, 'c-future-only').click(); await expect(detail(page).locator('.reaction-total')).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(detail(page).locator('.reaction-total')).toHaveText('7 days');
  await expect(caseButton(page, 'c-future-only')).toHaveAttribute('aria-pressed', 'true');
  await expect(caseButton(page, 'c-not-observed')).toBeVisible();
  await expect(measured(page).locator('button')).toHaveCount(5);
  await expect(page.locator('.phase-range')).toHaveText('01/11/2026 – 31/12/2026');
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('live graph edits, undo and redo recalculate reactions; case selection does not enter content history', async ({ page }) => {
  const node = reactionFixture().nodes.find(node => node.id === 'c-none');
  await setup(page, { graph: { nodes: [node], edges: [] } });
  await caseButton(page, 'c-none').click(); await expect(detail(page).locator('.reaction-total')).toHaveCount(0); await back(page);
  await page.locator('.react-flow__node[data-id="c-none"]').click();
  await page.getByRole('button', { name: 'Create node', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New node', exact: true });
  await dialog.getByLabel('Type', { exact: true }).selectOption('Action'); await dialog.getByLabel('Action', { exact: true }).fill('A new follow-up');
  await dialog.getByLabel('Time', { exact: true }).fill('13/11/26'); await page.keyboard.press('Enter');
  await openAnalytics(page); await caseButton(page, 'c-none').click(); await expect(detail(page).locator('.reaction-total')).toHaveText('4 days');
  await back(page); await page.keyboard.press('Control+Z'); await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await openAnalytics(page); await caseButton(page, 'c-none').click(); await expect(detail(page).locator('.reaction-total')).toHaveCount(0);
  await back(page); await page.keyboard.press('Control+Y'); await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await openAnalytics(page); await caseButton(page, 'c-none').click(); await expect(detail(page).locator('.reaction-total')).toHaveText('4 days');
});

test('read-only cases, bar switching and resizing leave saved data and history unchanged and make no inference requests', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T05:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-13T05:00:01Z'));
  const requests = await setup(page, { date: null }); await page.clock.runFor(32);
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await caseButton(page, 'c-long').click(); await caseButton(page, 'c-none').click();
  await page.getByRole('button', { name: 'Action: 5 events', exact: true }).click(); await caseButton(page, 'c-short').click();
  const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true }); await divider.focus(); await page.keyboard.press('End');
  await page.clock.runFor(5000); expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  await back(page); await page.clock.runFor(32); await page.keyboard.press('Control+Z');
  await expect(page.locator('.react-flow__node')).toHaveCount(reactionFixture().nodes.length);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before); expect(requests).toEqual([]);
});

test('case details and duration rows remain usable at minimum panel widths in Light and Dark', async ({ page }) => {
  await setup(page, { mode: 'dark' }); await caseButton(page, 'c-long').click();
  const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true });
  await divider.focus(); await page.keyboard.press('Home');
  expect(await page.locator('.phase-summary').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await caseButton(page, 'c-long').click(); await expect(caseButton(page, 'c-long')).toHaveCSS('background-color', 'rgb(38, 63, 97)');
  await divider.focus(); await page.keyboard.press('End');
  expect(await detail(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(detail(page)).toContainText('The second line is preserved.');
  await page.screenshot({ path: 'test-results/reaction-journey-dark.png' });
  await back(page); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Appearance', { exact: true }).selectOption('light'); await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await openAnalytics(page); await caseButton(page, 'c-long').click();
  await expect(detail(page).locator('.reaction-total')).toHaveText('12 days');
  await page.screenshot({ path: 'test-results/reaction-journey-light.png' });
});

test.describe('mobile reaction cases', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('tapping cases and chart bars switches the shared detail panel without new columns or overflow', async ({ page }) => {
    await setup(page, { mode: 'dark' }); await caseButton(page, 'c-short').tap();
    await expect(detail(page).locator('.reaction-total')).toHaveText('5 days');
    expect(await analytics(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByRole('separator', { name: 'Resize analytics panels', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Action: 5 events', exact: true }).tap();
    await expect(detail(page).getByRole('list', { name: 'Action events', exact: true }).locator('li')).toHaveCount(5);
    await caseButton(page, 'c-none').tap(); await expect(detail(page)).toContainText('No Description recorded.');
  });
});
