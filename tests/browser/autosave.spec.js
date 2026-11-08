import { test, expect } from '@playwright/test';
import { createEvent, connectNodes, parseDate } from '../../src/model.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';

const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');
const confirmation = page => page.getByRole('status', { name: 'All changes saved locally' });
const writes = page => page.evaluate(() => window.diagramWrites);
const stored = page => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);

async function setup(page, initialValue = null) {
  await page.clock.install({ time: new Date('2026-11-07T05:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-07T05:00:01Z'));
  await page.addInitScript(({ key, initialValue }) => {
    if (!sessionStorage.getItem('autosave-test-seeded')) {
      if (initialValue !== null) localStorage.setItem(key, initialValue);
      sessionStorage.setItem('autosave-test-seeded', 'yes');
    }
    window.diagramWrites = [];
    const original = Storage.prototype.setItem;
    window.allowDiagramWrites = () => { window.blockDiagramWrites = false; };
    Storage.prototype.setItem = function (storageKey, value) {
      if (this === localStorage && storageKey === key) {
        if (window.blockDiagramWrites) throw new DOMException('Storage is full', 'QuotaExceededError');
        original.call(this, storageKey, value);
        window.diagramWrites.push({ value, time: Date.now() });
      } else original.call(this, storageKey, value);
    };
  }, { key: STORAGE_KEY, initialValue });
  await page.goto('/');
  await page.clock.runFor(32);
}

async function create(page, date, kind = 'Action') {
  await page.getByRole('main').focus();
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Type', { exact: true })).toBeFocused();
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.getByLabel('Mistake', { exact: true }).fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill(date);
  await page.getByLabel('Description', { exact: true }).fill('Keep this description.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

function fixture() {
  let graph = { nodes: [], edges: [] };
  const dates = ['07/11/26', '07/11/26', '08/11/26', '09/11/26', '10/11/26', '11/11/26', '12/11/26'];
  for (const [i, kind] of ['Mistake', 'Consequence', 'Action', 'Goal', 'Blocked', 'Milestone', 'Success'].entries()) {
    graph = createEvent(graph, {
      kind, mistake: `Event ${i}: café 👩🏽‍💻`, description: `Details for ${kind}`, id: `node-${i}`,
      time: parseDate(dates[i]),
      selectedId: kind === 'Consequence' ? 'node-0' : undefined,
      firstPosition: { x: 200, y: 850 },
    });
  }
  graph = connectNodes(graph, { source: 'node-2', target: 'node-3', sourceHandle: 'right', targetHandle: 'top' });
  graph = connectNodes(graph, { source: 'node-3', target: 'node-4', sourceHandle: 'top', targetHandle: 'left' });
  return graph;
}

test('autosave waits three seconds after the latest content change; interactions neither save nor reset its timer', async ({ page }) => {
  await setup(page);
  await expect(confirmation(page)).toHaveCount(0);
  expect(await writes(page)).toHaveLength(0);
  await create(page, '07/11/26');
  await page.clock.runFor(2000);
  await create(page, '08/11/26', 'Goal');
  await page.clock.runFor(2000);
  // The first edit's original deadline has passed, but the new debounce has not.
  expect(await stored(page)).toBeNull();
  await nodes(page).first().click();
  await nodes(page).last().dblclick();
  await page.keyboard.press('Escape');
  await page.mouse.move(1100, 800); await page.mouse.down(); await page.mouse.move(1160, 840, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await page.clock.runFor(999);
  expect(await writes(page)).toHaveLength(0);
  await expect(confirmation(page)).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(confirmation(page)).toBeVisible();
  expect(await writes(page)).toHaveLength(1);
  const snapshot = JSON.parse(await stored(page));
  expect(snapshot.graph.nodes).toHaveLength(2);
  expect(snapshot.graph.edges).toEqual([]);
  expect(snapshot).not.toHaveProperty('viewport');
  for (const node of snapshot.graph.nodes) {
    expect(node).not.toHaveProperty('selected');
    expect(node.data).not.toHaveProperty('chainHighlighted');
  }
  await page.clock.runFor(32);
  await nodes(page).first().click();
  await page.keyboard.type('/n'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.clock.runFor(5000);
  expect(await writes(page)).toHaveLength(1);
  expect(JSON.parse(await stored(page))).toEqual(snapshot);
  const source = await nodes(page).first().locator('[data-handleid="right"]').boundingBox();
  const target = await nodes(page).last().locator('[data-handleid="left"]').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(edges(page)).toHaveCount(1);
  await expect(confirmation(page)).toHaveCount(0);
  await page.clock.runFor(2999);
  expect(await writes(page)).toHaveLength(1);
  await page.clock.runFor(1);
  await expect(confirmation(page)).toBeVisible();
  const manual = JSON.parse(await stored(page)).graph.edges[0];
  expect(manual.data.manual).toBe(true);
  expect(manual.sourceHandle).toBe('right');
  expect(manual.targetHandle).toBe('left');
  expect(manual.data).not.toHaveProperty('highlighted');
  await edges(page).first().locator('.edge-label').click();
  await page.clock.runFor(4000);
  expect(await writes(page)).toHaveLength(2);
  await page.keyboard.press('Escape');
  await create(page, '09/11/26', 'Goal');
  await expect(confirmation(page)).toHaveCount(0);
  await page.clock.runFor(2999);
  expect(await writes(page)).toHaveLength(2);
  await page.clock.runFor(1);
  await expect(confirmation(page)).toBeVisible();
  expect(await writes(page)).toHaveLength(3);
  await page.screenshot({ path: 'test-results/local-autosave.png' });
});

test('all saved node and edge data restore exactly; edge deletion, node deletion, and empty diagrams are saved and restored', async ({ page, context }) => {
  await page.setViewportSize({ width: 2400, height: 1400 });
  const graph = fixture();
  await setup(page, serializeDiagram(graph));
  await expect(nodes(page)).toHaveCount(7);
  await expect(edges(page)).toHaveCount(3);
  await expect(confirmation(page)).toBeVisible();
  const transforms = await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform));
  const paths = await edges(page).locator('.react-flow__edge-path').evaluateAll(elements => elements.map(el => el.getAttribute('d')));
  for (const [i, node] of graph.nodes.entries()) {
    await expect(nodes(page).nth(i)).toHaveAttribute('data-id', node.id);
    await expect(nodes(page).nth(i).locator('.event-node')).toHaveAttribute('title', `${node.data.kind}\n${node.data.mistake}\n${node.ariaLabel.split(', ')[1]}\n${node.data.description}`);
  }
  await page.clock.runFor(4000);
  expect(await writes(page)).toHaveLength(0);
  await page.reload(); await page.clock.runFor(32);
  expect(await nodes(page).evaluateAll(elements => elements.map(el => el.style.transform))).toEqual(transforms);
  expect(await edges(page).locator('.react-flow__edge-path').evaluateAll(elements => elements.map(el => el.getAttribute('d')))).toEqual(paths);
  expect(JSON.parse(await stored(page)).graph).toEqual(graph);
  // Reopening in another tab of the same browser also restores the diagram.
  const reopened = await context.newPage();
  await reopened.goto('/'); await expect(nodes(reopened)).toHaveCount(7); await expect(edges(reopened)).toHaveCount(3); await reopened.close();
  await edges(page).last().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await expect(confirmation(page)).toHaveCount(0);
  await page.clock.runFor(3000);
  const afterEdge = JSON.parse(await stored(page)).graph;
  expect(afterEdge.nodes).toEqual(graph.nodes);
  expect(afterEdge.edges).toEqual(graph.edges.slice(0, -1));
  await page.reload(); await page.clock.runFor(32);
  await expect(nodes(page)).toHaveCount(7); await expect(edges(page)).toHaveCount(2);
  await nodes(page).last().click(); await page.keyboard.press('Delete');
  await page.clock.runFor(3000);
  await page.reload(); await page.clock.runFor(32);
  await expect(nodes(page)).toHaveCount(6);
  // Restored placement metadata must support further node creation and layout.
  await nodes(page).first().click(); await create(page, '07/11/26', 'Consequence');
  await page.clock.runFor(3000);
  await page.reload(); await page.clock.runFor(32);
  await expect(nodes(page)).toHaveCount(7); await expect(edges(page)).toHaveCount(3);
  while (await nodes(page).count()) {
    await nodes(page).first().click(); await page.keyboard.press('Delete');
    await page.clock.runFor(32);
  }
  await page.clock.runFor(3000);
  expect(JSON.parse(await stored(page)).graph).toEqual({ nodes: [], edges: [] });
  await page.reload(); await page.clock.runFor(32);
  await expect(nodes(page)).toHaveCount(0); await expect(edges(page)).toHaveCount(0);
  await expect(confirmation(page)).toBeVisible();
});

test('failed storage writes never confirm a save or replace the previous saved diagram', async ({ page }) => {
  const graph = fixture();
  await setup(page, serializeDiagram(graph));
  await page.evaluate(() => { window.blockDiagramWrites = true; });
  await create(page, '13/11/26', 'Goal');
  await expect(confirmation(page)).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect(confirmation(page)).toHaveCount(0);
  await expect(nodes(page)).toHaveCount(8);
  expect(await writes(page)).toHaveLength(0);
  expect(JSON.parse(await stored(page)).graph).toEqual(graph);
  await page.evaluate(() => window.allowDiagramWrites());
  await create(page, '14/11/26', 'Goal');
  await page.clock.runFor(3000);
  await expect(confirmation(page)).toBeVisible();
  expect(JSON.parse(await stored(page)).graph.nodes).toHaveLength(9);
});

test('damaged or inaccessible local storage does not crash the board or falsely show confirmation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page, '{broken json');
  await expect(nodes(page)).toHaveCount(0);
  await expect(confirmation(page)).toHaveCount(0);
  await page.clock.runFor(4000);
  expect(await stored(page)).toBe('{broken json');
  expect(await writes(page)).toHaveLength(0);
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, graph: { nodes: [{}], edges: [] } })), STORAGE_KEY);
  await page.reload(); await page.clock.runFor(32);
  await expect(nodes(page)).toHaveCount(0);
  await expect(confirmation(page)).toHaveCount(0);
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } }));
  await page.reload(); await page.clock.runFor(32);
  await create(page, '07/11/26', 'Goal');
  await page.clock.runFor(3000);
  await expect(nodes(page)).toHaveCount(1);
  await expect(confirmation(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
