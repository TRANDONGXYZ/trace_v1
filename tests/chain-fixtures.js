import { durationLabel, parseDate } from '../src/model.js';

export function chainFixture() {
  const rows = [
    ['m-deep', 'Mistake', '01/11/26', 'Một lỗi dài cần giữ nguyên toàn bộ nội dung khi xem chuỗi hệ quả. '.repeat(4), 'Original Mistake context.\nSecond line stays unchanged.'],
    ['m-ties', 'Mistake', '02/11/26'], ['m-two', 'Mistake', '03/11/26'], ['m-parallel', 'Mistake', '02/11/26'],
    ['m-one', 'Mistake', '04/11/26'], ['m-none', 'Mistake', '05/11/26'], ['m-bridge', 'Mistake', '06/11/26'],
    ['m-future', 'Mistake', '28/12/26'], ['m-prior', 'Mistake', '31/10/26'], ['m-next', 'Mistake', '01/01/27'],
    ['deep-c1', 'Consequence', '03/11/26', 'The first recorded Consequence', 'Details one.\nChi tiết hai.'],
    ['deep-c2', 'Consequence', '07/11/26'], ['deep-c3', 'Consequence', '15/11/26'], ['later-branch', 'Consequence', '20/11/26'],
    ['after-action', 'Action', '17/11/26'], ['after-break', 'Consequence', '03/12/26'],
    ['tie-a', 'Consequence', '03/11/26'], ['tie-end-a', 'Consequence', '08/11/26'],
    ['tie-b', 'Consequence', '04/11/26'], ['tie-end-b', 'Consequence', '12/11/26'],
    ['two-c1', 'Consequence', '04/11/26'], ['two-c2', 'Consequence', '08/11/26'],
    ['parallel-a', 'Consequence', '04/11/26'], ['parallel-b', 'Consequence', '06/11/26'], ['parallel-c', 'Consequence', '10/11/26'],
    ['one-c', 'Consequence', '05/11/26'], ['bridge-action', 'Action', '07/11/26'], ['bridge-c', 'Consequence', '09/11/26'],
    ['future-c1', 'Consequence', '03/01/27'], ['future-c2', 'Consequence', '07/01/27'], ['prior-c', 'Consequence', '01/11/26'],
    ['bridge-follow-up', 'Action', '14/11/26'],
  ];
  const nodes = rows.map(([id, kind, date, text = `Original ${id}`, description = ''], index) => {
    const position = { x: 180 + index % 6 * 240, y: 150 + Math.floor(index / 6) * 130 };
    return { id, type: 'event', position, width: 160, height: 96, draggable: false, connectable: true,
      data: { kind, time: parseDate(date), mistake: text, description, placement: { mode: 'origin', origin: position, columnOffset: 0 } } };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = [['m-deep', 'deep-c1'], ['deep-c1', 'deep-c2'], ['deep-c2', 'deep-c3'], ['deep-c1', 'later-branch'],
    ['deep-c3', 'after-action'], ['after-action', 'after-break'], ['m-ties', 'tie-a'], ['tie-a', 'tie-end-a'],
    ['m-ties', 'tie-b'], ['tie-b', 'tie-end-b'], ['m-two', 'two-c1'], ['two-c1', 'two-c2'],
    ['m-parallel', 'parallel-a'], ['m-parallel', 'parallel-b'], ['m-parallel', 'parallel-c'], ['m-one', 'one-c'],
    // Historical relationships can bypass today's creation rules; analytics
    // reads their recorded structure without rewriting the original diagram.
    ['m-bridge', 'bridge-action'], ['bridge-action', 'bridge-c'], ['bridge-c', 'bridge-follow-up'],
    ['m-future', 'future-c1'], ['future-c1', 'future-c2'], ['m-prior', 'prior-c']];
  const edges = links.map(([source, target], index) => ({ id: `chain-edge-${index}`, type: 'time', source, target,
    sourceHandle: 'right', targetHandle: 'left', data: { ...durationLabel(byId.get(source).data.time, byId.get(target).data.time), manual: true } }));
  return { nodes, edges };
}
