export function creationTypeError(kind, selectedKind) {
  if (kind === 'Consequence' && !['Mistake', 'Action', 'Consequence'].includes(selectedKind)) {
    return 'Select a Mistake, Action, or Consequence node before creating a Consequence.';
  }
  if (selectedKind === 'Mistake' && kind !== 'Consequence') {
    return 'A Mistake can only be followed by a Consequence.';
  }
  return '';
}

export function connectionTypeError(sourceKind, targetKind) {
  if (sourceKind === 'Consequence' && ['Mistake', 'Milestone', 'Success'].includes(targetKind)) {
    return 'Consequence nodes cannot connect to Mistake, Milestone, or Success nodes.';
  }
  if (sourceKind === 'Mistake' && targetKind !== 'Consequence') {
    return 'Mistake nodes can only connect to Consequence nodes.';
  }
  if (targetKind === 'Consequence' && !['Mistake', 'Action', 'Consequence'].includes(sourceKind)) {
    return 'Consequence nodes can only receive connections from Mistake, Action, or Consequence nodes.';
  }
  return '';
}

// Equal dates retain the requested direction. Different dates retain the
// existing earlier-to-later normalization; types are checked after ordering.
export function connectionOrder(a, b) {
  return a.data.time <= b.data.time ? [a, b] : [b, a];
}
