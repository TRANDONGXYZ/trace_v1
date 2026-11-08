import assert from 'node:assert/strict';
process.env.TRACE_AI_PROVIDER = 'cloudflare';
const base = process.env.TRACE_TEST_API || 'http://127.0.0.1:8787';
const origin = process.env.TRACE_TEST_ORIGIN || 'http://127.0.0.1:5173';
const nativeFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('/api/ai/')) {
    requests++;
    const response = await nativeFetch(new URL(url, base), { ...options, headers: { ...options.headers, Origin: origin } });
    if (String(url).endsWith('/profile') && response.ok) {
      const { result } = await response.clone().json();
      console.log('Behavior role:', result.mechanism, result.priority_domain, result.priority_quote);
    }
    return response;
  }
  return nativeFetch(url, options);
};
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const { analyzeMistakes } = await import('../src/ollama.js');
const { CLOUD_ENGLISH_PRESET } = await import('../shared/ai-models.js');
const { parseDate } = await import('../src/model.js');
const { buildProgressReport, comparisonPeriods } = await import('../src/progress-analytics.js');
const { explainProgress } = await import('../src/progress-explanations.js');
const sentences = [
  'Ham thành tích mà không biết dừng lại nghỉ ngơi.',
  'Kỹ thuật chạy bộ sai mà vẫn ráng chạy vì sợ giảm thành tích.',
  'Tôi ghi sai thành tích chạy bộ vì nhập nhầm số liệu.',
  'Tôi chạy bộ sai kỹ thuật vì chưa được hướng dẫn đúng.',
  'Tôi nghỉ tập để phục hồi nên thành tích tạm thời giảm.',
  'Tôi làm việc quá sức vì sợ người khác không hài lòng.',
];
const nodes = sentences.map((text, index) => ({ id: String(index), data: {
  kind: 'Mistake', mistake: text.split(' ').slice(0, 5).join(' '), description: text.split(' ').slice(5).join(' '), time: parseDate(`${14 + index}/10/26`),
} }));
const clusters = await analyzeMistakes(nodes);
const membership = clusters.map(cluster => cluster.members.map(node => Number(node.id)).sort()).sort((a, b) => a[0] - b[0]);
console.log('Cloud cluster membership:', membership);
assert.deepEqual(membership, [[0, 1], [2], [3], [4], [5]]);
const before = requests;
await analyzeMistakes(nodes);
assert.equal(requests, before, 'unchanged analysis must reuse browser caches');
const report = buildProgressReport(nodes, [], clusters, comparisonPeriods(new Date(2026, 10, 8, 12)));
const findings = await explainProgress(report);
assert.equal(findings.length, 1);
assert.equal(findings[0].evidenceIds.length, 2);
assert.ok(findings[0].evidenceIds.every(id => ['0', '1'].includes(id)));
assert.match(findings[0].text, /có thể|có lẽ|dường như|giả thuyết|nếu/iu);
console.log('Cloud psychological hypothesis:', findings[0].text);
const completed = requests;
await explainProgress(report);
assert.equal(requests, completed, 'unchanged explanations must be cached');
const samples = [
  ['Tôi đã nổi nóng và quát mắng đồng nghiệp.', 'Tôi mất bình tĩnh và lớn tiếng với người khác.',
    'Tôi trì hoãn công việc nên không hoàn thành đúng hạn.', 'Tôi cứ để việc đến phút cuối rồi bị trễ hạn.',
    'Tôi quên sao lưu dữ liệu nên bị mất tài liệu.', 'Tôi phản ứng phòng thủ khi người khác góp ý.',
    'Tôi cố bảo vệ quan điểm của mình và không chịu nghe phản hồi.'],
  ['I lost my temper and shouted at a colleague.', 'I raised my voice angrily during a disagreement.',
    'I got defensive when someone challenged my opinion.', 'I rejected feedback because I felt my views were being attacked.',
    'I procrastinated and missed the project deadline.', 'I put off an important task until it was overdue.', 'I forgot to back up my files and lost my work.'],
];
for (const [index, sample] of samples.entries()) {
  const events = sample.map((mistake, i) => ({ id: String(i), data: { kind: 'Mistake', mistake, description: '', time: i } }));
  const groups = await analyzeMistakes(events, index === 1 ? { model: CLOUD_ENGLISH_PRESET } : {});
  const actual = groups.map(group => group.members.map(n => Number(n.id)).sort()).sort((a, b) => a[0] - b[0]);
  console.log(index === 0 ? 'Vietnamese paraphrases:' : 'English paraphrases:', actual);
  assert.deepEqual(actual, index === 0 ? [[0, 1], [2, 3], [4], [5, 6]] : [[0, 1], [2, 3], [4, 5], [6]]);
}
console.log(`Cloud live checks passed (${requests} requests; no Ollama used).`);
