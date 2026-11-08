import { DAY, formatDate } from './model.js';

function monthsBefore(day, count) {
  const date = new Date(day);
  const month = date.getUTCMonth() - count;
  const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0));
  return Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(date.getUTCDate(), last.getUTCDate()));
}

export function comparisonPeriods(now = new Date()) {
  // Event timestamps represent calendar days in UTC; "today" follows the
  // computer's local calendar, just like the creation form.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const end = today + DAY;
  const recentStart = monthsBefore(end, 2);
  return {
    recent: { start: recentStart, end },
    previous: { start: monthsBefore(recentStart, 2), end: recentStart },
  };
}

export const inPeriod = (node, period) => node.data.time >= period.start && node.data.time < period.end;
export const periodLabel = period => `${formatDate(period.start)} – ${formatDate(period.end - DAY)}`;
const ordered = nodes => [...nodes].sort((a, b) => a.data.time - b.data.time || a.id.localeCompare(b.id));
const range = nodes => nodes.length ? { first: Math.min(...nodes.map(node => node.data.time)), last: Math.max(...nodes.map(node => node.data.time)) } : null;

export function traceRecordedActions(nodes, edges, targetId) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (!byId.has(targetId)) return { actions: [], nodes: [], edges: [] };
  const incoming = new Map();
  for (const edge of edges) {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target || source.id === target.id || source.data.time > target.data.time) continue;
    incoming.set(target.id, [...(incoming.get(target.id) ?? []), edge]);
  }
  const paths = new Map([[targetId, [targetId]]]);
  const seenEdges = new Map();
  const queue = [targetId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const edge of incoming.get(id) ?? []) {
      seenEdges.set(edge.id, edge);
      if (!paths.has(edge.source)) {
        paths.set(edge.source, [edge.source, ...paths.get(id)]);
        queue.push(edge.source);
      }
    }
  }
  return {
    actions: ordered(nodes.filter(node => node.id !== targetId && paths.has(node.id) && node.data.kind === 'Action'))
      .map(node => ({ node, path: paths.get(node.id).map(id => byId.get(id)) })),
    nodes: ordered(nodes.filter(node => paths.has(node.id))),
    edges: [...seenEdges.values()],
  };
}

export function buildProgressReport(nodes, edges, clusters, periods = comparisonPeriods()) {
  const recent = ordered(nodes.filter(node => inPeriod(node, periods.recent)));
  const previous = ordered(nodes.filter(node => inPeriod(node, periods.previous)));
  const kinds = ['Mistake', 'Success', 'Milestone', 'Blocked', 'Consequence'];
  const counts = kinds.map(kind => {
    const current = recent.filter(node => node.data.kind === kind).length;
    const before = previous.filter(node => node.data.kind === kind).length;
    return { kind, recent: current, previous: before, change: current - before };
  });
  const successes = counts.filter(row => ['Success', 'Milestone'].includes(row.kind));
  const achievementCount = {
    recent: successes.reduce((sum, row) => sum + row.recent, 0),
    previous: successes.reduce((sum, row) => sum + row.previous, 0),
  };
  achievementCount.change = achievementCount.recent - achievementCount.previous;
  const trends = clusters === null ? null : clusters.map(cluster => {
    const current = ordered(cluster.members.filter(node => inPeriod(node, periods.recent)));
    const before = ordered(cluster.members.filter(node => inPeriod(node, periods.previous)));
    return { ...cluster, recent: current, previous: before, change: current.length - before.length,
      isNew: current.length > 0 && before.length === 0, recurring: current.length >= 2,
      recentRange: range(current), previousRange: range(before), allTimeRange: range(cluster.members) };
  }).filter(row => row.recent.length || row.previous.length)
    .sort((a, b) => b.recent.length - a.recent.length || b.change - a.change || a.id.localeCompare(b.id));
  const records = kindsToInclude => recent.filter(node => kindsToInclude.includes(node.data.kind))
    .map(node => ({ node, trace: traceRecordedActions(nodes, edges, node.id) }));
  return { periods, counts, achievementCount, trends,
    achievements: records(['Success', 'Milestone']), blocked: records(['Blocked']), consequences: records(['Consequence']),
    mistakes: records(['Mistake']), recent, previous };
}
