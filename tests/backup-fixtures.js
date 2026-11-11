import { DAY, durationLabel } from '../src/model.js';
export function backupFixture(count = 8) {
  const kinds = ['Action', 'Goal', 'Blocked', 'Milestone', 'Success', 'Mistake', 'Consequence', 'Consequence'];
  const nodes = Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length], position = { x: 240 + index * 280, y: 600 - index % 6 * 128 };
    return { id: `n${index}`, type: 'event', position, width: 160, height: 96,
      data: { kind, mistake: `Record ${index}: hành động và kết quả`, description: `Description ${index}\nSecond line`, time: Date.UTC(2026, 0, 1) + index * DAY,
        placement: { mode: index ? 'diagonal' : 'origin', columnOffset: 0, ...(index ? { referenceId: `n${index - 1}` } : { origin: position }) } },
      draggable: false, connectable: true };
  });
  const edges = nodes.slice(1).map((node, index) => ({ id: `e${index}`, type: 'time', source: nodes[index].id, target: node.id,
    sourceHandle: index % 2 ? 'top' : 'right', targetHandle: 'left',
    data: { ...durationLabel(nodes[index].data.time, node.data.time), ...(index % 2 ? { manual: true } : {}), labelPosition: { x: node.position.x - 55, y: node.position.y + 48 } } }));
  return { nodes, edges };
}
