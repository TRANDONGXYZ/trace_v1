// Round only a few units at each polygon vertex; preserve each distinct shape.
export function roundedPolygon(points, radius = 3) {
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const toward = other => {
      const distance = Math.hypot(other[0] - point[0], other[1] - point[1]);
      const ratio = Math.min(radius, distance / 2) / distance;
      return [point[0] + (other[0] - point[0]) * ratio, point[1] + (other[1] - point[1]) * ratio];
    };
    return { point, entry: toward(previous), exit: toward(next) };
  });
  return corners.map(({ point, entry, exit }, index) => `${index ? 'L' : 'M'} ${entry.join(' ')} Q ${point.join(' ')} ${exit.join(' ')}`).join(' ') + ' Z';
}
