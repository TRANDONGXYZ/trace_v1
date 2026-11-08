import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate } from '../src/model.js';
import { buildProgressReport, comparisonPeriods } from '../src/progress-analytics.js';
import { explainProgress, explanationJobs, evidenceAliases, clusterBatches, validateFinding, EXPLANATION_MODEL, EXPLANATION_OPTIONS, EXPLANATION_INPUT_LIMIT } from '../src/progress-explanations.js';
import { analyzeMistakes, EMBEDDING_MODEL } from '../src/ollama.js';
import { EMBEDDING_MODELS } from '../src/embedding-models.js';

const node = (id, date, mistake, description = '', kind = 'Mistake') => ({ id, data: { kind, time: parseDate(date), mistake, description } });
function report(suffix = '') {
  const nodes = [node(`first${suffix}`, '14/07/26', 'Ham thành tích mà không biết dừng lại nghỉ ngơi.'),
    node(`second${suffix}`, '15/10/26', 'Kỹ thuật chạy bộ sai mà vẫn ráng chạy', 'Vì sợ giảm thành tích.')];
  return buildProgressReport(nodes, [], [{ id: `cluster${suffix}`, label: 'Ham thành tích', members: nodes, count: 2 }], comparisonPeriods(new Date(2026, 10, 8, 12)));
}
const response = value => Response.json({ done: true, message: { content: JSON.stringify(value) } });
function supported(input, explanation = 'Có thể người dùng gắn giá trị bản thân với kết quả; cần kiểm tra giả thuyết này thay vì coi là sự thật.') {
  const ids = [...new Set([...input.records.map(r => r.id), ...input.observations.flatMap(n => n.evidence_ids)])].slice(0, 2);
  return { evidence_ids: ids, observed_pattern: 'Cả hai lần đều tiếp tục theo đuổi thành tích khi cần dừng lại hoặc điều chỉnh.', explanation: input.mode === 'observe' ? '' : explanation };
}

test('explanation plans are per recurring cluster, include older history and full fields, and exclude future/non-Mistake members', () => {
  const data = report('scope');
  const group = data.trends[0];
  group.members.push(node('history', '01/01/25', 'Earlier occurrence', 'Older context'), node('future', '09/11/26', 'Future occurrence'), node('action', '15/10/26', 'Action', '', 'Action'));
  group.recent.push(node('singleton', '15/10/26', 'New mistake'));
  data.trends.push({ id: 'single', label: 'single', members: [group.recent.at(-1)], recent: [group.recent.at(-1)] });
  const jobs = explanationJobs(data);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].cluster.count, 3);
  assert.deepEqual([...new Set(jobs[0].records.map(r => r.id))], ['history', 'firstscope', 'secondscope']);
  assert.ok(jobs[0].records.some(r => r.text.includes('Vì sợ giảm thành tích.')));
  assert.equal(jobs[0].cluster.first, parseDate('01/01/25'));
  assert.ok(!JSON.stringify(jobs).includes('Future occurrence'));
});

test('long cluster contexts retain every field and all batches contain multiple source mistakes within the input limit', () => {
  const data = report('long');
  data.trends[0].members[0].data.description = 'Không nghỉ ngơi và cần xem lại kỹ thuật. '.repeat(240);
  const job = explanationJobs(data)[0], batches = clusterBatches(job);
  assert.ok(batches.length > 1);
  assert.ok(batches.every(records => new Set(records.map(r => r.id)).size >= 2));
  assert.ok(batches.every(records => new TextEncoder().encode(JSON.stringify(evidenceAliases({ ...job, records, mode: 'observe' }).input)).length <= EXPLANATION_INPUT_LIMIT));
  const pieces = [...new Map(batches.flat().filter(r => r.id === 'firstlong').map(r => [r.part, r])).values()]
    .sort((a, b) => parseInt(a.part) - parseInt(b.part));
  assert.equal(pieces.map(r => r.text).join(' ').replace(/\s+/gu, ' ').trim(), `Mistake: ${data.trends[0].members[0].data.mistake} Description: ${data.trends[0].members[0].data.description}`.replace(/\s+/gu, ' ').trim());
});

test('short citations map UUIDs exactly and require at least two distinct mistakes within this cluster', () => {
  const job = explanationJobs(report('aliases'))[0];
  job.records[0].id = '9a944a6f-1b44-46ed-aefa-6cbec741fe71';
  job.records[1].id = '8e2e755f-7c76-4ef3-8986-dea91e91ac34';
  const { input, aliases } = evidenceAliases(job);
  assert.ok(!JSON.stringify(input).includes(job.records[0].id));
  const value = supported(input);
  assert.deepEqual(validateFinding(value, job, aliases).evidenceIds, job.records.map(r => r.id));
  for (const ids of [['R1'], ['R1', 'R1'], ['R1', 'R99'], ['R1', 'r2'], ['R1', 'unrelated-action'], ['R1', null]]) {
    assert.throws(() => validateFinding({ ...value, evidence_ids: ids }, job, aliases), /two distinct/);
  }
});

test('cluster analysis is collective, conditional, CPU limited, streaming, cached, and invalidated by changed descriptions', async t => {
  const data = report('valid');
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.messages[1].content);
    assert.equal(body.model, EXPLANATION_MODEL); assert.deepEqual(body.options, EXPLANATION_OPTIONS);
    assert.equal(body.stream, true); assert.equal(body.think, false); assert.equal(body.truncate, false); assert.equal(body.keep_alive, 0);
    assert.equal(input.records.length, 2); assert.equal(input.mode, 'explain');
    assert.ok(body.messages[0].content.includes('never each event individually'));
    assert.ok(body.messages[0].content.includes('HYPOTHESES, never facts'));
    assert.ok(body.messages[0].content.includes('Never diagnose'));
    return response(supported(input));
  });
  const findings = await explainProgress(data);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].clusterId, 'clustervalid');
  assert.deepEqual(findings[0].evidenceIds, ['firstvalid', 'secondvalid']);
  await explainProgress(data); assert.equal(fetch.mock.calls.length, 1);
  data.trends[0].members[1].data.description += ' Tôi không muốn nghỉ.';
  await explainProgress(data); assert.equal(fetch.mock.calls.length, 2);
});

test('large clusters use collective evidence batches and one final shared hypothesis, without losing text or caching intermediate hypotheses', async t => {
  const data = report('hierarchy');
  data.trends[0].members[0].data.description = 'Tôi tiếp tục tập luyện và không xem lại nền tảng. '.repeat(160);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content); calls.push(input);
    assert.ok(new TextEncoder().encode(JSON.stringify(input)).length <= EXPLANATION_INPUT_LIMIT);
    return response(supported(input));
  });
  const findings = await explainProgress(data);
  assert.equal(findings.length, 1);
  assert.ok(calls.filter(call => call.mode === 'observe').length > 1);
  assert.equal(calls.filter(call => call.mode === 'explain').length, 1);
  assert.ok(calls.at(-1).observations.length > 0);
  const seen = new Set(calls.flatMap(call => call.records.map(r => `${r.part}:${r.text}`)));
  assert.ok(explanationJobs(data)[0].records.every(r => seen.has(`${r.part}:${r.text}`)));
});

test('unsupported output affects only its cluster, valid results remain visible, and invalid output is retried', async t => {
  const data = report('partial-good'); data.trends.push(...report('partial-bad').trends);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    return response(calls === 1 ? supported(input) : { ...supported(input), evidence_ids: ['R1', 'invented'] });
  });
  const updates = [];
  assert.equal((await explainProgress(data, { onUpdate: update => updates.push(update) })).length, 1);
  assert.match(updates.at(-1).warnings[0], /unsupported evidence/);
  assert.equal(updates.at(-1).findings.length, 1);
  await explainProgress(data); assert.equal(calls, 3);
});

test('infrastructure failure preserves a completed cluster and stops subsequent model work', async t => {
  const data = report('before-outage'); data.trends.push(...report('outage').trends, ...report('after-outage').trends);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => ++calls === 1
    ? response(supported(JSON.parse(JSON.parse(options.body).messages[1].content))) : new Response('', { status: 503 }));
  const results = await explainProgress(data);
  assert.equal(calls, 2); assert.equal(results.length, 1);
});

test('insufficient evidence, singletons and unavailable clusters never yield assumed psychological causes', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({ observed_pattern: '', explanation: '', evidence_ids: [] }));
  assert.deepEqual(await explainProgress(report('insufficient')), []);
  const single = report('single'); single.trends[0].members.pop();
  assert.deepEqual(await explainProgress(single), []);
  await assert.rejects(explainProgress({ ...single, trends: null }), /Wait for mistake clustering/);
  assert.equal(fetch.mock.calls.length, 1);
});

test('cancel closes a live response, schedules no subsequent cluster, and caches no partial conclusion', async t => {
  const data = report('cancel'); data.trends.push(...report('cancel-next').trends);
  const controller = new AbortController(); let notify;
  const started = new Promise(resolve => { notify = resolve; });
  let closed = false, transport;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    transport = options.signal;
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{"message":{"content":"partial"},"done":false}\n')); notify();
    }, cancel() { closed = true; } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  });
  const pending = explainProgress(data, { signal: controller.signal });
  await started; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(closed, true); assert.equal(transport.aborted, true); assert.equal(fetch.mock.calls.length, 1);
  t.mock.method(globalThis, 'fetch', async (_url, options) => response(supported(JSON.parse(JSON.parse(options.body).messages[1].content))));
  assert.equal((await explainProgress(data)).length, 2, 'a canceled stream cannot poison the queue or cache');
});

test('embedding and cluster explanation jobs share one model queue', async t => {
  let active = 0, maximum = 0; const models = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return url.endsWith('/embed') ? Response.json({ embeddings: body.input.map(() => [1, ...Array(EMBEDDING_MODELS[body.model].dimensions - 1).fill(0)]) })
      : response(supported(JSON.parse(body.messages[1].content)));
  });
  await Promise.all([analyzeMistakes([node('one', '10/10/26', 'Fresh sentence'), node('two', '11/10/26', 'Another sentence')]), explainProgress(report('queued'))]);
  assert.equal(maximum, 1); assert.deepEqual(models, [EMBEDDING_MODEL, EXPLANATION_MODEL]);
});
