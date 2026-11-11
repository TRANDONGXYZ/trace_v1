import { test, expect } from '@playwright/test';
import { APPEARANCE_KEY } from '../../src/appearance.js';
import { NODE_APPEARANCE } from '../../src/node-types.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { phaseFixture } from '../phase-fixtures.js';

const settings = page => page.getByRole('dialog', { name: 'Settings', exact: true });
const theme = page => page.locator('html');
async function setup(page, { graph = phaseFixture(), mode, blocked = false } = {}) {
  await page.addInitScript(({ key, graph, appearanceKey, mode, blocked }) => {
    if (!sessionStorage.getItem('appearance-seeded')) {
      localStorage.setItem(key, graph); if (mode) localStorage.setItem(appearanceKey, mode);
      sessionStorage.setItem('appearance-seeded', 'yes');
    }
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (blocked && name === appearanceKey) throw new DOMException('Unavailable', 'QuotaExceededError');
      if (this === localStorage && name === key) window.diagramWrites++;
      return original.call(this, name, value);
    };
  }, { key: STORAGE_KEY, graph: serializeDiagram(graph), appearanceKey: APPEARANCE_KEY, mode, blocked });
  await page.goto('/');
}
async function openSettings(page) { await page.getByRole('button', { name: 'Settings', exact: true }).click(); }
async function chooseTheme(page, mode) { await settings(page).getByLabel('Appearance', { exact: true }).selectOption(mode); }
async function closeSettings(page) { await settings(page).getByRole('button', { name: 'Close settings', exact: true }).click(); }
async function openAnalytics(page) { await page.getByRole('button', { name: 'Analytics', exact: true }).click(); }
const widths = page => page.locator('.phase-columns').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
const rgb = hex => `rgb(${[1, 3, 5].map(n => parseInt(hex.slice(n, n + 2), 16)).join(', ')})`;
function contrast(first, second) {
  const light = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const a = light(first), b = light(second); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('Light, Dark and System apply immediately, override/follow live OS changes and persist independently of the diagram', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await setup(page);
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await openSettings(page); await expect(settings(page).getByLabel('Appearance')).toHaveValue('system');
  await chooseTheme(page, 'light'); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' }); await page.emulateMedia({ colorScheme: 'dark' });
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await chooseTheme(page, 'dark'); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await chooseTheme(page, 'system'); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.reload(); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await openSettings(page); await expect(settings(page).getByLabel('Appearance')).toHaveValue('system');
  await chooseTheme(page, 'light'); await page.reload(); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(key => localStorage.getItem(key), APPEARANCE_KEY)).toBe('light');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('invalid preferences default to System; failed preference writes apply for the session and report failure truthfully', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' }); await setup(page, { mode: 'unknown', blocked: true });
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await openSettings(page); await chooseTheme(page, 'dark');
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await expect(settings(page).getByRole('alert')).toContainText('preference could not be saved');
  await expect(settings(page).getByRole('button', { name: 'Export Data', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('dark scheme covers board, grid, axes, nodes, edges, dialogs and existing overview with readable contrasts', async ({ page }) => {
  const graph = phaseFixture(), allowed = new Set(['m-high', 'c-one', 'c-two', 'a-phase', 'goal', 'milestone', 'blocked', 'success']);
  graph.nodes = graph.nodes.filter(n => allowed.has(n.id)); graph.edges = graph.edges.filter(e => allowed.has(e.source) && allowed.has(e.target));
  await setup(page, { graph, mode: 'dark' });
  await expect(page.locator('.whiteboard')).toHaveCSS('background-color', 'rgb(17, 24, 33)');
  await expect(page.locator('.horizontal-axis')).toHaveCSS('background-color', 'rgb(32, 44, 58)');
  await expect(page.locator('.react-flow__background pattern circle')).toHaveCSS('fill', 'rgb(60, 78, 100)');
  for (const kind of Object.keys(NODE_APPEARANCE)) {
    const node = page.locator(`.event-node.${kind.toLowerCase()}`).first();
    await expect(node.locator('.node-shape')).toHaveCSS('fill', rgb(NODE_APPEARANCE[kind].fill));
    const text = await node.locator('.node-content').evaluate(el => getComputedStyle(el).color);
    expect(contrast(text, rgb(NODE_APPEARANCE[kind].fill))).toBeGreaterThanOrEqual(4.5);
  }
  await expect(page.locator('.react-flow__edge-path').first()).toHaveCSS('stroke', 'rgb(186, 198, 213)');
  await page.locator('.event-node.consequence').first().dblclick();
  await expect(page.locator('.selection-outline').first()).toHaveCSS('stroke', 'rgb(141, 184, 255)');
  await expect(page.locator('.chain-highlighted .react-flow__edge-path').first()).toHaveCSS('stroke', 'rgb(141, 184, 255)');
  await expect(page.locator('.chain-highlighted marker path').first()).toHaveCSS('fill', 'rgb(141, 184, 255)');
  await page.getByRole('button', { name: 'Create node', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'New node', exact: true });
  await expect(form).toHaveCSS('background-color', 'rgb(27, 36, 48)');
  for (const field of ['Type', 'Time', 'Description']) await expect(form.getByLabel(field, { exact: true })).toHaveCSS('background-color', 'rgb(27, 36, 48)');
  await page.keyboard.press('Escape'); await openSettings(page);
  await expect(settings(page)).toHaveCSS('background-color', 'rgb(27, 36, 48)');
  await expect(settings(page).getByLabel('Appearance')).toHaveCSS('color', 'rgb(228, 234, 242)');
  await closeSettings(page); await page.getByRole('button', { name: 'Mistake overview', exact: true }).click();
  const overview = page.getByRole('dialog', { name: 'Mistake overview', exact: true });
  await expect(overview.locator('.mistake-cluster')).toHaveCount(1);
  await expect(overview).toHaveCSS('background-color', 'rgb(27, 36, 48)');
  await expect(overview.locator('.analytics-table').first()).toHaveCSS('color', 'rgb(228, 234, 242)');
  await page.screenshot({ path: 'test-results/dark-overview.png' });
});

test('analytics chart and continuous gradients adapt to dark mode without changing counts', async ({ page }) => {
  await setup(page, { mode: 'dark' }); await page.clock.setFixedTime(new Date('2026-11-11T05:00:00Z')); await openAnalytics(page);
  const root = page.getByRole('main', { name: 'Analytics', exact: true });
  await expect(root).toHaveCSS('background-color', 'rgb(27, 36, 48)');
  await expect(page.getByRole('button', { name: 'Mistake: 5 events', exact: true })).toBeVisible();
  for (const [kind, count, start, end] of [['Mistake', 5, 'rgb(129, 62, 59)', 'rgb(45, 32, 37)'], ['Consequence', 4, 'rgb(113, 69, 31)', 'rgb(48, 39, 30)']]) {
    const bar = page.getByRole('button', { name: `${kind}: ${count} events`, exact: true }); await bar.click();
    await expect(bar.locator('.phase-bar-fill')).toHaveCSS('background-color', rgb(NODE_APPEARANCE[kind].fill));
    const list = page.getByRole('list', { name: `${kind} events`, exact: true });
    const css = await list.evaluate(el => ({ background: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).color }));
    expect(css.background).toContain(start); expect(css.background).toContain(end);
    expect(contrast(css.color, start)).toBeGreaterThanOrEqual(4.5); expect(contrast(css.color, end)).toBeGreaterThanOrEqual(4.5);
    expect(await list.locator('li').evaluateAll(elements => elements.every(el => getComputedStyle(el).backgroundImage === 'none'))).toBe(true);
  }
  await page.screenshot({ path: 'test-results/dark-resizable-analytics.png' });
});

test('divider drags both ways, clamps minimums, supports keyboard and does not interfere with bars or persistence', async ({ page }) => {
  await setup(page); await page.clock.setFixedTime(new Date('2026-11-11T05:00:00Z')); await openAnalytics(page);
  const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true });
  const initial = await widths(page); expect(initial[0] / initial[2]).toBeCloseTo(1.5, 2);
  const move = async delta => {
    const box = await divider.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + 100); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, box.y + 100, { steps: 12 }); await page.mouse.up();
  };
  await move(-180); const left = await widths(page); expect(left[0]).toBeLessThan(initial[0]); expect(left[2]).toBeGreaterThan(initial[2]);
  await move(260); const right = await widths(page); expect(right[0]).toBeGreaterThan(left[0]);
  await move(-2000); expect((await widths(page))[0]).toBeCloseTo(320, 0);
  await page.getByRole('button', { name: 'Consequence: 4 events', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Consequence events', exact: true }).locator('li')).toHaveCount(4);
  expect(await page.locator('.phase-summary').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await move(2000); expect((await widths(page))[2]).toBeCloseTo(280, 0);
  expect(await page.locator('.phase-detail').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await divider.focus(); await page.keyboard.press('Home'); expect((await widths(page))[0]).toBeCloseTo(320, 0);
  await page.keyboard.press('ArrowRight'); expect((await widths(page))[0]).toBeGreaterThan(320);
  await page.keyboard.press('End'); expect((await widths(page))[2]).toBeCloseTo(280, 0);
  await page.keyboard.press('ArrowLeft'); expect((await widths(page))[2]).toBeGreaterThan(280);
  await page.setViewportSize({ width: 760, height: 1000 });
  const smaller = await widths(page); expect(smaller[0]).toBeGreaterThanOrEqual(319); expect(smaller[2]).toBeGreaterThanOrEqual(279);
  expect(await page.getByRole('main', { name: 'Analytics', exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('appearance and layout changes preserve the pending three-second save and content-only undo/redo', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T05:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-11T05:00:01Z'));
  await setup(page, { graph: { nodes: [], edges: [] } }); await page.clock.runFor(32);
  await page.getByRole('button', { name: 'Create node', exact: true }).click();
  await page.getByLabel('Type', { exact: true }).selectOption('Action'); await page.getByLabel('Action', { exact: true }).fill('Keep my edit');
  await page.getByLabel('Time', { exact: true }).fill('11/11/26'); await page.keyboard.press('Enter');
  await page.clock.runFor(2000); await openSettings(page); await chooseTheme(page, 'dark'); await closeSettings(page); await page.clock.runFor(32);
  await openAnalytics(page); const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true });
  await divider.focus(); await page.keyboard.press('ArrowLeft');
  await page.clock.runFor(967); expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  await page.clock.runFor(1); expect(await page.evaluate(() => window.diagramWrites)).toBe(1);
  await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click(); await page.clock.runFor(32);
  await page.keyboard.press('Control+Z'); await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Control+Y'); await expect(page.locator('.react-flow__node')).toHaveCount(1);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(1);
});

test.describe('touch layouts', () => {
  test.use({ viewport: { width: 1024, height: 900 }, isMobile: true, hasTouch: true });
  test('touch drags the divider on tablets; narrow phones stack panels and retain appearance controls', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-11T05:00:00Z'));
    await setup(page, { mode: 'dark' }); await openAnalytics(page);
    const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true }), before = await widths(page), box = await divider.boundingBox();
    const cdp = await page.context().newCDPSession(page), x = box.x + box.width / 2, y = box.y + 100;
    await cdp.send('Input.synthesizeScrollGesture', { x, y, xDistance: -100, yDistance: 0, gestureSourceType: 'touch', speed: 300 });
    expect((await widths(page))[0]).toBeLessThan(before[0]);
    await expect(page.locator('.phase-analytics')).not.toHaveClass(/is-resizing/);
    await page.getByRole('button', { name: 'Consequence: 4 events', exact: true }).tap();
    await expect(page.getByRole('list', { name: 'Consequence events', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await expect(divider).not.toBeVisible();
    await page.getByRole('button', { name: 'Action: 2 events', exact: true }).tap();
    await expect(page.getByRole('list', { name: 'Action events', exact: true })).toBeVisible();
    expect(await page.getByRole('main', { name: 'Analytics', exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).tap(); await openSettings(page);
    await chooseTheme(page, 'light'); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: 'test-results/mobile-appearance.png' });
  });
});
