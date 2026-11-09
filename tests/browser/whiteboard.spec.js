import { test, expect } from '@playwright/test';

async function create(page, time, kind = 'Action') {
  await expect(page.getByRole('main', { name: 'Timeline whiteboard' })).toBeVisible();
  await page.keyboard.type('/n');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.locator('#mistake').fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill(time);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
const nodes = page => page.locator('.react-flow__node');
const edges = page => page.locator('.react-flow__edge');

test('keyboard creation, validation, positioning, chronological edges, highlighting, restrictions, node-only delete', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Timeline whiteboard' })).toBeVisible();
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Type', { exact: true }).selectOption('Action');
  await page.locator('#mistake').fill('Lost focus');
  await page.getByLabel('Time', { exact: true }).fill('31/02/26'); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Enter a valid date in DD/MM/YY format.');
  await page.getByLabel('Time', { exact: true }).fill('01/11/26'); await page.keyboard.press('Enter');
  await expect(nodes(page)).toHaveCount(1);
  const root = nodes(page).first();
  const box = await root.boundingBox();
  expect(box.x + box.width / 2).toBeCloseTo(360, 0);
  await root.click();
  await create(page, '06/11/26', 'Action');
  await expect(edges(page)).toHaveCount(1);
  const childBox = await nodes(page).nth(1).boundingBox();
  expect(childBox.y).toBeCloseTo(box.y, 0);
  expect(childBox.x).toBeGreaterThan(box.x + 240);
  await expect(page.locator('.edge-label')).toContainText('5days');
  await page.locator('.edge-label').click();
  await expect(page.locator('.edge-label')).toHaveClass(/highlighted/);
  await expect(edges(page).first().locator('..')).toHaveCSS('z-index', '1000');
  await expect(edges(page).locator('path.react-flow__edge-path')).toHaveAttribute('marker-end', /url\(#arrow-/);
  await page.locator('.edge-label').click();
  await expect(page.locator('.edge-label')).not.toHaveClass(/highlighted/);
  await root.click();
  await create(page, '01/01/27');
  const branchBox = await nodes(page).nth(2).boundingBox();
  expect(branchBox.y).toBeLessThan(box.y);
  await expect(edges(page)).toHaveCount(2);
  expect(await edges(page).nth(1).locator('.react-flow__edge-path').getAttribute('d')).toContain(' Q ');
  await root.click();
  const before = await root.evaluate(element => element.style.transform);
  await page.mouse.move(box.x + 40, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 100, { steps: 10 }); await page.mouse.up();
  expect(await root.evaluate(element => element.style.transform)).toBe(before);
  await root.focus(); await page.keyboard.press('ArrowRight');
  expect(await root.evaluate(element => element.style.transform)).toBe(before);
  await root.click();
  await create(page, '01/11/26');
  await expect(nodes(page)).toHaveCount(4);
  await expect(edges(page)).toHaveCount(3);
  const stacked = await nodes(page).nth(3).boundingBox();
  expect(stacked.x).toBeCloseTo(box.x + 264, 0);
  expect(stacked.y).toBeCloseTo(branchBox.y - 128, 0);
  await page.screenshot({ path: 'test-results/whiteboard.png' });
  await root.click(); await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(3);
  await expect(edges(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('axes follow pan/zoom, use unique month starts, and keep their viewport edges', async ({ page }) => {
  await page.goto('/');
  await create(page, '01/11/26');
  await create(page, '05/11/26');
  await expect(edges(page)).toHaveCount(0);
  for (const axis of ['horizontal-axis', 'vertical-axis']) {
    const items = page.getByTestId(axis).locator('[data-month="11/26"]');
    await expect(items).toHaveCount(1);
    expect(new Date(Number(await items.getAttribute('data-time'))).getUTCDate()).toBe(1);
  }
  const tick = page.getByTestId('horizontal-axis').locator('[data-month="11/26"]');
  const axisBox = await page.getByTestId('horizontal-axis').boundingBox();
  const original = await tick.boundingBox();
  await page.mouse.move(1000, 800); await page.mouse.down(); await page.mouse.move(1100, 850, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await tick.boundingBox()).x).toBeCloseTo(original.x + 100, 0);
  const panned = await tick.boundingBox();
  await page.mouse.move(900, 700); await page.keyboard.down('Control'); await page.mouse.wheel(0, -250); await page.keyboard.up('Control');
  await expect.poll(async () => (await tick.boundingBox()).x).not.toBeCloseTo(panned.x, 0);
  expect(await page.getByTestId('horizontal-axis').boundingBox()).toEqual(axisBox);
  await page.setViewportSize({ width: 850, height: 700 });
  await expect(page.getByTestId('horizontal-axis')).toHaveCSS('bottom', '0px');
});

test('creating an earlier event points forward; empty click clears selection; Escape cancels', async ({ page }) => {
  await page.goto('/');
  await create(page, '06/11/26');
  await nodes(page).first().click();
  const laterId = await nodes(page).first().getAttribute('data-id');
  await create(page, '01/11/26', 'Action');
  const earlierId = await nodes(page).nth(1).getAttribute('data-id');
  await expect(edges(page)).toHaveAttribute('data-id', `edge-${earlierId}-${laterId}`);
  await page.mouse.click(1100, 800);
  await create(page, '15/11/26');
  await expect(edges(page)).toHaveCount(1);
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(nodes(page)).toHaveCount(3);
});

test('reported November branches remain compact, January stays after December, and labels do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/');
  await create(page, '07/11/26');
  await create(page, '07/11/26', 'Action');
  const root = nodes(page).nth(1);
  await root.click();
  await create(page, '12/11/26');
  await nodes(page).nth(2).click();
  await create(page, '12/12/26', 'Action');
  await root.click();
  await create(page, '13/11/26');
  await create(page, '14/11/26');
  const rootBox = await root.boundingBox();
  const five = await nodes(page).nth(2).boundingBox();
  const six = await nodes(page).nth(4).boundingBox();
  const seven = await nodes(page).nth(5).boundingBox();
  const distance = n => Math.hypot(n.x - rootBox.x, n.y - rootBox.y);
  expect(distance(six) / distance(five)).toBeLessThan(1.25);
  expect(six.y - seven.y).toBeCloseTo(128, 0);
  expect(six.x - five.x).toBeLessThan(10);
  expect(seven.x - six.x).toBeLessThan(10);
  await create(page, '12/01/27');
  await create(page, '12/01/27');
  await expect(nodes(page)).toHaveCount(8);
  const december = await page.getByTestId('horizontal-axis').locator('[data-month="12/26"]').boundingBox();
  const january = await page.getByTestId('horizontal-axis').locator('[data-month="01/27"]').boundingBox();
  for (const index of [6, 7]) {
    const box = await nodes(page).nth(index).boundingBox();
    expect(box.x + box.width / 2).toBeGreaterThan(december.x + december.width / 2);
    expect(box.x + box.width / 2).toBeGreaterThan(january.x + january.width / 2);
  }
  const labels = await page.locator('.edge-label').all();
  const nodeBoxes = await Promise.all((await nodes(page).all()).map(n => n.boundingBox()));
  for (const label of labels) {
    const a = await label.boundingBox();
    for (const b of nodeBoxes) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBeTruthy();
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = await labels[i].boundingBox();
    const b = await labels[j].boundingBox();
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBeTruthy();
  }
  await page.screenshot({ path: 'test-results/reported-timeline.png' });
});

test('selection stroke is identical for Mistake and Action, with exactly one selected node', async ({ page }) => {
  await page.goto('/');
  await create(page, '07/11/26', 'Mistake');
  await create(page, '07/11/26', 'Action');
  const styles = [];
  for (const index of [0, 1, 0]) {
    await nodes(page).nth(index).click();
    await expect(page.locator('.selection-outline')).toHaveCount(1);
    await expect(nodes(page).nth(index).locator('.selection-outline')).toBeVisible();
    styles.push(await nodes(page).nth(index).locator('.selection-outline').evaluate(element => {
      const style = getComputedStyle(element);
      return [style.stroke, style.strokeWidth, style.opacity, style.filter, style.fill];
    }));
  }
  expect(styles[0]).toEqual(['rgb(36, 89, 203)', '3px', '1', 'none', 'none']);
  expect(styles[1]).toEqual(styles[0]);
  expect(styles[2]).toEqual(styles[0]);
  await page.screenshot({ path: 'test-results/selection.png' });
});

test('first node remains at one-quarter screen width when created after zooming', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await page.mouse.move(900, 700);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
  await expect.poll(async () => page.locator('.react-flow__viewport').evaluate(element => element.style.transform)).not.toContain('scale(1)');
  await create(page, '07/11/26');
  const box = await nodes(page).first().boundingBox();
  expect(box.x + box.width / 2).toBeCloseTo(360, 0);
});

test('vertical January marker follows the actual January branch before and after pan and zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/');
  await create(page, '04/11/26');
  const root = nodes(page).first();
  await root.click(); await create(page, '07/11/26', 'Action');
  await nodes(page).nth(1).click(); await create(page, '12/11/26');
  await nodes(page).nth(2).click(); await create(page, '12/12/26', 'Action');
  await root.click(); await create(page, '09/11/26');
  await nodes(page).nth(4).click(); await create(page, '13/11/26');
  await root.click(); await create(page, '09/11/26');
  await nodes(page).nth(6).click(); await create(page, '14/11/26');
  await root.click(); await create(page, '12/01/27');
  const januaryNode = nodes(page).nth(8);
  const januaryTick = page.getByTestId('vertical-axis').locator('[data-month="01/27"]');
  const decemberTick = page.getByTestId('vertical-axis').locator('[data-month="12/26"]');
  const checkAlignment = async () => {
    await expect(januaryTick).toHaveCount(1);
    await expect(januaryTick).toBeVisible();
    expect(Number(await januaryTick.getAttribute('data-time'))).toBe(Date.UTC(2027, 0, 1));
    const jan = await januaryNode.boundingBox();
    const nov = await nodes(page).nth(6).boundingBox();
    const tick = await januaryTick.boundingBox();
    const december = await decemberTick.boundingBox();
    const janCenter = jan.y + jan.height / 2;
    const novCenter = nov.y + nov.height / 2;
    const tickCenter = tick.y + tick.height / 2;
    expect(janCenter).toBeLessThan(tickCenter);
    expect(tickCenter).toBeLessThan(december.y + december.height / 2);
    const fraction = (Date.UTC(2027, 0, 1) - Date.UTC(2026, 10, 9)) / (Date.UTC(2027, 0, 12) - Date.UTC(2026, 10, 9));
    expect(Math.abs(tickCenter - (novCenter + fraction * (janCenter - novCenter)))).toBeLessThan(1);
  };
  await checkAlignment();
  await page.mouse.move(1250, 900); await page.mouse.down(); await page.mouse.move(1190, 980, { steps: 10 }); await page.mouse.up();
  await checkAlignment();
  await page.mouse.move(800, 600); await page.keyboard.down('Control'); await page.mouse.wheel(0, 180); await page.keyboard.up('Control');
  await expect.poll(async () => page.locator('.react-flow__viewport').evaluate(el => el.style.transform)).not.toContain('scale(1)');
  await checkAlignment();
  await page.screenshot({ path: 'test-results/vertical-january-regression.png' });
});

test('January-May-May-March reproduction preserves predecessor spacing and alignment on both time axes', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/');
  for (const date of ['12/01/27', '15/05/27', '16/05/27', '13/03/27']) await create(page, date);
  await expect(nodes(page)).toHaveCount(4);
  await expect(edges(page)).toHaveCount(0);
  const checkTimeline = async () => {
    // Read all rectangles in one browser frame, including during viewport zoom.
    const actual = await page.evaluate(() => {
      const center = element => {
        const r = element.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width };
      };
      const tick = (axis, month) => {
        const elements = document.querySelectorAll(`[data-testid="${axis}-axis"] [data-month="${month}"]`);
        if (elements.length !== 1) throw new Error(`Expected one ${axis} marker for ${month}, got ${elements.length}`);
        return { ...center(elements[0]), time: Number(elements[0].getAttribute('data-time')) };
      };
      return {
        nodes: [...document.querySelectorAll('.react-flow__node')].map(center),
        xMarch: tick('horizontal', '03/27'), yMarch: tick('vertical', '03/27'),
        xMay: tick('horizontal', '05/27'), yMay: tick('vertical', '05/27'),
      };
    });
    const [january, may15, may16, march] = actual.nodes;
    const order = [january, march, may15, may16];
    for (let i = 1; i < order.length; i++) {
      expect(order[i].x).toBeGreaterThan(order[i - 1].x);
      expect(order[i].y).toBeLessThan(order[i - 1].y);
    }
    const zoom = march.width / 160;
    const growth = 90 * Math.log1p(60 / 14);
    expect(Math.abs(march.x - january.x - (264 + growth) * zoom)).toBeLessThan(1);
    expect(Math.abs(january.y - march.y - (128 + growth) * zoom)).toBeLessThan(1);
    expect(actual.xMarch.time).toBe(Date.UTC(2027, 2, 1));
    expect(actual.yMarch.time).toBe(Date.UTC(2027, 2, 1));
    expect(march.x).toBeGreaterThan(actual.xMarch.x);
    expect(march.x).toBeLessThan(actual.xMay.x);
    expect(march.y).toBeLessThan(actual.yMarch.y);
    expect(march.y).toBeGreaterThan(actual.yMay.y);
    for (const axis of ['x', 'y']) {
      const marchStart = january[axis] + (march[axis] - january[axis]) * 48 / 60;
      const mayStart = march[axis] + (may15[axis] - march[axis]) * 49 / 63;
      expect(Math.abs(actual[`${axis}March`][axis] - marchStart)).toBeLessThan(1);
      expect(Math.abs(actual[`${axis}May`][axis] - mayStart)).toBeLessThan(1);
    }
  };
  await checkTimeline();
  await page.mouse.move(1300, 950); await page.mouse.down(); await page.mouse.move(1220, 1010, { steps: 10 }); await page.mouse.up();
  await checkTimeline();
  await page.mouse.move(800, 600); await page.keyboard.down('Control'); await page.mouse.wheel(0, 180); await page.keyboard.up('Control');
  await expect.poll(async () => page.locator('.react-flow__viewport').evaluate(el => el.style.transform)).not.toContain('scale(1)');
  await checkTimeline();
  await page.screenshot({ path: 'test-results/march-predecessor-regression.png' });
});

test('April 30 remains between April and May markers beside a connected cluster', async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto('/');
  await create(page, '04/11/26');
  const root = nodes(page).first();
  await root.click(); await create(page, '07/11/26', 'Action');
  await create(page, '09/11/26');
  await create(page, '09/11/26');
  await nodes(page).nth(3).click(); await create(page, '14/11/26', 'Action');
  await root.click(); await create(page, '12/01/27');
  await expect(edges(page)).toHaveCount(5);
  await page.mouse.click(1300, 1200);
  for (const date of ['15/05/27', '16/05/27', '13/03/27', '30/04/27']) await create(page, date);
  await expect(nodes(page)).toHaveCount(10);
  await expect(edges(page)).toHaveCount(5);
  // Frame the long timeline without changing node selection or placement.
  await page.mouse.move(1000, 900); await page.keyboard.down('Control'); await page.mouse.wheel(0, 360); await page.keyboard.up('Control');
  await expect.poll(async () => page.locator('.react-flow__viewport').evaluate(el => el.style.transform)).not.toContain('scale(1)');
  const checkTimeline = async () => {
    const actual = await page.evaluate(() => {
      const center = el => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      };
      const tick = (axis, month) => {
        const elements = document.querySelectorAll(`[data-testid="${axis}-axis"] [data-month="${month}"]`);
        if (elements.length !== 1) throw new Error(`Expected one ${axis} marker for ${month}`);
        return { ...center(elements[0]), time: Number(elements[0].getAttribute('data-time')) };
      };
      return {
        nodes: [...document.querySelectorAll('.react-flow__node')].map(center),
        xApril: tick('horizontal', '04/27'), yApril: tick('vertical', '04/27'),
        xMay: tick('horizontal', '05/27'), yMay: tick('vertical', '05/27'),
      };
    });
    const january = actual.nodes[5];
    const [may15, may16, march, april] = actual.nodes.slice(6);
    const ordered = [january, march, april, may15, may16];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].x).toBeGreaterThan(ordered[i - 1].x);
      expect(ordered[i].y).toBeLessThan(ordered[i - 1].y);
    }
    expect(april.x).toBeGreaterThan(actual.xApril.x);
    expect(april.x).toBeLessThan(actual.xMay.x);
    expect(april.y).toBeLessThan(actual.yApril.y);
    expect(april.y).toBeGreaterThan(actual.yMay.y);
    expect(actual.xApril.time).toBe(Date.UTC(2027, 3, 1));
    expect(actual.yApril.time).toBe(Date.UTC(2027, 3, 1));
    for (const axis of ['x', 'y']) {
      const aprilStart = march[axis] + (april[axis] - march[axis]) * 19 / 48;
      const mayStart = april[axis] + (may15[axis] - april[axis]) / 15;
      expect(Math.abs(actual[`${axis}April`][axis] - aprilStart)).toBeLessThan(1);
      expect(Math.abs(actual[`${axis}May`][axis] - mayStart)).toBeLessThan(1);
    }
    expect(actual.nodes[0].y).toBeCloseTo(actual.nodes[1].y, 1);
    expect(actual.nodes[3].y).toBeCloseTo(actual.nodes[4].y, 1);
  };
  await checkTimeline();
  await page.mouse.move(1700, 1150); await page.mouse.down(); await page.mouse.move(1630, 1210, { steps: 10 }); await page.mouse.up();
  await checkTimeline();
  await page.screenshot({ path: 'test-results/april-with-connected-cluster.png' });
});

test('screenshot case: April aligns when May 15 has an upward connection to the November branch', async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto('/');
  await create(page, '04/11/26');
  const root = nodes(page).first();
  await root.click(); await create(page, '07/11/26', 'Action');
  await create(page, '09/11/26');
  await create(page, '09/11/26');
  const branch = nodes(page).nth(3);
  await branch.click(); await create(page, '14/11/26');
  await root.click(); await create(page, '12/01/27');
  // The distinguishing detail in the screenshot: May 15 is connected to the
  // upper November 9 node, rather than being an independent future node.
  await branch.click(); await create(page, '15/05/27');
  const branchId = await branch.getAttribute('data-id');
  const mayId = await nodes(page).nth(6).getAttribute('data-id');
  const mayEdge = page.locator(`.react-flow__edge[data-id="edge-${branchId}-${mayId}"]`);
  await expect(mayEdge).toHaveCount(1);
  await expect(mayEdge.locator('.edge-label')).toContainText('6.19months');
  await page.mouse.click(1500, 1250);
  for (const date of ['16/05/27', '13/03/27', '30/04/27']) await create(page, date);
  await expect(nodes(page)).toHaveCount(10);
  await expect(edges(page)).toHaveCount(6);
  await page.mouse.move(1000, 1000); await page.keyboard.down('Control'); await page.mouse.wheel(0, 400); await page.keyboard.up('Control');
  await expect(page.getByTestId('horizontal-axis').locator('[data-month="05/27"]')).toHaveCount(1);
  const checkAlignment = async () => {
    const actual = await page.evaluate(() => {
      const center = el => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      };
      const tick = (axis, month) => {
        const matches = document.querySelectorAll(`[data-testid="${axis}-axis"] [data-month="${month}"]`);
        if (matches.length !== 1) throw new Error(`Expected one ${axis} tick for ${month}`);
        return { ...center(matches[0]), time: Number(matches[0].getAttribute('data-time')) };
      };
      return {
        nodes: [...document.querySelectorAll('.react-flow__node')].map(center),
        xApril: tick('horizontal', '04/27'), yApril: tick('vertical', '04/27'),
        xMay: tick('horizontal', '05/27'), yMay: tick('vertical', '05/27'),
      };
    });
    const [may15, may16, march, april] = actual.nodes.slice(6);
    const ordered = [actual.nodes[5], march, april, may15, may16];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].x).toBeGreaterThan(ordered[i - 1].x);
      expect(ordered[i].y).toBeLessThan(ordered[i - 1].y);
    }
    expect(april.x).toBeGreaterThan(actual.xApril.x);
    expect(april.x).toBeLessThan(actual.xMay.x);
    expect(april.y).toBeLessThan(actual.yApril.y);
    expect(april.y).toBeGreaterThan(actual.yMay.y);
    for (const axis of ['x', 'y']) {
      expect(actual[`${axis}April`].time).toBe(Date.UTC(2027, 3, 1));
      expect(actual[`${axis}May`].time).toBe(Date.UTC(2027, 4, 1));
      expect(Math.abs(actual[`${axis}April`][axis] - (march[axis] + (april[axis] - march[axis]) * 19 / 48))).toBeLessThan(1);
      expect(Math.abs(actual[`${axis}May`][axis] - (april[axis] + (may15[axis] - april[axis]) / 15))).toBeLessThan(1);
    }
    expect(actual.nodes[0].y).toBeCloseTo(actual.nodes[1].y, 1);
    expect(actual.nodes[3].y).toBeCloseTo(actual.nodes[4].y, 1);
  };
  await checkAlignment();
  await expect(mayEdge.locator('.react-flow__edge-path')).toHaveAttribute('d', / Q /);
  await page.mouse.move(1700, 1150); await page.mouse.down(); await page.mouse.move(1630, 1210, { steps: 10 }); await page.mouse.up();
  await checkAlignment();
  await nodes(page).nth(9).click();
  await checkAlignment();
  await page.screenshot({ path: 'test-results/april-connected-may-regression.png' });
});
