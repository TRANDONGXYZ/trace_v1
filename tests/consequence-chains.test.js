import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, parseDate } from '../src/model.js';
import { buildPhaseAnalytics, calendarPhase } from '../src/phase-analytics.js';
import { buildConsequenceChainReport } from '../src/consequence-chains.js';
import { indexRecordedGraph } from '../src/recorded-graph.js';
import { chainFixture } from './chain-fixtures.js';

const phase = () => calendarPhase(new Date(2026, 10, 14, 12));
const node = (id, kind, date = '01/11/26') => ({ id, data: { kind, time: parseDate(date), mistake: id, description: '' } });
const links = rows => rows.map(([source, target]) => ({ source, target }));
const report = (nodes, edges = []) => buildConsequenceChainReport(nodes, edges, phase());

test('zero and one consecutive Consequences have distinct depth/duration semantics', () => {
  const m = node('m', 'Mistake'), c = node('c', 'Consequence', '03/11/26');
  const empty = report([m, c]);
  assert.equal(empty.entries[0].depth, 0); assert.equal(empty.entries[0].totalConsequences, 0); assert.equal(empty.entries[0].durationDays, null);
  assert.deepEqual(empty.pathFor('m').map(n => n.id), ['m']); assert.deepEqual(empty.pathFor('missing'), []);
  const single = report([m, c], links([['m', 'c']])).entries[0];
  assert.equal(single.depth, 1); assert.equal(single.durationDays, 2); assert.equal(single.totalConsequences, 1);
});

test('three consecutive Consequences give depth three, full directed path and a fourteen-day duration', () => {
  const nodes = [node('m', 'Mistake'), node('b', 'Consequence', '03/11/26'), node('c', 'Consequence', '07/11/26'), node('d', 'Consequence', '15/11/26')];
  const result = report(nodes, links([['m', 'b'], ['b', 'c'], ['c', 'd']]));
  assert.equal(result.entries[0].depth, 3); assert.equal(result.entries[0].totalConsequences, 3); assert.equal(result.entries[0].durationDays, 14);
  assert.deepEqual(result.pathFor('m').map(n => n.id), ['m', 'b', 'c', 'd']);
});

test('parallel branches increase distinct totals without increasing consecutive depth', () => {
  const nodes = [node('m', 'Mistake'), ...['a', 'b', 'c'].map(id => node(id, 'Consequence'))];
  const result = report(nodes, links([['m', 'c'], ['m', 'b'], ['m', 'a']]));
  assert.equal(result.entries[0].depth, 1); assert.equal(result.entries[0].totalConsequences, 3); assert.equal(result.entries[0].durationDays, 0);
  assert.deepEqual(result.pathFor('m').map(n => n.id), ['m', 'a']);
});

test('every non-Consequence type breaks depth while total reachability continues through it', () => {
  for (const kind of ['Action', 'Goal', 'Milestone', 'Blocked', 'Success', 'Mistake']) {
    const nodes = [node('m', 'Mistake'), node('c1', 'Consequence'), node('middle', kind), node('c2', 'Consequence')];
    const result = report(nodes, links([['m', 'c1'], ['c1', 'middle'], ['middle', 'c2']]));
    assert.equal(result.byMistakeId.get('m').depth, 1, kind); assert.equal(result.byMistakeId.get('m').totalConsequences, 2, kind);
    assert.deepEqual(result.pathFor('m').map(n => n.id), ['m', 'c1']);
  }
});

test('zero depth can have positive totals through a historical intermediate Action', () => {
  const nodes = [node('m', 'Mistake'), node('a', 'Action'), node('c', 'Consequence')];
  const result = report(nodes, links([['m', 'a'], ['a', 'c']]));
  assert.equal(result.entries[0].depth, 0); assert.equal(result.entries[0].totalConsequences, 1); assert.equal(result.entries[0].durationDays, null);
});

test('merged paths and duplicate edges count targets once and never create false cycles', () => {
  const nodes = [node('m', 'Mistake'), ...['c1', 'c2', 'c3'].map(id => node(id, 'Consequence')), node('a', 'Action')];
  const result = report(nodes, links([['m', 'c1'], ['m', 'c2'], ['c1', 'c3'], ['c2', 'c3'], ['c1', 'c3'], ['c3', 'a'], ['a', 'c1'], ['m', 'missing']]));
  assert.equal(result.entries[0].depth, 2); assert.equal(result.entries[0].totalConsequences, 3); assert.equal(result.entries[0].status, 'measured');
  assert.deepEqual(result.pathFor('m').map(n => n.id), ['m', 'c1', 'c3']);
});

test('equally deep chains prefer the latest final date, then lexicographically smaller stable path IDs', () => {
  const nodes = [node('m', 'Mistake'), node('a', 'Consequence', '02/11/26'), node('a-end', 'Consequence', '06/11/26'),
    node('b', 'Consequence', '03/11/26'), node('b-end', 'Consequence', '10/11/26'), node('c', 'Consequence', '04/11/26'), node('c-end', 'Consequence', '10/11/26')];
  const edges = links([['m', 'c'], ['c', 'c-end'], ['m', 'a'], ['a', 'a-end'], ['m', 'b'], ['b', 'b-end']]);
  for (const [ns, es] of [[nodes, edges], [[...nodes].reverse(), [...edges].reverse()]]) {
    const result = report(ns, es); assert.deepEqual(result.pathFor('m').map(n => n.id), ['m', 'b', 'b-end']);
    assert.equal(result.entries[0].durationDays, 9);
  }
});

test('duration follows the selected deepest branch rather than the latest reachable consequence', () => {
  const graph = chainFixture(), result = report(graph.nodes, graph.edges), entry = result.byMistakeId.get('m-deep');
  assert.equal(entry.depth, 3); assert.equal(entry.totalConsequences, 5); assert.equal(entry.durationDays, 14);
  assert.equal(result.pathFor('m-deep').at(-1).id, 'deep-c3');
});

test('phase filters only starting Mistakes and includes future records and cross-year Consequences', () => {
  const graph = chainFixture(), result = report(graph.nodes, graph.edges);
  assert.ok(!result.byMistakeId.has('m-prior')); assert.ok(!result.byMistakeId.has('m-next'));
  const future = result.byMistakeId.get('m-future'); assert.equal(future.depth, 2); assert.equal(future.totalConsequences, 2); assert.equal(future.durationDays, 10);
  assert.deepEqual(result.pathFor('m-future').map(n => n.id), ['m-future', 'future-c1', 'future-c2']);
});

test('ranking uses depth, total count, Mistake date and stable ID without mutating graph collections', () => {
  const graph = chainFixture(), before = JSON.stringify(graph), result = report(graph.nodes, graph.edges);
  assert.deepEqual(result.entries.map(row => row.mistake.id), ['m-deep', 'm-ties', 'm-two', 'm-future', 'm-parallel', 'm-one', 'm-bridge', 'm-none']);
  const ties = [node('z', 'Mistake', '02/11/26'), node('b', 'Mistake'), node('a', 'Mistake')];
  assert.deepEqual(report(ties).entries.map(row => row.mistake.id), ['a', 'b', 'z']);
  assert.equal(JSON.stringify(graph), before);
});

test('backward and invalid dates preserve structural depth but explicitly withhold duration without absolute-value correction', () => {
  for (const dates of [['05/11/26', '03/11/26'], ['01/11/26', '05/11/26', '03/11/26', '07/11/26']]) {
    const nodes = dates.map((date, i) => node(String(i), i ? 'Consequence' : 'Mistake', date));
    const edges = nodes.slice(1).map((target, i) => ({ source: nodes[i].id, target: target.id }));
    const result = report(nodes, edges); assert.equal(result.entries[0].status, 'invalid-dates'); assert.equal(result.entries[0].durationDays, null);
    assert.equal(result.entries[0].depth, dates.length - 1); assert.deepEqual(result.pathFor('0').map(n => n.id), nodes.map(n => n.id));
  }
  const nodes = [node('m', 'Mistake'), node('bad', 'Consequence')]; nodes[1].data.time = 1e30;
  const result = report(nodes, links([['m', 'bad']])); assert.equal(result.entries[0].status, 'invalid-dates'); assert.equal(result.entries[0].durationDays, null);
});

test('Consequence-only cycles and their ancestors have unavailable depth; unrelated or nonconsecutive cycles do not poison valid cases', () => {
  const nodes = [node('m', 'Mistake'), node('ancestor', 'Consequence'), node('c1', 'Consequence'), node('c2', 'Consequence'),
    node('safe', 'Mistake'), node('leaf', 'Consequence'), node('bridge', 'Mistake'), node('action', 'Action')];
  const result = report(nodes, links([['m', 'ancestor'], ['ancestor', 'c1'], ['c1', 'c2'], ['c2', 'c1'], ['safe', 'leaf'], ['bridge', 'action'], ['action', 'c1']]));
  assert.equal(result.byMistakeId.get('m').depth, null); assert.equal(result.byMistakeId.get('m').totalConsequences, 3);
  assert.equal(result.byMistakeId.get('m').status, 'cycle'); assert.equal(result.byMistakeId.get('m').durationDays, null);
  assert.deepEqual(result.pathFor('m').map(n => n.id), ['m']);
  assert.equal(result.byMistakeId.get('safe').depth, 1); assert.equal(result.byMistakeId.get('bridge').depth, 0);
  assert.equal(result.entries.at(-1).mistake.id, 'm');
  const self = report([node('m', 'Mistake'), node('c', 'Consequence')], links([['m', 'c'], ['c', 'c']]));
  assert.equal(self.entries[0].status, 'cycle');
});

test('calendar days handle leap dates and shared phase ranking totals remain identical', () => {
  const nodes = [node('m', 'Mistake', '28/02/28'), node('c', 'Consequence', '01/03/28')];
  const leap = buildConsequenceChainReport(nodes, links([['m', 'c']]), calendarPhase(new Date(2028, 1, 28, 12)));
  assert.equal(leap.entries[0].durationDays, 2);
  const graph = chainFixture(), index = indexRecordedGraph(graph.nodes, graph.edges);
  const totals = new Map(buildPhaseAnalytics(graph.nodes, graph.edges, phase(), index).categories.find(c => c.kind === 'Mistake').events.map(row => [row.node.id, row.reachableCount]));
  const result = buildConsequenceChainReport(graph.nodes, graph.edges, phase(), index, totals);
  for (const entry of result.entries) assert.equal(entry.totalConsequences, totals.get(entry.mistake.id));
  assert.deepEqual(report([]).entries, []);
});

test('branching DAGs and long chains are processed iteratively without path enumeration or recursion', () => {
  const nodes = [node('m', 'Mistake')], edges = [];
  for (let level = 0; level < 32; level++) {
    for (const suffix of ['a', 'b']) { const item = node(`${level}-${suffix}`, 'Consequence'); item.data.time += (level + 1) * DAY; nodes.push(item); }
    for (const parent of level ? [`${level - 1}-a`, `${level - 1}-b`] : ['m']) for (const suffix of ['a', 'b']) edges.push({ source: parent, target: `${level}-${suffix}` });
  }
  const diamond = report(nodes, edges); assert.equal(diamond.entries[0].depth, 32); assert.equal(diamond.entries[0].totalConsequences, 64); assert.equal(diamond.pathFor('m').length, 33);
  const long = [node('m', 'Mistake'), ...Array.from({ length: 10000 }, (_, i) => node(`c${i}`, 'Consequence'))];
  const longEdges = long.slice(1).map((target, i) => ({ source: long[i].id, target: target.id }));
  const result = report(long, longEdges); assert.equal(result.entries[0].depth, 10000); assert.equal(result.pathFor('m').length, 10001);
});
