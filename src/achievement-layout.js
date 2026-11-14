import { indexRecordedGraph } from './recorded-graph.js';
import { compareStableIds } from './achievement-paths.js';
import { NODE_HEIGHT } from './node-types.js';

// Iterative strongly-connected components, then longest distance to the sink
// on the condensed DAG. Cycles keep their original nodes/edges; no synthetic
// nodes are rendered. Layout never touches saved positions.
export function layoutAchievementGraph(graph) {
  const { byId, outgoing, incoming } = graph.index ?? indexRecordedGraph(graph.nodes, graph.edges);
  const ids = [...byId.keys()].sort(compareStableIds), seen = new Set(), finish = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const stack = [{ id, next: 0 }];
    while (stack.length) {
      const frame = stack.at(-1), targets = outgoing.get(frame.id) ?? [];
      if (frame.next < targets.length) {
        const child = targets[frame.next++];
        if (!seen.has(child)) { seen.add(child); stack.push({ id: child, next: 0 }); }
      } else { finish.push(frame.id); stack.pop(); }
    }
  }
  const componentOf = new Map(), components = [];
  for (const id of finish.reverse()) {
    if (componentOf.has(id)) continue;
    const number = components.length, members = [], stack = [id]; componentOf.set(id, number);
    while (stack.length) {
      const current = stack.pop(); members.push(current);
      for (const parent of incoming.get(current) ?? []) if (!componentOf.has(parent)) { componentOf.set(parent, number); stack.push(parent); }
    }
    components.push(members);
  }
  const targets = components.map(() => new Set()), parents = components.map(() => new Set());
  let hasCycles = components.some(members => members.length > 1);
  for (const edge of graph.edges) {
    const source = componentOf.get(edge.source), target = componentOf.get(edge.target);
    if (source === target) { if (edge.source === edge.target) hasCycles = true; continue; }
    targets[source].add(target); parents[target].add(source);
  }
  const remaining = targets.map(set => set.size), distance = components.map(() => 0);
  const queue = remaining.flatMap((count, index) => count === 0 ? [index] : []);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const child = queue[cursor];
    for (const parent of parents[child]) {
      distance[parent] = Math.max(distance[parent], distance[child] + 1);
      if (--remaining[parent] === 0) queue.push(parent);
    }
  }
  const destination = graph.achievement.id, destinationComponent = componentOf.get(destination);
  const shift = components[destinationComponent].length > 1 ? 1 : 0, layers = new Map();
  for (const id of ids) {
    const component = componentOf.get(id);
    const level = id === destination ? 0 : component === destinationComponent ? 1 : distance[component] + shift;
    if (!layers.has(level)) layers.set(level, []);
    layers.get(level).push(id);
  }
  const maximum = Math.max(...layers.keys()), width = Math.max(...[...layers.values()].map(row => row.length)) * 208;
  const positions = new Map();
  for (const [level, row] of layers) row.forEach((id, index) => positions.set(id, { x: (width - row.length * 208) / 2 + index * 208, y: (maximum - level) * (NODE_HEIGHT + 72) }));
  return { positions, hasCycles };
}
