import { test, expect } from '@playwright/test';
import { chainFixture } from '../chain-fixtures.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { APPEARANCE_KEY } from '../../src/appearance.js';
import { NODE_APPEARANCE } from '../../src/node-types.js';
import { durationLabel, parseDate } from '../../src/model.js';

test.use({ timezoneId: 'Asia/Bangkok' });
const ranking = page => page.getByRole('list', { name: 'Consequence chain ranking', exact: true });
const detail = page => page.locator('#phase-detail');
const choose = (page, id) => page.getByTestId(`chain-case-${id}`);
const rgb = hex => `rgb(${[1, 3, 5].map(n => parseInt(hex.slice(n, n + 2), 16)).join(', ')})`;
async function openAnalytics(page) { await page.getByRole('button', { name: 'Analytics', exact: true }).click(); }
async function back(page) { await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click(); }
async function setup(page, { graph = chainFixture(), mode = 'light', date = '2026-11-14T05:00:00Z' } = {}) {
  if (date) await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(({ key, value, mode, appearance }) => {
    if (!sessionStorage.getItem('chain-seeded')) {
      localStorage.setItem(key, value); localStorage.setItem(appearance, mode); sessionStorage.setItem('chain-seeded', 'yes');
    }
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key) window.diagramWrites++;
      return original.call(this, name, value);
    };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph), mode, appearance: APPEARANCE_KEY });
  const requests = [];
  page.on('request', request => { if (/api\/ai|11434/u.test(request.url())) requests.push(request.url()); });
  await page.goto('/'); await openAnalytics(page);
  return requests;
}
function graphEdges(nodes, pairs) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return pairs.map(([source, target], index) => ({ id: `test-edge-${index}`, type: 'time', source, target, sourceHandle: 'right', targetHandle: 'left',
    data: { ...durationLabel(byId.get(source).data.time, byId.get(target).data.time), manual: true } }));
}

test('chain ranking follows Reaction Time in the same two panels and displays exact orange depth segments', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.phase-columns > section')).toHaveCount(2);
  const reaction = await page.locator('.reaction-analysis').boundingBox(), chain = await page.locator('.consequence-chain-analysis').boundingBox();
  expect(chain.y).toBeGreaterThanOrEqual(reaction.y + reaction.height);
  expect(await ranking(page).locator('button').evaluateAll(elements => elements.map(el => el.dataset.testid))).toEqual([
    'chain-case-m-deep', 'chain-case-m-ties', 'chain-case-m-two', 'chain-case-m-future', 'chain-case-m-parallel', 'chain-case-m-one', 'chain-case-m-bridge', 'chain-case-m-none',
  ]);
  for (const [id, depth, total] of [['m-deep', 3, 5], ['m-parallel', 1, 3], ['m-bridge', 0, 1], ['m-none', 0, 0]]) {
    await expect(choose(page, id)).toContainText(`Chain Depth: ${depth}`); await expect(choose(page, id)).toContainText(`Total Consequences: ${total}`);
    await expect(choose(page, id).locator('.chain-depth-segment')).toHaveCount(depth);
  }
  await expect(choose(page, 'm-deep').locator('.chain-depth-segment').first()).toHaveCSS('background-color', rgb(NODE_APPEARANCE.Consequence.fill));
  await expect(choose(page, 'm-deep').locator('.chain-depth-segment').first()).toHaveCSS('width', '12px');
  await expect(choose(page, 'm-two').locator('.chain-depth-segment').first()).toHaveCSS('width', '12px');
  await expect(choose(page, 'm-prior')).toHaveCount(0); await expect(choose(page, 'm-next')).toHaveCount(0);
  await choose(page, 'm-future').click(); await expect(detail(page).locator('.chain-duration')).toHaveText('10 days');
  await expect(detail(page)).toContainText('03/01/27'); await expect(detail(page)).toContainText('07/01/27');
});

test('selected detail shows separate metrics, full original text/descriptions and only the chosen longest actual chain', async ({ page }) => {
  await setup(page); await choose(page, 'm-deep').click();
  await expect(choose(page, 'm-deep')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail(page).locator('.chain-depth')).toHaveText('3'); await expect(detail(page).locator('.chain-total')).toHaveText('5');
  await expect(detail(page).locator('.chain-duration')).toHaveText('14 days');
  const path = detail(page).getByRole('list', { name: 'Selected Consequence chain', exact: true });
  expect(await path.locator('li').evaluateAll(elements => elements.map(el => el.dataset.nodeId))).toEqual(['m-deep', 'deep-c1', 'deep-c2', 'deep-c3']);
  const fixture = chainFixture();
  for (const id of ['m-deep', 'deep-c1']) {
    const original = fixture.nodes.find(node => node.id === id), item = path.locator(`[data-node-id="${id}"]`);
    await expect(item.locator('.journey-main-text')).toHaveText(original.data.mistake);
    await expect(item.locator('.journey-description')).toHaveText(original.data.description);
    await expect(item.locator('.journey-marker')).toHaveCSS('background-color', rgb(NODE_APPEARANCE[original.data.kind].fill));
  }
  await expect(path.locator('time')).toHaveText(['01/11/26', '03/11/26', '07/11/26', '15/11/26']);
  await expect(path.locator('.journey-missing-description')).toHaveCount(2);
  await expect(detail(page)).not.toContainText('Original later-branch'); await expect(detail(page)).not.toContainText('Original after-break');
  await choose(page, 'm-ties').click();
  expect(await detail(page).getByRole('list', { name: 'Selected Consequence chain', exact: true }).locator('li').evaluateAll(elements => elements.map(el => el.dataset.nodeId))).toEqual(['m-ties', 'tie-b', 'tie-end-b']);
  await expect(detail(page).locator('.chain-duration')).toHaveText('10 days');
  await page.screenshot({ path: 'test-results/consequence-chain-light.png' });
});

test('latest chain, reaction or chart selection exclusively controls the existing right panel', async ({ page }) => {
  await setup(page); await choose(page, 'm-deep').click();
  await page.getByTestId('reaction-case-bridge-c').click();
  await expect(detail(page).locator('.reaction-total')).toHaveText('5 days'); await expect(detail(page).locator('.chain-journey')).toHaveCount(0);
  await expect(choose(page, 'm-deep')).toHaveAttribute('aria-pressed', 'false');
  await choose(page, 'm-two').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('2');
  await expect(page.getByTestId('reaction-case-bridge-c')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Mistake: 8 events', exact: true }).click();
  await expect(detail(page).getByRole('list', { name: 'Mistake events', exact: true }).locator('li')).toHaveCount(8);
  await expect(detail(page).locator('.chain-journey')).toHaveCount(0); await expect(detail(page).locator('.reaction-journey')).toHaveCount(0);
  await choose(page, 'm-bridge').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('0');
  await expect(detail(page).locator('.chain-total')).toHaveText('1'); await expect(detail(page).locator('.chain-duration')).toHaveText('Not available');
  await expect(detail(page)).toContainText('No consecutive Consequence chain is recorded for this Mistake.');
  await expect(detail(page).getByRole('list', { name: 'Selected Consequence chain', exact: true })).toHaveCount(0);
  await expect(detail(page)).toContainText('No Description recorded.');
});

test('cycle and backward-date cases are explicit without false zero depths, absolute-value durations or invented paths', async ({ page }) => {
  const fixture = chainFixture(), base = fixture.nodes.find(node => node.id === 'one-c');
  const m = { ...fixture.nodes.find(node => node.id === 'm-one'), data: { ...fixture.nodes.find(node => node.id === 'm-one').data, time: parseDate('08/11/26') } };
  const cycle = { ...fixture.nodes.find(node => node.id === 'm-none'), id: 'm-cycle' };
  const nodes = [m, base, cycle, ...['cycle-a', 'cycle-b'].map(id => ({ ...base, id }))];
  await setup(page, { graph: { nodes, edges: graphEdges(nodes, [['m-one', 'one-c'], ['m-cycle', 'cycle-a'], ['cycle-a', 'cycle-b'], ['cycle-b', 'cycle-a']]) } });
  await choose(page, 'm-one').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('1');
  await expect(detail(page).locator('.chain-duration')).toHaveText('Not available'); await expect(detail(page)).toContainText('invalid or backward dates');
  await expect(detail(page).getByRole('list', { name: 'Selected Consequence chain', exact: true }).locator('time')).toHaveText(['08/11/26', '05/11/26']);
  await choose(page, 'm-cycle').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('Unavailable (cycle)');
  await expect(detail(page).locator('.chain-total')).toHaveText('2'); await expect(choose(page, 'm-cycle').locator('.chain-depth-segment')).toHaveCount(0);
  await expect(detail(page)).toContainText('no longest chain is claimed');
  await expect(detail(page).getByRole('list', { name: 'Selected Consequence chain', exact: true })).toHaveCount(0);
});

test('large depth keeps every equal-size segment in a horizontally scrollable bar without panel overflow', async ({ page }) => {
  const base = chainFixture(), root = base.nodes.find(node => node.id === 'm-one'), c = base.nodes.find(node => node.id === 'one-c');
  const nodes = [root, ...Array.from({ length: 150 }, (_, index) => ({ ...c, id: `long-${index}`, position: { x: 500 + index * 180, y: 400 } }))];
  const pairs = nodes.slice(1).map((target, index) => [nodes[index].id, target.id]);
  await setup(page, { graph: { nodes, edges: graphEdges(nodes, pairs) } });
  const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true }); await divider.focus(); await page.keyboard.press('Home');
  const segments = choose(page, 'm-one').locator('.chain-segments');
  await expect(segments.locator('.chain-depth-segment')).toHaveCount(150); await expect(choose(page, 'm-one')).toContainText('Chain Depth: 150');
  const sizes = await segments.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth })); expect(sizes.scroll).toBeGreaterThan(sizes.client);
  await segments.evaluate(el => { el.scrollLeft = el.scrollWidth; }); expect(await segments.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('.phase-summary').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await choose(page, 'm-one').click(); await expect(detail(page).getByRole('list', { name: 'Selected Consequence chain', exact: true }).locator('li')).toHaveCount(151);
});

test('selection, scrolling, resizing and returning to the board do not save content, call AI or add undo history', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-14T05:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-14T05:00:01Z'));
  const requests = await setup(page, { date: null }); await page.clock.runFor(32);
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await choose(page, 'm-deep').click(); await choose(page, 'm-none').click(); await page.getByTestId('reaction-case-bridge-c').click();
  await choose(page, 'm-ties').click();
  await page.getByRole('separator', { name: 'Resize analytics panels', exact: true }).focus(); await page.keyboard.press('End'); await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0); expect(requests).toEqual([]);
  await back(page); await page.clock.runFor(32); await page.keyboard.press('Control+Z');
  await expect(page.locator('.react-flow__node')).toHaveCount(chainFixture().nodes.length);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
});

test('content edits and undo/redo recalculate the chain while Dark mode and minimum panel sizes stay readable', async ({ page }) => {
  const original = chainFixture().nodes.find(node => node.id === 'm-none'), position = { x: 240, y: 400 };
  const root = { ...original, position, data: { ...original.data, placement: { mode: 'origin', origin: position, columnOffset: 0 } } };
  await setup(page, { graph: { nodes: [root], edges: [] }, mode: 'dark' }); await back(page);
  const create = async date => {
    await page.getByRole('button', { name: 'Create node', exact: true }).click(); const form = page.getByRole('dialog', { name: 'New node', exact: true });
    await form.getByLabel('Type', { exact: true }).selectOption('Consequence'); await form.getByLabel('Consequence', { exact: true }).fill(`Consequence on ${date}`);
    await form.getByLabel('Time', { exact: true }).fill(date); await page.keyboard.press('Enter');
  };
  await page.locator('.react-flow__node').first().click(); await create('06/11/26');
  await page.locator('.react-flow__node').nth(1).click(); await create('07/11/26');
  await openAnalytics(page); await choose(page, 'm-none').click();
  await expect(detail(page).locator('.chain-depth')).toHaveText('2'); await expect(detail(page).locator('.chain-duration')).toHaveText('2 days');
  await expect(choose(page, 'm-none')).toHaveCSS('background-color', 'rgb(38, 63, 97)');
  const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true }); await divider.focus(); await page.keyboard.press('End');
  expect(await detail(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/consequence-chain-dark.png' });
  await back(page); await page.keyboard.press('Control+Z'); await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await openAnalytics(page); await choose(page, 'm-none').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('1');
  await back(page); await page.keyboard.press('Control+Y'); await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await openAnalytics(page); await choose(page, 'm-none').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('2');
});

test.describe('mobile chains', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('taps switch chain, reaction and bar detail views without changing the stacked layout or overflowing', async ({ page }) => {
    await setup(page, { mode: 'dark' }); await choose(page, 'm-deep').tap(); await expect(detail(page).locator('.chain-depth')).toHaveText('3');
    expect(await page.getByRole('main', { name: 'Analytics', exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByTestId('reaction-case-bridge-c').tap(); await expect(detail(page).locator('.reaction-total')).toHaveText('5 days');
    await page.getByRole('button', { name: 'Mistake: 8 events', exact: true }).tap();
    await expect(detail(page).getByRole('list', { name: 'Mistake events', exact: true }).locator('li')).toHaveCount(8);
    await choose(page, 'm-none').tap(); await expect(detail(page)).toContainText('No consecutive Consequence chain is recorded for this Mistake.');
  });
});
