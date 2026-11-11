import { roundedPolygon } from './node-shapes.js';
export const NODE_HEIGHT = 96;
export const NODE_APPEARANCE = {
  Mistake: {
    shape: 'arrow-rectangle', fill: '#f6aaa6', stroke: '#b6453c',
    path: roundedPolygon([[1, 1], [135, 1], [159, 48], [135, 95], [1, 95]]),
    left: 0, right: 160,
  },
  Consequence: {
    shape: 'rectangle', fill: '#f6b26b', stroke: '#b56a22', height: 96,
    path: roundedPolygon([[1, 1], [159, 1], [159, 95], [1, 95]]),
    left: 0, right: 160,
  },
  Action: {
    shape: 'hexagon', fill: '#76a7ee', stroke: '#3568af',
    path: roundedPolygon([[21, 1], [139, 1], [159, 48], [139, 95], [21, 95], [1, 48]]),
    left: 0, right: 160,
  },
  Blocked: {
    shape: 'triangle', fill: '#fff0a1', stroke: '#a58d2d',
    path: roundedPolygon([[80, 1], [159, 95], [1, 95]]),
    left: 40, right: 120,
  },
  Goal: {
    shape: 'cylinder', fill: '#c9e9f8', stroke: '#6395ad',
    path: 'M 1 13 A 79 12 0 0 1 159 13 V 83 A 79 12 0 0 1 1 83 Z',
    detail: 'M 1 13 A 79 12 0 0 0 159 13',
    left: 0, right: 160,
  },
  Milestone: {
    shape: 'diamond', fill: '#cbeac5', stroke: '#709667',
    path: roundedPolygon([[80, 1], [159, 48], [80, 95], [1, 48]]),
    left: 0, right: 160,
  },
  Success: {
    shape: 'circle', fill: '#196b3a', stroke: '#104b28',
    path: 'M 80 1 A 47 47 0 1 1 80 95 A 47 47 0 1 1 80 1 Z',
    left: 33, right: 127,
  },
};

export const NODE_KINDS = Object.keys(NODE_APPEARANCE);
export const nodeHeight = () => NODE_HEIGHT;
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
