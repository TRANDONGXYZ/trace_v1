import { test, expect } from '@playwright/test';

const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');
const saved = page => page.getByRole('status', { name: 'All changes saved locally' });
async function open(page) {
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function create(page, kind, date, text = kind) {
  await open(page); await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.getByLabel(kind, { exact: true }).fill(text);
  await page.getByLabel('Time', { exact: true }).fill(date); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function connect(page, from, to) {
  const a = await nodes(page).nth(from).locator('[data-handleid="right"]').boundingBox();
  const b = await nodes(page).nth(to).locator('[data-handleid="left"]').boundingBox();
  await page.mouse.move(a.x + 5, a.y + 5); await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 5, { steps: 2 });
  await page.mouse.move(b.x + 5, b.y + 5, { steps: 16 }); await page.mouse.up();
}
const snapshot = page => page.evaluate(() => ({
  nodes: [...document.querySelectorAll('.react-flow__node')].map(n => [n.dataset.id, n.style.transform, n.title, n.getAttribute('aria-label')]),
  edges: [...document.querySelectorAll('.react-flow__edge')].map(e => [e.dataset.id, e.querySelector('.react-flow__edge-path').getAttribute('d')]),
}));
const viewport = page => page.locator('.react-flow__viewport').evaluate(el => {
  const matrix = new DOMMatrix(getComputedStyle(el).transform); return { x: matrix.e, y: matrix.f, zoom: matrix.a };
});
async function countWrites(page) {
  await page.addInitScript(() => {
    window.diagramWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'trace.whiteboard.v1') window.diagramWrites++;
      return set.call(this, key, value);
    };
  });
}

test('dynamic labels preserve entered text; multiline Description and larger orange Consequences save and restore', async ({ page }) => {
  await page.goto('/'); await create(page, 'Action', '07/11/26');
  await nodes(page).first().click(); await open(page);
  await page.locator('#mistake').fill('Existing field content');
  for (const kind of ['Mistake', 'Consequence', 'Action', 'Blocked', 'Goal', 'Milestone', 'Success']) {
    await page.getByLabel('Type', { exact: true }).selectOption(kind);
    await expect(page.getByLabel(kind, { exact: true })).toHaveValue('Existing field content');
  }
  await page.getByLabel('Type', { exact: true }).selectOption('Consequence');
  const description = page.getByLabel('Description', { exact: true });
  await expect(description).toHaveJSProperty('tagName', 'TEXTAREA');
  expect((await description.boundingBox()).height).toBeGreaterThan(90);
  await description.fill('First line'); await description.press('Enter'); await page.keyboard.type('Second line');
  await expect(description).toHaveValue('First line\nSecond line');
  await expect(nodes(page)).toHaveCount(1);
  await page.getByLabel('Time', { exact: true }).fill('07/11/26');
  await description.focus(); await page.keyboard.press('Control+Enter');
  await expect(nodes(page)).toHaveCount(2);
  const consequence = nodes(page).nth(1);
  await expect(consequence.locator('.node-shape')).toHaveCSS('fill', 'rgb(246, 178, 107)');
  const a = await nodes(page).first().boundingBox(), b = await consequence.boundingBox();
  expect(a.height).toBeCloseTo(64); expect(b.width).toBeCloseTo(160); expect(b.height).toBeCloseTo(96);
  expect(b.y + b.height / 2).toBeCloseTo(a.y + a.height / 2);
  await expect(saved(page)).toBeVisible(); await page.reload();
  await expect(nodes(page)).toHaveCount(2);
  await expect(nodes(page).nth(1).locator('.event-node')).toHaveAttribute('title', 'Consequence\nExisting field content\n07/11/26\nFirst line\nSecond line');
  expect((await nodes(page).nth(1).boundingBox()).height).toBeCloseTo(96);
});

test('earlier Consequence shows the exact date error without a node, edge or history entry; same date succeeds', async ({ page }) => {
  await page.goto('/'); await create(page, 'Mistake', '08/11/26');
  await nodes(page).first().click(); const before = await snapshot(page); await open(page);
  await page.getByLabel('Consequence', { exact: true }).fill('Outcome');
  const time = page.getByLabel('Time', { exact: true });
  await time.fill('07/11/26'); await time.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('A Consequence must occur after the Mistake.');
  await expect(time).toBeFocused(); expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+Z');
  await expect(nodes(page)).toHaveCount(0); await page.keyboard.press('Control+Y');
  await nodes(page).first().click(); await create(page, 'Consequence', '08/11/26');
  await expect(edges(page)).toHaveCount(1); await expect(edges(page).first()).toContainText('0days');
});

test('same-date manual links can recreate automatic links and respect direction, self and type restrictions', async ({ page }) => {
  await page.goto('/'); await create(page, 'Action', '08/11/26');
  await nodes(page).first().click(); await create(page, 'Goal', '08/11/26');
  await edges(page).first().locator('.edge-label').click(); await page.keyboard.press('Delete');
  const before = await nodes(page).evaluateAll(ns => ns.map(n => n.style.transform));
  await connect(page, 0, 1); await expect(edges(page)).toHaveCount(1);
  await connect(page, 0, 1); await connect(page, 0, 0); await expect(edges(page)).toHaveCount(1);
  expect(await nodes(page).evaluateAll(ns => ns.map(n => n.style.transform))).toEqual(before);
  await page.keyboard.press('Escape'); await create(page, 'Mistake', '08/11/26');
  await nodes(page).nth(2).click(); await create(page, 'Consequence', '08/11/26');
  await edges(page).last().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await connect(page, 3, 2); await expect(edges(page)).toHaveCount(1);
  await connect(page, 2, 3); await expect(edges(page)).toHaveCount(2);
});

test('A -> B -> C node-only deletion, undo and redo retain exact positions, relationships and debounced saves', async ({ page }) => {
  await countWrites(page); await page.goto('/');
  await create(page, 'Action', '01/11/26'); await nodes(page).first().click(); await create(page, 'Goal', '02/11/26');
  await nodes(page).nth(1).click(); await create(page, 'Success', '03/11/26');
  await expect(saved(page)).toBeVisible(); const connected = await snapshot(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const writes = await page.evaluate(() => window.diagramWrites);
  await nodes(page).nth(1).click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(2); await expect(edges(page)).toHaveCount(0);
  const deleted = await snapshot(page);
  expect(deleted.nodes).toEqual([connected.nodes[0], connected.nodes[2]]);
  await page.keyboard.press('Control+Z'); expect(await snapshot(page)).toEqual(connected);
  await page.clock.runFor(4000);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(writes, 'returning to the saved snapshot needs no write');
  await page.keyboard.press('Control+Y'); expect(await snapshot(page)).toEqual(deleted);
  await page.clock.runFor(2999); expect(await page.evaluate(() => window.diagramWrites)).toBe(writes);
  await page.clock.runFor(1); await expect(saved(page)).toBeVisible();
  expect(await page.evaluate(() => window.diagramWrites)).toBe(writes + 1);
  await page.reload(); await expect(nodes(page)).toHaveCount(2); await expect(edges(page)).toHaveCount(0);
  await page.keyboard.press('Control+Z'); await expect(nodes(page)).toHaveCount(2, { timeout: 1000 });
});

test('edge undo/redo, ignored navigation, and branching after undo preserve content history', async ({ page }) => {
  await page.goto('/'); await create(page, 'Action', '08/11/26'); await create(page, 'Goal', '08/11/26');
  const disconnected = await snapshot(page);
  await connect(page, 0, 1); const connected = await snapshot(page);
  await page.keyboard.press('Control+Z'); await expect.poll(() => snapshot(page)).toEqual(disconnected);
  await page.keyboard.press('Control+Y'); await expect.poll(() => snapshot(page)).toEqual(connected);
  await nodes(page).last().dblclick(); await page.keyboard.press('Escape');
  await page.mouse.move(1000, 700); await page.mouse.wheel(10, 30);
  await page.keyboard.press('Control+Z'); await expect.poll(() => snapshot(page)).toEqual(disconnected);
  await create(page, 'Blocked', '09/11/26');
  const branched = await snapshot(page); await page.keyboard.press('Control+Y'); expect(await snapshot(page)).toEqual(branched);
  await nodes(page).first().click(); await create(page, 'Goal', '10/11/26');
  await edges(page).first().locator('.edge-label').click(); await page.keyboard.press('Delete');
  await expect(edges(page)).toHaveCount(0); await page.keyboard.press('Control+Z'); await expect(edges(page)).toHaveCount(1);
});

test('legacy saved fields, dimensions and layout are preserved while Consequences render consistently at the new height', async ({ page }) => {
  const graph = { nodes: [
    { id: 'old-m', type: 'event', position: { x: 240, y: 400 }, width: 160, height: 64,
      data: { kind: 'Mistake', mistake: 'Original text', description: 'Original description', time: Date.UTC(2026, 10, 8), placement: { mode: 'origin', origin: { x: 240, y: 400 } } } },
    { id: 'old-c', type: 'event', position: { x: 504, y: 400 }, width: 160, height: 64,
      data: { kind: 'Consequence', mistake: 'Original consequence', description: '', time: Date.UTC(2026, 10, 8), placement: { mode: 'row', referenceId: 'old-m', columnOffset: 264, selectedSameDate: true } } },
  ], edges: [{ id: 'old-edge', source: 'old-m', target: 'old-c', type: 'time', sourceHandle: 'right', targetHandle: 'left', data: { days: 0, value: '0', unit: 'days' } }] };
  const stored = JSON.stringify({ version: 1, graph });
  await page.addInitScript(value => localStorage.setItem('trace.whiteboard.v1', value), stored);
  await page.goto('/'); await expect(nodes(page)).toHaveCount(2);
  const before = await snapshot(page);
  expect(before.nodes.map(n => n[1])).toEqual(['translate(240px, 400px)', 'translate(504px, 400px)']);
  expect((await nodes(page).last().boundingBox()).height).toBeCloseTo(96);
  await expect(nodes(page).last().locator('.node-mistake')).toHaveText('Original consequence');
  await nodes(page).first().click(); await page.keyboard.press('Delete'); await expect(nodes(page)).toHaveCount(1);
  await page.keyboard.press('Control+Z'); await expect.poll(() => snapshot(page)).toEqual(before);
  await page.waitForTimeout(3100);
  expect(await page.evaluate(() => localStorage.getItem('trace.whiteboard.v1'))).toBe(stored);
});

test('Ctrl+Z/Y in input and multiline textarea stays in text editing instead of changing graph history', async ({ page }) => {
  await page.goto('/'); await create(page, 'Action', '08/11/26'); await open(page);
  const before = await snapshot(page);
  for (const field of [page.locator('#mistake'), page.getByLabel('Description', { exact: true })]) {
    await field.focus(); await page.keyboard.type('Text to undo');
    await page.keyboard.press('Control+Z'); await page.keyboard.press('Control+Y');
    expect(await snapshot(page)).toEqual(before); await expect(page.getByRole('dialog')).toBeVisible();
  }
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+Z'); await expect(nodes(page)).toHaveCount(0);
});

test('wheel pans in both requested directions, Ctrl-wheel and browser pinch zoom, with synchronized rulers and no save', async ({ page }) => {
  await countWrites(page); await page.goto('/'); await create(page, 'Action', '08/11/26');
  await expect(saved(page)).toBeVisible(); const writes = await page.evaluate(() => window.diagramWrites);
  const tick = page.getByTestId('horizontal-axis').locator('[data-month="11/26"]');
  const start = await viewport(page), startTick = await tick.boundingBox();
  await page.mouse.move(900, 600); await page.mouse.wheel(40, 80);
  await expect.poll(async () => (await viewport(page)).y).toBeCloseTo(start.y + 80, 0);
  expect((await viewport(page)).x).toBeCloseTo(start.x + 40, 0); expect((await viewport(page)).zoom).toBe(start.zoom);
  expect((await tick.boundingBox()).x).toBeCloseTo(startTick.x + 40, 0);
  await page.mouse.wheel(-40, -80); await expect.poll(async () => (await viewport(page)).y).toBeCloseTo(start.y, 0);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -80); await page.keyboard.up('Control');
  await expect.poll(async () => (await viewport(page)).zoom).toBeGreaterThan(start.zoom);
  const zoomed = (await viewport(page)).zoom;
  // Chromium encodes trackpad pinch as a wheel event with ctrlKey, without a keyboard Control press.
  await page.locator('.react-flow__pane').dispatchEvent('wheel', { deltaY: 20, ctrlKey: true, clientX: 900, clientY: 600, bubbles: true, cancelable: true });
  await expect.poll(async () => (await viewport(page)).zoom).toBeLessThan(zoomed);
  await page.mouse.dblclick(1100, 700); expect((await viewport(page)).zoom).toBeLessThan(zoomed);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(writes);
  await page.keyboard.press('Control+Z'); await expect(nodes(page)).toHaveCount(0);
});
