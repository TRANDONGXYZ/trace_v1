import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, NODE_HEIGHT, SAME_DATE_GAP, axisAnchors, canConnectNodes, connectNodes, createEvent, deleteNode, deleteEdge, durationLabel, monthTicks, parseDate, projectTime, spacing, upstreamChain } from '../src/model.js';
import { NODE_KINDS, limitDescription, nodeHeight } from '../src/node-types.js';

let sequence = 0;
function add(state, date, selectedId, kind = 'Action') {
  return createEvent(state, { kind, mistake: 'Lost focus', time: parseDate(date), selectedId, firstPosition: { x: 240, y: 400 }, id: String(++sequence) });
}
const empty = () => ({ nodes: [], edges: [] });

test('strict calendar parsing, leap years, and two-digit years', () => {
  assert.equal(parseDate('29/02/24'), Date.UTC(2024, 1, 29));
  for (const invalid of ['29/02/26', '31/04/26', '00/11/26', '01/13/26', '1/11/26', '01/11/2026', '']) assert.equal(parseDate(invalid), null);
  assert.equal(parseDate('01/01/00'), Date.UTC(2000, 0, 1));
});

test('duration units use calendar boundaries, including exact months and years', () => {
  const duration = (a, b) => durationLabel(parseDate(a), parseDate(b));
  assert.deepEqual(duration('01/11/26', '06/11/26'), { value: '5', unit: 'days', days: 5 });
  assert.equal(duration('01/11/26', '01/12/26').value, '1');
  assert.equal(duration('01/11/26', '01/12/26').unit, 'month');
  assert.equal(duration('31/01/26', '28/02/26').unit, 'month');
  assert.equal(duration('01/11/26', '16/12/26').value, '1.48');
  assert.deepEqual(duration('01/11/26', '01/11/27'), { value: '1', unit: 'year', days: 365 });
  assert.equal(duration('29/02/24', '28/02/25').unit, 'year');
  assert.equal(duration('01/11/26', '01/05/28').value, '1.5');
});

test('log scaling gives readable minimum, near-equal short gaps, and compact longer gaps', () => {
  assert.ok(spacing(1) - 160 >= 104);
  assert.ok(spacing(2) / spacing(1) < 1.03);
  assert.ok(spacing(60) > spacing(14) * 1.2);
  assert.ok(spacing(60) / spacing(30) < 1.2);
});

test('unselected nodes use closest strictly earlier date, both axes, and no edges', () => {
  let state = add(empty(), '01/11/26');
  const a = state.nodes[0];
  assert.deepEqual(a.position, { x: 240, y: 400 });
  state = add(state, '01/01/27');
  state = add(state, '03/11/26');
  const n = state.nodes.at(-1);
  assert.ok(Math.abs(n.position.x - a.position.x - spacing(2)) < 0.001);
  assert.ok(Math.abs(n.position.y - a.position.y + spacing(2, 'y')) < 0.001);
  assert.equal(state.edges.length, 0);
});

test('selected first child stays on row; later child goes up and right', () => {
  let state = add(empty(), '01/11/26');
  const root = state.nodes[0];
  state = add(state, '06/11/26', root.id);
  assert.equal(state.nodes[1].position.y, root.position.y);
  assert.equal(state.edges[0].source, root.id);
  state = add(state, '01/01/27', root.id);
  assert.ok(state.nodes[2].position.y < root.position.y);
  assert.ok(state.nodes[2].position.x > root.position.x);
  assert.equal(state.edges[1].sourceHandle, 'top');
  assert.equal(state.edges[1].targetHandle, 'left');
});

test('earlier creation reverses edge direction and never creates self edges', () => {
  let state = add(empty(), '06/11/26');
  state = add(state, '01/11/26', state.nodes[0].id);
  assert.equal(state.edges[0].source, state.nodes[1].id);
  for (const edge of state.edges) {
    assert.notEqual(edge.source, edge.target);
    assert.ok(state.nodes.find(n => n.id === edge.source).data.time < state.nodes.find(n => n.id === edge.target).data.time);
  }
});

test('unselected equal dates stack in one column with a small gap and no same-date edge', () => {
  let state = add(empty(), '01/11/26');
  state = add(state, '01/11/26');
  state = add(state, '01/11/26');
  assert.equal(state.edges.length, 0);
  assert.ok(state.nodes.every(n => n.position.x === 240));
  assert.equal(state.nodes[0].position.y - state.nodes[1].position.y, NODE_HEIGHT + SAME_DATE_GAP);
  assert.equal(state.nodes[1].position.y - state.nodes[2].position.y, NODE_HEIGHT + SAME_DATE_GAP);
});

test('selected same-date creation uses a right row then stacks above the highest outgoing destination for every permitted type pair', () => {
  for (const sourceKind of NODE_KINDS) for (const targetKind of NODE_KINDS) {
    if ((sourceKind === 'Mistake' && targetKind !== 'Consequence') ||
      (sourceKind === 'Consequence' && ['Mistake', 'Milestone', 'Success'].includes(targetKind)) ||
      (targetKind === 'Consequence' && !['Mistake', 'Action'].includes(sourceKind))) continue;
    let state = sourceKind === 'Consequence' ? add(empty(), '06/11/26') : empty();
    state = add(state, '07/11/26', state.nodes[0]?.id, sourceKind);
    const parentId = state.nodes.at(-1).id;
    for (let i = 0; i < 3; i++) {
      const snapshot = JSON.stringify(state);
      const next = add(state, '07/11/26', parentId, targetKind);
      assert.equal(JSON.stringify(state), snapshot);
      state = next;
      const parent = state.nodes.find(n => n.id === parentId);
      const child = state.nodes.at(-1);
      const edge = state.edges.at(-1);
      assert.equal(edge.source, parentId);
      assert.equal(edge.target, child.id);
      assert.equal(edge.data.days, 0);
      if (!i) {
        assert.equal(child.position.x - parent.position.x, spacing(0));
        assert.equal(child.position.y + nodeHeight(child) / 2, parent.position.y + nodeHeight(parent) / 2);
        assert.equal(edge.sourceHandle, 'right');
      } else {
        const previous = state.nodes.at(-2);
        assert.equal(child.data.placement.referenceId, previous.id);
        assert.equal(child.position.x, previous.position.x);
        assert.equal(previous.position.y - child.position.y, nodeHeight(child) + SAME_DATE_GAP);
        assert.equal(edge.sourceHandle, 'top');
      }
    }
  }
});

test('selected duplicate dates stack over the highest outgoing node while retaining their own date column', () => {
  let state = add(empty(), '01/11/26');
  const rootId = state.nodes[0].id;
  state = add(state, '03/11/26', rootId, 'Goal');
  state = add(state, '05/11/26', rootId, 'Goal');
  const highestId = state.nodes[2].id;
  state = add(state, '03/11/26', rootId, 'Goal');
  const [root, first, highest, child] = state.nodes;
  assert.equal(child.data.placement.referenceId, highestId);
  assert.equal(child.position.x, first.position.x);
  assert.notEqual(child.position.x, highest.position.x);
  assert.equal(highest.position.y - child.position.y, NODE_HEIGHT + SAME_DATE_GAP);
  assert.equal(first.position.y, root.position.y);
  assert.equal(state.edges.at(-1).source, rootId);
  assert.equal(state.edges.at(-1).target, child.id);
  assert.equal(state.edges.at(-1).data.days, 2);
});

test('selected duplicates with no outgoing edges use their row despite unrelated same-date stacks, and incoming edges do not count', () => {
  let state = add(empty(), '01/11/26');
  state = add(state, '03/11/26', state.nodes[0].id, 'Goal');
  const selectedId = state.nodes[1].id;
  state = add(state, '03/11/26');
  const unrelated = state.nodes[2];
  state = add(state, '03/11/26', selectedId, 'Milestone');
  const selected = state.nodes[1], child = state.nodes[3];
  assert.equal(child.position.y, selected.position.y);
  assert.equal(child.position.x - selected.position.x, spacing(0));
  assert.notEqual(child.data.placement.referenceId, unrelated.id);
  assert.equal(state.edges.at(-1).source, selectedId);
  const disconnected = add(state, '03/11/26');
  const top = state.nodes.reduce((a, b) => a.position.y < b.position.y ? a : b);
  assert.equal(disconnected.nodes.at(-1).position.x, top.position.x);
  assert.equal(disconnected.nodes.at(-1).position.y, top.position.y - NODE_HEIGHT - SAME_DATE_GAP);
  assert.equal(disconnected.edges.length, state.edges.length);
});

test('manual and deleted outgoing edges determine the highest destination and return to a free row slot', () => {
  let state = add(empty(), '01/11/26');
  const rootId = state.nodes[0].id;
  state = add(state, '03/11/26', rootId, 'Goal');
  state = add(state, '05/11/26', rootId, 'Goal');
  const topId = state.nodes[2].id;
  state = deleteEdge(state, state.edges[1].id);
  state = connectNodes(state, { source: rootId, target: topId, sourceHandle: 'top', targetHandle: 'left' });
  state = add(state, '03/11/26', rootId, 'Goal');
  assert.equal(state.nodes.at(-1).data.placement.referenceId, topId);
  for (const edge of [...state.edges]) state = deleteEdge(state, edge.id);
  const oldCount = state.nodes.length;
  state = add(state, '03/11/26', rootId, 'Goal');
  assert.equal(state.nodes.length, oldCount + 1);
  assert.equal(state.nodes.at(-1).position.y, state.nodes[0].position.y);
  for (const peer of state.nodes.slice(0, -1)) {
    assert.ok(Math.abs(peer.position.x - state.nodes.at(-1).position.x) >= 160 ||
      Math.abs(peer.position.y - state.nodes.at(-1).position.y) >= NODE_HEIGHT);
  }
});

test('collision handling preserves the selected row', () => {
  let state = add(empty(), '01/11/26');
  state = add(state, '02/11/26', state.nodes[0].id);
  state = add(state, '03/11/26', state.nodes[1].id);
  state = add(state, '03/11/26', state.nodes[0].id);
  for (let i = 0; i < state.nodes.length; i++) for (let j = i + 1; j < state.nodes.length; j++) {
    assert.ok(Math.abs(state.nodes[i].position.x - state.nodes[j].position.x) >= 160 || Math.abs(state.nodes[i].position.y - state.nodes[j].position.y) >= NODE_HEIGHT);
  }
});

test('deletion removes only the selected node and incident edges without moving descendants', () => {
  let state = add(empty(), '01/11/26');
  const root = state.nodes[0].id;
  state = add(state, '02/11/26', root);
  const child = state.nodes[1].id;
  state = add(state, '03/11/26', child);
  state = add(state, '04/11/26', root);
  const sibling = state.nodes[3].id;
  state = add(state, '01/12/26');
  const unrelated = state.nodes[4].id;
  const subtree = deleteNode(state, child);
  assert.deepEqual(subtree.nodes, state.nodes.filter(n => n.id !== child));
  subtree.nodes.forEach(n => assert.equal(n, state.nodes.find(original => original.id === n.id)));
  assert.equal(subtree.edges.length, 1);
  assert.deepEqual(deleteNode(state, root).nodes, state.nodes.slice(1));
  assert.deepEqual(deleteNode(state, root).edges, state.edges.filter(e => e.source !== root && e.target !== root));
});

test('monthly references are unique, use first day UTC, and progress monotonically', () => {
  let state = add(empty(), '01/11/26');
  state = add(state, '05/11/26', state.nodes[0].id);
  state = add(state, '01/02/27', state.nodes[0].id);
  const ticks = monthTicks(state.nodes);
  assert.equal(ticks.length, 2);
  assert.equal(ticks.filter(t => t === Date.UTC(2026, 10, 1)).length, 1);
  assert.ok(ticks.every(t => new Date(t).getUTCDate() === 1));
  for (const axis of ['x', 'y']) {
    const anchors = axisAnchors(state.nodes, axis);
    for (let i = 1; i < ticks.length; i++) assert.ok(projectTime(ticks[i], anchors) > projectTime(ticks[i - 1], anchors));
  }
  assert.equal((parseDate('05/11/26') - parseDate('01/11/26')) / DAY, 4);
});

test('reported November branches keep close x gaps; collision packing only adds the needed vertical lane', () => {
  let state = add(empty(), '07/11/26');
  const rootId = state.nodes[0].id;
  state = add(state, '12/11/26', rootId);
  state = add(state, '13/11/26', rootId);
  state = add(state, '14/11/26', rootId);
  const [root, five, six, seven] = state.nodes;
  for (const [node, days] of [[five, 5], [six, 6], [seven, 7]]) {
    const displacement = node.position.x - root.position.x;
    assert.ok(displacement >= spacing(days) - 1e-8);
    assert.ok(displacement / spacing(days) < 1.02, 'nearby siblings must not get arbitrary horizontal jumps');
  }
  const distance = n => Math.hypot(n.position.x - root.position.x, n.position.y - root.position.y);
  assert.ok(distance(six) / distance(five) < 1.25);
  // The taller cards need a full extra vertical lane; horizontal gaps stay compact.
  assert.equal(five.position.y, root.position.y);
  assert.ok(Math.abs(six.position.y - seven.position.y - NODE_HEIGHT - SAME_DATE_GAP) < 1e-8);
});

test('January 2027 stays after December 2026 even when created from an older branch', () => {
  let state = add(empty(), '07/11/26');
  const rootId = state.nodes[0].id;
  state = add(state, '12/11/26', rootId);
  state = add(state, '12/12/26', state.nodes[1].id);
  state = add(state, '13/11/26', rootId);
  state = add(state, '14/11/26', rootId);
  state = add(state, '12/01/27', rootId);
  state = add(state, '12/01/27');
  state = add(state, '07/11/26');
  const xs = axisAnchors(state.nodes, 'x');
  for (const node of state.nodes) {
    const date = new Date(node.data.time);
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    const center = node.position.x + 80;
    assert.ok(center >= projectTime(monthStart, xs), `before own month: ${date.toISOString()}`);
    assert.ok(center < projectTime(nextMonth, xs), `after next month: ${date.toISOString()}`);
    if (node.data.time === parseDate('12/01/27')) assert.ok(center > projectTime(parseDate('01/12/26'), xs));
  }
  const ordered = [...state.nodes].sort((a, b) => a.data.time - b.data.time);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i].position.x >= ordered[i - 1].position.x);
    if (ordered[i].data.time === ordered[i - 1].data.time) assert.equal(ordered[i].position.x, ordered[i - 1].position.x);
  }
});

test('inserting dates between existing nodes reflows their columns instead of corrupting axis dates', () => {
  let state = add(empty(), '12/01/27');
  const firstId = state.nodes[0].id;
  state = add(state, '07/11/26', firstId);
  const novemberId = state.nodes[1].id;
  state = add(state, '12/12/26', novemberId);
  state = add(state, '13/11/26', novemberId);
  const ordered = [...state.nodes].sort((a, b) => a.data.time - b.data.time);
  for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i].position.x > ordered[i - 1].position.x);
  assert.equal(state.nodes[0].position.x, 240, 'first-created node remains anchored');
  for (const edge of state.edges) {
    const source = state.nodes.find(n => n.id === edge.source);
    const target = state.nodes.find(n => n.id === edge.target);
    assert.ok(target.position.x - source.position.x >= spacing(edge.data.days) - 0.001);
  }
});

test('deterministic mixed creation and deletion preserve chronology, no overlaps, and immutable state', () => {
  let state = empty();
  let random = 312;
  const rng = () => { random = (random * 1664525 + 1013904223) >>> 0; return random / 2 ** 32; };
  for (let i = 0; i < 70; i++) {
    const time = Date.UTC(2026, 9, 1 + Math.floor(rng() * 160));
    const selectedId = rng() < 0.75 && state.nodes.length ? state.nodes[Math.floor(rng() * state.nodes.length)].id : undefined;
    const old = JSON.stringify(state);
    const next = createEvent(state, { kind: i % 2 ? 'Action' : 'Goal', mistake: 'Lost focus', time, selectedId, firstPosition: { x: 240, y: 400 }, id: `mixed-${i}` });
    assert.equal(JSON.stringify(state), old);
    state = next;
    const xs = axisAnchors(state.nodes, 'x');
    for (const a of state.nodes) {
      const anchor = xs.find(point => point.time === a.data.time);
      assert.ok(a.position.x + 80 >= anchor.value - 0.001);
      assert.ok(a.position.x + 80 <= (anchor.endValue ?? anchor.value) + 0.001);
      for (const b of state.nodes) {
        if (a.data.time < b.data.time) assert.ok(a.position.x < b.position.x);
        if (a.id !== b.id) assert.ok(Math.abs(a.position.x - b.position.x) >= 160 || Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT - 0.001);
      }
    }
    for (const edge of state.edges) {
      assert.ok(state.nodes.find(n => n.id === edge.source).data.time <= state.nodes.find(n => n.id === edge.target).data.time);
    }
    if (i % 11 === 10) state = deleteNode(state, state.nodes[Math.floor(rng() * state.nodes.length)].id);
  }
});

test('vertical January marker uses actual branch heights, independently of horizontal date-column growth', () => {
  let state = add(empty(), '04/11/26');
  const root = state.nodes[0].id;
  state = add(state, '07/11/26', root);
  state = add(state, '12/11/26', state.nodes[1].id);
  state = add(state, '12/12/26', state.nodes[2].id);
  state = add(state, '09/11/26', root);
  const november = state.nodes[4].id;
  state = add(state, '13/11/26', november);
  state = add(state, '09/11/26', root);
  state = add(state, '14/11/26', state.nodes[6].id);
  state = add(state, '12/01/27', root);
  const january = state.nodes[8];
  const ys = axisAnchors(state.nodes, 'y');
  assert.equal(projectTime(january.data.time, ys), -(january.position.y + NODE_HEIGHT / 2));
  const decemberStartY = -projectTime(parseDate('01/12/26'), ys);
  const januaryStartY = -projectTime(parseDate('01/01/27'), ys);
  const februaryStartY = -projectTime(parseDate('01/02/27'), ys);
  const centerY = january.position.y + NODE_HEIGHT / 2;
  assert.ok(februaryStartY < centerY && centerY < januaryStartY);
  assert.ok(januaryStartY < decemberStartY);
  const novemberY = state.nodes[6].position.y + NODE_HEIGHT / 2;
  const ratio = (parseDate('01/01/27') - parseDate('09/11/26')) / (parseDate('12/01/27') - parseDate('09/11/26'));
  assert.ok(Math.abs(januaryStartY - (novemberY + ratio * (centerY - novemberY))) < 1e-8);
  // Changing x alone must never move the vertical ruler.
  const stretched = state.nodes.map((n, i) => ({ ...n, position: { ...n.position, x: n.position.x * (i + 3) } }));
  assert.deepEqual(axisAnchors(stretched, 'y'), ys);
});

test('vertical date envelope retains actual later branch heights without invented monotone offsets', () => {
  const nodes = [
    { data: { time: parseDate('04/11/26'), placement: { mode: 'origin' } }, position: { x: 0, y: 500 } },
    { data: { time: parseDate('14/11/26'), placement: { mode: 'diagonal' } }, position: { x: 300, y: 100 } },
    { data: { time: parseDate('12/01/27'), placement: { mode: 'diagonal' } }, position: { x: 900, y: 250 } },
  ];
  const ys = axisAnchors(nodes, 'y');
  assert.ok(ys.every((a, i) => !i || a.value > ys[i - 1].value));
  assert.equal(projectTime(parseDate('12/01/27'), ys), -(250 + NODE_HEIGHT / 2));
  assert.ok(-projectTime(parseDate('01/01/27'), ys) > 250 + NODE_HEIGHT / 2);
});

test('March reproduction uses January predecessor and does not jump above future May nodes during collision avoidance', () => {
  let state = empty();
  for (const date of ['12/01/27', '15/05/27', '16/05/27', '13/03/27']) state = add(state, date);
  const [january, may15, may16, march] = state.nodes;
  assert.equal(march.data.placement.referenceId, january.id);
  assert.equal((march.data.time - january.data.time) / DAY, 60);
  assert.equal((may15.data.time - march.data.time) / DAY, 63);
  assert.equal(state.edges.length, 0);
  assert.ok(Math.abs(march.position.x - january.position.x - spacing(60)) < 1e-8);
  assert.ok(Math.abs(january.position.y - march.position.y - spacing(60, 'y')) < 1e-8,
    `March must retain January-based y spacing; actual y=${march.position.y}, expected=${january.position.y - spacing(60, 'y')}`);
  assert.ok(january.position.y > march.position.y);
  assert.ok(march.position.y > may15.position.y);
  assert.ok(may15.position.y > may16.position.y);
  for (const axis of ['x', 'y']) {
    const anchors = axisAnchors(state.nodes, axis);
    for (const node of state.nodes) {
      const center = axis === 'x' ? node.position.x + 80 : -(node.position.y + NODE_HEIGHT / 2);
      assert.equal(projectTime(node.data.time, anchors), center);
      const date = new Date(node.data.time);
      const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      assert.ok(projectTime(start, anchors) < center && center < projectTime(end, anchors));
    }
  }
});

test('automatic reference excludes a closer future date and chooses the latest earlier date', () => {
  let state = add(empty(), '01/01/27');
  const january = state.nodes[0].id;
  state = add(state, '01/05/27');
  state = add(state, '01/03/27');
  const march = state.nodes[2].id;
  state = add(state, '30/04/27');
  const april = state.nodes[3];
  assert.equal(april.data.placement.referenceId, march);
  assert.notEqual(april.data.placement.referenceId, state.nodes[1].id);
  assert.notEqual(april.data.placement.referenceId, january);
  assert.ok(Math.abs(state.nodes[2].position.y - april.position.y - spacing(60, 'y')) < 1e-8);
  assert.ok(april.position.y > state.nodes[1].position.y, 'April must remain below the existing future May event');
  for (const axis of ['x', 'y']) {
    const anchors = axisAnchors(state.nodes, axis);
    for (const node of state.nodes) {
      const value = axis === 'x' ? node.position.x + 80 : -(node.position.y + NODE_HEIGHT / 2);
      assert.equal(projectTime(node.data.time, anchors), value);
    }
  }
  assert.equal(state.edges.length, 0);
});

test('an unselected earliest event has no future reference, while explicit later selection keeps its connection rules', () => {
  let state = add(empty(), '15/05/27');
  const may = state.nodes[0].id;
  state = add(state, '12/01/27');
  const january = state.nodes[1];
  assert.equal(january.data.placement.referenceId, undefined);
  assert.equal(january.data.placement.mode, 'origin');
  assert.ok(january.position.x < state.nodes[0].position.x);
  assert.ok(january.position.y > state.nodes[0].position.y);
  assert.equal(state.edges.length, 0);
  state = add(state, '13/03/27', may);
  const march = state.nodes[2];
  assert.equal(march.data.placement.referenceId, may);
  assert.equal(march.data.placement.mode, 'row');
  assert.equal(march.position.y, state.nodes[0].position.y);
  assert.equal(state.edges.length, 1);
  assert.equal(state.edges[0].source, march.id);
  assert.equal(state.edges[0].target, may);
});

test('independent timeline retains every unique date on both axes through out-of-order insertions', () => {
  let state = empty();
  for (const date of ['16/05/27', '12/01/27', '15/05/27', '13/03/27', '30/04/27', '01/03/27', '01/12/26']) {
    state = add(state, date);
    const sorted = [...state.nodes].sort((a, b) => a.data.time - b.data.time);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].position.x > sorted[i - 1].position.x);
      assert.ok(sorted[i].position.y < sorted[i - 1].position.y);
    }
    for (const axis of ['x', 'y']) {
      const anchors = axisAnchors(state.nodes, axis);
      assert.equal(anchors.length, state.nodes.length);
      for (const node of state.nodes) {
        assert.equal(projectTime(node.data.time, anchors), axis === 'x' ? node.position.x + 80 : -(node.position.y + NODE_HEIGHT / 2));
        const ref = state.nodes.find(n => n.id === node.data.placement.referenceId);
        if (ref) assert.ok(ref.data.time < node.data.time);
      }
    }
  }
});

test('connected November-January cluster does not disable April/May chronology for later independent nodes', () => {
  let state = add(empty(), '04/11/26');
  const root = state.nodes[0].id;
  state = add(state, '07/11/26', root);
  state = add(state, '09/11/26', root);
  state = add(state, '09/11/26', root);
  state = add(state, '14/11/26', state.nodes[3].id);
  state = add(state, '12/01/27', root);
  const clusterEdges = state.edges.map(e => e.id);
  for (const date of ['15/05/27', '16/05/27', '13/03/27', '30/04/27']) state = add(state, date);
  const [may15, may16, march, april] = state.nodes.slice(6);
  assert.equal(april.data.placement.referenceId, march.id);
  assert.ok(march.position.y > april.position.y);
  assert.ok(april.position.y > may15.position.y, 'April 30 must stay below May 15 even with connected nodes elsewhere');
  assert.ok(may15.position.y > may16.position.y);
  assert.deepEqual(state.edges.map(e => e.id), clusterEdges, 'independent creation must not add connections');
  for (const axis of ['x', 'y']) {
    const anchors = axisAnchors(state.nodes, axis);
    for (const node of [march, april, may15, may16]) {
      const value = axis === 'x' ? node.position.x + 80 : -(node.position.y + NODE_HEIGHT / 2);
      assert.equal(projectTime(node.data.time, anchors), value, 'the node date must remain an actual ruler anchor');
      const date = new Date(node.data.time);
      const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      assert.ok(projectTime(start, anchors) < value && value < projectTime(next, anchors));
    }
  }
  // Both horizontal connections keep their original row relationship.
  assert.equal(state.nodes[0].position.y, state.nodes[1].position.y);
  assert.equal(state.nodes[3].position.y, state.nodes[4].position.y);
});

test('adding and deleting unrelated connected nodes cannot switch off independent date ordering', () => {
  let state = empty();
  for (const date of ['12/01/27', '15/05/27', '16/05/27', '13/03/27', '30/04/27']) state = add(state, date);
  const timelineIds = state.nodes.map(n => n.id);
  state = add(state, '01/11/26');
  const november = state.nodes.at(-1).id;
  state = add(state, '02/11/26', november);
  const check = () => {
    const timeline = state.nodes.filter(n => timelineIds.includes(n.id)).sort((a, b) => a.data.time - b.data.time);
    for (let i = 1; i < timeline.length; i++) {
      assert.ok(timeline[i].position.x > timeline[i - 1].position.x);
      assert.ok(timeline[i].position.y < timeline[i - 1].position.y);
    }
    const anchors = axisAnchors(state.nodes, 'y');
    for (const node of timeline) assert.equal(projectTime(node.data.time, anchors), -(node.position.y + NODE_HEIGHT / 2));
  };
  assert.equal(state.edges.length, 1);
  check();
  state = deleteNode(state, november);
  state = add(state, '31/03/27');
  assert.equal(state.edges.length, 0);
  check();
});

function clusterWithJanuary() {
  let state = add(empty(), '04/11/26');
  const root = state.nodes[0].id;
  state = add(state, '07/11/26', root);
  state = add(state, '09/11/26', root);
  state = add(state, '09/11/26', root);
  const branch = state.nodes[3].id;
  state = add(state, '14/11/26', branch);
  state = add(state, '12/01/27', root);
  return { state, branch };
}

test('screenshot regression: connected May 15 must reflow above an independent April 30', () => {
  let { state, branch } = clusterWithJanuary();
  state = add(state, '15/05/27', branch);
  for (const date of ['16/05/27', '13/03/27', '30/04/27']) state = add(state, date);
  const [may15, may16, march, april] = state.nodes.slice(6);
  assert.ok(state.edges.some(e => e.source === branch && e.target === may15.id));
  assert.equal(may15.data.placement.mode, 'diagonal');
  assert.equal(april.data.placement.referenceId, march.id);
  assert.ok(april.position.y > may15.position.y,
    `April y=${april.position.y} must be below connected May y=${may15.position.y}`);
  assert.ok(may15.position.y > may16.position.y);
  for (const axis of ['x', 'y']) {
    const anchors = axisAnchors(state.nodes, axis);
    const aprilValue = axis === 'x' ? april.position.x + 80 : -(april.position.y + NODE_HEIGHT / 2);
    assert.equal(projectTime(april.data.time, anchors), aprilValue);
    assert.ok(projectTime(parseDate('01/04/27'), anchors) < aprilValue);
    assert.ok(aprilValue < projectTime(parseDate('01/05/27'), anchors));
  }
  assert.equal(state.nodes[0].position.y, state.nodes[1].position.y);
  assert.equal(state.nodes[3].position.y, state.nodes[4].position.y);
});

test('all 24 insertion orders keep March/April before a connected May destination on both rulers', () => {
  const permutations = values => values.length ? values.flatMap((value, i) =>
    permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
  for (const order of permutations(['15/05/27', '16/05/27', '13/03/27', '30/04/27'])) {
    let { state, branch } = clusterWithJanuary();
    for (const date of order) state = add(state, date, date === '15/05/27' ? branch : undefined);
    const future = state.nodes.filter(n => n.data.time >= parseDate('12/01/27')).sort((a, b) => a.data.time - b.data.time);
    for (let i = 1; i < future.length; i++) {
      assert.ok(future[i].position.x > future[i - 1].position.x, order.join(', '));
      assert.ok(future[i].position.y < future[i - 1].position.y, order.join(', '));
    }
    for (const axis of ['x', 'y']) {
      const anchors = axisAnchors(state.nodes, axis);
      for (const node of future) {
        const value = axis === 'x' ? node.position.x + 80 : -(node.position.y + NODE_HEIGHT / 2);
        assert.equal(projectTime(node.data.time, anchors), value, `${axis}: ${order.join(', ')}`);
      }
    }
  }
});

test('a future same-row May pair moves together when April is inserted into its diagonal parent branch', () => {
  let { state, branch } = clusterWithJanuary();
  state = add(state, '15/05/27', branch);
  const may15Id = state.nodes.at(-1).id;
  state = add(state, '16/05/27', may15Id);
  const may16Id = state.nodes.at(-1).id;
  state = add(state, '13/03/27');
  state = add(state, '30/04/27');
  const may15 = state.nodes.find(n => n.id === may15Id);
  const may16 = state.nodes.find(n => n.id === may16Id);
  const april = state.nodes.at(-1);
  assert.equal(may15.position.y, may16.position.y);
  assert.ok(april.position.y > may15.position.y);
  assert.ok(april.position.x < may15.position.x);
  assert.equal(state.nodes[0].position.y, state.nodes[1].position.y);
  assert.equal(state.nodes[3].position.y, state.nodes[4].position.y);
});

function independentEvents() {
  let state = empty();
  for (const date of ['01/11/26', '03/11/26', '05/11/26', '07/11/26', '09/11/26', '11/11/26']) state = add(state, date);
  return state;
}

function diamondConnections() {
  let state = independentEvents();
  const [a, b, c, d, e] = state.nodes;
  for (const [source, target] of [[a, b], [a, c], [b, d], [c, d], [d, e]]) {
    state = connectNodes(state, { source: source.id, target: target.id, sourceHandle: 'top', targetHandle: 'left' });
  }
  return state;
}

test('manual connections allow branching and merging without changing existing nodes', () => {
  const state = independentEvents();
  const snapshot = JSON.stringify(state);
  const connected = diamondConnections();
  assert.equal(connected.edges.length, 5);
  assert.equal(connected.edges.filter(e => e.source === connected.nodes[0].id).length, 2);
  assert.equal(connected.edges.filter(e => e.target === connected.nodes[3].id).length, 2);
  const [a, b] = state.nodes;
  const next = connectNodes(state, { source: a.id, target: b.id, sourceHandle: 'top', targetHandle: 'left' });
  assert.equal(next.nodes, state.nodes);
  assert.equal(JSON.stringify(state), snapshot);
  assert.deepEqual([next.edges[0].data.value, next.edges[0].data.unit, next.edges[0].data.days], ['2', 'days', 2]);
  assert.equal(next.edges[0].data.manual, true);
});

test('all top/side endpoints work and reversed gestures retain chronological arrows and the chosen ports', () => {
  const state = independentEvents();
  const [earlier, later] = state.nodes;
  for (const sourceHandle of ['top', 'left', 'right']) for (const targetHandle of ['top', 'left', 'right']) {
    const next = connectNodes(state, { source: later.id, target: earlier.id, sourceHandle, targetHandle });
    assert.equal(next.edges[0].source, earlier.id);
    assert.equal(next.edges[0].target, later.id);
    assert.equal(next.edges[0].sourceHandle, targetHandle);
    assert.equal(next.edges[0].targetHandle, sourceHandle);
  }
});

test('self, duplicate, missing-node, and unsupported-handle connections are rejected', () => {
  let state = independentEvents();
  state = add(state, '01/11/26');
  const [a, b] = state.nodes;
  state = connectNodes(state, { source: a.id, target: b.id });
  for (const invalid of [
    { source: a.id, target: a.id },
    { source: b.id, target: a.id },
    { source: a.id, target: 'missing' },
    { source: a.id, target: state.nodes[2].id, sourceHandle: 'bottom' },
  ]) {
    assert.equal(canConnectNodes(state, invalid), false);
    assert.equal(connectNodes(state, invalid), state);
  }
});

test('deleting a single manual or automatic edge preserves all node and other edge objects', () => {
  const graph = diamondConnections();
  const removed = graph.edges[2];
  const snapshot = JSON.stringify(graph);
  const next = deleteEdge(graph, removed.id);
  assert.equal(next.nodes, graph.nodes);
  assert.deepEqual(next.edges.map(e => e.id), graph.edges.filter(e => e.id !== removed.id).map(e => e.id));
  for (const edge of next.edges) assert.equal(edge, graph.edges.find(e => e.id === edge.id));
  assert.equal(JSON.stringify(graph), snapshot);
  const [a, b] = graph.nodes;
  let automatic = add(empty(), '01/11/26');
  automatic = add(automatic, '03/11/26', automatic.nodes[0].id);
  assert.equal(automatic.edges[0].deletable, true);
  assert.equal(deleteEdge(automatic, automatic.edges[0].id).nodes, automatic.nodes);
  assert.equal(deleteEdge(automatic, automatic.edges[0].id).edges.length, 0);
  // After disconnecting B from D, deleting B no longer reaches the merged D.
  const afterDelete = deleteNode(next, b.id);
  assert.ok(afterDelete.nodes.some(n => n.id === graph.nodes[3].id));
  assert.ok(afterDelete.nodes.some(n => n.id === a.id));
});

test('upstream chains include every merging path and exclude descendants and unrelated nodes', () => {
  const graph = diamondConnections();
  const [a, b, c, d, e, f] = graph.nodes;
  const chain = upstreamChain(graph, d.id);
  assert.deepEqual([...chain.nodeIds].sort(), [a.id, b.id, c.id, d.id].sort());
  assert.deepEqual([...chain.edgeIds].sort(), graph.edges.slice(0, 4).map(edge => edge.id).sort());
  assert.equal(chain.nodeIds.has(e.id), false);
  assert.equal(chain.nodeIds.has(f.id), false);
  const broken = upstreamChain(deleteEdge(graph, graph.edges[2].id), d.id);
  assert.deepEqual([...broken.nodeIds].sort(), [a.id, c.id, d.id].sort());
  assert.equal(broken.edgeIds.size, 2);
  assert.deepEqual([...upstreamChain(graph, a.id).nodeIds], [a.id]);
  assert.equal(upstreamChain(graph, a.id).edgeIds.size, 0);
  assert.equal(upstreamChain(graph, 'missing').nodeIds.size, 0);
  const deleted = deleteNode(graph, a.id);
  assert.deepEqual(deleted.nodes, graph.nodes.slice(1));
  assert.deepEqual(deleted.edges, graph.edges.filter(edge => edge.source !== a.id && edge.target !== a.id));
});

test('manually chosen ports persist through subsequent automatic layout and count as outgoing connections', () => {
  let graph = independentEvents();
  const [a, b] = graph.nodes;
  graph = connectNodes(graph, { source: a.id, target: b.id, sourceHandle: 'left', targetHandle: 'top' });
  graph = add(graph, '15/11/26', a.id);
  const manual = graph.edges.find(e => e.data.manual);
  assert.equal(manual.sourceHandle, 'left');
  assert.equal(manual.targetHandle, 'top');
  assert.equal(graph.nodes.at(-1).data.placement.mode, 'diagonal');
  assert.equal(graph.nodes.at(-1).draggable, false);
  assert.ok(graph.nodes.every(n => n.connectable));
});

test('all seven kinds save the required mistake and optional description without changing layout', () => {
  assert.deepEqual(NODE_KINDS, ['Mistake', 'Consequence', 'Action', 'Blocked', 'Goal', 'Milestone', 'Success']);
  for (const kind of NODE_KINDS) {
    const initial = kind === 'Consequence' ? add(empty(), '07/11/26', undefined, 'Mistake') : empty();
    const graph = createEvent(initial, {
      kind, mistake: '  Lost my composure  ', description: 'I interrupted another person.',
      time: parseDate('07/11/26'), firstPosition: { x: 240, y: 400 }, id: kind,
      selectedId: initial.nodes[0]?.id,
    });
    const node = graph.nodes.at(-1);
    assert.deepEqual(node.position, { x: kind === 'Consequence' ? 240 + spacing(0) : 240, y: 400 });
    assert.equal(node.data.kind, kind);
    assert.equal(node.data.mistake, 'Lost my composure');
    assert.equal(node.data.description, 'I interrupted another person.');
    assert.equal(node.draggable, false);
    assert.equal(node.connectable, true);
  }
});

test('creation validates type, required mistake, and the 500-character description limit', () => {
  const fields = { kind: 'Goal', mistake: 'Lost focus', time: parseDate('07/11/26'), firstPosition: { x: 240, y: 400 }, id: 'validation' };
  for (const mistake of [undefined, '', '   ', null]) {
    assert.throws(() => createEvent(empty(), { ...fields, mistake }), /Mistake is required/);
  }
  assert.throws(() => createEvent(empty(), { ...fields, kind: 'Other' }), /Invalid event/);
  assert.throws(() => createEvent(empty(), { ...fields, time: NaN }), /Invalid event/);
  assert.throws(() => createEvent(empty(), { ...fields, description: 'a'.repeat(501) }), /500 characters/);
  assert.throws(() => createEvent(empty(), { ...fields, description: null }), /500 characters/);
  assert.equal(createEvent(empty(), fields).nodes[0].data.description, '');
  assert.equal(createEvent(empty(), { ...fields, description: 'a'.repeat(500) }).nodes[0].data.description.length, 500);
});

test('description length counts characters rather than words and retains complete emoji and accented characters', () => {
  const words = 'word '.repeat(101);
  assert.equal(limitDescription(words), words.slice(0, 500));
  const emoji = '👍🏽';
  const accented = 'e\u0301';
  for (const character of [emoji, accented]) {
    assert.equal(limitDescription(character.repeat(501)), character.repeat(500));
    const graph = createEvent(empty(), {
      kind: 'Success', mistake: 'Lost focus', description: character.repeat(500),
      time: parseDate('07/11/26'), firstPosition: { x: 240, y: 400 }, id: 'unicode',
    });
    assert.equal(graph.nodes[0].data.description, character.repeat(500));
    assert.throws(() => createEvent(empty(), {
      kind: 'Success', mistake: 'Lost focus', description: character.repeat(501),
      time: parseDate('07/11/26'), firstPosition: { x: 240, y: 400 }, id: 'unicode-too-long',
    }), /500 characters/);
  }
});

test('Consequence creation requires explicit selection of a Mistake or Action', () => {
  const state = add(empty(), '07/11/26', undefined, 'Mistake');
  const snapshot = JSON.stringify(state);
  assert.throws(() => add(empty(), '08/11/26', undefined, 'Consequence'), /Select a Mistake or Action/);
  assert.throws(() => add(state, '08/11/26', undefined, 'Consequence'), /Select a Mistake or Action/);
  assert.throws(() => add(state, '08/11/26', 'missing', 'Consequence'), /Select a Mistake or Action/);
  assert.equal(JSON.stringify(state), snapshot);
  for (const kind of NODE_KINDS) {
    let graph = kind === 'Consequence' ? add(empty(), '06/11/26') : empty();
    graph = add(graph, '07/11/26', graph.nodes[0]?.id, kind);
    const parent = graph.nodes.at(-1);
    const before = JSON.stringify(graph);
    if (['Mistake', 'Action'].includes(kind)) {
      const next = add(graph, '08/11/26', parent.id, 'Consequence');
      assert.equal(next.edges.at(-1).source, parent.id);
      assert.equal(next.nodes.at(-1).data.kind, 'Consequence');
    } else assert.throws(() => add(graph, '08/11/26', parent.id, 'Consequence'), /Select a Mistake or Action/);
    assert.equal(JSON.stringify(graph), before);
  }
});

test('a selected Mistake rejects every other successor type at earlier, equal, and later dates', () => {
  const state = add(empty(), '07/11/26', undefined, 'Mistake');
  const root = state.nodes[0];
  for (const kind of NODE_KINDS.filter(kind => kind !== 'Consequence')) {
    for (const date of ['06/11/26', '07/11/26', '08/11/26']) {
      assert.throws(() => add(state, date, root.id, kind), /Mistake can only be followed by a Consequence/);
    }
  }
  assert.equal(state.nodes.length, 1);
  assert.equal(state.edges.length, 0);
});

test('same-date Consequences follow a Mistake on the right row first, then above and right with zero-day arrows', () => {
  let graph = add(empty(), '07/11/26', undefined, 'Mistake');
  const rootId = graph.nodes[0].id;
  graph = add(graph, '07/11/26', rootId, 'Consequence');
  const firstId = graph.nodes[1].id;
  let root = graph.nodes[0];
  let first = graph.nodes[1];
  assert.equal(first.position.x - root.position.x, spacing(0));
  assert.equal(first.position.y + nodeHeight(first) / 2, root.position.y + nodeHeight(root) / 2);
  assert.equal(graph.edges[0].source, root.id);
  assert.equal(graph.edges[0].target, first.id);
  assert.equal(graph.edges[0].sourceHandle, 'right');
  assert.equal(graph.edges[0].targetHandle, 'left');
  assert.deepEqual(graph.edges[0].data, { value: '0', unit: 'days', days: 0, labelPosition: graph.edges[0].data.labelPosition });
  graph = add(graph, '07/11/26', rootId, 'Consequence');
  root = graph.nodes[0]; first = graph.nodes.find(n => n.id === firstId);
  const second = graph.nodes[2];
  assert.equal(first.position.y + nodeHeight(first) / 2, root.position.y + nodeHeight(root) / 2);
  assert.equal(second.position.x - root.position.x, spacing(0));
  assert.equal(first.position.y - second.position.y, nodeHeight(second) + SAME_DATE_GAP);
  assert.equal(graph.edges[1].sourceHandle, 'top');
  assert.equal(graph.edges[1].targetHandle, 'left');
  assert.equal(graph.edges[1].data.days, 0);
  assert.equal(monthTicks(graph.nodes).length, 1);
  const upstream = upstreamChain(graph, second.id);
  assert.deepEqual([...upstream.nodeIds].sort(), [root.id, second.id].sort());
  assert.equal(deleteNode(graph, rootId).nodes.length, 2);
});

test('different-date Consequences preserve calendar order and existing row/branch placement', () => {
  for (const kind of ['Mistake', 'Action']) for (const date of ['06/11/26', '08/11/26']) {
    let graph = add(empty(), '07/11/26', undefined, kind);
    const rootId = graph.nodes[0].id;
    if (kind === 'Mistake' && date === '06/11/26') {
      const snapshot = JSON.stringify(graph);
      assert.throws(() => add(graph, date, rootId, 'Consequence'), { message: 'A Consequence must occur after the Mistake.' });
      assert.equal(JSON.stringify(graph), snapshot); continue;
    }
    graph = add(graph, date, rootId, 'Consequence');
    const [root, child] = graph.nodes;
    assert.equal(root.position.y + nodeHeight(root) / 2, child.position.y + nodeHeight(child) / 2);
    assert.ok(Math.abs(Math.abs(child.position.x - root.position.x) - spacing(1)) < 1e-8);
    const source = graph.nodes.find(n => n.id === graph.edges[0].source);
    const target = graph.nodes.find(n => n.id === graph.edges[0].target);
    assert.ok(source.data.time < target.data.time);
  }
  let graph = add(empty(), '07/11/26', undefined, 'Mistake');
  graph = add(graph, '08/11/26', graph.nodes[0].id, 'Consequence');
  graph = add(graph, '09/11/26', graph.nodes[0].id, 'Consequence');
  assert.ok(graph.nodes[2].position.y < graph.nodes[0].position.y);
  // Selected same-date placement now applies to Action as well as Mistake.
  let action = add(empty(), '07/11/26');
  action = add(action, '07/11/26', action.nodes[0].id, 'Consequence');
  assert.equal(action.nodes[1].position.x - action.nodes[0].position.x, spacing(0));
  assert.equal(action.nodes[1].position.y, action.nodes[0].position.y);
  assert.equal(action.edges.length, 1);
});

test('all type pairs obey the same rules on equal dates and normalize only different-date gestures', () => {
  for (const sourceKind of NODE_KINDS) for (const targetKind of NODE_KINDS) {
    const graph = { nodes: [
      { id: 'earlier', position: { x: 0, y: 0 }, data: { kind: sourceKind, time: parseDate('07/11/26') } },
      { id: 'later', position: { x: 300, y: -100 }, data: { kind: targetKind, time: parseDate('08/11/26') } },
    ], edges: [] };
    const allowed = (sourceKind !== 'Mistake' || targetKind === 'Consequence') &&
      (sourceKind !== 'Consequence' || !['Mistake', 'Milestone', 'Success'].includes(targetKind)) &&
      (targetKind !== 'Consequence' || ['Mistake', 'Action'].includes(sourceKind));
    for (const [source, target] of [['earlier', 'later'], ['later', 'earlier']]) {
      assert.equal(canConnectNodes(graph, { source, target }), allowed, `${sourceKind} -> ${targetKind}`);
      const next = connectNodes(graph, { source, target });
      assert.equal(next.edges.length, allowed ? 1 : 0);
      if (allowed) assert.equal(next.edges[0].source, 'earlier');
    }
    graph.nodes[1].data.time = graph.nodes[0].data.time;
    assert.equal(canConnectNodes(graph, { source: 'earlier', target: 'later' }), allowed);
    if (allowed) {
      const next = connectNodes(graph, { source: 'earlier', target: 'later' });
      assert.equal(next.edges[0].source, 'earlier');
      assert.equal(next.edges[0].data.days, 0);
    }
  }
  const goal = add(empty(), '08/11/26', undefined, 'Goal');
  assert.throws(() => add(goal, '07/11/26', goal.nodes[0].id, 'Mistake'), /Mistake nodes can only connect/);
});

test('deleted or manual outgoing edges correctly choose the same-date Consequence scenario without overlaps', () => {
  let graph = add(empty(), '07/11/26', undefined, 'Mistake');
  const rootId = graph.nodes[0].id;
  graph = add(graph, '07/11/26', rootId, 'Consequence');
  const original = graph.nodes[1];
  graph = deleteEdge(graph, graph.edges[0].id);
  graph = add(graph, '07/11/26', rootId, 'Consequence');
  const next = graph.nodes[2];
  assert.equal(next.position.y + nodeHeight(next) / 2, graph.nodes[0].position.y + nodeHeight(graph.nodes[0]) / 2);
  assert.ok(next.position.x > original.position.x);
  graph = connectNodes(graph, { source: rootId, target: original.id, sourceHandle: 'top', targetHandle: 'left' });
  assert.equal(graph.edges.at(-1).source, rootId);
  graph = add(graph, '07/11/26', rootId, 'Consequence');
  assert.ok(graph.nodes.at(-1).position.y < graph.nodes[0].position.y);
  for (let i = 0; i < graph.nodes.length; i++) for (let j = i + 1; j < graph.nodes.length; j++) {
    assert.ok(Math.abs(graph.nodes[i].position.x - graph.nodes[j].position.x) >= 160 || Math.abs(graph.nodes[i].position.y - graph.nodes[j].position.y) >= NODE_HEIGHT);
  }
});

test('same-date Consequence offsets remain inside their month when future dates are added or inserted', () => {
  let graph = add(empty(), '30/11/26', undefined, 'Mistake');
  const rootId = graph.nodes[0].id;
  graph = add(graph, '30/11/26', rootId, 'Consequence');
  graph = add(graph, '30/11/26', rootId, 'Consequence');
  graph = add(graph, '31/12/26');
  graph = add(graph, '01/12/26');
  for (const axis of ['x', 'y']) {
    const anchors = axisAnchors(graph.nodes, axis);
    const boundary = projectTime(parseDate('01/12/26'), anchors);
    for (const node of graph.nodes.slice(0, 3)) {
      const coordinate = axis === 'x' ? node.position.x + 80 : -(node.position.y + 32);
      assert.ok(coordinate < boundary, `${axis}: November Consequence crossed December`);
    }
    assert.ok(projectTime(parseDate('01/11/26'), anchors) < boundary);
  }
  assert.equal(monthTicks(graph.nodes).length, 2);
});

test('incoming edges do not select the branch scenario and manual zero-day labels stay clear of added Consequences', () => {
  let incoming = add(empty(), '07/11/26', undefined, 'Mistake');
  const rootId = incoming.nodes[0].id;
  incoming = add(incoming, '06/11/26', undefined, 'Action');
  incoming = connectNodes(incoming, { source: incoming.nodes[1].id, target: rootId });
  assert.equal(incoming.edges[0].target, rootId);
  incoming = add(incoming, '07/11/26', rootId, 'Consequence');
  assert.equal(incoming.nodes.at(-1).position.y, incoming.nodes[0].position.y);

  let graph = add(empty(), '07/11/26', undefined, 'Mistake');
  const mistakeId = graph.nodes[0].id;
  graph = add(graph, '07/11/26', mistakeId, 'Consequence');
  const consequenceId = graph.nodes[1].id;
  graph = add(graph, '06/11/26', undefined, 'Goal');
  graph = add(graph, '08/11/26');
  graph = deleteEdge(graph, graph.edges[0].id);
  graph = connectNodes(graph, { source: mistakeId, sourceHandle: 'right', target: consequenceId, targetHandle: 'top' });
  graph = add(graph, '07/11/26', mistakeId, 'Consequence');
  const label = graph.edges[0].data.labelPosition;
  assert.ok(label, 'manual route has a clear label position after adding a branch');
  for (const node of graph.nodes) {
    assert.ok(label.x + 31 <= node.position.x || label.x - 31 >= node.position.x + 160 ||
      label.y + 23 <= node.position.y || label.y - 23 >= node.position.y + nodeHeight(node));
  }
});

test('Consequence cannot point to Mistake/Milestone/Success through automatic creation; rejection preserves content', () => {
  let graph = add(empty(), '01/11/26');
  graph = add(graph, '02/11/26', graph.nodes[0].id, 'Consequence');
  const parent = graph.nodes[1];
  for (const kind of ['Mistake', 'Milestone', 'Success']) for (const date of ['02/11/26', '03/11/26']) {
    const snapshot = JSON.stringify(graph);
    assert.throws(() => add(graph, date, parent.id, kind), /Consequence nodes cannot connect/);
    assert.equal(JSON.stringify(graph), snapshot);
  }
});

test('same-date manual arrows preserve chosen direction and can recreate every permitted automatic type pair', () => {
  for (const sourceKind of NODE_KINDS) for (const targetKind of NODE_KINDS) {
    if ((sourceKind === 'Mistake' && targetKind !== 'Consequence') ||
      (sourceKind === 'Consequence' && ['Mistake', 'Milestone', 'Success'].includes(targetKind)) ||
      (targetKind === 'Consequence' && !['Mistake', 'Action'].includes(sourceKind))) continue;
    let graph = sourceKind === 'Consequence' ? add(empty(), '06/11/26') : empty();
    graph = add(graph, '07/11/26', graph.nodes[0]?.id, sourceKind);
    const source = graph.nodes.at(-1).id;
    graph = add(graph, '07/11/26', source, targetKind);
    const edge = graph.edges.at(-1), target = graph.nodes.at(-1).id;
    const disconnected = deleteEdge(graph, edge.id);
    const reconnected = connectNodes(disconnected, { source, target });
    assert.equal(reconnected.nodes, disconnected.nodes);
    assert.equal(reconnected.edges.at(-1).source, source);
    assert.equal(reconnected.edges.at(-1).target, target);
    assert.equal(reconnected.edges.at(-1).data.days, 0);
  }
});
