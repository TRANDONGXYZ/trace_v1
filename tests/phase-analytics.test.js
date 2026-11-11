import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { calendarPhase, phaseLabel, buildPhaseAnalytics, PHASE_KINDS } from '../src/phase-analytics.js';
import { parseDate } from '../src/model.js';
import { phaseFixture } from './phase-fixtures.js';

const current = () => calendarPhase(new Date(2026, 10, 11, 12));
const node = (id, kind, date) => ({ id, data: { kind, time: parseDate(date), mistake: id, description: '' } });
const category = (report, kind) => report.categories.find(item => item.kind === kind);

test('odd/even months share all six fixed phases, including year and leap-day boundaries', () => {
  for (const year of [2026, 2027, 2028]) for (let month = 0; month < 12; month++) {
    const phase = calendarPhase(new Date(year, month, 12, 12));
    assert.equal(phase.start, Date.UTC(year, Math.floor(month / 2) * 2, 1));
    assert.equal(phase.end, Date.UTC(year, Math.floor(month / 2) * 2 + 2, 1));
  }
  assert.deepEqual(current(), calendarPhase(new Date(2026, 11, 12, 12)));
  assert.equal(phaseLabel(current()), '01/11/2026 – 31/12/2026');
  assert.equal(phaseLabel(calendarPhase(new Date(2027, 0, 1))), '01/01/2027 – 28/02/2027');
  assert.equal(phaseLabel(calendarPhase(new Date(2028, 1, 29))), '01/01/2028 – 29/02/2028');
});

test('phase selection uses device-local month even when the UTC date is in the preceding month', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { calendarPhase } from './src/phase-analytics.js'; console.log(JSON.stringify(calendarPhase(new Date('2026-10-31T18:30:00Z'))));"],
  { env: { ...process.env, TZ: 'Asia/Bangkok' }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), current());
});

test('chart includes all seven kinds, whole-phase future events and exact boundaries, without mutating the graph', () => {
  const graph = phaseFixture(), before = JSON.stringify(graph);
  const report = buildPhaseAnalytics(graph.nodes, graph.edges, current());
  assert.deepEqual(report.categories.map(item => item.kind), PHASE_KINDS);
  assert.deepEqual(report.categories.map(item => item.count), [5, 4, 2, 1, 1, 1, 1]);
  assert.ok(category(report, 'Mistake').events.some(item => item.node.id === 'm-december'));
  assert.ok(!report.categories.some(item => item.events.some(row => ['old', 'next', 'c-future'].includes(row.node.id))));
  const january = buildPhaseAnalytics(graph.nodes, graph.edges, calendarPhase(new Date(2027, 0, 1)));
  assert.equal(category(january, 'Mistake').count, 1);
  assert.equal(category(january, 'Consequence').count, 1);
  assert.equal(JSON.stringify(graph), before);
});

test('Mistakes rank by distinct direct/indirect downstream Consequences across phases, with stable ties', () => {
  const { nodes, edges } = phaseFixture();
  const rows = category(buildPhaseAnalytics(nodes, edges, current()), 'Mistake').events;
  assert.deepEqual(rows.map(row => [row.node.id, row.reachableCount]), [
    ['m-high', 3], ['m-low', 1], ['m-tie', 1], ['m-zero', 0], ['m-december', 0],
  ]);
});

test('Consequences rank by distinct downstream Actions through intermediate Consequences and Actions', () => {
  const { nodes, edges } = phaseFixture();
  const rows = category(buildPhaseAnalytics(nodes, edges, current()), 'Consequence').events;
  assert.deepEqual(rows.map(row => [row.node.id, row.reachableCount]), [['c-one', 3], ['c-two', 3], ['c-small', 1], ['c-zero', 0]]);
});

test('cycles, duplicate paths, self-links and dangling endpoints terminate without counting start or unrelated records', () => {
  const nodes = [node('c', 'Consequence', '01/11/26'), node('a', 'Action', '01/11/26'),
    node('b', 'Action', '01/11/26'), node('unrelated', 'Action', '01/11/26')];
  const edges = [['c', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'c'], ['c', 'a'], ['c', 'missing'], ['missing', 'unrelated']]
    .map(([source, target]) => ({ source, target }));
  const report = buildPhaseAnalytics(nodes, edges, current());
  assert.equal(category(report, 'Consequence').events[0].reachableCount, 2);
  // Traversal crosses any intermediate type, not just a Consequence-only chain.
  const mixed = [node('m', 'Mistake', '01/11/26'), ...nodes];
  const rows = category(buildPhaseAnalytics(mixed, [{ source: 'm', target: 'a' }, ...edges], current()), 'Mistake').events;
  assert.equal(rows[0].reachableCount, 1);
});

test('other five types have no ranking metric; empty/zero categories remain selectable and represented', () => {
  const { nodes, edges } = phaseFixture();
  const report = buildPhaseAnalytics(nodes, edges, current());
  for (const kind of ['Action', 'Milestone', 'Goal', 'Blocked', 'Success']) {
    assert.equal(category(report, kind).targetKind, null);
    assert.ok(category(report, kind).events.every(row => !Object.hasOwn(row, 'reachableCount')));
  }
  assert.ok(buildPhaseAnalytics([], [], current()).categories.every(row => row.count === 0 && !row.events.length));
  assert.equal(category(buildPhaseAnalytics([node('zero', 'Mistake', '01/11/26')], [], current()), 'Mistake').events[0].reachableCount, 0);
});

test('long cyclic directed paths use iterative traversal rather than the call stack', () => {
  const nodes = [node('root', 'Mistake', '01/11/26'), ...Array.from({ length: 12000 }, (_, i) => node(`n${i}`, 'Consequence', '01/01/27'))];
  const edges = nodes.slice(1).map((target, i) => ({ source: nodes[i].id, target: target.id }));
  edges.push({ source: nodes.at(-1).id, target: 'root' });
  const report = buildPhaseAnalytics(nodes, edges, current());
  assert.equal(category(report, 'Mistake').events[0].reachableCount, 12000);
});
