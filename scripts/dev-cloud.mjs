import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { isWorkerBlocked } from './worker-availability.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function startDevelopment({ argv = process.argv.slice(2), spawnProcess = spawn, checkWorker = isWorkerBlocked,
  runtime = process, logger = console } = {}) {
  const children = [];
  let stopping = false, warned = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    runtime.removeListener('SIGINT', stop); runtime.removeListener('SIGTERM', stop);
    for (const child of children) if (!child.killed && child.exitCode == null) child.kill('SIGINT');
  };
  const unavailable = reason => {
    if (warned || stopping) return;
    warned = true;
    logger.warn(`Local Cloudflare AI service unavailable: ${reason}`);
    logger.warn('The whiteboard, autosave, backups and deterministic Analytics remain available.');
    logger.warn('For existing local Ollama analysis, use npm run dev:ollama instead. No Windows security settings were changed.');
  };
  const launch = (name, script, args) => {
    const failure = error => {
      if (stopping) return;
      if (name === 'worker') unavailable(error.message);
      else { logger.error(error.message); runtime.exitCode = 1; stop(); }
    };
    try {
      const child = spawnProcess(runtime.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
      children.push(child);
      child.once('error', failure);
      child.once('exit', (code, signal) => {
        if (stopping) return;
        if (name === 'worker') unavailable(`Wrangler exited (${signal || code}). The frontend is staying open.`);
        else { runtime.exitCode = code ?? 1; stop(); }
      });
    } catch (error) { failure(error); }
  };
  let blocked = false;
  try { blocked = await checkWorker(); } catch { /* Normal worker failure is handled below. */ }
  runtime.once('SIGINT', stop); runtime.once('SIGTERM', stop);
  launch('frontend', 'node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', ...argv]);
  if (blocked) unavailable('Windows Smart App Control recorded a block for this exact workerd.exe binary; skipping it.');
  else if (!stopping) launch('worker', 'node_modules/wrangler/bin/wrangler.js', ['dev', '--config', 'worker/wrangler.jsonc', '--port', '8787']);
  return { stop, children };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await startDevelopment();
