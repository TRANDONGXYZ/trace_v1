import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvent, connectNodes, deleteNode, parseDate, NODE_HEIGHT, SAME_DATE_GAP } from '../src/model.js';
import { readDiagram, serializeDiagram, LAYOUT_VERSION } from '../src/persistence.js';
import { initialHistory } from '../src/diagram-history.js';

function legacyFixture() {
  let graph = { nodes: [], edges: [] };
  for (const [index, kind, date, selectedId] of [
    [0, 'Action', '08/11/26'], [1, 'Consequence', '08/11/26', 'n0'],
    [2, 'Consequence', '08/11/26', 'n0'], [3, 'Consequence', '09/11/26', 'n0'],
    [4, 'Mistake', '09/11/26'], [5, 'Goal', '10/11/26'],
    [6, 'Blocked', '11/11/26'], [7, 'Milestone', '12/11/26'], [8, 'Success', '13/11/26'],
  ]) {
    graph = createEvent(graph, { id: `n${index}`, kind, mistake: `Record ${index}`, description: `Details\n${index}`,
      time: parseDate(date), selectedId, firstPosition: { x: 240, y: 1000 } });
  }
  graph = connectNodes(graph, { source: 'n5', target: 'n8', sourceHandle: 'top', targetHandle: 'left' });
  return { ...graph, nodes: graph.nodes.map(n => ({ ...n, height: n.data.kind === 'Consequence' ? 96 : 64,
    position: { ...n.position, y: 1000 + (n.position.y - 1000) / 2 } })) };
}
function read(value) {
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => value, setItem: () => { throw new Error('Restore must not write storage'); } } };
  try { return readDiagram(); }
  finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}
const fields = graph => graph.nodes.map(n => ({ id: n.id, kind: n.data.kind, time: n.data.time, mistake: n.data.mistake, description: n.data.description }));
function collides(a, b, clearance = 0) {
  return Math.abs(a.position.x - b.position.x) < 160 &&
    a.position.y < b.position.y + b.height + clearance - 0.001 &&
    b.position.y < a.position.y + a.height + clearance - 0.001;
}

test('older overlapping layouts reflow all seven types with clear vertical gaps and unchanged event/relationship data', () => {
  const old = legacyFixture();
  assert.ok(old.nodes.some((a, i) => old.nodes.slice(i + 1).some(b => collides(a, b))), 'fixture reproduces overlapping older card positions');
  const restored = read(JSON.stringify({ version: 1, graph: old }));
  assert.deepEqual(fields(restored), fields(old));
  assert.deepEqual(restored.edges.map(e => [e.id, e.source, e.target, e.data.days]), old.edges.map(e => [e.id, e.source, e.target, e.data.days]));
  for (const [i, a] of restored.nodes.entries()) {
    assert.equal(a.height, NODE_HEIGHT);
    for (const b of restored.nodes.slice(i + 1)) assert.equal(collides(a, b, SAME_DATE_GAP), false, `${a.id}/${b.id}`);
  }
  assert.equal(restored.nodes[0].position.x, old.nodes[0].position.x);
  assert.equal(restored.nodes[0].position.y + NODE_HEIGHT / 2, old.nodes[0].position.y + old.nodes[0].height / 2);
  const manual = restored.edges.find(e => e.data.manual);
  assert.equal(manual.sourceHandle, 'top'); assert.equal(manual.targetHandle, 'left');
});

test('legacy projection is deterministic, does not mutate the saved graph or enter undo history', () => {
  const old = legacyFixture(), value = JSON.stringify({ version: 1, graph: old });
  const first = read(value), second = read(value);
  assert.deepEqual(second, first); assert.equal(JSON.stringify({ version: 1, graph: old }), value);
  assert.equal(initialHistory(first).past.length, 0);
});

test('current layout marker preserves survivor positions and metadata across saves/reloads after node deletion', () => {
  const restored = read(JSON.stringify({ version: 1, graph: legacyFixture() }));
  const deleted = deleteNode(restored, 'n0');
  const value = serializeDiagram(deleted);
  assert.equal(JSON.parse(value).version, 1);
  assert.equal(JSON.parse(value).layoutVersion, LAYOUT_VERSION);
  assert.deepEqual(read(value), deleted, 'current saves must not reflow deletion survivors on reload');
});

test('empty legacy diagrams and invalid snapshots retain existing graceful restore behavior', () => {
  assert.deepEqual(read(JSON.stringify({ version: 1, graph: { nodes: [], edges: [] } })), { nodes: [], edges: [] });
  assert.equal(read('{bad json'), null);
  assert.equal(read(JSON.stringify({ version: 1, graph: { nodes: [{}], edges: [] } })), null);
});
