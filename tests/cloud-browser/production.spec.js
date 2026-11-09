import { test, expect } from '@playwright/test';
import { createEvent, connectNodes, parseDate } from '../../src/model.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { CLOUD_EMBEDDING_DIMENSIONS } from '../../shared/ai-models.js';

function fixture() {
  let graph = { nodes: [], edges: [] };
  const rows = [
    ['a', 'Mistake', '14/10/26', 'Ham thành tích mà không biết dừng lại nghỉ ngơi.'],
    ['b', 'Mistake', '15/10/26', 'Kỹ thuật chạy bộ sai mà vẫn ráng chạy vì sợ giảm thành tích.'],
    ['c', 'Mistake', '16/10/26', 'Tôi chạy bộ sai kỹ thuật vì chưa được hướng dẫn đúng.'],
    ['action', 'Action', '10/10/26', 'PRIVATE ACTION NOT FOR AI'],
    ['success', 'Success', '20/10/26', 'PRIVATE SUCCESS NOT FOR AI'],
  ];
  for (const [id, kind, date, mistake] of rows) graph = createEvent(graph, {
    id, kind, mistake, description: '', time: parseDate(date), firstPosition: { x: 240, y: 800 },
  });
  return connectNodes(graph, { source: 'action', target: 'success', sourceHandle: 'right', targetHandle: 'left' });
}
async function seed(page, graph = fixture()) {
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00+07:00'));
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('production-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('production-seeded', 'yes'); }
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) { if (name === key) window.diagramWrites++; return original.call(this, name, value); };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph) });
  await page.goto('/');
}
const overview = page => page.getByRole('dialog', { name: 'Mistake overview' });
const explanations = page => page.getByRole('region', { name: 'Possible explanations', exact: true });
async function open(page) { await page.getByRole('button', { name: 'Mistake overview', exact: true }).click(); }
async function mockAI(page, calls, { holdExplanation } = {}) {
  await page.route('**/api/ai/*', async route => {
    const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON(); calls.push({ path, body });
    let result;
    if (path.endsWith('/embed')) result = { embeddings: body.texts.map((_text, i) => Array.from({ length: CLOUD_EMBEDDING_DIMENSIONS }, (_, j) => i === j ? 1 : 0)) };
    else if (path.endsWith('/profile')) {
      const knowledge = body.text.includes('hướng dẫn');
      result = { mechanism: knowledge ? 'knowledge_gap' : 'overvalued_goal', priority_quote: knowledge ? '' : body.text,
        priority_label: knowledge ? '' : 'achievement', behavior_label: 'Reported behavior', priority_domain: knowledge ? 'none' : 'achievement_performance' };
    } else {
      if (holdExplanation) await holdExplanation;
      result = { evidence_ids: ['R1', 'R2'], observed_pattern: 'Thành tích được ưu tiên hơn nghỉ ngơi và sửa kỹ thuật.',
        explanation: 'Có thể nhu cầu chứng minh năng lực đang chi phối quyết định; đây là giả thuyết cần đối chiếu với trải nghiệm thực tế.' };
    }
    await route.fulfill({ json: { result } }).catch(() => {});
  });
}

test('production uses cloud task contracts, preserves recorded progress and stores reusable insights only in the browser', async ({ page }) => {
  const calls = [], localRequests = [];
  page.on('request', request => { if (request.url().includes(':11434')) localRequests.push(request.url()); });
  await mockAI(page, calls); const graph = fixture(); await seed(page, graph); await open(page);
  await expect(overview(page)).toContainText('relevant Mistake and Description text to Cloudflare');
  await expect(page.locator('.overview-summary')).toHaveText('3 mistakes · 2 clusters');
  const facts = page.getByRole('table', { name: 'Period comparison', exact: true });
  await expect(facts).toContainText('Success');
  await expect(overview(page)).toContainText('PRIVATE ACTION NOT FOR AI');
  await explanations(page).getByRole('button', { name: 'Explain recent patterns', exact: true }).click();
  await expect(explanations(page).locator('.local-findings > li')).toHaveCount(1);
  await expect(explanations(page)).toContainText('Possible psychological explanation — not confirmed');
  await expect(explanations(page)).toContainText('nhu cầu chứng minh năng lực');
  expect(calls.every(call => !JSON.stringify(call.body).includes('PRIVATE'))).toBe(true);
  expect(calls.every(call => !Object.hasOwn(call.body, 'model') && !Object.hasOwn(call.body, 'options'))).toBe(true);
  expect(localRequests).toEqual([]);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).graph, STORAGE_KEY)).toEqual(graph);
  const completed = calls.length;
  await page.reload(); await open(page);
  await expect(page.locator('.overview-summary')).toHaveText('3 mistakes · 2 clusters');
  await explanations(page).getByRole('button', { name: 'Explain recent patterns', exact: true }).click();
  await expect(explanations(page).locator('.local-findings > li')).toHaveCount(1);
  expect(calls).toHaveLength(completed);
  await explanations(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/cloud-production-analysis.png' });
});

test('cloud quota exhaustion leaves the board, deterministic progress and saved data usable', async ({ page }) => {
  await page.route('**/api/ai/*', route => route.fulfill({ status: 503, json: { error: { code: 'ai_allowance_or_capacity', message: 'The free AI allowance is exhausted. The whiteboard remains usable.' } } }));
  await seed(page); await open(page);
  await expect(overview(page)).toContainText('free AI allowance');
  await expect(page.getByRole('table', { name: 'Period comparison', exact: true })).toContainText('Mistake');
  await expect(overview(page)).toContainText('PRIVATE SUCCESS NOT FOR AI');
  await page.getByRole('button', { name: 'Close overview' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.reload(); await expect(page.locator('.react-flow__node')).toHaveCount(5);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

for (const action of ['Cancel', 'Close overview']) test(`cloud ${action} aborts the frontend request and never displays a stale result`, async ({ page }) => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const calls = []; await mockAI(page, calls, { holdExplanation: held });
  await seed(page); await open(page);
  await explanations(page).getByRole('button', { name: 'Explain recent patterns', exact: true }).click();
  await expect.poll(() => calls.some(call => call.path.endsWith('/explain'))).toBe(true);
  const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/ai/explain'));
  await page.getByRole('button', { name: action, exact: true }).click(); await canceled; release();
  if (action === 'Cancel') {
    await expect(explanations(page)).toContainText('cancellation is best effort');
    await expect(explanations(page).locator('.local-findings > li')).toHaveCount(0);
  } else await expect(overview(page)).not.toBeVisible();
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('production autosave still debounces content changes and ignores navigation and highlighting', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T12:00:00+07:00') });
  await page.clock.pauseAt(new Date('2026-11-08T12:00:01+07:00'));
  await page.goto('/');
  await page.clock.runFor(32);
  await page.getByRole('main').focus(); await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await page.getByLabel('Type', { exact: true }).selectOption('Action');
  await page.getByLabel('Action', { exact: true }).fill('Keep the existing whiteboard');
  await page.getByLabel('Time', { exact: true }).fill('08/11/26'); await page.keyboard.press('Enter');
  await page.clock.runFor(2999);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.clock.runFor(1);
  await expect(page.getByRole('status', { name: 'All changes saved locally' })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.locator('.react-flow__node').click(); await page.locator('.react-flow__node').dblclick();
  await page.clock.runFor(4000);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(saved);
  await page.reload(); await expect(page.locator('.react-flow__node')).toHaveCount(1);
});

test('real cloud Vietnamese analysis works through the production API without Ollama or uploading Action/Success text', async ({ page }) => {
  const tasks = [], localRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/ai/') && request.method() === 'POST') tasks.push(request.postDataJSON());
    if (request.url().includes(':11434')) localRequests.push(request.url());
  });
  const graph = fixture(); await seed(page, graph); await open(page);
  await expect(page.locator('.overview-summary')).toHaveText('3 mistakes · 2 clusters', { timeout: 60000 });
  await explanations(page).getByRole('button', { name: 'Explain recent patterns', exact: true }).click();
  await expect(explanations(page).locator('.local-findings > li')).toHaveCount(1, { timeout: 60000 });
  await expect(explanations(page)).toContainText('Possible psychological explanation — not confirmed');
  expect(localRequests).toEqual([]);
  expect(tasks.every(body => !JSON.stringify(body).includes('PRIVATE'))).toBe(true);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  await explanations(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/cloud-live-production.png' });
});

test('public deployment has its AI binding, restrictive security headers, no tracking beacon, and live input guards', async ({ request, baseURL }) => {
  test.skip(!process.env.TRACE_TEST_PUBLIC_URL, 'Requires actual Worker response headers and AI binding.');
  const status = await request.get('/api/ai/status');
  expect(status.status()).toBe(200);
  expect(await status.json()).toEqual({ provider: 'cloudflare', available: true, cancellation: 'best-effort' });
  expect(status.headers()['cache-control']).toContain('no-store');
  const html = await request.get('/');
  expect(html.headers()['content-security-policy']).toContain("connect-src 'self'");
  expect(await html.text()).not.toContain('static.cloudflareinsights.com');
  const origin = new URL(baseURL).origin;
  const unknown = await request.get('/api/unknown', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } });
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()['content-type']).toContain('application/json');
  const invalid = await request.post('/api/ai/profile', { headers: { Origin: origin }, data: { text: 'Public security check', model: 'arbitrary-model' } });
  expect(invalid.status()).toBe(400);
  const foreign = await request.post('/api/ai/profile', { headers: { Origin: 'https://foreign.example' }, data: { text: 'Public security check' } });
  expect(foreign.status()).toBe(403);
  const oversized = await request.post('/api/ai/profile', { headers: { Origin: origin }, data: { text: 'x'.repeat(17000) } });
  expect(oversized.status()).toBe(413);
});

test('real public request cancellation suppresses results without claiming immediate provider resource release', async ({ page }) => {
  test.skip(!process.env.TRACE_TEST_PUBLIC_URL, 'Checks cancellation against the real public API.');
  const source = fixture(), nodes = source.nodes.slice(0, 2).map(node => ({ ...node, data: { ...node.data, mistake: source.nodes[0].data.mistake } }));
  await seed(page, { nodes, edges: [] }); await open(page);
  const started = page.waitForRequest(request => request.url().endsWith('/api/ai/explain'));
  await explanations(page).getByRole('button', { name: 'Explain recent patterns', exact: true }).click();
  await started;
  const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/ai/explain'));
  await page.waitForTimeout(50);
  await explanations(page).getByRole('button', { name: 'Cancel', exact: true }).click(); await canceled;
  await expect(explanations(page)).toContainText('cancellation is best effort');
  await expect(explanations(page).locator('.local-findings > li')).toHaveCount(0);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});
