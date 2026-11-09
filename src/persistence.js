import { NODE_KINDS } from './node-types.js';
import { restoreLayout } from './model.js';

export const STORAGE_KEY = 'trace.whiteboard.v1';
export const AUTOSAVE_DELAY = 3000;
export const LAYOUT_VERSION = 2;

const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);

export function readDiagram() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const graph = saved?.graph;
    if (saved?.version !== 1 || !Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) return null;
    const ids = new Set();
    for (const node of graph.nodes) {
      if (typeof node.id !== 'string' || ids.has(node.id) || !point(node.position) || node.type !== 'event' ||
        !NODE_KINDS.includes(node.data?.kind) || !Number.isFinite(node.data.time) ||
        typeof node.data.mistake !== 'string' || typeof node.data.description !== 'string' ||
        !['origin', 'row', 'diagonal', 'stack', 'selected-stack'].includes(node.data.placement?.mode)) return null;
      ids.add(node.id);
    }
    const edgeIds = new Set();
    for (const edge of graph.edges) {
      if (typeof edge.id !== 'string' || edgeIds.has(edge.id) || edge.type !== 'time' ||
        !ids.has(edge.source) || !ids.has(edge.target) || !Number.isFinite(edge.data?.days) ||
        typeof edge.data.value !== 'string' || typeof edge.data.unit !== 'string') return null;
      edgeIds.add(edge.id);
    }
    return saved.layoutVersion === LAYOUT_VERSION ? graph : restoreLayout(graph);
  } catch {
    // Unavailable storage or damaged data must not stop the whiteboard opening.
    // Leave the existing storage entry untouched until actual content changes.
    return null;
  }
}

export function serializeDiagram(graph) {
  return JSON.stringify({ version: 1, layoutVersion: LAYOUT_VERSION, graph });
}
