export function creationTypeError(kind, selectedKind) {
  if (kind === 'Consequence' && !['Mistake', 'Action'].includes(selectedKind)) {
    return 'Select a Mistake or Action node before creating a Consequence.';
  }
  if (selectedKind === 'Mistake' && kind !== 'Consequence') {
    return 'A Mistake can only be followed by a Consequence.';
  }
  return '';
}

export function connectionTypeError(sourceKind, targetKind) {
  if (sourceKind === 'Mistake' && targetKind !== 'Consequence') {
    return 'Mistake nodes can only connect to Consequence nodes.';
  }
  if (targetKind === 'Consequence' && !['Mistake', 'Action'].includes(sourceKind)) {
    return 'Consequence nodes can only receive connections from Mistake or Action nodes.';
  }
  return '';
}
