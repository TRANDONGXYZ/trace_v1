import { test, expect } from '@playwright/test';
import { parseDate } from '../../src/model.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { EMBEDDING_MODELS } from '../../src/embedding-models.js';
import { EXPLANATION_MODEL, EXPLANATION_OPTIONS } from '../../src/progress-explanations.js';

function fixture() {
  const rows = [
    ['p1', 'Mistake', '10/07/26', 'Nổi nóng'], ['p2', 'Mistake', '10/08/26', 'Mất bình tĩnh'],
    ['r1', 'Mistake', '10/09/26', 'Nổi nóng'], ['r2', 'Mistake', '15/10/26', 'Lớn tiếng'], ['r3', 'Mistake', '08/11/26', 'Quát đồng nghiệp'],
    ['new', 'Mistake', '20/10/26', 'Trì hoãn công việc'], ['old', 'Mistake', '08/07/26', 'Trì hoãn công việc'], ['ceased', 'Mistake', '15/08/26', 'Quên lịch hẹn'], ['future', 'Mistake', '09/11/26', 'Nổi nóng'],
    ['ps', 'Success', '01/08/26', 'Kết quả trước đây'], ['rs', 'Success', '25/10/26', 'Hoàn thành dự án'], ['rm', 'Milestone', '30/10/26', 'Hoàn thành giai đoạn một'],
    ['pb', 'Blocked', '08/09/26', 'Bị chặn trước đây'], ['rb', 'Blocked', '22/10/26', 'Chưa được duyệt', 'Tôi đã gửi hồ sơ nhưng chưa nhận được phản hồi.'],
    ['pc', 'Consequence', '05/08/26', 'Phát sinh phí trước đây'], ['rc1', 'Consequence', '10/10/26', 'Bị mất phí', 'Tôi phải trả phí do chậm xử lý.'], ['rc2', 'Consequence', '21/10/26', 'Bị trễ tiến độ', 'Công việc bị chậm một ngày.'],
    ['a-old', 'Action', '01/07/26', 'Chuẩn bị kế hoạch từ trước'], ['a', 'Action', '15/09/26', 'Thực hiện kế hoạch'], ['attempt', 'Action', '19/10/26', 'Đã gửi hồ sơ'],
    ['goal', 'Goal', '01/10/26', 'Mục tiêu dự án'], ['after', 'Action', '26/10/26', 'Việc làm sau thành công'], ['unrelated', 'Action', '20/09/26', 'Hành động không liên quan'], ['a-future', 'Action', '09/11/26', 'Hành động tương lai'],
  ];
  const nodes = rows.map(([id, kind, date, mistake, description = ''], i) => ({
    id, type: 'event', width: 160, height: 64, draggable: false,
    position: { x: 180 + (i % 5) * 210, y: 180 + Math.floor(i / 5) * 100 },
    data: { kind, time: parseDate(date), mistake, description, placement: { mode: 'origin' } },
    ariaLabel: `${kind}, ${date}`,
  }));
  const edges = [['a-old', 'goal'], ['a', 'goal'], ['goal', 'rs'], ['a', 'rm'], ['rs', 'after'], ['attempt', 'rb'], ['a-future', 'rb'], ['r1', 'rc1'], ['a', 'rc2']]
    .map(([source, target]) => ({ id: `${source}-${target}`, source, target, sourceHandle: 'top', targetHandle: 'left', type: 'time', data: { value: '1', unit: 'day', days: 1 } }));
  return { nodes, edges };
}
async function seed(page, graph) {
  await page.clock.install({ time: new Date('2026-11-08T12:00:00+07:00') });
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) { if (name === key) window.diagramWrites++; return original.call(this, name, value); };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph) });
  await page.goto('/');
}
async function mockEmbeddings(page) {
  await page.route('http://127.0.0.1:11434/api/embed', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { embeddings: body.input.map(text => Array.from({ length: EMBEDDING_MODELS[body.model].dimensions }, (_, index) =>
      index === (/nổi nóng|Mất bình tĩnh|Lớn tiếng|Quát/iu.test(text) ? 0 : /Trì hoãn/iu.test(text) ? 1 : 2) ? 1 : 0)) } });
  });
}
const section = (page, title) => page.locator('section.progress-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function open(page) { await page.getByRole('button', { name: 'Mistake overview', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); }

test('two-period facts, recurring date ranges, new/increased types, achievements, blockers, and consequences use recorded data and directed paths', async ({ page }) => {
  await mockEmbeddings(page);
  let chats = 0; await page.route('http://127.0.0.1:11434/api/chat', route => { chats++; return route.abort(); });
  const graph = fixture(); await seed(page, graph); await open(page);
  await expect(page.locator('.period-labels')).toContainText('09/09/26 – 08/11/26');
  await expect(page.locator('.period-labels')).toContainText('09/07/26 – 08/09/26');
  const counts = page.getByRole('table', { name: 'Period comparison', exact: true });
  expect(await counts.getByRole('row', { name: /^Mistake / }).locator('td').allTextContents()).toEqual(['4', '3', '1 more']);
  expect(await counts.getByRole('row', { name: /^Success \+ Milestone / }).locator('td').allTextContents()).toEqual(['2', '1', '1 more']);
  expect(await counts.getByRole('row', { name: /^Consequence / }).locator('td').allTextContents()).toEqual(['2', '1', '1 more']);
  const trends = page.getByRole('table', { name: 'Mistake trends', exact: true });
  const recurring = trends.locator('[data-trend-id*="r1"]');
  await expect(recurring).toContainText('Recurring'); await expect(recurring).toContainText('1 more');
  await expect(recurring).toContainText('10/09/26 – 08/11/26');
  await expect(trends.locator('[data-trend-id*="new"]')).toContainText('New in comparison');
  await expect(trends.locator('[data-trend-id*="ceased"]')).toContainText('1 fewer');
  const achievements = section(page, 'Recent successes and milestones');
  await expect(achievements.locator('[data-event-id="rs"]')).toContainText('Chuẩn bị kế hoạch từ trước');
  await expect(achievements.locator('[data-event-id="rs"]')).toContainText('Thực hiện kế hoạch');
  await expect(achievements.locator('[data-event-id="rs"]')).toContainText('Recorded path:');
  await expect(achievements).not.toContainText('Việc làm sau thành công');
  await expect(achievements).not.toContainText('Hành động không liên quan');
  const blocked = section(page, 'Recent blocked situations and attempted Actions');
  await expect(blocked).toContainText('Đã gửi hồ sơ');
  await expect(blocked).toContainText('chưa nhận được phản hồi');
  await expect(blocked).not.toContainText('Hành động tương lai');
  const consequences = section(page, 'Recent consequences');
  await expect(consequences.locator('[data-event-id]')).toHaveCount(2);
  await expect(consequences).toContainText('Bị mất phí'); await expect(consequences).toContainText('Bị trễ tiến độ');
  expect(chats).toBe(0, 'explanations do not automatically load a chat model');
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).graph, STORAGE_KEY)).toEqual(graph);
  await page.getByRole('heading', { name: 'Recent progress', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/recent-progress.png' });
  await page.setViewportSize({ width: 480, height: 760 });
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

function reply(input, explanation = 'Có thể nhu cầu chứng minh bản thân khiến việc tiếp nhận phản hồi trở nên khó khăn; đây chỉ là giả thuyết cần kiểm tra.') {
  return { done: true, message: { content: JSON.stringify({ evidence_ids: [...new Set(input.records.map(r => r.id))].slice(0, 2),
    observed_pattern: 'Các lần ghi nhận cho thấy phản ứng lặp lại trong những tình huống tương tự.', explanation }) } };
}

test('cluster explanations are opt-in, collective, distinguish observations from hypotheses, and preserve cached results and diagram facts', async ({ page }) => {
  await mockEmbeddings(page);
  const chats = [];
  await page.route('http://127.0.0.1:11434/api/chat', route => {
    const body = route.request().postDataJSON(), input = JSON.parse(body.messages[1].content); chats.push(input);
    expect(body.model).toBe(EXPLANATION_MODEL); expect(body.options).toEqual(EXPLANATION_OPTIONS);
    expect(body.stream).toBe(true); expect(body.keep_alive).toBe(0); expect(body.think).toBe(false);
    expect(input.records.length).toBeGreaterThanOrEqual(2);
    return route.fulfill({ json: reply(input) });
  });
  const graph = fixture(); await seed(page, graph); await open(page);
  const explanations = page.getByRole('region', { name: 'Possible local explanations' });
  await expect(explanations.getByRole('button', { name: 'Explain recent patterns locally' })).toBeEnabled();
  expect(chats).toHaveLength(0);
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect(explanations.locator('.local-findings > li')).toHaveCount(2);
  await expect(explanations).toContainText('Shared pattern in cited records — model summary');
  await expect(explanations).toContainText('Possible psychological explanation — not confirmed');
  await expect(explanations).toContainText('Cited mistakes from this cluster:');
  expect(chats).toHaveLength(2);
  expect(chats.some(input => input.records.some(r => r.date === '10/07/26'))).toBe(true, 'older cluster history is included');
  expect(chats.every(input => !JSON.stringify(input).includes('09/11/26'))).toBe(true, 'future records are excluded');
  expect(chats.every(input => !JSON.stringify(input).includes('Đã gửi hồ sơ'))).toBe(true, 'outcomes are no longer explained individually');
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect(explanations.locator('.local-findings > li')).toHaveCount(2); expect(chats).toHaveLength(2);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).graph, STORAGE_KEY)).toEqual(graph);
  await explanations.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/cluster-psychological-explanations.png' });
});

test('missing clusters and singletons cannot initiate psychological inference; recorded outcomes remain available', async ({ page }) => {
  await page.route('http://127.0.0.1:11434/api/embed', route => route.fulfill({ status: 404, json: { error: 'missing' } }));
  let chats = 0; await page.route('http://127.0.0.1:11434/api/chat', route => { chats++; return route.abort(); });
  await seed(page, fixture()); await open(page);
  await expect(section(page, 'Recurring mistakes and trends')).toContainText('Semantic trends are unavailable');
  const explanations = page.getByRole('region', { name: 'Possible local explanations' });
  await expect(explanations).toContainText('until mistake clustering succeeds');
  await expect(explanations.getByRole('button')).toHaveCount(0);
  await expect(section(page, 'Recent successes and milestones')).toContainText('Hoàn thành dự án');
  expect(chats).toBe(0);
});

test('invalid citations cannot create psychological conclusions or discard a valid cluster hypothesis', async ({ page }) => {
  await mockEmbeddings(page);
  await page.route('http://127.0.0.1:11434/api/chat', route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    const valid = input.records.length > 2;
    const result = reply(input, valid ? 'Có thể người dùng đang cố bảo vệ giá trị bản thân.' : 'Fabricated claim');
    if (!valid) result.message.content = JSON.stringify({ observed_pattern: 'Claim', explanation: 'Fabricated claim', evidence_ids: ['R1', 'not-a-record'] });
    return route.fulfill({ json: result });
  });
  await seed(page, fixture()); await open(page);
  const explanations = page.getByRole('region', { name: 'Possible local explanations' });
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect(explanations.getByRole('button', { name: 'Explain recent patterns locally' })).toBeEnabled();
  await expect(explanations.locator('.local-findings > li')).toHaveCount(1);
  await expect(explanations).toContainText('Có thể người dùng đang cố bảo vệ giá trị bản thân.');
  await expect(explanations.getByRole('alert')).toContainText('unsupported evidence');
  await expect(explanations).not.toContainText('Fabricated claim');
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

for (const action of ['Cancel', 'Close overview', 'Escape']) test(`${action} aborts active explanation HTTP work and allows a clean retry`, async ({ page }) => {
  await mockEmbeddings(page);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('http://127.0.0.1:11434/api/chat', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    if (++calls === 1) await held;
    await route.fulfill({ json: reply(input) }).catch(() => {});
  });
  await seed(page, fixture()); await open(page);
  const explanations = page.getByRole('region', { name: 'Possible local explanations' });
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect.poll(() => calls).toBe(1);
  const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/chat'));
  if (action === 'Escape') await page.keyboard.press('Escape');
  else await page.getByRole('button', { name: action, exact: true }).click();
  await canceled; release();
  if (action === 'Cancel') {
    await expect(explanations).toContainText('Analysis canceled.');
    await expect(explanations.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await expect(explanations.locator('.local-findings > li')).toHaveCount(0);
  } else { await expect(page.getByRole('dialog')).not.toBeVisible(); await open(page); }
  expect(calls).toBe(1, 'canceled analysis schedules no further cluster');
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect(explanations.locator('.local-findings > li')).toHaveCount(2);
  expect(calls).toBe(3);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

test('Cancel retains completed cluster results and retries only unfinished clusters', async ({ page }) => {
  await mockEmbeddings(page);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('http://127.0.0.1:11434/api/chat', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    if (++calls === 2) await held;
    await route.fulfill({ json: reply(input) }).catch(() => {});
  });
  await seed(page, fixture()); await open(page);
  const explanations = page.getByRole('region', { name: 'Possible local explanations' });
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect(explanations.locator('.local-findings > li')).toHaveCount(1);
  await expect.poll(() => calls).toBe(2);
  await explanations.getByRole('button', { name: 'Cancel', exact: true }).click(); release();
  await expect(explanations).toContainText('Analysis canceled.');
  await expect(explanations.locator('.local-findings > li')).toHaveCount(1);
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await expect(explanations.locator('.local-findings > li')).toHaveCount(2);
  expect(calls).toBe(3);
});

function repeatedGraph() {
  const source = fixture();
  const nodes = source.nodes.filter(n => ['r2', 'r3'].includes(n.id)).map(n => ({ ...n,
    data: { ...n.data, mistake: 'Kept working despite exhaustion to maintain results.', description: '' } }));
  return { nodes, edges: [] };
}

for (const action of ['Cancel', 'Close overview']) test(`real Ollama inference stops and unloads after ${action}`, async ({ page, request }) => {
  test.setTimeout(120000);
  await seed(page, repeatedGraph()); await open(page);
  const explanations = page.getByRole('region', { name: 'Possible local explanations' });
  const generating = page.waitForResponse(response => response.url().endsWith('/api/chat') && response.status() === 200);
  await explanations.getByRole('button', { name: 'Explain recent patterns locally' }).click();
  await generating;
  const running = await (await request.get('http://127.0.0.1:11434/api/ps')).json();
  expect(running.models.some(m => m.name === EXPLANATION_MODEL)).toBe(true);
  const canceled = page.waitForEvent('requestfailed', req => req.url().endsWith('/api/chat'));
  await page.getByRole('button', { name: action, exact: true }).click(); await canceled;
  await expect.poll(async () => {
    const body = await (await request.get('http://127.0.0.1:11434/api/ps')).json();
    return body.models.some(m => m.name === EXPLANATION_MODEL);
  }, { timeout: 20000 }).toBe(false);
  if (action === 'Cancel') {
    await expect(explanations).toContainText('Analysis canceled.');
    await expect(explanations.locator('.local-findings > li')).toHaveCount(0);
  } else await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
});

