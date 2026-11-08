import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterMistakes, cosine, mistakeText, normalizeVector, textChunks } from '../src/mistake-clusters.js';
import { analyzeMistakes, EMBEDDING_CACHE_KEY, EMBEDDING_MODEL, EMBEDDING_OPTIONS } from '../src/ollama.js';
import { EMBEDDING_MODELS, ENGLISH_MODEL, VIETNAMESE_MODEL, MODEL_PREFERENCE_KEY, readModelPreference } from '../src/embedding-models.js';
import { BEHAVIOR_MODEL, BEHAVIOR_OPTIONS, BEHAVIOR_CACHE_KEY, behaviorProfiles, behavioralMatches, validateBehaviorProfile } from '../src/behavior-patterns.js';

const node = (id, mistake = `Mistake ${id}`, description = '', kind = 'Mistake') => ({ id, data: { kind, mistake, description, time: Number(id) || 0 } });
const vector = (x, y = 0, model = EMBEDDING_MODEL) => [x, y, ...Array(EMBEDDING_MODELS[model].dimensions - 2).fill(0)];
function mockStorage(t, storage) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => original ? Object.defineProperty(globalThis, 'localStorage', original) : delete globalThis.localStorage);
}

test('semantic clustering discovers counts, includes singletons, uses real representative text, and is order independent', () => {
  const nodes = [node('1', 'I yelled'), node('2', 'Raised my voice'), node('3', 'I shouted'), node('4', 'Missed a deadline'), node('5', 'Procrastinated'), node('6', 'Lost my files')];
  const vectors = [[1, 0, 0], [0.99, 0.01, 0], [0.98, -0.02, 0], [0, 1, 0], [0.01, 0.99, 0], [0, 0, 1]];
  const snapshot = JSON.stringify(nodes);
  const clusters = clusterMistakes(nodes, vectors);
  assert.deepEqual(clusters.map(cluster => cluster.count), [3, 2, 1]);
  assert.equal(clusters.reduce((sum, cluster) => sum + cluster.count, 0), nodes.length);
  assert.ok(clusters.every(cluster => cluster.members.some(member => member.data.mistake === cluster.label)));
  assert.deepEqual(clusterMistakes([...nodes].reverse(), [...vectors].reverse()), clusters);
  assert.equal(JSON.stringify(nodes), snapshot);
});

test('complete-link prevents an ambiguous middle sentence from joining two unrelated clusters', () => {
  const angles = [0, 40, 80].map(degrees => degrees * Math.PI / 180);
  const groups = clusterMistakes([node('1'), node('2'), node('3')], angles.map(angle => [Math.cos(angle), Math.sin(angle)]), 0.7);
  assert.deepEqual(groups.map(cluster => cluster.count), [2, 1]);
});

test('behavioral compatibility preserves strongest observed matches and can support different surface wording', () => {
  const nodes = [node('1'), node('2'), node('3')];
  const vectors = [0, 20, 30].map(degrees => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)]);
  const observed = clusterMistakes(nodes, vectors, 0.93);
  assert.deepEqual(clusterMistakes(nodes, vectors, 0.93, (_a, _b, similarity) => similarity >= 0.93), observed);
  assert.deepEqual(observed[0].members.map(n => n.id), ['2', '3']);
  assert.equal(clusterMistakes(nodes.slice(0, 2), [[1, 0], [0, 1]], 0.93, () => true).length, 1);
});

test('embeddings normalize magnitude, reject malformed vectors, and keep Mistake and Description text', () => {
  assert.equal(cosine(normalizeVector([2, 0]), normalizeVector([9, 0])), 1);
  for (const invalid of [[], [0, 0], [NaN], [Infinity], ['1'], null]) assert.throws(() => normalizeVector(invalid));
  assert.throws(() => cosine([1, 0], [1]), /dimensions/);
  assert.throws(() => clusterMistakes([node('1')], []), /Each mistake/);
  assert.equal(mistakeText(node('1', '  Lost  focus ', 'Ignored\nimportant feedback')), 'Lost focus Ignored important feedback');
});

test('long fields split without dropping descriptions or breaking Unicode, including exact-sized words', () => {
  const text = `${'Delayed work '.repeat(120)}Ignored feedback at the meeting.`;
  const chunks = textChunks(text);
  assert.ok(chunks.every(chunk => Array.from(chunk).length <= 480 && chunk.length > 0));
  assert.equal(chunks.join(' '), text.trim());
  const emoji = '😀'.repeat(1000);
  assert.equal(textChunks(emoji).join(''), emoji);
  assert.deepEqual(textChunks('x'.repeat(480)), ['x'.repeat(480)]);
});

test('analysis excludes other node kinds, reuses duplicate and saved embeddings, and sends limited CPU batches', async t => {
  const values = new Map();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, EMBEDDING_MODEL);
    assert.deepEqual(body.options, EMBEDDING_OPTIONS);
    assert.equal(body.keep_alive, 0);
    assert.equal(body.truncate, false);
    assert.ok(body.input.length <= 8);
    return Response.json({ embeddings: body.input.map(text => text.includes('file') ? vector(0, 1) : vector(1)) });
  });
  mockStorage(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  const nodes = [node('1', 'I yelled', 'Lost my temper'), node('2', 'I yelled', 'Lost my temper'), node('3', 'Lost files'), node('4', 'Action entry', '', 'Action')];
  const clusters = await analyzeMistakes(nodes);
  assert.deepEqual(clusters.map(cluster => cluster.count), [2, 1]);
  assert.equal(fetch.mock.calls.length, 1);
  assert.equal(JSON.parse(fetch.mock.calls[0].arguments[1].body).input.length, 2);
  assert.ok(values.has(EMBEDDING_CACHE_KEY));
  await analyzeMistakes(nodes);
  assert.equal(fetch.mock.calls.length, 1);
  await analyzeMistakes([nodes[0]]);
  await analyzeMistakes([]);
  assert.equal(fetch.mock.calls.length, 1);
});

test('requests are sequential, bounded to eight inputs, preserve long text, and respect cancellation', async t => {
  let active = 0, maximum = 0;
  const inputs = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    active++; maximum = Math.max(maximum, active);
    const body = JSON.parse(options.body); inputs.push(...body.input);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return Response.json({ embeddings: body.input.map(() => vector(1)) });
  });
  mockStorage(t, { getItem: () => null, setItem: () => {} });
  const nodes = Array.from({ length: 12 }, (_, i) => node(String(i), `I delayed task number ${i}`, i === 0 ? 'Context '.repeat(150) : ''));
  await Promise.all([analyzeMistakes(nodes), analyzeMistakes(nodes.slice(0, 2))]);
  assert.equal(maximum, 1);
  assert.ok(inputs.some(text => text.includes('Context')));
  const controller = new AbortController(); controller.abort();
  const before = fetch.mock.calls.length;
  await assert.rejects(analyzeMistakes(nodes, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetch.mock.calls.length, before);
});

test('missing, busy, unreachable, or invalid Ollama responses fail instead of presenting invented clusters', async t => {
  mockStorage(t, { getItem: () => null, setItem: () => {} });
  const nodes = [node('1', 'Shouted'), node('2', 'Missed deadline')];
  for (const [response, message] of [[new Response('', { status: 404 }), /ollama pull/], [new Response('', { status: 503 }), /busy/], [Response.json({ embeddings: [] }), /incomplete/], [Response.json({ embeddings: [null, null] }), /dimensions/]]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(analyzeMistakes(nodes), message);
    mock.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(analyzeMistakes(nodes), /Start Ollama/);
});

test('model choices keep dimensions, prefixes, thresholds, and cached vectors separate', async t => {
  const values = new Map();
  mockStorage(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    assert.deepEqual(body.options, EMBEDDING_OPTIONS);
    assert.equal(body.keep_alive, 0);
    return Response.json({ embeddings: body.input.map((text, index) => index ? vector(0.8, 0.6, body.model) : vector(1, 0, body.model)) });
  });
  const nodes = [node('1', 'Tôi đã nổi nóng', 'Tôi lớn tiếng khi tranh luận.'), node('2', 'Tôi không giữ bình tĩnh', 'Tôi quát đồng nghiệp.')];
  const vietnamese = await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  const english = await analyzeMistakes(nodes, { model: ENGLISH_MODEL });
  assert.equal(vietnamese.length, 2, '0.8 similarity is below the multilingual model threshold');
  assert.equal(english.length, 1, 'the same vector similarity exceeds the MiniLM threshold');
  assert.ok(requests[0].input.every(text => text.startsWith('task: clustering | query: ')));
  assert.ok(requests[0].input.join(' ').includes('Tôi lớn tiếng khi tranh luận.'));
  assert.ok(!requests[1].input[0].startsWith('task:'));
  assert.notEqual(EMBEDDING_MODELS[ENGLISH_MODEL].cacheKey, EMBEDDING_MODELS[VIETNAMESE_MODEL].cacheKey);
  await analyzeMistakes(nodes, { model: ENGLISH_MODEL });
  await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  assert.equal(requests.length, 2, 'each model can reuse its own cached embeddings');
  values.set(EMBEDDING_MODELS[VIETNAMESE_MODEL].cacheKey, values.get(EMBEDDING_MODELS[ENGLISH_MODEL].cacheKey));
  await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  assert.equal(requests.length, 3, 'wrong-dimension cache entries are rejected');
  await assert.rejects(analyzeMistakes(nodes, { model: 'a-chat-model' }), /supported local embedding/);
});

test('Vietnamese is the default model and saved preferences are validated', t => {
  const values = new Map();
  mockStorage(t, { getItem: key => values.get(key) ?? null });
  assert.equal(readModelPreference(), VIETNAMESE_MODEL);
  values.set(MODEL_PREFERENCE_KEY, ENGLISH_MODEL);
  assert.equal(readModelPreference(), ENGLISH_MODEL);
  values.set(MODEL_PREFERENCE_KEY, 'an-unknown-model');
  assert.equal(readModelPreference(), VIETNAMESE_MODEL);
});

test('multilingual cache eviction bounds storage without losing any occurrences from the current analysis', async t => {
  const values = new Map();
  mockStorage(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    return Response.json({ embeddings: body.input.map(() => vector(1, 0, body.model)) });
  });
  const nodes = Array.from({ length: 70 }, (_, index) => node(String(index), `Tôi đã nổi nóng lần ${index}`));
  const groups = await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, nodes.length);
  assert.equal(JSON.parse(values.get(EMBEDDING_MODELS[VIETNAMESE_MODEL].cacheKey)).length, 64);
});

const behaviorSamples = [
  ['Ham thành tích mà không biết dừng lại nghỉ ngơi.', 'overvalued_goal', 'thành tích', 'achievement', 'Pursuing achievement without rest'],
  ['Kỹ thuật chạy bộ sai mà vẫn ráng chạy vì sợ giảm thành tích.', 'overvalued_goal', 'giảm thành tích', 'performance', 'Running despite poor technique to preserve performance'],
  ['Tôi ghi sai thành tích chạy bộ vì nhập nhầm số liệu.', 'attention_lapse', '', '', 'Recording results incorrectly'],
  ['Tôi chạy bộ sai kỹ thuật vì chưa được hướng dẫn đúng.', 'knowledge_gap', '', '', 'Running incorrectly without instruction'],
  ['Tôi nghỉ tập để phục hồi nên thành tích tạm thời giảm.', 'rest_or_correction', '', '', 'Choosing recovery despite a performance reduction'],
];

test('cause-aware clustering joins the Vietnamese performance tradeoffs, separates same-topic controls, and caches full-field profiles', async t => {
  const values = new Map();
  mockStorage(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  let chats = 0, active = 0, maximum = 0;
  const profiles = new Map(behaviorSamples.map(([text, mechanism, priority_quote, priority_label, behavior_label]) => [text, { mechanism, priority_quote, priority_label, behavior_label,
    priority_domain: mechanism === 'overvalued_goal' ? 'achievement_performance' : 'none' }]));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    if (url.endsWith('/chat')) {
      chats++;
      assert.equal(body.model, BEHAVIOR_MODEL);
      assert.equal(body.think, false);
      assert.equal(body.keep_alive, 0);
      assert.deepEqual(body.options, BEHAVIOR_OPTIONS);
      return Response.json({ done: true, message: { content: JSON.stringify(profiles.get(body.messages[1].content)) } });
    }
    // Raw embeddings deliberately say all five are the same topic. Cause
    // profiles must override even a very high surface-level cosine score.
    return Response.json({ embeddings: body.input.map(() => vector(1)) });
  });
  const nodes = behaviorSamples.map(([text], i) => {
    const words = text.split(' ');
    return node(String(i), words.slice(0, 5).join(' '), words.slice(5).join(' '));
  });
  const grouped = await analyzeMistakes(nodes);
  assert.deepEqual(grouped.map(c => c.members.map(n => n.id)), [['0', '1'], ['2'], ['3'], ['4']]);
  assert.equal(chats, 5);
  assert.equal(maximum, 1);
  assert.equal(JSON.parse(values.get(BEHAVIOR_CACHE_KEY)).length, 5);
  assert.deepEqual(await analyzeMistakes([...nodes].reverse()), grouped);
  assert.equal(chats, 5, 'unchanged full-field profiles survive a later analysis');
  const changedText = 'Ham thành tích mà không biết dừng lại nghỉ ngơi. Sợ thất bại.';
  profiles.set(changedText, profiles.get(behaviorSamples[0][0]));
  await analyzeMistakes([{ ...nodes[0], data: { ...nodes[0].data, description: `${nodes[0].data.description} Sợ thất bại.` } }, ...nodes.slice(1)]);
  assert.equal(chats, 6, 'a changed Description invalidates just that profile');
});

test('shared causal category alone cannot join unrelated goals; complete-link prevents a weak bridge', () => {
  const nodes = ['I ignored rest because I wanted approval.', 'I overworked because I feared disapproval.', 'I overspent because I wanted luxury.'].map((text, i) => node(String(i), text));
  const profiles = new Map(nodes.map(n => [mistakeText(n), { mechanism: 'overvalued_goal', priority_quote: n.id === '2' ? 'luxury' : 'approval', priority_label: '', behavior_label: '', priority_domain: n.id === '2' ? 'money_possessions' : 'approval_acceptance' }]));
  const vectors = new Map(nodes.map((n, i) => [mistakeText(n), i === 2 ? [0, 1] : [1, 0]]));
  const match = behavioralMatches(profiles, vectors, 0.925, VIETNAMESE_MODEL);
  assert.equal(match(nodes[0], nodes[1], 0.2), true);
  assert.equal(match(nodes[0], nodes[2], 0.99), false);
  vectors.set(mistakeText(nodes[2]), [1, 0]);
  assert.equal(match(nodes[0], nodes[2], 1), false, 'a matching embedding cannot override a different priority');
  assert.deepEqual(clusterMistakes(nodes, [[1, 0], [1, 0], [1, 0]], 0.925, match).map(c => c.count), [2, 1]);
});

test('fabricated source spans, missing priorities, truncated and invalid profiles cannot become supported causes', async t => {
  const valid = { mechanism: 'overvalued_goal', priority_quote: 'approval', priority_label: 'approval', behavior_label: 'Overworking to gain approval', priority_domain: 'approval_acceptance' };
  assert.equal(validateBehaviorProfile(valid, 'I overworked because I wanted approval.').mechanism, 'overvalued_goal');
  assert.throws(() => validateBehaviorProfile(valid, 'I rested.'), /unsupported source/);
  assert.throws(() => validateBehaviorProfile({ ...valid, priority_quote: '' }, 'I rested.'), /support/);
  assert.throws(() => validateBehaviorProfile({ ...valid, mechanism: 'invented' }, 'approval'), /invalid/);
  mockStorage(t, { getItem: () => null, setItem: () => {} });
  const nodes = [node('1', 'I overworked because I wanted approval.'), node('2', 'I kept working despite fatigue.')];
  for (const response of [
    { message: { content: JSON.stringify({ ...valid, priority_quote: 'not in either source' }) } },
    { done_reason: 'length', message: { content: '{}' } },
    { message: { content: 'not json' } },
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(response));
    const profiles = await behaviorProfiles(nodes);
    assert.deepEqual([...profiles.values()], [null, null], 'unsupported profiles stay unclassified instead of erasing valid clusters');
    const match = behavioralMatches(profiles, new Map(), 0.925, VIETNAMESE_MODEL);
    assert.equal(match(nodes[0], nodes[1], 1), false);
    mock.mock.restore();
  }
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(behaviorProfiles(nodes, aborted.signal), { name: 'AbortError' });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(behaviorProfiles(nodes), /ollama pull qwen3.5/);
});
