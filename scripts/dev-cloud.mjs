import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGINT');
}
for (const [script, args] of [
  ['node_modules/wrangler/bin/wrangler.js', ['dev', '--config', 'worker/wrangler.jsonc', '--env', 'development', '--port', '8787']],
  ['node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', ...process.argv.slice(2)]],
]) {
  const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
}
process.once('SIGINT', stop); process.once('SIGTERM', stop);
