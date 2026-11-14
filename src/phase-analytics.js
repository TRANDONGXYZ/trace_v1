// Fixed calendar phases are separate from the existing rolling progress report.
import { countReachableKind, indexRecordedGraph } from './recorded-graph.js';
export const PHASE_KINDS = ['Mistake', 'Consequence', 'Action', 'Milestone', 'Goal', 'Blocked', 'Success'];
const dateLabel = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export function calendarPhase(now = new Date()) {
  const month = Math.floor(now.getMonth() / 2) * 2;
  return { start: Date.UTC(now.getFullYear(), month, 1), end: Date.UTC(now.getFullYear(), month + 2, 1) };
}

export const phaseLabel = phase => `${dateLabel.format(phase.start)} – ${dateLabel.format(phase.end - 1)}`;
export const localCalendarDay = (now = new Date()) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

export function buildPhaseAnalytics(nodes, edges, phase = calendarPhase(), index = indexRecordedGraph(nodes, edges)) {
  const groups = new Map(PHASE_KINDS.map(kind => [kind, []]));
  for (const node of nodes) {
    if (node.data.time >= phase.start && node.data.time < phase.end && groups.has(node.data.kind)) {
      groups.get(node.data.kind).push(node);
    }
  }
  const categories = PHASE_KINDS.map(kind => {
    const targetKind = kind === 'Mistake' ? 'Consequence' : kind === 'Consequence' ? 'Action' : null;
    const events = groups.get(kind).map(node => ({ node, ...(targetKind ? { reachableCount: countReachableKind(index, node.id, targetKind) } : {}) }));
    // Equal ranks and ordinary lists use event date, then stable ID. No text
    // similarity or inferred severity participates in the ranking.
    events.sort((a, b) => (targetKind ? b.reachableCount - a.reachableCount : 0) ||
      a.node.data.time - b.node.data.time || a.node.id.localeCompare(b.node.id));
    return { kind, count: events.length, targetKind, events };
  });
  return { phase, categories };
}
