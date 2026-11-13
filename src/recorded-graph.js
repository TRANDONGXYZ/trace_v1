// Index recorded arrows once; individual analyses apply their own eligibility
// rules without repairing historical data or changing interactive link rules.
export function indexRecordedGraph(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  }
  return { byId, outgoing };
}
