import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate } from '../src/model.js';
import { calendarPhase } from '../src/phase-analytics.js';
import { buildAchievementReport, extractAchievementSubgraph, achievementPathHighlight } from '../src/achievement-paths.js';
import { layoutAchievementGraph } from '../src/achievement-layout.js';
import { achievementFixture } from './achievement-fixtures.js';

const phase = calendarPhase(new Date(2026, 10, 14, 12));
const node = (id, kind, date = '01/11/26') => ({ id, position: { x: 1, y: 2 }, data: { kind, time: parseDate(date), mistake: id, description: '' } });
const links = pairs => pairs.map(([source, target], i) => ({ id: `edge-${i}`, source, target, sourceHandle: 'right', targetHandle: 'left' }));
const report = graph => buildAchievementReport(graph.nodes, graph.edges, phase);
const extract = (graph, id = 's') => extractAchievementSubgraph(id, graph.nodes, graph.edges);

test('Milestone/Success with no upstream Actions return zero and neutral singleton subgraphs', () => {
  for (const kind of ['Milestone', 'Success']) {
    const graph = { nodes: [node('s', kind)], edges: [] }, result = extract(graph);
    assert.equal(report(graph).entries[0].actionCount, 0); assert.deepEqual(result.actions, []);
    assert.equal(result.nodes.length, 1); assert.equal(result.edges.length, 0);
  }
  assert.deepEqual(report({ nodes: [], edges: [] }).entries, []);
  assert.equal(extract({ nodes: [node('s', 'Action')], edges: [] }), null);
});

test('multiple direct Actions count once, with chronological list and stable ID ties', () => {
  const graph = { nodes: [node('s', 'Success'), node('z', 'Action'), node('b', 'Action', '31/10/26'), node('a', 'Action')],
    edges: links([['z', 's'], ['b', 's'], ['a', 's'], ['a', 's']]) };
  assert.equal(report(graph).entries[0].actionCount, 3);
  assert.deepEqual(extract(graph).actions.map(row => [row.node.id, row.direct]), [['b', true], ['a', true], ['z', true]]);
});

test('all intermediate node types preserve indirect Actions and original edges', () => {
  for (const kind of ['Mistake', 'Consequence', 'Milestone', 'Blocked', 'Goal', 'Action', 'Success']) {
    const graph = { nodes: [node('a', 'Action'), node('middle', kind), node('s', 'Success')], edges: links([['a', 'middle'], ['middle', 's']]) };
    assert.equal(report(graph).entries.find(entry => entry.achievement.id === 's').actionCount, kind === 'Action' ? 2 : 1);
    const result = extract(graph); assert.equal(result.nodes.length, 3); assert.deepEqual(result.edges, graph.edges);
    assert.equal(result.actions.find(row => row.node.id === 'a').direct, false);
  }
});

test('merged and alternative paths retain every original internal edge/ID/handle and no unrelated or downstream nodes', () => {
  const graph = achievementFixture(), result = extract(graph);
  assert.deepEqual(result.nodes.map(n => n.id), ['a', 'c', 'consequence', 'd', 'e', 'f', 'g', 'm', 'mistake', 's']);
  assert.equal(result.actions.length, 5); assert.equal(new Set(result.nodes.map(n => n.id)).size, result.nodes.length);
  assert.deepEqual(result.edges, graph.edges.filter(e => !['s', 'unrelated'].includes(e.source)).sort((a, b) => a.id < b.id ? -1 : 1));
  for (const edge of result.edges) assert.equal(edge, graph.edges.find(e => e.id === edge.id));
  for (const original of result.nodes) assert.equal(original, graph.nodes.find(n => n.id === original.id));
});

test('an Action with both a direct edge and indirect routes is categorized as Direct exactly once', () => {
  const graph = { nodes: [node('a', 'Action'), node('m', 'Milestone'), node('s', 'Success')], edges: links([['a', 'm'], ['m', 's'], ['a', 's']]) };
  const result = extract(graph); assert.deepEqual(result.actions.map(row => [row.node.id, row.direct]), [['a', true]]);
  assert.equal(result.edges.length, 3);
});

test('ranking uses distinct count, most recent achievement date, then ascending stable ID', () => {
  const graph = achievementFixture(), ordered = report(graph).entries;
  assert.deepEqual(ordered.map(entry => entry.achievement.id), ['s', 'm', 'future', 'none']);
  assert.equal(ordered[0].actionCount, 5); assert.equal(ordered[1].actionCount, 2);
  const ties = { nodes: [node('z', 'Success'), node('a', 'Milestone')], edges: [] };
  assert.deepEqual(report(ties).entries.map(entry => entry.achievement.id), ['a', 'z']);
});

test('phase filters achievements only, including future phase records and earlier/future upstream Actions', () => {
  const graph = achievementFixture(); graph.nodes.push(node('future-action', 'Action', '02/01/27'));
  graph.edges.push(...links([['future-action', 's']]));
  const result = report(graph); assert.ok(!result.byAchievementId.has('prior')); assert.ok(!result.byAchievementId.has('next'));
  assert.ok(result.byAchievementId.has('future')); assert.equal(result.byAchievementId.get('s').actionCount, 6);
  assert.ok(extract(graph).actions.some(row => row.node.id === 'a')); assert.ok(extract(graph).actions.some(row => row.node.id === 'future-action'));
});

test('Action highlighting retains both alternate paths and converging edges without dimming shared targets', () => {
  const graph = extract(achievementFixture()), highlighted = achievementPathHighlight(graph, 'a');
  assert.deepEqual([...highlighted.nodeIds].sort(), ['a', 'e', 'm', 's']);
  assert.deepEqual([...highlighted.edgeIds].sort(), ['achievement-edge-0', 'achievement-edge-2', 'achievement-edge-4', 'achievement-edge-5']);
  assert.equal(achievementPathHighlight(graph, 'm'), null); assert.equal(achievementPathHighlight(graph, 'missing'), null);
});

test('cycles, self edges, broken references and backward dates terminate without data repair or false duplicate counts', () => {
  const graph = { nodes: [node('a', 'Action'), node('b', 'Blocked'), node('s', 'Success')], edges: links([['a', 'b'], ['b', 'a'], ['b', 's'], ['s', 'a'], ['a', 'a'], ['missing', 's']]) };
  assert.equal(report(graph).entries[0].actionCount, 1);
  const result = extract(graph); assert.equal(result.nodes.length, 3); assert.equal(result.edges.length, 5);
  assert.deepEqual([...achievementPathHighlight(result, 'a').nodeIds].sort(), ['a', 'b', 's']);
  assert.ok(!achievementPathHighlight(result, 'a').edgeIds.has('edge-3'));
  const layout = layoutAchievementGraph(result); assert.equal(layout.hasCycles, true);
  assert.ok(layout.positions.get('s').y > layout.positions.get('a').y);
});

test('layered layout places the achievement last, all acyclic arrows downward, no overlaps and stable positions', () => {
  const graph = achievementFixture(), before = JSON.stringify(graph), result = extract(graph), layout = layoutAchievementGraph(result);
  assert.equal(layout.hasCycles, false);
  for (const edge of result.edges) assert.ok(layout.positions.get(edge.source).y < layout.positions.get(edge.target).y, edge.id);
  const positions = [...layout.positions.values()];
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    assert.ok(Math.abs(positions[i].x - positions[j].x) >= 160 || Math.abs(positions[i].y - positions[j].y) >= 96);
  }
  const reverse = extract({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() });
  assert.deepEqual(layoutAchievementGraph(reverse).positions, layout.positions);
  assert.equal(JSON.stringify(graph), before);
});

test('large branching and long cyclic graphs use iterative traversal/layout without enumerating paths', () => {
  const nodes = [node('s', 'Success')], pairs = [];
  for (let level = 0; level < 32; level++) for (const suffix of ['a', 'b']) {
    const id = `${level}-${suffix}`; nodes.push(node(id, 'Action'));
    for (const target of level ? [`${level - 1}-a`, `${level - 1}-b`] : ['s']) pairs.push([id, target]);
  }
  const graph = { nodes, edges: links(pairs) }, result = extract(graph);
  assert.equal(result.actions.length, 64); assert.equal(achievementPathHighlight(result, '31-a').nodeIds.size, 64);
  assert.equal(layoutAchievementGraph(result).positions.size, 65);
  const long = [node('s', 'Success'), ...Array.from({ length: 10000 }, (_, i) => node(`a-${i}`, 'Action'))];
  const edges = long.slice(1).map((n, i) => ({ id: `e-${i}`, source: n.id, target: long[i].id }));
  edges.push({ id: 'cycle', source: 'a-0', target: 'a-9999' });
  const deep = extract({ nodes: long, edges }); assert.equal(deep.actions.length, 10000); assert.equal(layoutAchievementGraph(deep).positions.size, 10001);
});
