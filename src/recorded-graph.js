// Index recorded arrows once; individual analyses apply their own eligibility
// rules without repairing historical data or changing interactive link rules.
export function indexRecordedGraph(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map(), incoming = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge.source);
  }
  return { byId, outgoing, incoming };
}

export function reachableRecordedIds(startId, adjacency, stopId = null) {
  const seen = new Set([startId]), queue = [startId];
  for (let position = 0; position < queue.length; position++) {
    if (queue[position] === stopId) continue;
    for (const id of adjacency.get(queue[position]) ?? []) {
      if (!seen.has(id)) { seen.add(id); queue.push(id); }
    }
  }
  return seen;
}

export function countReachableKind({ byId, outgoing }, startId, kind) {
  if (!byId.has(startId)) return 0;
  const seen = new Set([startId]), queue = [startId];
  let count = 0;
  for (let position = 0; position < queue.length; position++) {
    for (const id of outgoing.get(queue[position]) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id); queue.push(id);
      if (byId.get(id)?.data?.kind === kind) count++;
    }
  }
  return count;
}
