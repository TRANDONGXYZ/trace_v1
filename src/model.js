import { NODE_APPEARANCE, NODE_KINDS, limitDescription, nodeHeight } from './node-types.js';
import { connectionTypeError, creationTypeError, connectionOrder } from './node-rules.js';
import { manualEdgePath, straightSegments } from './edge-routing.js';

export const DAY = 86_400_000;
export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 64;
export const SAME_DATE_GAP = 24;
const LABEL_WIDTH = 64;
const LABEL_HEIGHT = 46;
const LABEL_GAP = 20;

export function parseDate(input) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = Date.UTC(2000 + y, m - 1, d);
  const check = new Date(date);
  return check.getUTCFullYear() === 2000 + y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? date : null;
}

export function formatDate(time) {
  const date = new Date(time);
  return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear() % 100].map(n => String(n).padStart(2, '0')).join('/');
}

export function formatMonth(time) {
  const date = new Date(time);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear() % 100).padStart(2, '0')}`;
}

function addMonths(time, months) {
  const date = new Date(time);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0));
  return Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), Math.min(date.getUTCDate(), end.getUTCDate()));
}

export function durationLabel(a, b) {
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const days = (end - start) / DAY;
  let amount = days;
  let unit = 'day';
  if (end >= addMonths(start, 12)) {
    let years = new Date(end).getUTCFullYear() - new Date(start).getUTCFullYear();
    if (addMonths(start, years * 12) > end) years--;
    const anniversary = addMonths(start, years * 12);
    amount = years + (end - anniversary) / (addMonths(start, (years + 1) * 12) - anniversary);
    unit = 'year';
  } else if (end >= addMonths(start, 1)) {
    const s = new Date(start);
    const e = new Date(end);
    let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth();
    if (addMonths(start, months) > end) months--;
    const anniversary = addMonths(start, months);
    amount = months + (end - anniversary) / (addMonths(start, months + 1) - anniversary);
    unit = 'month';
  }
  return { value: Number(amount.toFixed(2)).toString(), unit: amount === 1 ? unit : `${unit}s`, days };
}

// Center-to-center distance: node width + label + breathing room, then a log curve.
const timeGrowth = days => 90 * Math.log1p(Math.abs(days) / 14);

export function spacing(days, axis = 'x') {
  // Upward-edge labels occupy the horizontal run. Its vertical leg only needs
  // node clearance, rather than paying for another horizontal label box.
  const baseline = axis === 'y' ? NODE_HEIGHT + SAME_DATE_GAP : NODE_WIDTH + LABEL_WIDTH + 2 * LABEL_GAP;
  return baseline + timeGrowth(days);
}

const overlaps = (a, b, ah = NODE_HEIGHT, bh = NODE_HEIGHT) => Math.abs(a.x - b.x) < NODE_WIDTH + SAME_DATE_GAP - 0.001 &&
  a.y < b.y + bh + SAME_DATE_GAP - 0.001 && b.y < a.y + ah + SAME_DATE_GAP - 0.001;
const verticalSpacing = (a, b) => spacing((b.data.time - a.data.time) / DAY, 'y') + (nodeHeight(a) + nodeHeight(b)) / 2 - NODE_HEIGHT;

function alignVerticalGroups(nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const parents = new Map(nodes.map(node => [node.id, node.id]));
  const find = id => {
    let root = id;
    while (parents.get(root) !== root) root = parents.get(root);
    while (id !== root) {
      const next = parents.get(id);
      parents.set(id, root);
      id = next;
    }
    return root;
  };
  const join = (a, b) => parents.set(find(b), find(a));
  // Only equality constraints form fixed groups. A directed diagonal edge
  // requires spacing, not a fixed y offset: its destination must remain free
  // to move above an intermediate date inserted later.
  for (const node of nodes) {
    const { mode, referenceId } = node.data.placement;
    if (['row', 'selected-stack'].includes(mode) && byId.has(referenceId)) join(referenceId, node.id);
  }
  const sameDates = new Map();
  for (const node of nodes) {
    const peer = sameDates.get(node.data.time);
    if (peer) join(peer, node.id);
    else sameDates.set(node.data.time, node.id);
  }
  const components = new Map();
  for (const node of nodes) {
    const id = find(node.id);
    if (!components.has(id)) components.set(id, { id, nodes: [], incoming: new Map() });
    components.get(id).nodes.push(node);
  }
  const ordered = [...components.values()].map(component => ({
    ...component,
    minTime: Math.min(...component.nodes.map(n => n.data.time)),
    maxTime: Math.max(...component.nodes.map(n => n.data.time)),
    minHeight: Math.min(...component.nodes.map(n => -n.position.y)),
    maxHeight: Math.max(...component.nodes.map(n => -n.position.y)),
  })).sort((a, b) => a.minTime - b.minTime);
  const componentById = new Map(ordered.map(c => [c.id, c]));
  const constrain = (earlier, later, distance) => {
    // Overlapping ranges within required horizontal rows cannot be vertically
    // separated. Preserve those equalities; diagonal edges are separate groups.
    if (earlier.id === later.id || earlier.maxTime >= later.minTime) return;
    later.incoming.set(earlier.id, Math.max(later.incoming.get(earlier.id) ?? -Infinity, distance));
  };
  for (let i = 0; i < ordered.length; i++) {
    const earlier = ordered[i];
    for (let j = i + 1; j < ordered.length; j++) {
      const later = ordered[j];
      if (earlier.maxTime >= later.minTime) continue;
      let distance = earlier.maxHeight - later.minHeight + timeGrowth((later.minTime - earlier.maxTime) / DAY);
      for (const a of earlier.nodes) for (const b of later.nodes) {
        if (Math.abs(a.position.x - b.position.x) < NODE_WIDTH + SAME_DATE_GAP) {
          distance = Math.max(distance, -a.position.y + nodeHeight(b) + SAME_DATE_GAP + b.position.y);
        }
      }
      constrain(earlier, later, distance);
    }
  }
  for (const node of nodes) {
    const ref = byId.get(node.data.placement.referenceId);
    if (!ref || ['stack', 'selected-stack'].includes(node.data.placement.mode) || ref.data.time === node.data.time) continue;
    const [earlier, later] = ref.data.time < node.data.time ? [ref, node] : [node, ref];
    constrain(componentById.get(find(earlier.id)), componentById.get(find(later.id)),
      -earlier.position.y + verticalSpacing(earlier, later) + (nodeHeight(later) - nodeHeight(earlier)) / 2 + later.position.y);
  }
  const shifts = new Map();
  for (const component of ordered) {
    shifts.set(component.id, Math.max(0, ...[...component.incoming].map(([id, distance]) => shifts.get(id) + distance)));
  }
  const originShift = shifts.get(find(nodes[0].id));
  return nodes.map(node => ({ ...node, position: {
    ...node.position, y: node.position.y - shifts.get(find(node.id)) + originShift,
  } }));
}

// Selected same-date creations can add offsets within a date column.
// Chronological constraints are a DAG:
// solve minimum distances from earlier to later dates, never shift tick marks
// independently of the nodes they describe. A new constraint can reflow columns.
function layoutGraph(nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const dates = [...new Set(nodes.map(n => n.data.time))].sort((a, b) => a - b);
  const incoming = new Map(dates.map(time => [time, new Map()]));
  const nodeOffset = node => node.data.placement.columnOffset ?? 0;
  const dateOffsets = new Map(dates.map(time => {
    const offsets = nodes.filter(n => n.data.time === time).map(nodeOffset);
    return [time, { min: Math.min(...offsets), max: Math.max(...offsets) }];
  }));
  const constrain = (a, b, distance) => {
    if (a === b) return false;
    const [earlier, later] = a < b ? [a, b] : [b, a];
    const constraints = incoming.get(later);
    if ((constraints.get(earlier) ?? -Infinity) >= distance) return false;
    constraints.set(earlier, distance);
    return true;
  };
  const separateColumns = (a, b) => {
    const [earlier, later] = a.data.time < b.data.time ? [a, b] : [b, a];
    return constrain(earlier.data.time, later.data.time, NODE_WIDTH + SAME_DATE_GAP + nodeOffset(earlier) - nodeOffset(later));
  };
  for (let i = 1; i < dates.length; i++) {
    constrain(dates[i - 1], dates[i], dateOffsets.get(dates[i - 1]).max - dateOffsets.get(dates[i]).min + Math.max(1, timeGrowth((dates[i] - dates[i - 1]) / DAY)));
  }
  for (const node of nodes) {
    const ref = byId.get(node.data.placement.referenceId);
    if (ref && !['stack', 'selected-stack'].includes(node.data.placement.mode) && ref.data.time !== node.data.time) {
      const [earlier, later] = ref.data.time < node.data.time ? [ref, node] : [node, ref];
      constrain(earlier.data.time, later.data.time, spacing((later.data.time - earlier.data.time) / DAY) + nodeOffset(earlier) - nodeOffset(later));
    }
  }
  for (const edge of edges) {
    const a = byId.get(edge.source).data.time;
    const b = byId.get(edge.target).data.time;
    constrain(a, b, spacing((b - a) / DAY) + nodeOffset(byId.get(edge.source)) - nodeOffset(byId.get(edge.target)));
  }

  const origin = nodes[0];
  const originPosition = origin.data.placement.origin ?? origin.position;
  let placed;
  // A row collision adds a date-column separation constraint. Each pair can add
  // it only once, so this loop terminates without arbitrary spacing increments.
  let changed;
  do {
    const columns = new Map();
    for (const time of dates) {
      columns.set(time, Math.max(0, ...[...incoming.get(time)].map(([earlier, distance]) => columns.get(earlier) + distance)));
    }
    const offset = originPosition.x - columns.get(origin.data.time) - nodeOffset(origin);
    placed = [];
    const positioned = new Map();
    changed = false;
    for (const node of nodes) {
      const { mode, referenceId } = node.data.placement;
      const ref = positioned.get(referenceId);
      const timeDirection = Math.sign(node.data.time - (ref?.data.time ?? node.data.time));
      const position = { x: columns.get(node.data.time) + nodeOffset(node) + offset, y: node.position.y };
      if (mode === 'stack') {
        const peers = placed.filter(n => n.data.time === node.data.time);
        if (peers.length) position.y = Math.min(...peers.map(n => n.position.y)) - nodeHeight(node) - SAME_DATE_GAP;
      } else if (mode === 'selected-stack' && ref) {
        position.y = ref.position.y - nodeHeight(node) - SAME_DATE_GAP;
      } else if (ref) {
        position.y = ref.position.y + (nodeHeight(ref) - nodeHeight(node)) / 2;
        if (mode === 'diagonal') position.y -= timeDirection * verticalSpacing(ref, node);
      } else if (mode === 'origin') {
        position.y = node.data.placement.origin?.y ?? node.position.y;
      }
      if (['stack', 'selected-stack'].includes(mode) || (mode === 'diagonal' && ref)) {
        const direction = ['stack', 'selected-stack'].includes(mode) ? -1 : -timeDirection;
        const deferred = new Set();
        let collision;
        while ((collision = placed.find(n => !deferred.has(n.id) && overlaps(position, n.position, nodeHeight(node), nodeHeight(n))))) {
          if (mode === 'diagonal' && Math.sign(node.data.time - collision.data.time) === direction) {
            // An upward move past a future event (or downward past an earlier
            // one) would invert vertical chronology. Separate their date
            // columns on the next pass and retain the reference-based height.
            changed = separateColumns(node, collision) || changed;
            deferred.add(collision.id);
            continue;
          }
          // Move only to the nearest free vertical lane. The date column stays
          // unchanged, and later siblings no longer receive huge x/y jumps.
          position.y = collision.position.y + (direction < 0 ? -nodeHeight(node) - SAME_DATE_GAP : nodeHeight(collision) + SAME_DATE_GAP);
        }
      } else {
        for (const other of placed) {
          if (overlaps(position, other.position, nodeHeight(node), nodeHeight(other))) changed = separateColumns(node, other) || changed;
        }
      }
      const result = { ...node, position };
      placed.push(result);
      positioned.set(node.id, result);
    }
    // Keep horizontal rows and same-date stacks intact, while allowing every
    // diagonal destination (including connected nodes) to reflow chronologically.
    placed = alignVerticalGroups(placed);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      if (overlaps(placed[i].position, placed[j].position, nodeHeight(placed[i]), nodeHeight(placed[j]))) {
        changed = separateColumns(placed[i], placed[j]) || changed;
      }
    }
  } while (changed);

  const positioned = new Map(placed.map(n => [n.id, n]));
  const routed = edges.map(edge => {
      if (edge.data.manual) return edge;
      const source = positioned.get(edge.source);
      const target = positioned.get(edge.target);
      const upward = target.position.y + nodeHeight(target) / 2 < source.position.y + nodeHeight(source) / 2 - 0.001;
      return { ...edge, sourceHandle: upward ? 'top' : 'right', targetHandle: 'left' };
    });
  return { nodes: placed, edges: placeEdgeLabels(placed, routed) };
}

function placeEdgeLabels(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const obstacles = nodes.map(n => ({ ...n.position, width: NODE_WIDTH, height: nodeHeight(n) }));
  const pad = 8;
  const freePoint = (x, y) => obstacles.every(r => x + LABEL_WIDTH / 2 + pad <= r.x || x - LABEL_WIDTH / 2 - pad >= r.x + r.width || y + LABEL_HEIGHT / 2 + pad <= r.y || y - LABEL_HEIGHT / 2 - pad >= r.y + r.height);
  const onSegment = (start, end, fixed, horizontal, containLabel = true) => {
    const half = (horizontal ? LABEL_WIDTH : LABEL_HEIGHT) / 2;
    const crossHalf = (horizontal ? LABEL_HEIGHT : LABEL_WIDTH) / 2;
    const inset = containLabel ? half + pad : 0;
    let free = [[Math.min(start, end) + inset, Math.max(start, end) - inset]].filter(([a, b]) => a <= b);
    for (const r of obstacles) {
      const crossStart = horizontal ? r.y : r.x;
      const crossEnd = crossStart + (horizontal ? r.height : r.width);
      if (fixed + crossHalf + pad <= crossStart || fixed - crossHalf - pad >= crossEnd) continue;
      const lower = (horizontal ? r.x : r.y) - half - pad;
      const upper = (horizontal ? r.x + r.width : r.y + r.height) + half + pad;
      free = free.flatMap(([a, b]) => upper <= a || lower >= b ? [[a, b]] : [[a, Math.min(b, lower)], [Math.max(a, upper), b]].filter(([lo, hi]) => lo <= hi));
    }
    const midpoint = (start + end) / 2;
    const candidates = free.map(([a, b]) => Math.max(a, Math.min(b, midpoint))).sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
    if (!candidates.length) return null;
    return horizontal ? { x: candidates[0], y: fixed } : { x: fixed, y: candidates[0] };
  };
  return edges.map(edge => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (edge.data.manual) {
      const point = (node, handle) => {
        const appearance = NODE_APPEARANCE[node.data.kind];
        return {
          x: node.position.x + (handle === 'top' ? NODE_WIDTH / 2 : handle === 'left' ? appearance.left - 5 : appearance.right + 5),
          y: node.position.y + (handle === 'top' ? -5 : nodeHeight(node) / 2),
        };
      };
      const start = point(source, edge.sourceHandle);
      const end = point(target, edge.targetHandle);
      const [path, preferredX, preferredY] = manualEdgePath({
        sourceX: start.x, sourceY: start.y, targetX: end.x, targetY: end.y,
        sourcePosition: edge.sourceHandle, targetPosition: edge.targetHandle,
      });
      const candidates = straightSegments(path).flatMap(segment => {
        let point;
        // A label may cover a rounded corner while its center stays on the
        // route. Requiring its whole box inside one short straight segment
        // would discard otherwise clear space between same-date cards.
        if (Math.abs(segment.start.y - segment.end.y) < 1e-6) point = onSegment(segment.start.x, segment.end.x, segment.start.y, true, false);
        else if (Math.abs(segment.start.x - segment.end.x) < 1e-6) point = onSegment(segment.start.y, segment.end.y, segment.start.x, false, false);
        return point ? [point] : [];
      }).sort((a, b) => Math.hypot(a.x - preferredX, a.y - preferredY) - Math.hypot(b.x - preferredX, b.y - preferredY));
      const label = candidates[0];
      if (label) obstacles.push({ x: label.x - LABEL_WIDTH / 2, y: label.y - LABEL_HEIGHT / 2, width: LABEL_WIDTH, height: LABEL_HEIGHT });
      return { ...edge, data: { ...edge.data, labelPosition: label ?? null } };
    }
    const upward = edge.sourceHandle === 'top';
    const sx = source.position.x + (upward ? NODE_WIDTH / 2 : NODE_APPEARANCE[source.data.kind].right);
    const sy = source.position.y + (upward ? 0 : nodeHeight(source) / 2);
    const tx = target.position.x + NODE_APPEARANCE[target.data.kind].left;
    const ty = target.position.y + nodeHeight(target) / 2;
    let label;
    if (upward) {
      const radius = Math.min(16, (tx - sx) / 2, (sy - ty) / 2);
      label = onSegment(sx + radius, tx, ty, true) ?? onSegment(ty + radius, sy, sx, false);
    } else if (sy === ty) {
      label = onSegment(sx, tx, sy, true);
    } else {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const midX = (sx + tx) / 2;
        const x = (1 - t) ** 3 * sx + 3 * t * (1 - t) * midX + t ** 3 * tx;
        const y = (1 - 3 * t ** 2 + 2 * t ** 3) * sy + (3 * t ** 2 - 2 * t ** 3) * ty;
        if (freePoint(x, y)) { label = { x, y }; break; }
      }
    }
    if (label) obstacles.push({ x: label.x - LABEL_WIDTH / 2, y: label.y - LABEL_HEIGHT / 2, width: LABEL_WIDTH, height: LABEL_HEIGHT });
    return { ...edge, data: { ...edge.data, labelPosition: label } };
  });
}

export function createEvent(state, { kind, mistake, time, description = '', selectedId, firstPosition, id }) {
  if (!NODE_KINDS.includes(kind) || !Number.isFinite(time)) throw new Error('Invalid event');
  if (typeof mistake !== 'string' || !mistake.trim()) throw new Error('Mistake is required');
  if (typeof description !== 'string' || limitDescription(description) !== description) throw new Error('Description must be at most 500 characters');
  const height = NODE_APPEARANCE[kind].height ?? NODE_HEIGHT;
  const selected = state.nodes.find(n => n.id === selectedId);
  const typeError = creationTypeError(kind, selected?.data.kind);
  if (typeError) throw new Error(typeError);
  if (selected?.data.kind === 'Mistake' && kind === 'Consequence' && time < selected.data.time) {
    throw Object.assign(new Error('A Consequence must occur after the Mistake.'), { field: 'time' });
  }
  if (selected) {
    const [source, target] = connectionOrder(selected, { data: { kind, time } });
    const edgeError = connectionTypeError(source.data.kind, target.data.kind);
    if (edgeError) throw new Error(edgeError);
  }
  const sameDate = state.nodes.filter(n => n.data.time === time);
  const selectedSameDate = !!selected && sameDate.length > 0;
  let reference;
  let mode;
  let columnOffset = 0;
  let initialPosition = firstPosition;
  if (selectedSameDate) {
    const targets = new Set(state.edges.filter(edge => edge.source === selected.id).map(edge => edge.target));
    const highest = state.nodes.filter(node => targets.has(node.id)).reduce((top, node) =>
      !top || node.position.y < top.position.y ? node : top, undefined);
    reference = highest ?? selected;
    mode = highest ? 'selected-stack' : 'row';
    // A same-date outgoing destination supplies its exact column. For other
    // destination dates, retain this event's date column and use its height.
    columnOffset = reference.data.time === time && highest
      ? reference.data.placement.columnOffset ?? 0
      : selected.data.time === time
        ? (selected.data.placement.columnOffset ?? 0) + spacing(0)
        : sameDate[0].data.placement.columnOffset ?? 0;
    if (mode === 'row') {
      let collision;
      while ((collision = sameDate.find(peer =>
        Math.abs((peer.data.placement.columnOffset ?? 0) - columnOffset) < NODE_WIDTH + SAME_DATE_GAP &&
        overlaps({ x: 0, y: peer.position.y }, { x: 0, y: selected.position.y + (nodeHeight(selected) - height) / 2 }, nodeHeight(peer), height)))) {
        // An edge may have been deleted while its old destination remains.
        // Keep the required row and move only the new card into a free slot.
        columnOffset = (collision.data.placement.columnOffset ?? 0) + NODE_WIDTH + SAME_DATE_GAP;
      }
    }
  } else if (sameDate.length) {
    reference = sameDate.reduce((a, b) => a.position.y < b.position.y ? a : b);
    mode = 'stack';
    columnOffset = reference.data.placement.columnOffset ?? 0;
  } else if (!state.nodes.length) {
    mode = 'origin';
  } else {
    reference = selected ?? state.nodes.reduce((earlier, node) =>
      node.data.time < time && (!earlier || node.data.time > earlier.data.time) ? node : earlier, undefined);
    if (reference) {
      const sameRow = !!selected && !state.edges.some(e => e.source === selected.id);
      mode = sameRow ? 'row' : 'diagonal';
    } else {
      // No predecessor exists: introduce an independent earlier timeline
      // anchor at the axes' extrapolated date, without using a later node as
      // a placement reference or creating a connection.
      mode = 'origin';
      initialPosition = {
        x: projectTime(time, axisAnchors(state.nodes, 'x')) - NODE_WIDTH / 2,
        y: -projectTime(time, axisAnchors(state.nodes, 'y')) - height / 2,
      };
    }
  }
  const node = {
    id, type: 'event', position: initialPosition,
    data: { kind, mistake: mistake.trim(), time, description, placement: { mode, referenceId: reference?.id, columnOffset, ...(selectedSameDate ? { selectedSameDate: true } : {}), ...(mode === 'origin' ? { origin: initialPosition } : {}) } },
    width: NODE_WIDTH, height, draggable: false, connectable: true,
    ariaLabel: `${kind}, ${formatDate(time)}`,
  };
  let edges = state.edges;
  if (selected) {
    const [source, target] = connectionOrder(selected, node);
    edges = [...edges, {
      id: `edge-${source.id}-${target.id}`, source: source.id, target: target.id,
      type: 'time', data: { ...durationLabel(source.data.time, target.data.time) },
      reconnectable: false, deletable: true,
      ariaLabel: `${formatDate(source.data.time)} to ${formatDate(target.data.time)}`,
    }];
  }
  return layoutGraph([...state.nodes, node], edges);
}

function chronologicalConnection(state, connection) {
  const a = state.nodes.find(n => n.id === connection.source);
  const b = state.nodes.find(n => n.id === connection.target);
  if (!a || !b || a.id === b.id) return null;
  const [source, target] = connectionOrder(a, b);
  const forward = source === a;
  if (connectionTypeError(source.data.kind, target.data.kind)) return null;
  const sourceHandle = (forward ? connection.sourceHandle : connection.targetHandle) ?? 'right';
  const targetHandle = (forward ? connection.targetHandle : connection.sourceHandle) ?? 'left';
  if (![sourceHandle, targetHandle].every(handle => ['top', 'left', 'right'].includes(handle))) return null;
  if (state.edges.some(e => e.source === source.id && e.target === target.id)) return null;
  return { source, target, sourceHandle, targetHandle };
}

export function canConnectNodes(state, connection) {
  return chronologicalConnection(state, connection) !== null;
}

export function connectNodes(state, connection) {
  const normalized = chronologicalConnection(state, connection);
  if (!normalized) return state;
  const { source, target, sourceHandle, targetHandle } = normalized;
  const edge = {
    id: `edge-${source.id}-${target.id}`, source: source.id, target: target.id,
    sourceHandle, targetHandle, type: 'time',
    data: { ...durationLabel(source.data.time, target.data.time), manual: true },
    reconnectable: false, deletable: true,
    ariaLabel: `${formatDate(source.data.time)} to ${formatDate(target.data.time)}`,
  };
  // Connecting existing events must not change their dates or positions.
  return { ...state, edges: placeEdgeLabels(state.nodes, [...state.edges, edge]) };
}

export function deleteEdge(state, edgeId) {
  return { ...state, edges: state.edges.filter(edge => edge.id !== edgeId) };
}

export function upstreamChain(state, rootId) {
  const nodeIds = new Set();
  const edgeIds = new Set();
  const existing = new Set(state.nodes.map(n => n.id));
  if (!existing.has(rootId)) return { nodeIds, edgeIds };
  const incoming = new Map();
  for (const edge of state.edges) {
    if (existing.has(edge.source) && existing.has(edge.target)) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }
  const queue = [rootId];
  nodeIds.add(rootId);
  while (queue.length) {
    for (const edge of incoming.get(queue.pop()) ?? []) {
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source)) { nodeIds.add(edge.source); queue.push(edge.source); }
    }
  }
  return { nodeIds, edgeIds };
}

export function deleteNode(state, nodeId) {
  if (!state.nodes.some(node => node.id === nodeId)) return state;
  return {
    nodes: state.nodes.filter(n => n.id !== nodeId),
    edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
  };
}

// Each ruler uses its own dimension. Ordinary rows and unselected stacks do
// not advance vertical time. Explicit selected duplicate-date placement adds
// a span on its date, just as a date can now span multiple horizontal slots.
export function axisAnchors(nodes, axis) {
  if (!nodes.length) return [];
  const dates = new Map();
  for (const node of nodes) {
    if (axis === 'y' && node !== nodes[0] && ['row', 'stack', 'selected-stack'].includes(node.data.placement?.mode) && !node.data.placement.selectedSameDate) continue;
    const value = axis === 'x' ? node.position.x + NODE_WIDTH / 2 : -(node.position.y + nodeHeight(node) / 2);
    if (!dates.has(node.data.time)) dates.set(node.data.time, { time: node.data.time, value });
    else if (axis === 'x' || node.data.placement.selectedSameDate) {
      const anchor = dates.get(node.data.time);
      const end = Math.max(anchor.endValue ?? anchor.value, value);
      anchor.value = Math.min(anchor.value, value);
      if (end > anchor.value) anchor.endValue = end;
    }
  }
  const anchors = [];
  for (const anchor of [...dates.values()].sort((a, b) => a.time - b.time)) {
    // Different branches can revisit an existing vertical band. Keep actual
    // positions on the chronological envelope; never fabricate a y coordinate
    // from horizontal distances or push a later event's marker above its node.
    if (axis === 'y') while (anchors.length && (anchors.at(-1).endValue ?? anchors.at(-1).value) >= anchor.value) anchors.pop();
    anchors.push(anchor);
  }
  return anchors;
}

export function projectTime(time, anchors) {
  if (!anchors.length) return 0;
  const exact = anchors.find(anchor => anchor.time === time);
  if (exact) return exact.value;
  let a = anchors[0];
  let b = anchors.at(-1);
  for (let i = 1; i < anchors.length; i++) {
    if (time <= anchors[i].time) { a = anchors[i - 1]; b = anchors[i]; break; }
    a = anchors[i];
  }
  if (time >= anchors.at(-1).time) a = b = anchors.at(-1);
  if (time <= anchors[0].time) a = b = anchors[0];
  if (a.time === b.time) {
    const days = (time - a.time) / DAY;
    // Continuous at the anchor; logarithmic extrapolation to nearby month starts.
    const start = days > 0 ? (a.endValue ?? a.value) : a.value;
    return start + Math.sign(days) * 170 * Math.log1p(Math.abs(days) / 14);
  }
  const start = a.endValue ?? a.value;
  return start + (time - a.time) / (b.time - a.time) * (b.value - start);
}

export function monthTicks(nodes) {
  // Only months represented by events need a marker. Group by the first day,
  // never by individual event dates, so duplicate dates/months cannot add ticks.
  return [...new Set(nodes.map(node => {
    const date = new Date(node.data.time);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }))].sort((a, b) => a - b);
}
