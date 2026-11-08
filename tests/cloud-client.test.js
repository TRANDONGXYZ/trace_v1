import test from 'node:test';
import assert from 'node:assert/strict';
process.env.TRACE_AI_PROVIDER = 'cloudflare';
const { cloudAI } = await import('../src/cloud-ai.js');
const { analyzeMistakes } = await import('../src/ollama.js');
const { CLOUD_EMBEDDING_DIMENSIONS, CLOUD_ENGLISH_PRESET, CLOUD_EMBEDDING_MODEL } = await import('../shared/ai-models.js');
const { EMBEDDING_MODELS } = await import('../src/embedding-models.js');
const { explainProgress } = await import('../src/progress-explanations.js');
const { parseDate } = await import('../src/model.js');
const { comparisonPeriods, buildProgressReport } = await import('../src/progress-analytics.js');
const node = (id, mistake, description = '') => ({ id, data: { kind: 'Mistake', mistake, description, time: parseDate('15/10/26') } });
function storage(t) {
  const values = new Map(), original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  t.after(() => original ? Object.defineProperty(globalThis, 'localStorage', original) : delete globalThis.localStorage);
  return values;
}

test('cloud requests contain task data only; limits/errors preserve deterministic whiteboard use and abort reaches fetch', async t => {
  let transport;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/ai/profile');
    assert.deepEqual(JSON.parse(options.body), { text: 'source' });
    transport = options.signal;
    return Response.json({ result: { mechanism: 'unspecified' } });
  });
  const controller = new AbortController();
  await cloudAI('profile', { text: 'source' }, controller.signal);
  controller.abort(); assert.equal(transport.aborted, true);
  for (const [status, code] of [[429, 'rate_limited'], [503, 'ai_allowance_or_capacity']]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code, message: 'AI unavailable; whiteboard remains usable.' } }, { status }));
    await assert.rejects(cloudAI('profile', { text: 'source' }), error => error.status === status && error.code === code);
  }
});

test('grounded shared cloud cause roles join different situations while unrelated roles remain separate and caches suppress duplicate calls', async t => {
  storage(t); let calls = 0;
  const texts = ['Ham thành tích mà không nghỉ.', 'Vẫn chạy vì sợ giảm thành tích.', 'Nhập nhầm dữ liệu vì bất cẩn.', 'Làm việc vì sợ người khác không hài lòng.'];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; const body = JSON.parse(options.body);
    assert.ok(!Object.hasOwn(body, 'model')); assert.ok(!Object.hasOwn(body, 'options'));
    if (url.endsWith('/embed')) return Response.json({ result: { embeddings: body.texts.map((_text, i) => Array.from({ length: CLOUD_EMBEDDING_DIMENSIONS }, (_, j) => i === j ? 1 : 0)) } });
    const index = texts.indexOf(body.text);
    return Response.json({ result: { mechanism: index === 2 ? 'attention_lapse' : 'overvalued_goal', priority_quote: index === 2 ? '' : body.text,
      priority_label: index === 3 ? 'approval' : 'achievement', behavior_label: 'Recorded behavior', priority_domain: index === 2 ? 'none' : index === 3 ? 'approval_acceptance' : 'achievement_performance' } });
  });
  const nodes = texts.map((text, i) => node(String(i), text));
  assert.deepEqual((await analyzeMistakes(nodes)).map(group => group.members.map(n => n.id)), [['0', '1'], ['2'], ['3']]);
  const completed = calls; await analyzeMistakes(nodes); assert.equal(calls, completed);
  assert.equal(EMBEDDING_MODELS[CLOUD_ENGLISH_PRESET].cacheKey, EMBEDDING_MODELS[CLOUD_EMBEDDING_MODEL].cacheKey);
  assert.ok(EMBEDDING_MODELS[CLOUD_ENGLISH_PRESET].threshold > EMBEDDING_MODELS[CLOUD_EMBEDDING_MODEL].threshold);
});

test('cloud cluster hypotheses are cached persistently with hashed content keys and changed evidence regenerates them', async t => {
  const values = storage(t); let calls = 0;
  const nodes = [node('source-a', 'Kept working'), node('source-b', 'Ignored rest')];
  const report = buildProgressReport(nodes, [], [{ id: 'cluster', label: 'Performance', members: nodes, count: 2 }], comparisonPeriods(new Date(2026, 10, 8, 12)));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.equal(url, '/api/ai/explain');
    const body = JSON.parse(options.body);
    assert.equal(body.input.records.length, 2);
    return Response.json({ result: { evidence_ids: ['R1', 'R2'], observed_pattern: 'Results were prioritized.', explanation: 'A need for recognition may be involved; this remains uncertain.' } });
  });
  assert.equal((await explainProgress(report)).length, 1);
  const entry = [...values].find(([key]) => key.startsWith('trace.cluster-explanations.'));
  assert.ok(entry);
  const saved = JSON.parse(entry[1]); assert.match(saved[0][0], /^[a-f0-9]{64}$/u);
  assert.ok(!saved[0][0].includes('Kept working'));
  await explainProgress(report); assert.equal(calls, 1);
  nodes[1].data.description = 'New context';
  await explainProgress(report); assert.equal(calls, 2);
});
