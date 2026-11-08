import { getSmoothStepPath } from '@xyflow/react';

export function manualEdgePath(points) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = points;
  if (sourcePosition === 'top' && targetPosition === 'left' && targetX > sourceX && targetY < sourceY) {
    const radius = Math.min(16, (targetX - sourceX) / 2, (sourceY - targetY) / 2);
    return [
      `M ${sourceX} ${sourceY} L ${sourceX} ${targetY + radius} Q ${sourceX} ${targetY} ${sourceX + radius} ${targetY} L ${targetX} ${targetY}`,
      (sourceX + radius + targetX) / 2, targetY,
    ];
  }
  return getSmoothStepPath({ ...points, borderRadius: 16 });
}

// Labels need straight stretches of a rounded orthogonal route, not its corners.
export function straightSegments(path) {
  const segments = [];
  let current;
  for (const [, command, coordinates] of path.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const numbers = (coordinates.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (command === 'M') current = { x: numbers[0], y: numbers[1] };
    else if (command === 'Q') current = { x: numbers.at(-2), y: numbers.at(-1) };
    else for (let i = 0; i < numbers.length; i += 2) {
      const end = { x: numbers[i], y: numbers[i + 1] };
      if (current) segments.push({ start: current, end });
      current = end;
    }
  }
  return segments;
}
