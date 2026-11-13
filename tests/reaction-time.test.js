import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, parseDate } from '../src/model.js';
import { calendarPhase, localCalendarDay } from '../src/phase-analytics.js';
import { buildReactionTimeReport, recordedCalendarDay } from '../src/reaction-time.js';
import { indexRecordedGraph } from '../src/recorded-graph.js';
import { reactionFixture } from './reaction-fixtures.js';

const phase = () => calendarPhase(new Date(2026, 10, 13, 12));
const today = () => parseDate('13/11/26');
const node = (id, kind, date) => ({ id, data: { kind, time: parseDate(date), mistake: id, description: '' } });
const links = pairs => pairs.map(([source, target]) => ({ source, target }));
const report = (nodes, edges, date = today()) => buildReactionTimeReport(nodes, edges, phase(), date);

test('direct and indirect reactions use the first completed reachable Action and sort descending without changing the graph', () => {
  const graph = reactionFixture(), original = JSON.stringify(graph);
  const result = report(graph.nodes, graph.edges);
  assert.deepEqual(result.measured.map(row => [row.consequence.id, row.action.id, row.days]), [
    ['c-long', 'a-long', 12], ['c-mid', 'a-long', 7], ['c-short', 'a-short', 5], ['c-same', 'a-same', 0],
  ]);
  assert.deepEqual(result.measured[0].path.map(n => n.id), ['c-long', 'c-mid', 'a-long']);
  assert.equal(result.byConsequenceId.get('c-short').action.id, 'a-short');
  assert.equal(JSON.stringify(graph), original);
});

test('same-day responses are measured as zero; no Action and future-only Action cases retain null durations', () => {
  const graph = reactionFixture(), result = report(graph.nodes, graph.edges);
  assert.equal(result.byConsequenceId.get('c-same').days, 0);
  assert.deepEqual(result.unmeasured.map(row => [row.consequence.id, row.status, row.days]), [['c-future-only', 'future', null], ['c-none', 'none', null]]);
  assert.equal(result.byConsequenceId.get('c-future-only').futureAction.id, 'a-future');
  assert.equal(result.byConsequenceId.get('c-future-only').action, null);
  assert.equal(result.byConsequenceId.get('c-none').futureAction, null);
});

test('phase membership filters Consequences; observed cutoff includes all of today and excludes future roots', () => {
  const graph = reactionFixture(), result = report(graph.nodes, graph.edges);
  assert.ok(!result.byConsequenceId.has('c-not-observed')); assert.ok(!result.byConsequenceId.has('c-old'));
  assert.equal(result.byConsequenceId.get('c-long').action.data.time, today());
  const tomorrow = report(graph.nodes, graph.edges, today() + DAY);
  assert.equal(tomorrow.byConsequenceId.get('c-future-only').days, 7);
  assert.equal(tomorrow.byConsequenceId.get('c-not-observed').status, 'none');
});

test('ties use Action ID, then a deterministic shortest chronological path independent of collection order', () => {
  const nodes = [node('root', 'Consequence', '01/11/26'), node('z-goal', 'Goal', '02/11/26'), node('a-goal', 'Goal', '02/11/26'),
    node('z-action', 'Action', '06/11/26'), node('a-action', 'Action', '06/11/26')];
  const edges = links([['root', 'z-goal'], ['root', 'a-goal'], ['z-goal', 'a-action'], ['a-goal', 'a-action'], ['a-goal', 'z-action']]);
  for (const [ns, es] of [[nodes, edges], [[...nodes].reverse(), [...edges].reverse()]]) {
    const entry = report(ns, es).measured[0];
    assert.equal(entry.action.id, 'a-action'); assert.deepEqual(entry.path.map(n => n.id), ['root', 'a-goal', 'a-action']);
  }
  const direct = report(nodes, [...edges, ...links([['root', 'a-action']])]).measured[0];
  assert.deepEqual(direct.path.map(n => n.id), ['root', 'a-action']);
});

test('cycles, duplicate paths, self-links, dangling/invalid nodes and backward links are safe and never invent a journey', () => {
  const nodes = [node('root', 'Consequence', '05/11/26'), node('peer', 'Consequence', '05/11/26'), node('action', 'Action', '06/11/26'),
    node('earlier', 'Action', '04/11/26'), node('unrelated', 'Action', '05/11/26'), { id: 'invalid', data: { kind: 'Action', time: Infinity } }];
  const edges = links([['root', 'root'], ['root', 'peer'], ['peer', 'root'], ['peer', 'action'], ['root', 'peer'],
    ['root', 'earlier'], ['root', 'missing'], ['missing', 'unrelated'], ['root', 'invalid']]);
  const result = report(nodes, edges), entry = result.byConsequenceId.get('root');
  assert.equal(entry.days, 1); assert.deepEqual(entry.path.map(n => n.id), ['root', 'peer', 'action']);
  const backwardOnly = report(nodes, links([['root', 'earlier'], ['earlier', 'action']]));
  assert.equal(backwardOnly.byConsequenceId.get('root').status, 'none');
});

test('targets can cross phase/year boundaries when an explicit earlier phase is reviewed after completion', () => {
  const nodes = [node('c', 'Consequence', '28/12/26'), node('bridge', 'Goal', '31/12/26'), node('a', 'Action', '03/01/27')];
  const result = report(nodes, links([['c', 'bridge'], ['bridge', 'a']]), parseDate('03/01/27'));
  assert.equal(result.measured[0].days, 6); assert.deepEqual(result.measured[0].path.map(n => n.id), ['c', 'bridge', 'a']);
  assert.equal(report(nodes, links([['c', 'bridge'], ['bridge', 'a']]), parseDate('31/12/26')).unmeasured[0].status, 'future');
});

test('calendar days stay integral across month ends, leap days, time-of-day legacy data and local clock boundaries', () => {
  const cases = [['31/10/26', '01/11/26', 1], ['28/02/28', '01/03/28', 2], ['31/12/26', '01/01/27', 1]];
  for (const [start, end, days] of cases) {
    const nodes = [node('c', 'Consequence', start), node('a', 'Action', end)];
    const selectedPhase = calendarPhase(new Date(nodes[0].data.time));
    const result = buildReactionTimeReport(nodes, links([['c', 'a']]), selectedPhase, nodes[1].data.time);
    assert.equal(result.measured[0].days, days);
  }
  const nodes = [node('c', 'Consequence', '01/11/26'), node('a', 'Action', '02/11/26')];
  nodes[0].data.time += 23 * 3600000; nodes[1].data.time += 3600000;
  assert.equal(report(nodes, links([['c', 'a']])).measured[0].days, 1);
  assert.equal(recordedCalendarDay(NaN), NaN);
  assert.equal(localCalendarDay(new Date(2026, 10, 13, 0, 1)), today());
});

test('empty graphs and observed roots without any links give explicit unmeasured records and allow a shared graph index', () => {
  assert.deepEqual(report([], []), { measured: [], unmeasured: [], byConsequenceId: new Map() });
  const nodes = [node('c', 'Consequence', '01/11/26')], index = indexRecordedGraph(nodes, []);
  const result = buildReactionTimeReport(nodes, [], phase(), today(), index);
  assert.equal(result.unmeasured.length, 1); assert.deepEqual(result.unmeasured[0].path, []);
});

test('long cyclic paths are iterative and reconstructed only for the selected first Action', () => {
  const nodes = [node('root', 'Consequence', '01/11/26'), ...Array.from({ length: 10000 }, (_, i) => node(`goal-${i}`, 'Goal', '01/11/26')), node('action', 'Action', '02/11/26')];
  const edges = nodes.slice(1).map((target, i) => ({ source: nodes[i].id, target: target.id }));
  edges.push({ source: 'goal-9999', target: 'root' });
  const entry = report(nodes, edges).measured[0]; assert.equal(entry.days, 1); assert.equal(entry.path.length, nodes.length);
});
