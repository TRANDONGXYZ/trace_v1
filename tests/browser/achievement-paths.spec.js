import { test, expect } from '@playwright/test';
import { achievementFixture } from '../achievement-fixtures.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { APPEARANCE_KEY } from '../../src/appearance.js';

test.use({ timezoneId: 'Asia/Bangkok' });
const detail = page => page.locator('#phase-detail');
const graph = page => page.getByRole('region', { name: 'Read-only achievement paths', exact: true });
const choose = (page, id) => page.getByTestId(`achievement-case-${id}`);
const action = (page, id) => page.getByTestId(`related-action-${id}`);
const rfNode = (page, id) => graph(page).locator(`.react-flow__node[data-id="${id}"]`);
async function setup(page, { diagram = achievementFixture(), mode = 'light', date = '2026-11-14T05:00:00Z' } = {}) {
  if (date) await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(({ key, value, appearance, mode }) => {
    if (!sessionStorage.getItem('achievement-seeded')) {
      localStorage.setItem(key, value); localStorage.setItem(appearance, mode); sessionStorage.setItem('achievement-seeded', 'yes');
    }
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) window.diagramWrites++; return original.call(this, name, value); };
  }, { key: STORAGE_KEY, value: serializeDiagram(diagram), appearance: APPEARANCE_KEY, mode });
  const requests = []; page.on('request', request => { if (/api\/ai|11434/u.test(request.url())) requests.push(request.url()); });
  await page.goto('/'); await page.getByRole('button', { name: 'Analytics', exact: true }).click(); return requests;
}

test('achievement ranking follows chains, includes both outcome types and sorts by count/date/ID with full phase scope', async ({ page }) => {
  await setup(page); await expect(page.locator('.phase-columns > section')).toHaveCount(2);
  const chain = await page.locator('.consequence-chain-analysis').boundingBox(), achievements = await page.locator('.achievement-analysis').boundingBox();
  expect(achievements.y).toBeGreaterThanOrEqual(chain.y + chain.height);
  expect(await page.getByRole('list', { name: 'Achievement ranking', exact: true }).locator('button').evaluateAll(elements => elements.map(el => el.dataset.testid)))
    .toEqual(['achievement-case-s', 'achievement-case-m', 'achievement-case-future', 'achievement-case-none']);
  await expect(choose(page, 's')).toContainText('Success'); await expect(choose(page, 's')).toContainText('5 related Actions');
  await expect(choose(page, 'm')).toContainText('2 related Actions'); await expect(choose(page, 'future')).toContainText('20/12/26');
  await expect(choose(page, 'prior')).toHaveCount(0); await expect(choose(page, 'next')).toHaveCount(0);
  await expect(choose(page, 's').locator('.journey-marker')).toHaveCSS('background-color', 'rgb(25, 107, 58)');
  await expect(choose(page, 'm').locator('.journey-marker')).toHaveCSS('background-color', 'rgb(203, 234, 197)');
});

test('details preserve complete summary and all distinct Actions, types, full descriptions, branches, IDs and arrows', async ({ page }) => {
  const original = achievementFixture(); await setup(page); await choose(page, 's').click();
  await expect(choose(page, 's')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail(page).locator('.achievement-summary .journey-main-text')).toHaveText(original.nodes.find(n => n.id === 's').data.mistake);
  await expect(detail(page).locator('.achievement-summary .journey-description')).toHaveText('Full achievement Description.\nSecond original line.');
  expect(await detail(page).getByRole('list', { name: 'Related Actions', exact: true }).locator('button').evaluateAll(elements => elements.map(el => el.dataset.testid)))
    .toEqual(['related-action-a', 'related-action-f', 'related-action-c', 'related-action-d', 'related-action-e']);
  await expect(action(page, 'a')).toContainText('15/10/26 · Indirect-only'); await expect(action(page, 'e')).toContainText('06/11/26 · Direct');
  await expect(graph(page).locator('.react-flow__node')).toHaveCount(10); await expect(graph(page).locator('.react-flow__edge')).toHaveCount(10);
  expect(await graph(page).locator('.react-flow__node').evaluateAll(nodes => nodes.map(n => n.dataset.id).sort())).toEqual(['a', 'c', 'consequence', 'd', 'e', 'f', 'g', 'm', 'mistake', 's']);
  const edges = await graph(page).locator('.react-flow__edge').evaluateAll(nodes => nodes.map(n => n.dataset.id).sort());
  expect(edges).toEqual(original.edges.filter(e => !['s', 'unrelated'].includes(e.source)).map(e => e.id).sort());
  for (const id of ['achievement-edge-0', 'achievement-edge-2', 'achievement-edge-4', 'achievement-edge-5'])
    await expect(graph(page).locator(`.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`)).toHaveAttribute('marker-end', /url/);
  await action(page, 'a').click();
  await expect(detail(page).getByRole('region', { name: 'Selected recorded event', exact: true }).locator('.journey-main-text')).toHaveText(original.nodes.find(n => n.id === 'a').data.mistake);
  await expect(detail(page).locator('.achievement-selected-event .journey-description')).toHaveText('Original Action context.\nChi tiết gốc.');
  await expect(rfNode(page, 'a').locator('.node-shape')).toHaveAttribute('fill', '#76a7ee');
});

test('Action selection highlights all alternate paths, dims other branches, and clear restores the whole graph', async ({ page }) => {
  await setup(page); await choose(page, 's').click(); await action(page, 'a').click();
  expect(await graph(page).locator('.react-flow__node:not(.achievement-dimmed)').evaluateAll(nodes => nodes.map(n => n.dataset.id).sort())).toEqual(['a', 'e', 'm', 's']);
  expect(await graph(page).locator('.achievement-path-edge').evaluateAll(edges => edges.map(n => n.dataset.id).sort())).toEqual(['achievement-edge-0', 'achievement-edge-2', 'achievement-edge-4', 'achievement-edge-5']);
  await expect(rfNode(page, 'c')).toHaveCSS('opacity', '0.25'); await expect(graph(page).locator('.react-flow__node')).toHaveCount(10);
  await detail(page).getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(graph(page).locator('.achievement-dimmed')).toHaveCount(0); await expect(graph(page).locator('.achievement-path-edge')).toHaveCount(0);
  await graph(page).getByRole('button', { name: 'Zoom Out', exact: true }).click();
  await rfNode(page, 'm').click(); await expect(detail(page).locator('.achievement-selected-event')).toContainText('Original m');
  await expect(graph(page).locator('.achievement-dimmed')).toHaveCount(0);
  await action(page, 'e').click(); await expect(graph(page).locator('.achievement-path-edge')).toHaveCount(1);
  await graph(page).locator('.react-flow__pane').click({ position: { x: 15, y: 20 } }); await expect(graph(page).locator('.achievement-dimmed')).toHaveCount(0);
  await graph(page).screenshot({ path: 'test-results/achievement-path-light.png' });
});

test('latest chart, reaction, chain or achievement selection exclusively controls the same right panel', async ({ page }) => {
  await setup(page); await choose(page, 's').click(); await action(page, 'a').click();
  await page.getByTestId('reaction-case-consequence').click(); await expect(detail(page).locator('.reaction-total')).toHaveText('2 days');
  await expect(choose(page, 's')).toHaveAttribute('aria-pressed', 'false'); await expect(graph(page)).toHaveCount(0);
  await choose(page, 'm').click(); await expect(detail(page).locator('.achievement-summary')).toContainText('Related Actions: 2');
  await page.getByTestId('chain-case-mistake').click(); await expect(detail(page).locator('.chain-depth')).toHaveText('1');
  await choose(page, 's').click(); await page.getByRole('button', { name: 'Success: 2 events', exact: true }).click();
  await expect(detail(page).getByRole('list', { name: 'Success events', exact: true }).locator('li')).toHaveCount(2);
  await choose(page, 's').click(); await expect(detail(page).getByRole('button', { name: 'Clear selection', exact: true })).toBeDisabled();
});

test('empty roots and cycles remain finite, retain intermediate nodes and show neutral messages', async ({ page }) => {
  const original = achievementFixture(), nodes = original.nodes.filter(n => ['m', 's', 'g'].includes(n.id));
  const edges = [{ ...original.edges[0], id: 'cycle-1', source: 'g', target: 'm' }, { ...original.edges[0], id: 'cycle-2', source: 'm', target: 's' }, { ...original.edges[0], id: 'cycle-3', source: 's', target: 'm' }];
  await setup(page, { diagram: { nodes, edges } }); await choose(page, 's').click();
  await expect(detail(page)).toContainText('No upstream Actions are recorded'); await expect(detail(page)).toContainText('Recorded cycles are retained');
  await expect(graph(page).locator('.react-flow__node')).toHaveCount(3); await expect(graph(page).locator('.react-flow__edge')).toHaveCount(3);
  await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: 'Analytics', exact: true }).click(); await choose(page, 's').click();
  await expect(graph(page).locator('.react-flow__edge')).toHaveCount(3);
});

test('zero-Action achievements still show their singleton graph and original information', async ({ page }) => {
  await setup(page); await choose(page, 'none').click();
  await expect(detail(page)).toContainText('Related Actions: 0'); await expect(detail(page)).toContainText('No upstream connections are recorded.');
  await expect(graph(page).locator('.react-flow__node')).toHaveCount(1); await expect(graph(page).locator('.react-flow__edge')).toHaveCount(0);
  await expect(detail(page).locator('.achievement-summary')).toContainText('No Description recorded.');
});

test('graph navigation/selection is read-only, isolated from the board, and creates no saves, history or inference', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-14T05:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-14T05:00:01Z'));
  const requests = await setup(page, { date: null }); await page.clock.runFor(32);
  const saved = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  const boardViewport = await page.locator('.whiteboard .react-flow__viewport').getAttribute('style');
  await choose(page, 's').click(); await action(page, 'a').click();
  const position = await rfNode(page, 'a').getAttribute('style');
  await page.keyboard.press('Delete'); await page.keyboard.press('Control+Z'); await page.keyboard.press('Control+Y');
  await expect(graph(page).locator('.react-flow__node')).toHaveCount(10); await expect(graph(page).locator('.react-flow__edge')).toHaveCount(10);
  await expect(rfNode(page, 'a')).toHaveAttribute('style', position);
  const viewport = graph(page).locator('.react-flow__viewport'), before = await viewport.getAttribute('style');
  await graph(page).getByRole('button', { name: 'Zoom Out', exact: true }).click(); await page.clock.runFor(500);
  expect(await viewport.getAttribute('style')).not.toBe(before);
  const box = await graph(page).boundingBox(); await page.mouse.move(box.x + 20, box.y + 80); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 110); await page.mouse.up();
  await page.clock.runFor(5000); expect(requests).toEqual([]); expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(saved);
  expect(await page.locator('.whiteboard .react-flow__viewport').getAttribute('style')).toBe(boardViewport);
  await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click(); await page.keyboard.press('Control+Z');
  await expect(page.locator('.whiteboard .react-flow__node')).toHaveCount(achievementFixture().nodes.length);
});

test('graph remains readable in Dark mode and minimum-width panels without changing layout when selecting', async ({ page }) => {
  await setup(page, { mode: 'dark' }); await choose(page, 's').click();
  const before = await graph(page).locator('.react-flow__node').evaluateAll(nodes => nodes.map(n => [n.dataset.id, n.style.transform]));
  const divider = page.getByRole('separator', { name: 'Resize analytics panels', exact: true }); await divider.focus(); await page.keyboard.press('End');
  expect(await detail(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await action(page, 'a').click();
  expect(await graph(page).locator('.react-flow__node').evaluateAll(nodes => nodes.map(n => [n.dataset.id, n.style.transform]))).toEqual(before);
  await expect(choose(page, 's')).toHaveCSS('background-color', 'rgb(38, 63, 97)');
  await graph(page).screenshot({ path: 'test-results/achievement-path-dark.png' });
});

test('wide converging graphs retain all branches without shrinking labels below the initial readable zoom', async ({ page }) => {
  const base = achievementFixture(), outcome = base.nodes.find(n => n.id === 's'), original = base.nodes.find(n => n.id === 'c');
  const actions = Array.from({ length: 40 }, (_, i) => ({ ...original, id: `wide-${i}`, data: { ...original.data, mistake: `Recorded Action ${i}` } }));
  const edges = actions.map((n, i) => ({ ...base.edges[0], id: `wide-edge-${i}`, source: n.id, target: 's' }));
  await setup(page, { diagram: { nodes: [outcome, ...actions], edges } }); await choose(page, 's').click();
  await expect(graph(page).locator('.react-flow__node')).toHaveCount(41); await expect(graph(page).locator('.react-flow__edge')).toHaveCount(40);
  const viewport = graph(page).locator('.react-flow__viewport'); await expect(viewport).toHaveAttribute('style', /scale\(0\.65\)/);
  await action(page, 'wide-39').click(); await expect(detail(page).locator('.achievement-selected-event')).toContainText('Recorded Action 39');
  await expect(graph(page).locator('.achievement-path-edge')).toHaveCount(1);
  expect(await detail(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test.describe('mobile achievement paths', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('touch selection and zoom retain a usable stacked layout and all original branches', async ({ page }) => {
    await setup(page); await choose(page, 's').tap(); await action(page, 'a').tap();
    await expect(graph(page).locator('.achievement-path-edge')).toHaveCount(4);
    await graph(page).getByRole('button', { name: 'Zoom Out', exact: true }).tap();
    expect(await page.getByRole('main', { name: 'Analytics', exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await detail(page).getByRole('button', { name: 'Clear selection', exact: true }).tap(); await expect(graph(page).locator('.achievement-dimmed')).toHaveCount(0);
  });
});
