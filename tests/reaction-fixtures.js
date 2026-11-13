import { durationLabel, parseDate } from '../src/model.js';

export function reactionFixture() {
  const rows = [
    ['c-long', 'Consequence', '01/11/26', 'A long consequence account that must remain complete in the details. '.repeat(5), 'Original consequence context.\nThe second line is preserved.'],
    ['c-mid', 'Consequence', '06/11/26', 'Reviewed what happened', 'Waited until symptoms settled.\nThen made a plan.'],
    ['c-short', 'Consequence', '05/11/26', 'A shorter interval', ''],
    ['c-same', 'Consequence', '08/11/26', 'Acted on the same day', ''],
    ['c-future-only', 'Consequence', '07/11/26', 'A connected Action is dated tomorrow', 'This is the original note.'],
    ['c-none', 'Consequence', '09/11/26', 'No connected follow-up', ''],
    ['c-not-observed', 'Consequence', '14/11/26', 'Future Consequence', ''],
    ['c-old', 'Consequence', '31/10/26', 'Previous phase Consequence', ''],
    ['a-long', 'Action', '13/11/26', 'Changed my approach after reviewing the notes', 'Step one: kiểm tra kỹ thuật.\nStep two: nghỉ ngơi.'],
    ['a-short', 'Action', '10/11/26', 'First of several connected Actions', ''],
    ['a-same', 'Action', '08/11/26', 'Same-day Action', ''],
    ['a-future', 'Action', '14/11/26', 'Future-dated Action', ''],
    ['a-unrelated', 'Action', '02/11/26', 'An unrelated Action must not be selected', ''],
    ['goal-alt', 'Goal', '04/11/26', 'An unrelated Goal', ''],
  ];
  const nodes = rows.map(([id, kind, date, mistake, description], index) => {
    const position = { x: 160 + index % 5 * 230, y: 140 + Math.floor(index / 5) * 130 };
    return { id, type: 'event', position, width: 160, height: 96, draggable: false, connectable: true,
      data: { kind, time: parseDate(date), mistake, description, placement: { mode: 'origin', origin: position, columnOffset: 0 } } };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = [['c-long', 'c-mid'], ['c-mid', 'a-long'],
    ['c-short', 'a-short'], ['c-short', 'a-long'], ['c-same', 'a-same'], ['c-future-only', 'a-future'], ['c-old', 'a-short']];
  const edges = links.map(([source, target], index) => ({ id: `reaction-edge-${index}`, source, target, type: 'time', sourceHandle: 'right', targetHandle: 'left',
    data: { ...durationLabel(byId.get(source).data.time, byId.get(target).data.time), manual: true } }));
  return { nodes, edges };
}
