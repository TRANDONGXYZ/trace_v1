import { NODE_KINDS, NODE_HEIGHT, DESCRIPTION_LIMIT } from './node-types.js';
import { DAY, NODE_WIDTH, durationLabel, formatDate, restoreLayout } from './model.js';
import { LAYOUT_VERSION } from './persistence.js';
import { connectionTypeError } from './node-rules.js';

export const BACKUP_FORMAT = 'trace-whiteboard';
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const modes = new Set(['origin', 'row', 'diagonal', 'stack', 'selected-stack']);
const handles = new Set(['top', 'left', 'right']);
const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    fail('The backup has missing or unrecognized fields. No data was imported.');
  }
}
function id(value) {
  if (typeof value !== 'string' || !value.length || value.length > 256 || /\s/u.test(value)) fail('The backup contains an invalid ID.');
}
function point(value) {
  keys(value, ['x', 'y']);
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) fail('Backup coordinates must be finite numbers.');
  return { x: value.x, y: value.y };
}
function placement(value) {
  keys(value, ['mode'], ['referenceId', 'columnOffset', 'origin', 'selectedSameDate']);
  if (!modes.has(value.mode)) fail('The backup contains an unsupported placement mode.');
  if (Object.hasOwn(value, 'referenceId')) id(value.referenceId);
  if (Object.hasOwn(value, 'columnOffset') && !Number.isFinite(value.columnOffset)) fail('The backup contains an invalid layout offset.');
  if (Object.hasOwn(value, 'selectedSameDate') && typeof value.selectedSameDate !== 'boolean') fail('The backup contains an invalid placement flag.');
  return { ...value, ...(Object.hasOwn(value, 'origin') ? { origin: point(value.origin) } : {}) };
}
function record(node, legacyLayout = false) {
  keys(node, ['id', 'kind', 'time', 'mistake', 'description', 'position', 'placement'], legacyLayout ? ['height'] : []);
  id(node.id);
  if (!NODE_KINDS.includes(node.kind)) fail('The backup contains an unsupported node type.');
  if (!Number.isFinite(node.time) || node.time % DAY !== 0 || node.time < Date.UTC(2000, 0, 1) || node.time >= Date.UTC(2100, 0, 1)) {
    fail('The backup contains an invalid event date.');
  }
  if (typeof node.mistake !== 'string' || !node.mistake.trim() || typeof node.description !== 'string') fail('The backup contains invalid node text.');
  let count = 0;
  for (const _ of characters.segment(node.description)) if (++count > DESCRIPTION_LIMIT) fail('A backup Description exceeds 500 characters.');
  if (Object.hasOwn(node, 'height') && ![64, 96].includes(node.height)) fail('The backup contains an invalid legacy height.');
  return { ...node, position: point(node.position), placement: placement(node.placement) };
}
// This is the actual earlier relationship policy, not a general validation
// bypass. An explicit marker preserves these recorded edges as historical data.
function allowedLegacy(source, target) {
  return source.kind === 'Consequence' && ['Mistake', 'Milestone', 'Success'].includes(target.kind);
}
function relationship(edge, nodes, ids, pairs) {
  keys(edge, ['id', 'source', 'target', 'sourceHandle', 'targetHandle', 'manual'], ['labelPosition', 'compatibility']);
  id(edge.id); id(edge.source); id(edge.target);
  if (ids.has(edge.id)) fail('The backup contains duplicate edge IDs.');
  ids.add(edge.id);
  const source = nodes.get(edge.source), target = nodes.get(edge.target);
  if (!source || !target) fail('A backup edge references a missing node.');
  if (edge.source === edge.target) fail('A backup cannot contain self-connections.');
  if (source.time > target.time) fail('The backup contains a backward chronological edge.');
  const pair = `${edge.source.length}:${edge.source}${edge.target}`;
  if (pairs.has(pair)) fail('The backup contains duplicate directed connections.');
  pairs.add(pair);
  if (!handles.has(edge.sourceHandle) || !handles.has(edge.targetHandle) || typeof edge.manual !== 'boolean') fail('The backup contains invalid connection handles or flags.');
  if (edge.compatibility !== undefined && edge.compatibility !== 'legacy-consequence-v1') fail('The backup uses an unsupported relationship compatibility policy.');
  const error = connectionTypeError(source.kind, target.kind);
  if (error && !(edge.compatibility === 'legacy-consequence-v1' && allowedLegacy(source, target))) fail(`Invalid backup relationship: ${error}`);
  if (edge.compatibility && !allowedLegacy(source, target)) fail('The legacy relationship marker does not match a supported historical rule.');
  return { ...edge, ...(Object.hasOwn(edge, 'labelPosition') ? { labelPosition: edge.labelPosition === null ? null : point(edge.labelPosition) } : {}) };
}

export function createBackup(graph, now = new Date()) {
  const nodesById = new Map();
  const nodes = graph.nodes.map(node => {
    // Explicit projection excludes UI, analytics, model caches and arbitrary
    // extra properties even when they exist on an in-memory React Flow node.
    const p = node.data.placement;
    const packed = record({ id: node.id, kind: node.data.kind, time: node.data.time, mistake: node.data.mistake,
      description: node.data.description, position: { x: node.position.x, y: node.position.y },
      placement: { mode: p.mode, ...(p.referenceId !== undefined ? { referenceId: p.referenceId } : {}),
        ...(p.columnOffset !== undefined ? { columnOffset: p.columnOffset } : {}),
        ...(p.origin !== undefined ? { origin: { x: p.origin.x, y: p.origin.y } } : {}),
        ...(p.selectedSameDate !== undefined ? { selectedSameDate: p.selectedSameDate } : {}) } });
    if (nodesById.has(packed.id)) fail('The whiteboard contains duplicate node IDs.');
    nodesById.set(packed.id, packed); return packed;
  });
  const ids = new Set(), pairs = new Set();
  const edges = graph.edges.map(edge => {
    const source = nodesById.get(edge.source), target = nodesById.get(edge.target);
    const compatibility = source && target && connectionTypeError(source.kind, target.kind) && allowedLegacy(source, target)
      ? 'legacy-consequence-v1' : undefined;
    return relationship({ id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: edge.sourceHandle ?? 'right', targetHandle: edge.targetHandle ?? 'left', manual: edge.data.manual === true,
      ...(edge.data.labelPosition !== undefined ? { labelPosition: edge.data.labelPosition } : {}), ...(compatibility ? { compatibility } : {}) }, nodesById, ids, pairs);
  });
  // Exactly one JSON serialization of the current live graph per export.
  const serialized = JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now.toISOString(),
    diagram: { layoutVersion: LAYOUT_VERSION, nodes, edges } });
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) fail('The backup exceeds the 25 MiB file limit.');
  return serialized;
}

function decodeV1(diagram) {
  keys(diagram, ['nodes', 'edges', 'layoutVersion']);
  if (![1, LAYOUT_VERSION].includes(diagram.layoutVersion)) fail('This backup layout version is not supported. Update Trace before importing it.');
  if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) fail('Backup nodes and edges must be arrays.');
  const byId = new Map();
  const nodes = diagram.nodes.map(value => {
    const node = record(value, diagram.layoutVersion === 1);
    if (byId.has(node.id)) fail('The backup contains duplicate node IDs.');
    byId.set(node.id, node);
    return { id: node.id, type: 'event', position: node.position, width: NODE_WIDTH,
      height: diagram.layoutVersion === 1 ? node.height ?? (node.kind === 'Consequence' ? 96 : 64) : NODE_HEIGHT,
      data: { kind: node.kind, time: node.time, mistake: node.mistake, description: node.description, placement: node.placement },
      draggable: false, connectable: true, ariaLabel: `${node.kind}, ${formatDate(node.time)}` };
  });
  const ids = new Set(), pairs = new Set();
  const edges = diagram.edges.map(value => {
    const edge = relationship(value, byId, ids, pairs);
    return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      type: 'time', reconnectable: false, deletable: true,
      data: { ...durationLabel(byId.get(edge.source).time, byId.get(edge.target).time), ...(edge.manual ? { manual: true } : {}),
        ...(Object.hasOwn(edge, 'labelPosition') ? { labelPosition: edge.labelPosition } : {}) },
      ariaLabel: `${formatDate(byId.get(edge.source).time)} to ${formatDate(byId.get(edge.target).time)}` };
  });
  return diagram.layoutVersion === LAYOUT_VERSION ? { nodes, edges } : restoreLayout({ nodes, edges });
}
// A new schema gets its own complete validator/migrator. Do not guess how a
// future version should be interpreted or silently discard unknown fields.
const readers = new Map([[1, decodeV1]]);
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) fail('Choose a UTF-8 JSON Trace backup no larger than 25 MiB.');
  let value;
  try { value = JSON.parse(text); } catch { fail('The file is not valid JSON. No data was imported.'); }
  if (value?.format !== BACKUP_FORMAT) fail('This file is not a Trace whiteboard backup.');
  if (!readers.has(value.schemaVersion)) fail(`Unsupported backup schema version ${String(value.schemaVersion)}. Update Trace before importing it.`);
  keys(value, ['format', 'schemaVersion', 'exportedAt', 'diagram']);
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) || new Date(value.exportedAt).toISOString() !== value.exportedAt) fail('The backup has an invalid export timestamp.');
  return readers.get(value.schemaVersion)(value.diagram);
}

export function backupFilename(now = new Date()) {
  const pad = number => String(number).padStart(2, '0');
  return `trace-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
}

export async function saveBackupFile(graph) {
  const now = new Date(), filename = backupFilename(now);
  // Acquire the native handle while the click's user activation is still live.
  let handle;
  if (typeof window.showSaveFilePicker === 'function') {
    try { handle = await window.showSaveFilePicker({ suggestedName: filename,
      types: [{ description: 'Trace JSON backup', accept: { 'application/json': ['.json'] } }] }); }
    catch (error) { if (!['SecurityError', 'NotSupportedError'].includes(error.name)) throw error; }
  }
  const serialized = createBackup(graph, now);
  const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
  if (handle) {
    const stream = await handle.createWritable();
    try { await stream.write(blob); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
    return 'Backup saved.';
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'Backup download started. Check your browser’s downloads.';
}
