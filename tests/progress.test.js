import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, parseDate } from '../src/model.js';
import { comparisonPeriods, buildProgressReport, traceRecordedActions, periodLabel } from '../src/progress-analytics.js';

const node = (id, kind, date, mistake = id, description = '') => ({ id, data: { kind, time: parseDate(date), mistake, description } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
const periods = () => comparisonPeriods(new Date(2026, 10, 8, 12));
function fixture() {
  const nodes = [
    node('p1', 'Mistake', '10/07/26', 'Nổi nóng'), node('p2', 'Mistake', '10/08/26', 'Mất bình tĩnh'),
    node('r1', 'Mistake', '10/09/26', 'Nổi nóng'), node('r2', 'Mistake', '15/10/26', 'Lớn tiếng'), node('r3', 'Mistake', '08/11/26', 'Quát đồng nghiệp'),
    node('new', 'Mistake', '20/10/26', 'Trì hoãn'), node('old', 'Mistake', '08/07/26', 'Trì hoãn'), node('ceased', 'Mistake', '15/08/26', 'Quên lịch'),
    node('future', 'Mistake', '09/11/26', 'Nổi nóng'),
    node('ps', 'Success', '01/08/26'), node('rs', 'Success', '25/10/26'), node('rm', 'Milestone', '30/10/26'),
    node('pb', 'Blocked', '08/09/26'), node('rb', 'Blocked', '22/10/26', 'Chưa được duyệt', 'Tôi đã gửi hồ sơ nhưng chưa nhận được phản hồi.'),
    node('pc', 'Consequence', '05/08/26'), node('rc1', 'Consequence', '10/10/26'), node('rc2', 'Consequence', '21/10/26'),
    node('a-old', 'Action', '01/07/26'), node('a', 'Action', '15/09/26'), node('attempt', 'Action', '19/10/26'),
    node('goal', 'Goal', '01/10/26'), node('after', 'Action', '26/10/26'), node('unrelated', 'Action', '20/09/26'), node('a-future', 'Action', '09/11/26'),
  ];
  const edges = [edge('a-old', 'goal'), edge('a', 'goal'), edge('goal', 'rs'), edge('a', 'rm'), edge('rs', 'after'),
    edge('attempt', 'rb'), edge('a-future', 'rb'), edge('r1', 'rc1'), edge('a', 'rc2')];
  const groups = [['p1', 'p2', 'r1', 'r2', 'r3', 'future'], ['new', 'old'], ['ceased']].map((ids, index) => ({
    id: `cluster-${index}`, label: nodes.find(n => n.id === ids[0]).data.mistake, members: nodes.filter(n => ids.includes(n.id)), count: ids.length,
  }));
  return { nodes, edges, groups };
}

test('rolling periods include today, have no overlap/gap, clamp month ends, and preserve local calendar dates', () => {
  const spans = periods();
  assert.equal(periodLabel(spans.recent), '09/09/26 – 08/11/26');
  assert.equal(periodLabel(spans.previous), '09/07/26 – 08/09/26');
  assert.equal(spans.previous.end, spans.recent.start);
  const endOfMarch = comparisonPeriods(new Date(2027, 2, 31, 12));
  assert.equal(periodLabel(endOfMarch.recent), '01/02/27 – 31/03/27');
  assert.equal(periodLabel(endOfMarch.previous), '01/12/26 – 31/01/27');
  const leap = comparisonPeriods(new Date(2028, 3, 30, 12));
  assert.equal(leap.recent.start, parseDate('01/03/28'));
  assert.equal(leap.recent.end, parseDate('01/05/28'));
  assert.equal(leap.previous.start, parseDate('01/01/28'));
  assert.equal(leap.previous.end, leap.recent.start);
  const august = comparisonPeriods(new Date(2026, 7, 30, 12));
  assert.equal(periodLabel(august.recent), '30/06/26 – 30/08/26');
  assert.equal(periodLabel(august.previous), '30/04/26 – 29/06/26');
  const morning = comparisonPeriods(new Date(2026, 10, 8, 0, 1));
  assert.deepEqual(morning, spans);
});

test('recorded comparisons classify recurring, increasing, new-in-comparison, and ceased mistake types with date ranges', () => {
  const { nodes, edges, groups } = fixture();
  const snapshot = JSON.stringify({ nodes, edges, groups });
  const report = buildProgressReport(nodes, edges, groups, periods());
  const row = kind => report.counts.find(row => row.kind === kind);
  assert.deepEqual(row('Mistake'), { kind: 'Mistake', recent: 4, previous: 3, change: 1 });
  assert.deepEqual(report.achievementCount, { recent: 2, previous: 1, change: 1 });
  assert.deepEqual(row('Consequence'), { kind: 'Consequence', recent: 2, previous: 1, change: 1 });
  assert.deepEqual(row('Blocked'), { kind: 'Blocked', recent: 1, previous: 1, change: 0 });
  assert.equal(report.trends[0].recent.length, 3);
  assert.equal(report.trends[0].previous.length, 2);
  assert.equal(report.trends[0].change, 1);
  assert.equal(report.trends[0].recurring, true);
  assert.deepEqual(report.trends[0].recentRange, { first: parseDate('10/09/26'), last: parseDate('08/11/26') });
  assert.equal(report.trends[1].isNew, true, 'an older occurrence outside the baseline does not negate new-in-comparison');
  assert.equal(report.trends[2].change, -1);
  assert.equal(report.trends[2].recentRange, null);
  assert.equal(JSON.stringify({ nodes, edges, groups }), snapshot);
});

test('window boundary nodes appear exactly once; future and older records never enter period totals', () => {
  const nodes = ['08/07/26', '09/07/26', '08/09/26', '09/09/26', '08/11/26', '09/11/26'].map((date, i) => node(String(i), 'Mistake', date));
  const report = buildProgressReport(nodes, [], [], periods());
  assert.deepEqual(report.previous.map(n => n.id), ['1', '2']);
  assert.deepEqual(report.recent.map(n => n.id), ['3', '4']);
  const empty = buildProgressReport([], [], [], periods());
  assert.ok(empty.counts.every(row => row.recent === 0 && row.previous === 0));
  assert.deepEqual(empty.trends, []);
  assert.equal(buildProgressReport(nodes, [], null, periods()).trends, null);
});

test('upstream Action traces include indirect and merged paths, permit older Actions, and exclude downstream, unrelated, and invalid future links', () => {
  const { nodes, edges, groups } = fixture();
  const trace = traceRecordedActions(nodes, edges, 'rs');
  assert.deepEqual(trace.actions.map(record => record.node.id), ['a-old', 'a']);
  assert.deepEqual(trace.actions[0].path.map(n => n.id), ['a-old', 'goal', 'rs']);
  const report = buildProgressReport(nodes, edges, groups, periods());
  assert.deepEqual(report.blocked[0].trace.actions.map(record => record.node.id), ['attempt']);
  assert.ok(!report.blocked[0].trace.nodes.some(n => n.id === 'a-future'));
  assert.equal(report.consequences.length, 2);
  assert.deepEqual(traceRecordedActions(nodes, edges, 'missing'), { actions: [], nodes: [], edges: [] });
  const removed = edges.filter(e => e.source !== 'goal');
  assert.equal(traceRecordedActions(nodes, removed, 'rs').actions.length, 0);
});

test('same-date Action paths tolerate merges and cycles without duplication or infinite traversal', () => {
  const nodes = [node('a', 'Action', '08/11/26'), node('b', 'Goal', '08/11/26'), node('s', 'Success', '08/11/26')];
  const trace = traceRecordedActions(nodes, [edge('a', 'b'), edge('b', 'a'), edge('b', 's'), edge('a', 's')], 's');
  assert.equal(trace.actions.length, 1);
  assert.deepEqual(trace.actions[0].path.map(n => n.id), ['a', 's']);
});

