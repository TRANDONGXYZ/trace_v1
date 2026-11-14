import { parseDate, durationLabel } from '../src/model.js';

export function achievementFixture() {
  const rows = [
    ['a', 'Action', '15/10/26', 'An earlier phase Action with complete original content. '.repeat(4), 'Original Action context.\nChi tiết gốc.'],
    ['c', 'Action', '04/11/26'], ['d', 'Action', '05/11/26'], ['e', 'Action', '06/11/26'], ['f', 'Action', '19/10/26'],
    ['m', 'Milestone', '10/11/26'], ['g', 'Blocked', '08/11/26'],
    ['s', 'Success', '12/11/26', 'Completed the recorded achievement', 'Full achievement Description.\nSecond original line.'],
    ['none', 'Milestone', '11/11/26'], ['future', 'Success', '20/12/26'], ['prior', 'Success', '31/10/26'], ['next', 'Success', '01/01/27'],
    ['unrelated', 'Action', '03/11/26'], ['downstream', 'Goal', '13/11/26'],
    ['mistake', 'Mistake', '01/11/26'], ['consequence', 'Consequence', '02/11/26'],
  ];
  const nodes = rows.map(([id, kind, date, text = `Original ${id}`, description = ''], i) => {
    const position = { x: 180 + i % 6 * 240, y: 150 + Math.floor(i / 6) * 130 };
    return { id, type: 'event', position, width: 160, height: 96, draggable: false, connectable: true,
      data: { kind, time: parseDate(date), mistake: text, description, placement: { mode: 'origin', origin: position, columnOffset: 0 } } };
  });
  const pairs = [['a', 'm'], ['c', 'm'], ['m', 's'], ['d', 'e'], ['e', 's'], ['a', 'e'], ['f', 'g'], ['g', 's'],
    ['s', 'downstream'], ['unrelated', 'next'], ['mistake', 'consequence'], ['consequence', 'c']];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = pairs.map(([source, target], i) => ({ id: `achievement-edge-${i}`, type: 'time', source, target, sourceHandle: 'right', targetHandle: 'left',
    data: { ...durationLabel(byId.get(source).data.time, byId.get(target).data.time), manual: true } }));
  return { nodes, edges };
}
