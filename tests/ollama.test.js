import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMistakes } from '../src/ollama.js';
import { ENGLISH_MODEL, VIETNAMESE_MODEL } from '../src/embedding-models.js';
import { buildProgressReport, comparisonPeriods } from '../src/progress-analytics.js';
import { explainProgress, EXPLANATION_MODEL } from '../src/progress-explanations.js';
import { parseDate } from '../src/model.js';
import { BEHAVIOR_MODEL } from '../src/behavior-patterns.js';
import { localChat } from '../src/local-ollama-chat.js';

test('real local Ollama groups semantic paraphrases, includes Description, and unloads the CPU model', async () => {
  const sentences = [
    'I lost my temper and shouted at a colleague.',
    'I raised my voice angrily during a disagreement.',
    'I got defensive when someone challenged my opinion.',
    'I rejected feedback because I felt my views were being attacked.',
    'I procrastinated and missed the project deadline.',
    'I put off an important task until it was overdue.',
    'I forgot to back up my files and lost my work.',
  ];
  // Distribute the actual sentence over both fields; the description supplies
  // semantic context instead of serving as an ignored display-only value.
  const nodes = sentences.map((sentence, i) => {
    const words = sentence.split(' ');
    return { id: String(i), data: {
      kind: 'Mistake', mistake: words.slice(0, 5).join(' '), description: words.slice(5).join(' '), time: i,
    } };
  });
  const clusters = await analyzeMistakes(nodes, { model: ENGLISH_MODEL });
  assert.deepEqual(clusters.map(cluster => cluster.members.map(node => Number(node.id)).sort()).sort((a, b) => a[0] - b[0]), [[0, 1], [2, 3], [4, 5], [6]]);
  const running = await (await fetch('http://127.0.0.1:11434/api/ps')).json();
  assert.ok(!running.models.some(model => model.name === ENGLISH_MODEL), 'the embedding model is released after analysis');
});

test('real multilingual Ollama model groups Vietnamese paraphrases from both fields and unloads afterward', async () => {
  const sentences = [
    'Tôi đã nổi nóng và quát mắng đồng nghiệp.',
    'Tôi mất bình tĩnh và lớn tiếng với người khác.',
    'Tôi trì hoãn công việc nên không hoàn thành đúng hạn.',
    'Tôi cứ để việc đến phút cuối rồi bị trễ hạn.',
    'Tôi quên sao lưu dữ liệu nên bị mất tài liệu.',
    'Tôi phản ứng phòng thủ khi người khác góp ý.',
    'Tôi cố bảo vệ quan điểm của mình và không chịu nghe phản hồi.',
  ];
  const nodes = sentences.map((sentence, index) => ({ id: String(index), data: {
    kind: 'Mistake', mistake: sentence.split(' ').slice(0, 5).join(' '),
    description: sentence.split(' ').slice(5).join(' '), time: index,
  } }));
  const clusters = await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  assert.deepEqual(clusters.map(cluster => cluster.members.map(node => Number(node.id)).sort()).sort((a, b) => a[0] - b[0]), [[0, 1], [2, 3], [4], [5, 6]]);
  const running = await (await fetch('http://127.0.0.1:11434/api/ps')).json();
  assert.ok(!running.models.some(model => model.name === VIETNAMESE_MODEL));
});

test('real local model gives a conditional Vietnamese cluster hypothesis grounded in two mistakes', async () => {
  const nodes = [
    { id: '7a73181e-c87c-4a58-b2ae-d1ca676ea889', data: { kind: 'Mistake', time: parseDate('14/07/26'), mistake: 'Ham th?nh t?ch m? kh?ng bi?t d?ng l?i ngh? ng?i.', description: '' } },
    { id: '02471f3c-8711-4ccb-b883-70c0ef78d320', data: { kind: 'Mistake', time: parseDate('15/10/26'), mistake: 'K? thu?t ch?y b? sai m? v?n r?ng ch?y v? s? gi?m th?nh t?ch.', description: '' } },
  ];
  const clusters = [{ id: 'achievement-cluster', label: 'Ham th?nh t?ch', members: nodes, count: 2 }];
  const report = buildProgressReport(nodes, [], clusters, comparisonPeriods(new Date(2026, 10, 8, 12)));
  const findings = await explainProgress(report);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].clusterId, 'achievement-cluster');
  assert.equal(findings[0].evidenceIds.length, 2);
  assert.ok(findings[0].evidenceIds.every(id => nodes.some(node => node.id === id)));
  assert.match(findings[0].text, /c? th?|c? l?|d??ng nh?|gi? thuy?t|n?u/iu);
  assert.notEqual(findings[0].text, findings[0].observedPattern);
  console.log('Cluster hypothesis:', findings[0].text);
  const running = await (await fetch('http://127.0.0.1:11434/api/ps')).json();
  assert.ok(!running.models.some(model => model.name === EXPLANATION_MODEL));
});

test('real Vietnamese cause-aware clustering joins the supplied performance examples and excludes same-topic counterexamples', async () => {
  const sentences = [
    'Ham thành tích mà không biết dừng lại nghỉ ngơi.',
    'Kỹ thuật chạy bộ sai mà vẫn ráng chạy vì sợ giảm thành tích.',
    'Tôi ghi sai thành tích chạy bộ vì nhập nhầm số liệu.',
    'Tôi chạy bộ sai kỹ thuật vì chưa được hướng dẫn đúng.',
    'Tôi nghỉ tập để phục hồi nên thành tích tạm thời giảm.',
  ];
  const nodes = sentences.map((text, i) => ({ id: String(i), data: {
    kind: 'Mistake', mistake: text.split(' ').slice(0, 5).join(' '), description: text.split(' ').slice(5).join(' '), time: i,
  } }));
  const clusters = await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  assert.deepEqual(clusters.map(cluster => cluster.members.map(node => Number(node.id)).sort()).sort((a, b) => a[0] - b[0]), [[0, 1], [2], [3], [4]]);
  const running = await (await fetch('http://127.0.0.1:11434/api/ps')).json();
  assert.ok(!running.models.some(model => [VIETNAMESE_MODEL, BEHAVIOR_MODEL].includes(model.name)));
});

test('real local analysis separates distinct overvalued goals rather than merging every motivation into one cluster', async () => {
  const sentences = ['Ham thành tích mà không biết dừng lại nghỉ ngơi.', 'Tôi làm việc quá sức vì sợ người khác không hài lòng.'];
  const nodes = sentences.map((mistake, i) => ({ id: String(i), data: { kind: 'Mistake', mistake, description: '', time: i } }));
  const clusters = await analyzeMistakes(nodes, { model: VIETNAMESE_MODEL });
  assert.deepEqual(clusters.map(cluster => cluster.count), [1, 1]);
});

test('real streaming cancellation interrupts active inference and releases the canceled model', async () => {
  const controller = new AbortController();
  let generated = false, canceledAt;
  await assert.rejects(localChat({ model: EXPLANATION_MODEL,
    messages: [{ role: 'user', content: 'Count from 1 to 10000, one integer per line. Continue counting without stopping.' }],
    options: { num_gpu: 0, num_thread: 2, num_ctx: 4096, num_predict: 2048 },
  }, { signal: controller.signal, onContent: chunk => {
    if (!generated && chunk.trim()) { generated = true; canceledAt = Date.now(); controller.abort(); }
  } }), { name: 'AbortError' });
  assert.equal(generated, true, 'cancel only after real token generation has begun');
  while (Date.now() - canceledAt < 15_000) {
    const { models } = await (await fetch('http://127.0.0.1:11434/api/ps')).json();
    if (!models.some(model => model.name === EXPLANATION_MODEL)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail('Ollama did not release the canceled inference model promptly');
});
