import { DAY } from './model.js';
import { calendarPhase } from './phase-analytics.js';
import { recordedCalendarDay } from './reaction-time.js';
import { countReachableKind, indexRecordedGraph } from './recorded-graph.js';

const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function buildConsequenceChainReport(nodes, edges, phase = calendarPhase(), index = indexRecordedGraph(nodes, edges), mistakeTotals = null) {
  const { byId, outgoing } = index;
  const days = new Map(nodes.map(node => [node.id, recordedCalendarDay(node.data?.time)]));
  const children = new Map(), parents = new Map();
  for (const node of nodes) if (node.data?.kind === 'Consequence') {
    const targets = [...new Set(outgoing.get(node.id) ?? [])].filter(id => byId.get(id)?.data?.kind === 'Consequence');
    children.set(node.id, targets);
    for (const target of targets) {
      if (!parents.has(target)) parents.set(target, []);
      parents.get(target).push(node.id);
    }
  }
  const better = (candidateId, currentId, tails) => {
    if (currentId === null) return true;
    const candidate = tails.get(candidateId), current = tails.get(currentId);
    const candidateDate = Number.isFinite(candidate.endDay) ? candidate.endDay : -Infinity;
    const currentDate = Number.isFinite(current.endDay) ? current.endDay : -Infinity;
    return candidate.depth > current.depth || (candidate.depth === current.depth &&
      (candidateDate > currentDate || (candidateDate === currentDate && compareIds(candidateId, currentId) < 0)));
  };

  // Process leaves toward parents once. Nodes left unresolved are in, or lead
  // to, a Consequence-only cycle. Do not enumerate exponentially many paths or
  // claim an arbitrary cycle cutoff is the longest chain.
  const remaining = new Map([...children].map(([id, targets]) => [id, targets.length]));
  const queue = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  const tails = new Map();
  for (let position = 0; position < queue.length; position++) {
    const id = queue[position];
    let next = null;
    for (const child of children.get(id)) if (better(child, next, tails)) next = child;
    const day = days.get(id), tail = next === null ? null : tails.get(next);
    tails.set(id, { depth: 1 + (tail?.depth ?? 0), next, endDay: tail ? tail.endDay : day,
      chronological: Number.isFinite(day) && (!tail || (tail.chronological && day <= days.get(next))) });
    for (const parent of parents.get(id) ?? []) {
      remaining.set(parent, remaining.get(parent) - 1);
      if (remaining.get(parent) === 0) queue.push(parent);
    }
  }

  const entries = [], byMistakeId = new Map();
  for (const mistake of nodes) {
    const start = days.get(mistake.id);
    if (mistake.data?.kind !== 'Mistake' || !Number.isFinite(start) || start < phase.start || start >= phase.end) continue;
    const targets = [...new Set(outgoing.get(mistake.id) ?? [])].filter(id => children.has(id));
    const cyclic = targets.some(id => !tails.has(id));
    let first = null;
    if (!cyclic) for (const target of targets) if (better(target, first, tails)) first = target;
    const tail = first === null ? null : tails.get(first);
    const chronological = tail && tail.chronological && start <= days.get(first);
    const entry = { mistake, depth: cyclic ? null : tail?.depth ?? 0,
      totalConsequences: mistakeTotals?.get(mistake.id) ?? countReachableKind(index, mistake.id, 'Consequence'),
      durationDays: chronological ? (tail.endDay - start) / DAY : null,
      status: cyclic ? 'cycle' : !tail ? 'none' : chronological ? 'measured' : 'invalid-dates', first };
    entries.push(entry); byMistakeId.set(mistake.id, entry);
  }
  entries.sort((a, b) => (a.depth === null ? 1 : 0) - (b.depth === null ? 1 : 0) ||
    (b.depth ?? 0) - (a.depth ?? 0) || b.totalConsequences - a.totalConsequences ||
    days.get(a.mistake.id) - days.get(b.mistake.id) || compareIds(a.mistake.id, b.mistake.id));

  // Reconstruct only the selected timeline. Linked tails are shared by roots;
  // keeping a complete path array per Mistake would waste memory on merges.
  const pathFor = mistakeId => {
    const entry = byMistakeId.get(mistakeId);
    if (!entry) return [];
    const path = [entry.mistake];
    for (let id = entry.first; id !== null; id = tails.get(id).next) path.push(byId.get(id));
    return path;
  };
  return { entries, byMistakeId, pathFor };
}
