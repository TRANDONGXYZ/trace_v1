import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { createBackup, parseBackup } from '../../src/backup.js';
import { backupFixture } from '../backup-fixtures.js';
import { serializeDiagram, STORAGE_KEY } from '../../src/persistence.js';

const nodes = page => page.locator('.react-flow__node');
const settings = page => page.getByRole('dialog', { name: 'Settings', exact: true });
const stored = page => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
async function setup(page, graph = backupFixture(2), clock = false) {
  if (clock) { await page.clock.install({ time: new Date('2026-11-10T08:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-10T08:00:01Z')); }
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('backup-test-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('backup-test-seeded', 'yes'); }
    window.diagramWrites = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, text) {
      if (name === key) {
        if (window.failDiagramSave) throw new DOMException('Storage full', 'QuotaExceededError');
        set.call(this, name, text); window.diagramWrites.push(text);
      } else set.call(this, name, text);
    };
  }, { key: STORAGE_KEY, value: serializeDiagram(graph) });
  await page.goto('/'); if (clock) await page.clock.runFor(32);
  await expect(nodes(page)).toHaveCount(graph.nodes.length);
}
async function openSettings(page) { await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(settings(page)).toBeVisible(); }
async function choose(page, text, viaButton = false) {
  const file = { name: 'trace-backup.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') };
  if (viaButton) {
    const pending = page.waitForEvent('filechooser'); await settings(page).getByRole('button', { name: 'Import Data' }).click();
    await (await pending).setFiles(file);
  } else await page.getByLabel('Trace backup file').setInputFiles(file);
}
async function create(page, kind = 'Action', text = 'Newest unsaved content') {
  await page.getByRole('button', { name: 'Create node', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New node' });
  await dialog.getByLabel('Type', { exact: true }).selectOption(kind);
  await dialog.getByLabel(kind, { exact: true }).fill(text);
  await dialog.getByLabel('Time', { exact: true }).fill('10/11/26'); await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
}

test('download fallback exports empty or pending unsaved current content, without modifying storage or calling AI', async ({ page }) => {
  const requests = []; page.on('request', request => { if (/api\/ai|11434/u.test(request.url())) requests.push(request.url()); });
  await page.addInitScript(() => { window.showSaveFilePicker = undefined; });
  await setup(page, { nodes: [], edges: [] }, true); const before = await stored(page);
  await openSettings(page);
  await expect(settings(page)).toContainText('not encrypted');
  const first = page.waitForEvent('download'); await settings(page).getByRole('button', { name: 'Export Data' }).click();
  const empty = await first; expect(parseBackup(await fs.readFile(await empty.path(), 'utf8')).nodes).toEqual([]);
  await settings(page).getByRole('button', { name: 'Close settings' }).click(); await create(page);
  await openSettings(page); const pending = page.waitForEvent('download');
  await settings(page).getByRole('button', { name: 'Export Data' }).click(); const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^trace-backup-2026-11-10-\d{6}\.json$/u);
  const graph = parseBackup(await fs.readFile(await download.path(), 'utf8'));
  expect(graph.nodes[0].data.mistake).toBe('Newest unsaved content');
  expect(await stored(page)).toBe(before); expect(requests).toEqual([]);
  await expect(settings(page).getByRole('status')).toContainText('download started');
});

test('native save picker writes and closes before success; cancel creates no download and failure is reported', async ({ page }) => {
  await page.addInitScript(() => {
    window.savedBackup = null; window.fileClosed = false;
    window.showSaveFilePicker = async options => {
      window.saveOptions = options;
      if (window.cancelSave) throw new DOMException('Canceled', 'AbortError');
      if (window.pickerUnavailable) throw new DOMException('Picker unavailable', 'NotSupportedError');
      return { createWritable: async () => ({
        write: async blob => { if (window.failFileWrite) throw new Error('Disk unavailable'); window.savedBackup = await blob.text(); },
        close: async () => { window.fileClosed = true; }, abort: async () => {},
      }) };
    };
  });
  let downloads = 0; page.on('download', () => downloads++);
  await setup(page); const before = await stored(page); await openSettings(page);
  await settings(page).getByRole('button', { name: 'Export Data' }).click();
  await expect(settings(page).getByRole('status')).toHaveText('Backup saved.');
  expect(await page.evaluate(() => window.fileClosed)).toBe(true);
  expect(parseBackup(await page.evaluate(() => window.savedBackup)).nodes.length).toBe(2);
  await page.evaluate(() => { window.cancelSave = true; });
  await settings(page).getByRole('button', { name: 'Export Data' }).click();
  await expect(settings(page).getByRole('status')).toHaveCount(0);
  await page.evaluate(() => { window.cancelSave = false; window.failFileWrite = true; });
  await settings(page).getByRole('button', { name: 'Export Data' }).click();
  await expect(settings(page).getByRole('alert')).toContainText('Disk unavailable');
  expect(downloads).toBe(0); expect(await stored(page)).toBe(before);
  await page.evaluate(() => { window.failFileWrite = false; window.pickerUnavailable = true; });
  const fallback = page.waitForEvent('download'); await settings(page).getByRole('button', { name: 'Export Data' }).click(); await fallback;
  await expect(settings(page).getByRole('status')).toContainText('download started');
  expect(downloads).toBe(1);
});

test('invalid files never alter live or persisted data or show replacement confirmation', async ({ page }) => {
  await setup(page); const before = await stored(page); await openSettings(page);
  const broken = JSON.parse(createBackup(backupFixture())); broken.diagram.edges[0].target = 'missing';
  const duplicate = JSON.parse(createBackup(backupFixture())); duplicate.diagram.nodes.push(duplicate.diagram.nodes[0]);
  const future = JSON.parse(createBackup(backupFixture())); future.schemaVersion = 99;
  for (const [text, message] of [['{bad', 'not valid JSON'], [JSON.stringify(broken), 'missing node'], [JSON.stringify(duplicate), 'duplicate node'], [JSON.stringify(future), 'Unsupported backup schema']]) {
    await choose(page, text); await expect(settings(page).getByRole('alert')).toContainText(message);
    await expect(settings(page).getByRole('button', { name: 'Replace whiteboard' })).toHaveCount(0);
    expect(await stored(page)).toBe(before); await expect(nodes(page)).toHaveCount(2);
  }
  const invalidUtf8 = Buffer.from(createBackup(backupFixture())); invalidUtf8[invalidUtf8.indexOf('Record')] = 255;
  await page.getByLabel('Trace backup file').setInputFiles({ name: 'invalid-encoding.json', mimeType: 'application/json', buffer: invalidUtf8 });
  await expect(settings(page).getByRole('alert')).toContainText('not valid UTF-8');
  expect(await stored(page)).toBe(before); await expect(nodes(page)).toHaveCount(2);
  expect(await page.evaluate(() => window.diagramWrites)).toHaveLength(0);
});

test('valid import waits for confirmation, can be canceled, and then replaces the whole diagram atomically', async ({ page }) => {
  const requests = []; page.on('request', r => { if (/api\/ai|11434/u.test(r.url())) requests.push(r.url()); });
  await setup(page); const before = await stored(page); const imported = backupFixture(8);
  await openSettings(page); await choose(page, createBackup(imported), true);
  await expect(settings(page).getByRole('region', { name: 'Confirm import' })).toContainText('8 nodes and 7 connections');
  await expect(nodes(page)).toHaveCount(2); expect(await stored(page)).toBe(before);
  await settings(page).getByRole('button', { name: 'Cancel import' }).click(); expect(await stored(page)).toBe(before);
  await choose(page, createBackup(imported)); await settings(page).getByRole('button', { name: 'Replace whiteboard' }).click();
  await expect(settings(page).getByRole('status')).toHaveText('Whiteboard imported and saved locally.');
  await expect(nodes(page)).toHaveCount(8);
  const saved = JSON.parse(await stored(page));
  expect(saved.graph.nodes.map(n => n.id)).toEqual(imported.nodes.map(n => n.id));
  expect(saved.graph.nodes.map(n => n.position)).toEqual(imported.nodes.map(n => n.position));
  expect(saved.graph.edges.map(e => [e.id, e.source, e.target])).toEqual(imported.edges.map(e => [e.id, e.source, e.target]));
  await settings(page).getByRole('button', { name: 'Close settings' }).click(); await page.keyboard.press('Control+Z');
  await expect(nodes(page)).toHaveCount(8); await page.reload(); await expect(nodes(page)).toHaveCount(8);
  expect(requests).toEqual([]);
});

test('successful import cancels an older pending autosave, writes once and starts fresh undo/redo history', async ({ page }) => {
  await setup(page, backupFixture(1), true); await create(page); await expect(nodes(page)).toHaveCount(2);
  await openSettings(page); await choose(page, createBackup(backupFixture(5)));
  await settings(page).getByRole('button', { name: 'Replace whiteboard' }).click(); await expect(nodes(page)).toHaveCount(5);
  const imported = await stored(page); expect(await page.evaluate(() => window.diagramWrites)).toHaveLength(1);
  await page.clock.runFor(10000); expect(await stored(page)).toBe(imported);
  expect(await page.evaluate(() => window.diagramWrites)).toHaveLength(1);
  await settings(page).getByRole('button', { name: 'Close settings' }).click();
  await page.keyboard.press('Control+Z'); await page.keyboard.press('Control+Y'); await expect(nodes(page)).toHaveCount(5);
  await create(page); await expect(nodes(page)).toHaveCount(6); await page.keyboard.press('Control+Z'); await expect(nodes(page)).toHaveCount(5);
  await page.clock.runFor(4000); expect(await page.evaluate(() => window.diagramWrites)).toHaveLength(1);
});

test('storage failure preserves the live graph, old saved data, pending autosave and edit history', async ({ page }) => {
  await setup(page, backupFixture(1), true); const before = await stored(page); await create(page);
  await page.evaluate(() => { window.failDiagramSave = true; });
  await openSettings(page); await choose(page, createBackup(backupFixture(8)));
  await settings(page).getByRole('button', { name: 'Replace whiteboard' }).click();
  await expect(settings(page).getByRole('alert')).toContainText('could not be saved');
  await expect(settings(page).getByRole('status')).toHaveCount(0);
  await expect(nodes(page)).toHaveCount(2); expect(await stored(page)).toBe(before);
  await page.evaluate(() => { window.failDiagramSave = false; }); await page.clock.runFor(3000);
  expect(JSON.parse(await stored(page)).graph.nodes).toHaveLength(2);
  await settings(page).getByRole('button', { name: 'Close settings' }).click();
  await page.keyboard.press('Control+Z'); await expect(nodes(page)).toHaveCount(1);
});

test('browser measures export/import CPU at growing sizes and a 1000-node import remains interactive', async ({ page }) => {
  test.setTimeout(60000); await setup(page, { nodes: [], edges: [] });
  const measurements = [];
  for (const count of [100, 1000, 10000]) {
    const graph = backupFixture(count);
    measurements.push(await page.evaluate(async graph => {
      const { createBackup, parseBackup } = await import('/src/backup.js');
      const start = performance.now(), text = createBackup(graph), exported = performance.now();
      const restored = parseBackup(text), end = performance.now();
      return { nodes: restored.nodes.length, exportMs: +(exported - start).toFixed(2), importMs: +(end - exported).toFixed(2) };
    }, graph));
  }
  console.log('Browser backup CPU timings:', JSON.stringify(measurements));
  await openSettings(page); await choose(page, createBackup(backupFixture(1000)));
  const start = performance.now(); await settings(page).getByRole('button', { name: 'Replace whiteboard' }).click();
  await expect(nodes(page)).toHaveCount(1000); await expect(settings(page).getByRole('status')).toContainText('imported and saved');
  await settings(page).getByRole('button', { name: 'Close settings' }).click();
  console.log('1000-node import commit/render and responsive Close (ms):', +(performance.now() - start).toFixed(2));
  await expect(settings(page)).toHaveCount(0); expect(measurements.map(m => m.nodes)).toEqual([100, 1000, 10000]);
});
