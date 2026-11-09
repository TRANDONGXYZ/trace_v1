import test from 'node:test';
import assert from 'node:assert/strict';
import { initialHistory, diagramHistory } from '../src/diagram-history.js';
import { createEvent, parseDate, deleteNode, deleteEdge, connectNodes } from '../src/model.js';
const empty = () => ({ nodes: [], edges: [] });
const add = (graph, id, selectedId) => createEvent(graph, { id, kind: 'Action', mistake: id, time: parseDate(`${id.charCodeAt(0) - 64}/11/26`.padStart(8, '0')), selectedId, firstPosition: { x: 240, y: 500 } });
const change = (history, value) => diagramHistory(history, { type: 'change', value });
const undo = history => diagramHistory(history, { type: 'undo' });
const redo = history => diagramHistory(history, { type: 'redo' });

test('A -> B -> C deletion preserves A/C and undo/redo restore exact node/edge/layout snapshots', () => {
  let history = initialHistory(empty());
  history = change(history, graph => add(graph, 'A'));
  history = change(history, graph => add(graph, 'B', 'A'));
  history = change(history, graph => add(graph, 'C', 'B'));
  const connected = history.present;
  history = change(history, graph => deleteNode(graph, 'B'));
  const deleted = history.present;
  assert.deepEqual(deleted.nodes, [connected.nodes[0], connected.nodes[2]]);
  assert.deepEqual(deleted.edges, []);
  assert.equal(undo(history).present, connected);
  assert.equal(redo(undo(history)).present, deleted);
  history = undo(history);
  assert.equal(undo(history).present.nodes.length, 2, 'node creation is also a single undoable operation');
});

test('edge creation/deletion and shared descendants restore without changing unrelated records', () => {
  let graph = add(empty(), 'A'); graph = add(graph, 'B'); graph = add(graph, 'C');
  const ab = connectNodes(graph, { source: 'A', target: 'B' });
  let history = change(initialHistory(graph), ab);
  assert.equal(undo(history).present, graph);
  history = change(history, current => connectNodes(current, { source: 'B', target: 'C' }));
  history = change(history, current => connectNodes(current, { source: 'A', target: 'C' }));
  const connected = history.present;
  const removed = deleteNode(connected, 'B');
  assert.deepEqual(removed.edges, connected.edges.filter(e => e.source === 'A' && e.target === 'C'));
  history = change(history, current => deleteEdge(current, current.edges[0].id));
  assert.equal(undo(history).present, connected);
  assert.equal(redo(undo(history)).present, history.present);
});

test('no-ops, invalid connections and empty undo/redo preserve history; real edits discard the redo branch', () => {
  const graph = add(empty(), 'A');
  let history = initialHistory(graph);
  assert.equal(undo(history), history); assert.equal(redo(history), history);
  history = change(history, g => add(g, 'B', 'A'));
  const undone = undo(history);
  assert.equal(change(undone, structuredClone(undone.present)), undone);
  assert.equal(change(undone, g => deleteNode(g, 'missing')), undone);
  assert.equal(change(undone, g => connectNodes(g, { source: 'A', target: 'A' })), undone);
  const branched = change(undone, g => add(g, 'C', 'A'));
  assert.equal(branched.future.length, 0); assert.equal(redo(branched), branched);
  assert.deepEqual(graph.nodes.map(n => n.id), ['A'], 'earlier snapshots remain immutable');
});

test('creating after deletion of a placement reference remains valid and does not poison history', () => {
  let graph = add(empty(), 'A'); graph = add(graph, 'B', 'A'); graph = add(graph, 'C', 'B');
  let history = change(initialHistory(graph), current => deleteNode(current, 'B'));
  history = change(history, current => add(current, 'D', 'C'));
  assert.deepEqual(history.present.nodes.map(n => n.id), ['A', 'C', 'D']);
  assert.ok(history.present.nodes.every(n => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
  assert.deepEqual(undo(history).present.nodes.map(n => n.id), ['A', 'C']);
});
