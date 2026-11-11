export const INITIAL_SPLIT = 0.6;
export const DIVIDER_SPACE = 28; // 12px handle plus two 8px gaps.
export const MIN_CHART_WIDTH = 320;
export const MIN_DETAIL_WIDTH = 280;

export function splitLimits(containerWidth) {
  const available = containerWidth - DIVIDER_SPACE;
  if (available < MIN_CHART_WIDTH + MIN_DETAIL_WIDTH) return { min: INITIAL_SPLIT, max: INITIAL_SPLIT };
  return { min: MIN_CHART_WIDTH / available, max: 1 - MIN_DETAIL_WIDTH / available };
}

export function clampSplit(ratio, containerWidth) {
  const { min, max } = splitLimits(containerWidth);
  return Math.min(max, Math.max(min, ratio));
}
