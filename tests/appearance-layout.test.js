import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_KEY, normalizeAppearance, resolveAppearance, readAppearance, initializeAppearance } from '../src/appearance.js';
import { INITIAL_SPLIT, DIVIDER_SPACE, MIN_CHART_WIDTH, MIN_DETAIL_WIDTH, splitLimits, clampSplit } from '../src/analytics-layout.js';

test('appearance modes default to System; explicit Light/Dark override either system preference', () => {
  for (const invalid of [null, undefined, '', 'other', 'DARK']) assert.equal(normalizeAppearance(invalid), 'system');
  for (const systemDark of [true, false]) {
    assert.equal(resolveAppearance('light', systemDark), 'light'); assert.equal(resolveAppearance('dark', systemDark), 'dark');
    assert.equal(resolveAppearance('system', systemDark), systemDark ? 'dark' : 'light');
  }
});

test('preference restoration and startup use a separate key and tolerate unavailable storage', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  try {
    globalThis.window = { localStorage: { getItem: key => { assert.equal(key, APPEARANCE_KEY); return 'dark'; } }, matchMedia: () => ({ matches: false }) };
    globalThis.document = { documentElement: { dataset: {} } };
    assert.equal(readAppearance(), 'dark'); initializeAppearance(); assert.equal(document.documentElement.dataset.theme, 'dark');
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('Storage unavailable'); } });
    assert.equal(readAppearance(), 'system'); initializeAppearance(); assert.equal(document.documentElement.dataset.theme, 'light');
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('split begins at 60/40 whenever both minimum widths fit at that ratio', () => {
  assert.equal(INITIAL_SPLIT, 0.6);
  for (const width of [900, 1200, 2000]) assert.equal(clampSplit(INITIAL_SPLIT, width), INITIAL_SPLIT);
});

test('split clamps both directions to chart/list minimums and handles narrow layouts', () => {
  for (const width of [640, 900, 1600]) {
    const available = width - DIVIDER_SPACE, limits = splitLimits(width);
    assert.equal(clampSplit(-10, width), limits.min); assert.equal(clampSplit(10, width), limits.max);
    assert.ok(clampSplit(-10, width) * available >= MIN_CHART_WIDTH - 0.001);
    assert.ok((1 - clampSplit(10, width)) * available >= MIN_DETAIL_WIDTH - 0.001);
  }
  for (const width of [0, 280, 600]) assert.equal(clampSplit(0.8, width), INITIAL_SPLIT);
});
