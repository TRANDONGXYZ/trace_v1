// Content snapshots only. Viewport and selection never enter this reducer.
export const initialHistory = present => ({ past: [], present, future: [] });

export function diagramHistory(history, action) {
  if (action.type === 'undo') {
    if (!history.past.length) return history;
    return { past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future] };
  }
  if (action.type === 'redo') {
    if (!history.future.length) return history;
    return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
  }
  if (action.type !== 'change') return history;
  const next = typeof action.value === 'function' ? action.value(history.present) : action.value;
  if (next === history.present || JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return { past: [...history.past, history.present], present: next, future: [] };
}
