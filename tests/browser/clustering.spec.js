import { test, expect } from '@playwright/test';
import { createEvent, parseDate } from '../../src/model.js';
import { STORAGE_KEY, serializeDiagram } from '../../src/persistence.js';
import { EMBEDDING_MODEL, EMBEDDING_OPTIONS } from '../../src/ollama.js';
import { EMBEDDING_MODELS, ENGLISH_MODEL, VIETNAMESE_MODEL, MODEL_PREFERENCE_KEY } from '../../src/embedding-models.js';
import { BEHAVIOR_MODEL, BEHAVIOR_OPTIONS } from '../../src/behavior-patterns.js';

const samples = [
  ['I lost my temper.', 'Shouted at a colleague.'],
  ['I yelled during a discussion.', 'I raised my voice.'],
  ['Raised my voice in anger.', 'Lost composure during feedback.'],
  ['I delayed an important task.', 'Missed the project deadline.'],
  ['I left work until the last minute.', 'Procrastinated until it was overdue.'],
  ['I failed to back up my files.', 'Lost the only copy of my work.'],
];
const vector = (group, model = EMBEDDING_MODEL) => Array.from({ length: EMBEDDING_MODELS[model].dimensions }, (_, i) => i === group ? 1 : 0);
function graphFor(entries = samples, extras = true) {
  let graph = { nodes: [], edges: [] };
  entries.forEach(([mistake, description], i) => {
    graph = createEvent(graph, { kind: 'Mistake', mistake, description, time: parseDate('07/11/26'), id: `mistake-${i}`, firstPosition: { x: 240, y: 800 } });
  });
  if (extras && entries.length) for (const kind of ['Consequence', 'Goal']) graph = createEvent(graph, {
    kind, mistake: 'Do not count this as a Mistake node', description: '', time: parseDate('07/11/26'), id: kind,
    selectedId: kind === 'Consequence' ? 'mistake-0' : undefined, firstPosition: { x: 240, y: 800 },
  });
  return graph;
}
async function seed(page, graph, model = undefined) {
  await page.addInitScript(({ key, value, model, preference }) => {
    if (!sessionStorage.getItem('cluster-seeded')) {
      localStorage.setItem(key, value); sessionStorage.setItem('cluster-seeded', 'yes');
      if (model) localStorage.setItem(preference, model);
    }
    window.diagramWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) window.diagramWrites++;
      return original.call(this, name, value);
    };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph), model, preference: MODEL_PREFERENCE_KEY });
  await page.goto('/');
}
async function mockEmbeddings(page, requests) {
  await page.route('http://127.0.0.1:11434/api/embed', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    expect(EMBEDDING_MODELS[body.model]).toBeDefined();
    expect(body.options).toEqual(EMBEDDING_OPTIONS);
    expect(body.keep_alive).toBe(0);
    expect(body.input.length).toBeLessThanOrEqual(8);
    await route.fulfill({ json: { embeddings: body.input.map(text => vector(/temper|yelled|voice/.test(text) ? 0 : /delayed|last minute/.test(text) ? 1 : 2, body.model)) } });
  });
}
const overview = page => page.getByRole('dialog', { name: 'Mistake overview' });
async function open(page) { await page.getByRole('button', { name: 'Mistake overview', exact: true }).click(); await expect(overview(page)).toBeVisible(); }
async function create(page, kind, mistake) {
  await page.keyboard.type('/n'); await page.keyboard.press('Enter');
  await page.getByLabel('Type', { exact: true }).selectOption(kind);
  await page.locator('#mistake').fill(mistake);
  await page.getByLabel('Time', { exact: true }).fill('07/11/26');
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('overview shows all Mistake clusters with stronger frequency emphasis, original examples, persistent cache, and no diagram mutation', async ({ page }) => {
  const requests = [];
  await mockEmbeddings(page, requests);
  const graph = graphFor(); await seed(page, graph);
  await open(page);
  await expect(page.locator('.overview-summary')).toHaveText('6 mistakes · 3 clusters');
  expect(requests).toHaveLength(1);
  expect(requests[0].input.join(' ')).toContain('Shouted at a colleague.');
  expect(requests[0].input.join(' ')).not.toContain('Do not count this');
  const cards = page.locator('.mistake-cluster');
  expect(await cards.evaluateAll(elements => elements.map(el => Number(el.dataset.count)))).toEqual([3, 2, 1]);
  const bars = await cards.locator('.cluster-bar > div').evaluateAll(elements => elements.map(el => ({ width: el.getBoundingClientRect().width, color: getComputedStyle(el).backgroundColor })));
  expect(bars[0].width).toBeGreaterThan(bars[1].width); expect(bars[1].width).toBeGreaterThan(bars[2].width);
  expect(new Set(bars.map(bar => bar.color)).size).toBe(3);
  await page.screenshot({ path: 'test-results/mistake-overview.png' });
  await cards.first().getByText('View occurrences', { exact: true }).click();
  await expect(cards.first().locator('li')).toHaveCount(3);
  await expect(cards.first()).toContainText('Shouted at a colleague.');
  await expect(cards.first()).toContainText('07/11/26');
  await page.getByRole('button', { name: 'Close overview' }).click();
  await open(page); await expect(cards).toHaveCount(3); expect(requests).toHaveLength(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).graph, STORAGE_KEY)).toEqual(graph);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  await page.reload(); await open(page); await expect(cards).toHaveCount(3); expect(requests).toHaveLength(1);
  await page.setViewportSize({ width: 480, height: 760 });
  expect(await overview(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mistake-overview-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.keyboard.press('Escape');
  await page.locator('.react-flow__node').first().click(); await page.keyboard.press('Delete');
  await open(page); await expect(page.locator('.overview-summary')).toHaveText('5 mistakes · 3 clusters');
  expect(requests).toHaveLength(1);
});

test('empty, single, and identical Mistake entries need no model request; normal navigation does not start analysis', async ({ page }) => {
  let requests = 0;
  await page.route('http://127.0.0.1:11434/**', route => { requests++; return route.abort(); });
  await page.goto('/'); await open(page);
  await expect(overview(page)).toContainText('No Mistake nodes yet.');
  await page.keyboard.press('Escape');
  await create(page, 'Mistake', 'I shouted at someone.');
  await open(page); await expect(page.locator('.overview-summary')).toHaveText('1 mistake · 1 cluster');
  await page.keyboard.press('Escape');
  await create(page, 'Mistake', 'I shouted at someone.');
  await open(page); await expect(page.locator('.overview-summary')).toHaveText('2 mistakes · 1 cluster');
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node').first().dblclick();
  await page.mouse.move(1100, 800); await page.mouse.wheel(0, -80);
  expect(requests).toBe(0);
});

test('missing or busy Ollama shows a useful error, without fake clusters, and reopening can retry', async ({ page }) => {
  let status = 404;
  await page.route('http://127.0.0.1:11434/api/embed', route => route.fulfill({ status, json: { error: 'model unavailable' } }));
  await seed(page, graphFor()); await open(page);
  await expect(page.getByRole('alert')).toContainText(`ollama pull ${VIETNAMESE_MODEL}`);
  await expect(page.locator('.mistake-cluster')).toHaveCount(0);
  await page.getByLabel('Clustering model').selectOption(ENGLISH_MODEL);
  await expect(page.getByRole('alert')).toContainText(`ollama pull ${ENGLISH_MODEL}`);
  await page.keyboard.press('Escape'); status = 503; await open(page);
  await expect(page.getByRole('alert')).toContainText('busy or short of memory');
  await page.keyboard.press('Escape');
  await page.unroute('http://127.0.0.1:11434/api/embed');
  const requests = []; await mockEmbeddings(page, requests); await open(page);
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
});

test('closing during analysis cancels the request and leaves the diagram usable and unchanged', async ({ page }) => {
  const requests = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('http://127.0.0.1:11434/api/embed', async route => {
    requests.push(route.request()); await held;
    await route.fulfill({ json: { embeddings: route.request().postDataJSON().input.map(() => vector(1)) } }).catch(() => {});
  });
  const graph = graphFor(); await seed(page, graph); await open(page);
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Analyzing mistakes locally' })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  const cancelled = page.waitForEvent('requestfailed', request => request.url().includes('/api/embed'));
  await page.getByRole('button', { name: 'Close overview' }).click();
  await cancelled; release();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  await create(page, 'Action', 'Took a break.');
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
});

test('real browser connects only to local Ollama and groups semantic paraphrases with the CPU model', async ({ page, request }) => {
  const calls = [];
  page.on('request', event => { if (event.url().includes('/api/embed')) calls.push(event.postDataJSON()); });
  const graph = graphFor([
    ['I lost my temper and shouted at a colleague.', ''],
    ['I raised my voice angrily during a disagreement.', ''],
    ['I forgot to back up my files and lost my work.', ''],
  ], false);
  await seed(page, graph, ENGLISH_MODEL); await open(page);
  await expect(page.locator('.overview-summary')).toHaveText('3 mistakes · 2 clusters', { timeout: 30000 });
  expect(await page.locator('.mistake-cluster').evaluateAll(elements => elements.map(el => Number(el.dataset.count)))).toEqual([2, 1]);
  expect(calls).toHaveLength(1);
  expect(calls[0].options.num_gpu).toBe(0);
  expect(calls[0].keep_alive).toBe(0);
  const running = await (await request.get('http://127.0.0.1:11434/api/ps')).json();
  expect(running.models.some(model => model.name === ENGLISH_MODEL)).toBe(false);
  expect(await page.evaluate(key => localStorage.getItem(key), EMBEDDING_MODELS[ENGLISH_MODEL].cacheKey)).not.toBeNull();
  await page.screenshot({ path: 'test-results/mistake-overview-ollama.png' });
});

test('model selection defaults to Vietnamese, persists across reloads, and reuses separate caches without changing the diagram', async ({ page }) => {
  const requests = []; await mockEmbeddings(page, requests);
  const graph = graphFor(); await seed(page, graph); await open(page);
  const choice = page.getByLabel('Clustering model');
  await expect(choice).toHaveValue(VIETNAMESE_MODEL);
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
  expect(requests.map(body => body.model)).toEqual([VIETNAMESE_MODEL]);
  await choice.selectOption(ENGLISH_MODEL);
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
  expect(requests.map(body => body.model)).toEqual([VIETNAMESE_MODEL, ENGLISH_MODEL]);
  await choice.selectOption(VIETNAMESE_MODEL);
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
  expect(requests).toHaveLength(2);
  await choice.selectOption(ENGLISH_MODEL);
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
  await page.reload(); await open(page);
  await expect(choice).toHaveValue(ENGLISH_MODEL);
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
  expect(requests).toHaveLength(2);
  for (const config of Object.values(EMBEDDING_MODELS)) expect(await page.evaluate(key => localStorage.getItem(key), config.cacheKey)).not.toBeNull();
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).graph, STORAGE_KEY)).toEqual(graph);
});

test('switching models cancels the old request and does not display or cache its stale results', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const requests = [];
  await page.route('http://127.0.0.1:11434/api/embed', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (body.model === VIETNAMESE_MODEL) {
      await held;
      await route.fulfill({ json: { embeddings: body.input.map(() => vector(1, VIETNAMESE_MODEL)) } }).catch(() => {});
    } else {
      await route.fulfill({ json: { embeddings: body.input.map(text => vector(/temper|yelled|voice/.test(text) ? 0 : /delayed|last minute/.test(text) ? 1 : 2, ENGLISH_MODEL)) } });
    }
  });
  await seed(page, graphFor()); await open(page);
  await expect.poll(() => requests.length).toBe(1);
  const cancelled = page.waitForEvent('requestfailed', request => request.url().includes('/api/embed'));
  await page.getByLabel('Clustering model').selectOption(ENGLISH_MODEL);
  await cancelled;
  await expect(page.locator('.mistake-cluster')).toHaveCount(3);
  release();
  await expect(page.locator('.overview-summary')).toHaveText('6 mistakes · 3 clusters');
  expect(await page.evaluate(key => localStorage.getItem(key), EMBEDDING_MODELS[VIETNAMESE_MODEL].cacheKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), EMBEDDING_MODELS[ENGLISH_MODEL].cacheKey)).not.toBeNull();
});

test('real Vietnamese browser analysis groups paraphrases from both fields using the default multilingual model', async ({ page, request }) => {
  const sentences = [
    'Tôi đã nổi nóng và quát mắng đồng nghiệp.',
    'Tôi mất bình tĩnh và lớn tiếng với người khác.',
    'Tôi trì hoãn công việc nên không hoàn thành đúng hạn.',
    'Tôi cứ để việc đến phút cuối rồi bị trễ hạn.',
    'Tôi quên sao lưu dữ liệu nên bị mất tài liệu.',
    'Tôi phản ứng phòng thủ khi người khác góp ý.',
    'Tôi cố bảo vệ quan điểm của mình và không chịu nghe phản hồi.',
  ];
  const graph = graphFor(sentences.map(sentence => [sentence.split(' ').slice(0, 5).join(' '), sentence.split(' ').slice(5).join(' ')]), false);
  const requests = [];
  page.on('request', event => { if (event.url().includes('/api/embed')) requests.push(event.postDataJSON()); });
  await seed(page, graph); await open(page);
  await expect(page.getByLabel('Clustering model')).toHaveValue(VIETNAMESE_MODEL);
  await expect(page.locator('.overview-summary')).toHaveText('7 mistakes · 4 clusters', { timeout: 30000 });
  expect(await page.locator('.mistake-cluster').evaluateAll(elements => elements.map(el => Number(el.dataset.count)))).toEqual([2, 2, 2, 1]);
  expect(requests).toHaveLength(1);
  expect(requests[0].model).toBe(VIETNAMESE_MODEL);
  expect(requests[0].input[0]).toContain('task: clustering | query: Tôi đã nổi nóng và quát mắng đồng nghiệp.');
  expect(requests[0].options).toEqual(EMBEDDING_OPTIONS);
  expect(requests[0].keep_alive).toBe(0);
  await page.screenshot({ path: 'test-results/mistake-overview-vietnamese.png' });
  await page.locator('.mistake-cluster').first().getByText('View occurrences', { exact: true }).click();
  await expect(page.locator('.mistake-cluster').first().locator('li p').first()).toHaveText('quát mắng đồng nghiệp.');
  const running = await (await request.get('http://127.0.0.1:11434/api/ps')).json();
  expect(running.models.some(model => model.name === VIETNAMESE_MODEL)).toBe(false);
});

test('Vietnamese shared motivations group together while recovery, instruction gaps and entry errors remain separate', async ({ page }) => {
  const rows = [
    ['Ham thành tích mà không biết dừng lại nghỉ ngơi.', 'overvalued_goal', 'thành tích'],
    ['Kỹ thuật chạy bộ sai mà vẫn ráng chạy vì sợ giảm thành tích.', 'overvalued_goal', 'giảm thành tích'],
    ['Tôi ghi sai thành tích chạy bộ vì nhập nhầm số liệu.', 'attention_lapse', ''],
    ['Tôi chạy bộ sai kỹ thuật vì chưa được hướng dẫn đúng.', 'knowledge_gap', ''],
    ['Tôi nghỉ tập để phục hồi nên thành tích tạm thời giảm.', 'rest_or_correction', ''],
  ];
  let chats = 0;
  await page.route('http://127.0.0.1:11434/api/embed', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { embeddings: body.input.map(() => vector(0, body.model)) } });
  });
  await page.route('http://127.0.0.1:11434/api/chat', route => {
    const body = route.request().postDataJSON();
    expect(body.model).toBe(BEHAVIOR_MODEL); expect(body.options).toEqual(BEHAVIOR_OPTIONS);
    expect(body.keep_alive).toBe(0); expect(body.think).toBe(false);
    const row = rows.find(([text]) => text === body.messages[1].content); chats++;
    return route.fulfill({ json: { done: true, message: { content: JSON.stringify({ mechanism: row[1], priority_quote: row[2], priority_label: row[2], behavior_label: row[0], priority_domain: row[1] === 'overvalued_goal' ? 'achievement_performance' : 'none' }) } } });
  });
  const graph = graphFor(rows.map(([text]) => {
    const words = text.split(' '); return [words.slice(0, 5).join(' '), words.slice(5).join(' ')];
  }), false);
  await seed(page, graph); await open(page);
  await expect(page.locator('.overview-summary')).toHaveText('5 mistakes · 4 clusters');
  const first = page.locator('.mistake-cluster').first();
  await first.getByText('View occurrences', { exact: true }).click();
  await expect(first.locator('li')).toHaveCount(2);
  await expect(first).toContainText('Ham thành tích');
  await expect(first).toContainText('Kỹ thuật chạy bộ sai');
  expect(chats).toBe(5);
  await page.reload(); await open(page);
  await expect(page.locator('.overview-summary')).toHaveText('5 mistakes · 4 clusters');
  expect(chats).toBe(5);
  expect(await page.evaluate(() => window.diagramWrites)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).graph, STORAGE_KEY)).toEqual(graph);
});
