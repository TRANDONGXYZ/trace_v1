import { durationLabel, parseDate } from '../src/model.js';

export function phaseFixture() {
  const records = [
    ['m-high', 'Mistake', '01/11/26'], ['m-low', 'Mistake', '02/11/26'],
    ['m-zero', 'Mistake', '03/11/26'], ['m-tie', 'Mistake', '04/11/26'], ['m-december', 'Mistake', '31/12/26'],
    ['c-one', 'Consequence', '02/11/26'], ['c-two', 'Consequence', '03/11/26'],
    ['c-future', 'Consequence', '01/01/27'], ['c-small', 'Consequence', '04/11/26'], ['c-zero', 'Consequence', '05/11/26'],
    ['a-one', 'Action', '02/01/27'], ['a-two', 'Action', '03/01/27'], ['a-three', 'Action', '04/01/27'],
    ['a-phase', 'Action', '06/11/26'], ['a-shared', 'Action', '08/11/26'],
    ['goal', 'Goal', '09/11/26'], ['milestone', 'Milestone', '10/11/26'],
    ['blocked', 'Blocked', '11/11/26'], ['success', 'Success', '31/12/26'],
    ['old', 'Mistake', '31/10/26'], ['next', 'Mistake', '01/01/27'],
  ];
  const nodes = records.map(([id, kind, date], index) => {
    const position = { x: 160 + index % 5 * 240, y: 150 + Math.floor(index / 5) * 140 };
    return { id, type: 'event', position, width: 160, height: 96, draggable: false, connectable: true,
      data: { kind, time: parseDate(date), mistake: `Recorded ${id}: nội dung đầy đủ`, description: `Details for ${id}\nSecond line`,
        placement: { mode: 'origin', origin: position, columnOffset: 0 } } };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = [['m-high', 'c-one'], ['m-high', 'c-two'], ['c-one', 'c-future'], ['c-two', 'c-future'],
    ['c-two', 'a-one'], ['c-future', 'a-one'], ['a-one', 'a-two'], ['a-two', 'a-three'],
    ['m-low', 'c-small'], ['m-tie', 'c-small'], ['c-small', 'a-shared']];
  const edges = links.map(([source, target], index) => ({ id: `phase-edge-${index}`, source, target, type: 'time',
    sourceHandle: 'right', targetHandle: 'left',
    data: { ...durationLabel(byId.get(source).data.time, byId.get(target).data.time), manual: true } }));
  return { nodes, edges };
}
