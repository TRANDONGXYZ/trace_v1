import { DAY } from './model.js';
import { NODE_KINDS } from './node-types.js';
import { calendarPhase, localCalendarDay } from './phase-analytics.js';
import { indexRecordedGraph } from './recorded-graph.js';

// Stored dates are UTC-midnight calendar dates. Normalize any legacy time-of-
// day component to that recorded UTC date; never subtract local elapsed hours.
export function recordedCalendarDay(time) {
  if (!Number.isFinite(time)) return NaN;
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function buildReactionTimeReport(nodes, edges, phase = calendarPhase(), today = localCalendarDay(), index = indexRecordedGraph(nodes, edges)) {
  const { byId, outgoing } = index;
  const dates = new Map();
  for (const node of nodes) {
    const day = recordedCalendarDay(node.data?.time);
    if (Number.isFinite(day) && NODE_KINDS.includes(node.data?.kind)) dates.set(node.id, day);
  }
  const orderedIds = (a, b) => dates.get(a) - dates.get(b) || compareIds(a, b);
  const forward = new Map();
  for (const [source, targets] of outgoing) {
    if (!dates.has(source)) continue;
    // A displayed journey must be both an actual directed path and
    // chronological. Skip broken/backward legacy links rather than sorting a
    // non-chronological path into an invented sequence of events.
    forward.set(source, targets.filter(target => dates.has(target) && dates.get(target) >= dates.get(source)).sort(orderedIds));
  }
  const measured = [], unmeasured = [], byConsequenceId = new Map();
  for (const consequence of nodes) {
    const start = dates.get(consequence.id);
    if (consequence.data?.kind !== 'Consequence' || !Number.isFinite(start) || start < phase.start || start >= phase.end || start > today) continue;
    const parents = new Map([[consequence.id, null]]), queue = [consequence.id];
    let first = null, future = null;
    for (let position = 0; position < queue.length; position++) {
      const id = queue[position], node = byId.get(id), day = dates.get(id);
      if (id !== consequence.id && node.data.kind === 'Action') {
        if (day <= today) { if (first === null || orderedIds(id, first) < 0) first = id; }
        else if (future === null || orderedIds(id, future) < 0) future = id;
      }
      for (const target of forward.get(id) ?? []) {
        if (parents.has(target)) continue;
        parents.set(target, id); queue.push(target);
      }
    }
    const path = [];
    if (first !== null) {
      // BFS chooses a shortest path; date/ID-sorted neighbors make equal-length
      // alternatives stable even if nodes/edges arrive in a different order.
      for (let id = first; id !== null; id = parents.get(id)) path.push(byId.get(id));
      path.reverse();
    }
    const entry = { consequence, action: first === null ? null : byId.get(first),
      futureAction: first === null && future !== null ? byId.get(future) : null,
      status: first !== null ? 'measured' : future !== null ? 'future' : 'none',
      days: first === null ? null : (dates.get(first) - start) / DAY, path };
    byConsequenceId.set(consequence.id, entry);
    (first === null ? unmeasured : measured).push(entry);
  }
  const byConsequence = (a, b) => orderedIds(a.consequence.id, b.consequence.id);
  measured.sort((a, b) => b.days - a.days || byConsequence(a, b));
  unmeasured.sort(byConsequence);
  return { measured, unmeasured, byConsequenceId };
}
