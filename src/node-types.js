export const NODE_APPEARANCE = {
  Mistake: {
    shape: 'arrow-rectangle', fill: '#f6aaa6', stroke: '#b6453c',
    path: 'M 1 1 H 135 L 159 32 L 135 63 H 1 Z',
    left: 0, right: 160,
  },
  Consequence: {
    shape: 'rectangle', fill: '#fff0a1', stroke: '#a58d2d',
    path: 'M 1 1 H 159 V 63 H 1 Z',
    left: 0, right: 160,
  },
  Action: {
    shape: 'hexagon', fill: '#76a7ee', stroke: '#3568af',
    path: 'M 21 1 H 139 L 159 32 L 139 63 H 21 L 1 32 Z',
    left: 0, right: 160,
  },
  Blocked: {
    shape: 'triangle', fill: '#fff0a1', stroke: '#a58d2d',
    path: 'M 80 1 L 159 63 H 1 Z',
    left: 40, right: 120,
  },
  Goal: {
    shape: 'cylinder', fill: '#c9e9f8', stroke: '#6395ad',
    path: 'M 1 11 A 79 10 0 0 1 159 11 V 53 A 79 10 0 0 1 1 53 Z',
    detail: 'M 1 11 A 79 10 0 0 0 159 11',
    left: 0, right: 160,
  },
  Milestone: {
    shape: 'diamond', fill: '#cbeac5', stroke: '#709667',
    path: 'M 80 1 L 159 32 L 80 63 L 1 32 Z',
    left: 0, right: 160,
  },
  Success: {
    shape: 'circle', fill: '#196b3a', stroke: '#104b28',
    path: 'M 80 1 A 31 31 0 1 1 80 63 A 31 31 0 1 1 80 1 Z',
    left: 49, right: 111,
  },
};

export const NODE_KINDS = Object.keys(NODE_APPEARANCE);
export const DESCRIPTION_LIMIT = 500;
const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Limit user-perceived characters, including emoji and combining accents.
export function limitDescription(value) {
  return Array.from(characters.segment(value), part => part.segment).slice(0, DESCRIPTION_LIMIT).join('');
}

export function localDateInput(date = new Date()) {
  return [date.getDate(), date.getMonth() + 1, date.getFullYear() % 100]
    .map(value => String(value).padStart(2, '0')).join('/');
}
