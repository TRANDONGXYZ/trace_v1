import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, parseBackup, backupFilename, MAX_BACKUP_BYTES } from '../src/backup.js';
import { backupFixture } from './backup-fixtures.js';
const now = new Date('2026-11-10T08:00:00.000Z');
const value = () => JSON.parse(createBackup(backupFixture(), now));
const parse = object => parseBackup(JSON.stringify(object));

test('empty backup is portable versioned JSON and restores an empty graph', () => {
  const file = JSON.parse(createBackup({ nodes: [], edges: [] }, now));
  assert.deepEqual(file, { format: 'trace-whiteboard', schemaVersion: 1, exportedAt: now.toISOString(), diagram: { layoutVersion: 2, nodes: [], edges: [] } });
  assert.deepEqual(parse(file), { nodes: [], edges: [] });
  assert.match(backupFilename(new Date(2026, 10, 10, 15, 30)), /^trace-backup-2026-11-10-153000\.json$/u);
});

test('export serializes the complete diagram exactly once', t => {
  const stringify = JSON.stringify; let calls = 0;
  t.mock.method(JSON, 'stringify', (...args) => { calls++; return stringify(...args); });
  createBackup(backupFixture(100), now); assert.equal(calls, 1);
});

test('populated export/import/export preserves all essential fields, positions, IDs, layouts, ports and labels', () => {
  const original = backupFixture();
  const first = createBackup(original, now), restored = parseBackup(first);
  assert.deepEqual(JSON.parse(createBackup(restored, now)), JSON.parse(first));
  for (const [i, node] of original.nodes.entries()) {
    assert.deepEqual(restored.nodes[i].data, node.data); assert.deepEqual(restored.nodes[i].position, node.position);
  }
  assert.deepEqual(restored.edges.map(e => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.data]),
    original.edges.map(e => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.data]));
});

test('export projects only diagram fields and never serializes UI state, derived duration or secrets/caches/history', () => {
  const graph = backupFixture();
  graph.past = ['SECRET']; graph.apiKey = 'SECRET'; graph.analytics = { cache: 'SECRET' };
  graph.nodes[0].selected = true; graph.nodes[0].data.chainHighlighted = true; graph.nodes[0].token = 'SECRET';
  graph.edges[0].selected = true; graph.edges[0].data.highlighted = true;
  const text = createBackup(graph, now);
  for (const word of ['SECRET', 'selected', 'highlighted', 'ariaLabel', 'draggable', 'reconnectable', 'days', 'unit', 'value']) assert.ok(!text.includes(`"${word}"`) && !text.includes('SECRET'));
  assert.equal(parseBackup(text).nodes.length, 8);
});

test('invalid JSON, format, unsupported versions and unknown essential fields produce explicit failures', () => {
  assert.throws(() => parseBackup('{bad'), /not valid JSON/);
  for (const object of [null, {}, { format: 'other' }]) assert.throws(() => parse(object), /not a Trace/);
  for (const version of [0, 2, '1', null]) assert.throws(() => parse({ ...value(), schemaVersion: version }), /Unsupported backup schema/);
  assert.throws(() => parse({ ...value(), futureEssentialField: 'data' }), /unrecognized fields/);
  const file = value(); file.diagram.layoutVersion = 99; assert.throws(() => parse(file), /layout version/);
  const missing = value(); delete missing.diagram.nodes[0].description; assert.throws(() => parse(missing), /missing/);
});

test('structural corruption and invalid node data are rejected before a graph is returned', () => {
  const invalid = [
    f => { f.diagram.nodes.push(f.diagram.nodes[0]); },
    f => { f.diagram.edges.push(f.diagram.edges[0]); },
    f => { f.diagram.edges[0].target = 'missing'; },
    f => { f.diagram.edges[0].target = f.diagram.edges[0].source; },
    f => { f.diagram.edges[0].sourceHandle = 'bottom'; },
    f => { f.diagram.nodes[0].kind = 'Unknown'; },
    f => { f.diagram.nodes[0].time += 1; },
    f => { f.diagram.nodes[0].time = Date.UTC(2100, 0, 1); },
    f => { f.diagram.nodes[0].position.x = null; },
    f => { f.diagram.nodes[0].placement.columnOffset = 'invalid'; },
    f => { f.diagram.nodes[0].placement.origin = null; },
    f => { f.diagram.nodes[0].mistake = '   '; },
    f => { f.diagram.nodes[0].description = 'a'.repeat(501); },
    f => { f.diagram.nodes[0].placement.secretNewField = 2; },
    f => { f.diagram.edges[0].labelPosition.x = 'bad'; },
    f => { f.diagram.edges[0].manual = 'true'; },
  ];
  for (const corrupt of invalid) { const file = value(); corrupt(file); assert.throws(() => parse(file)); }
  const graph = backupFixture(); graph.nodes[0].position.x = Infinity; assert.throws(() => createBackup(graph), /finite/);
});

test('Description character validation preserves multiline text, emoji and combining characters', () => {
  const graph = backupFixture(1); graph.nodes[0].data.description = '👩🏽‍💻'.repeat(250) + 'e\u0301'.repeat(249) + '\n';
  assert.equal(parseBackup(createBackup(graph)).nodes[0].data.description, graph.nodes[0].data.description);
  graph.nodes[0].data.description += 'x'; assert.throws(() => createBackup(graph), /500 characters/);
});

test('known historical Consequence relationships require explicit compatibility tags and retain exact endpoints', () => {
  for (const target of ['Mistake', 'Milestone', 'Success']) {
    const graph = backupFixture(2); graph.nodes[0].data.kind = 'Consequence'; graph.nodes[1].data.kind = target;
    const file = JSON.parse(createBackup(graph));
    assert.equal(file.diagram.edges[0].compatibility, 'legacy-consequence-v1');
    const restored = parse(file); assert.equal(restored.edges[0].source, 'n0'); assert.equal(restored.edges[0].target, 'n1');
    assert.deepEqual(JSON.parse(createBackup(restored)).diagram, file.diagram);
    delete file.diagram.edges[0].compatibility; assert.throws(() => parse(file), /Invalid backup relationship/);
  }
  const file = value(); file.diagram.nodes[1].kind = 'Consequence'; file.diagram.nodes[0].kind = 'Goal';
  file.diagram.edges[0].compatibility = 'legacy-consequence-v1'; assert.throws(() => parse(file), /Invalid backup relationship/);
});

test('backward chronology, duplicated directed pairs and false legacy claims are rejected', () => {
  const backwards = value(); backwards.diagram.edges[0].source = 'n1'; backwards.diagram.edges[0].target = 'n0'; assert.throws(() => parse(backwards), /backward/);
  const duplicate = value(); duplicate.diagram.edges.push({ ...duplicate.diagram.edges[0], id: 'another' }); assert.throws(() => parse(duplicate), /duplicate directed/);
  const falseLegacy = value(); falseLegacy.diagram.edges[0].compatibility = 'legacy-consequence-v1'; assert.throws(() => parse(falseLegacy), /marker/);
});

test('dangling placement references after node-only deletion are preserved as legitimate layout metadata', () => {
  const file = value(); file.diagram.nodes[1].placement.referenceId = 'deleted-parent';
  assert.equal(parse(file).nodes[1].data.placement.referenceId, 'deleted-parent');
});

test('known earlier layout can reflow without changing records; current coordinates are preserved exactly', () => {
  const file = value(); file.diagram.layoutVersion = 1;
  file.diagram.nodes.forEach(n => { n.height = 64; });
  const restored = parse(file);
  assert.deepEqual(restored.nodes.map(n => n.id), file.diagram.nodes.map(n => n.id));
  assert.ok(restored.nodes.every(n => n.height === 96));
  assert.deepEqual(parse(value()).nodes.map(n => n.position), value().diagram.nodes.map(n => n.position));
});

test('file budget is enforced before parsing oversized JSON', () => {
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /25 MiB/);
});
