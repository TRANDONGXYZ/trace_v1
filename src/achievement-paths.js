import { calendarPhase } from './phase-analytics.js';
import { recordedCalendarDay } from './reaction-time.js';
import { indexRecordedGraph, reachableRecordedIds } from './recorded-graph.js';

export const compareStableIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const compareDates = (a, b) => {
  const date = node => { const day = recordedCalendarDay(node.data?.time); return Number.isFinite(day) ? day : Infinity; };
  return date(a) - date(b) || compareStableIds(a.id, b.id);
};

export function buildAchievementReport(nodes, edges, phase = calendarPhase(), index = indexRecordedGraph(nodes, edges)) {
  const entries = [];
  for (const achievement of nodes) {
    const day = recordedCalendarDay(achievement.data?.time);
    if (!['Milestone', 'Success'].includes(achievement.data?.kind) || !(day >= phase.start && day < phase.end)) continue;
    const ancestors = reachableRecordedIds(achievement.id, index.incoming);
    let actionCount = 0;
    for (const id of ancestors) if (index.byId.get(id)?.data?.kind === 'Action') actionCount++;
    entries.push({ achievement, actionCount });
  }
  entries.sort((a, b) => b.actionCount - a.actionCount || recordedCalendarDay(b.achievement.data.time) - recordedCalendarDay(a.achievement.data.time) || compareStableIds(a.achievement.id, b.achievement.id));
  return { entries, byAchievementId: new Map(entries.map(entry => [entry.achievement.id, entry])) };
}

export function extractAchievementSubgraph(achievementId, nodes, edges, index = indexRecordedGraph(nodes, edges)) {
  const achievement = index.byId.get(achievementId);
  if (!achievement || !['Milestone', 'Success'].includes(achievement.data?.kind)) return null;
  const ids = reachableRecordedIds(achievementId, index.incoming);
  const relatedNodes = [...ids].map(id => index.byId.get(id)).sort((a, b) => compareStableIds(a.id, b.id));
  const relatedEdges = edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).sort((a, b) => compareStableIds(a.id, b.id));
  const direct = new Set(index.incoming.get(achievementId) ?? []);
  const actions = relatedNodes.filter(node => node.data?.kind === 'Action').sort(compareDates).map(node => ({ node, direct: direct.has(node.id) }));
  return { achievement, nodes: relatedNodes, edges: relatedEdges, actions, index: indexRecordedGraph(relatedNodes, relatedEdges) };
}

export function achievementPathHighlight(graph, actionId) {
  if (graph.index.byId.get(actionId)?.data?.kind !== 'Action') return null;
  // Every extracted node already reaches the achievement. Forward reachability
  // within that set retains all alternatives, without enumerating paths. Stop
  // at the destination so outgoing legacy cycles do not extend past it.
  const nodeIds = reachableRecordedIds(actionId, graph.index.outgoing, graph.achievement.id);
  const edgeIds = new Set(graph.edges.filter(edge => edge.source !== graph.achievement.id && nodeIds.has(edge.source) && nodeIds.has(edge.target)).map(edge => edge.id));
  return { nodeIds, edgeIds };
}
