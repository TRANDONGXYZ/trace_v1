import assert from 'node:assert/strict';
import { createBackup, parseBackup } from '../src/backup.js';
import { backupFixture } from './backup-fixtures.js';
for (const count of [100, 1000, 10000]) {
  const graph = backupFixture(count), times = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now(); const text = createBackup(graph); const exported = performance.now();
    const restored = parseBackup(text); const imported = performance.now();
    assert.equal(restored.nodes.length, count); assert.equal(restored.edges.length, count - 1);
    times.push({ exportMs: exported - start, importMs: imported - exported, bytes: new TextEncoder().encode(text).length });
  }
  const median = key => times.map(t => t[key]).sort((a, b) => a - b)[2];
  console.log(JSON.stringify({ nodes: count, edges: count - 1, bytes: times[0].bytes,
    exportMedianMs: +median('exportMs').toFixed(2), importMedianMs: +median('importMs').toFixed(2), runs: 5 }));
}
