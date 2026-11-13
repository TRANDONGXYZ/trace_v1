import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startDevelopment } from '../scripts/dev-cloud.mjs';
import { isWorkerBlocked } from '../scripts/worker-availability.mjs';

async function launcher(t, blocked = false) {
  const runtime = Object.assign(new EventEmitter(), { execPath: process.execPath });
  const calls = [], warnings = [], errors = [];
  const session = await startDevelopment({ runtime, argv: ['--port', '5197', '--strictPort'], checkWorker: async () => blocked,
    logger: { warn: value => warnings.push(value), error: value => errors.push(value) },
    spawnProcess: (command, args, options) => {
      const child = Object.assign(new EventEmitter(), { killed: false, exitCode: null, kills: [] });
      child.kill = signal => { child.kills.push(signal); child.killed = true; };
      child.finish = code => { child.exitCode = code; child.emit('exit', code, null); };
      calls.push({ command, args, options, child }); return child;
    } });
  t.after(session.stop);
  return { runtime, calls, warnings, errors, session };
}

test('normal startup owns frontend and Worker processes, forwards frontend arguments and stops only its children', async t => {
  const { runtime, calls, session } = await launcher(t);
  assert.equal(calls.length, 2); assert.ok(calls[0].args[0].includes('vite')); assert.ok(calls[1].args[0].includes('wrangler'));
  assert.deepEqual(calls[0].args.slice(1), ['--host', '127.0.0.1', '--port', '5197', '--strictPort']);
  for (const call of calls) { assert.equal(call.command, process.execPath); assert.equal(call.options.windowsHide, true); }
  runtime.emit('SIGINT'); session.stop();
  for (const call of calls) assert.deepEqual(call.child.kills, ['SIGINT']);
  assert.equal(runtime.listenerCount('SIGINT'), 0); assert.equal(runtime.listenerCount('SIGTERM'), 0);
});

test('a confirmed Windows block skips Wrangler while leaving the frontend usable and security settings untouched', async t => {
  const { calls, warnings, runtime } = await launcher(t, true);
  assert.equal(calls.length, 1); assert.ok(calls[0].args[0].includes('vite'));
  assert.equal(calls[0].child.killed, false); assert.equal(runtime.exitCode, undefined);
  assert.ok(warnings.some(text => text.includes('Smart App Control'))); assert.ok(warnings.some(text => text.includes('No Windows security settings were changed')));
});

test('Worker errors and exits never terminate the frontend or turn an optional service failure into app exit', async t => {
  for (const failure of ['error', 'exit']) {
    const { calls, runtime, warnings } = await launcher(t);
    if (failure === 'error') calls[1].child.emit('error', Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' }));
    else calls[1].child.finish(1);
    assert.equal(calls[0].child.killed, false); assert.equal(runtime.exitCode, undefined);
    assert.ok(warnings.some(text => text.includes('whiteboard, autosave, backups and deterministic Analytics remain available')));
  }
});

test('frontend failure still stops its Worker and reports the real frontend exit status', async t => {
  const { calls, runtime } = await launcher(t);
  calls[0].child.finish(1);
  assert.equal(runtime.exitCode, 1); assert.equal(calls[1].child.killed, true); assert.equal(calls[0].child.killed, false);
});

test('Windows preflight invokes only a read-only hash/policy inspection; runtime paths are passed as literal environment data', async () => {
  const binary = 'C:\\work\\$(untrusted text)\\workerd.exe';
  const result = await isWorkerBlocked({ platform: 'win32', env: { SystemRoot: 'C:\\Windows', MINIFLARE_WORKERD_PATH: binary },
    execute: async (command, args, options) => {
      assert.ok(command.endsWith('powershell.exe')); assert.ok(args.includes('-NonInteractive'));
      assert.equal(options.env.TRACE_WORKERD_PROBE_PATH, binary); assert.equal(options.windowsHide, true);
      const script = args.at(-1);
      assert.ok(script.includes('SHA256 Flat Hash')); assert.ok(script.includes('Get-FileHash -LiteralPath'));
      assert.ok(script.includes('VerifiedAndReputableDesktop')); assert.doesNotMatch(script, /Set-Item|Unblock-File|Add-MpPreference|Set-MpPreference|ExecutionPolicy|Start-Process/i);
      return { stdout: '{"blocked":true}' };
    } });
  assert.equal(result, true);
});

test('unknown/unavailable diagnostics are not classified as confirmed blocks, and non-Windows starts do not run PowerShell', async () => {
  assert.equal(await isWorkerBlocked({ platform: 'linux', execute: () => { throw new Error('Must not run'); } }), false);
  for (const execute of [async () => { throw new Error('Log unavailable'); }, async () => ({ stdout: 'invalid output' }), async () => ({ stdout: '{"blocked":false}' })]) {
    assert.equal(await isWorkerBlocked({ platform: 'win32', env: { MINIFLARE_WORKERD_PATH: 'C:\\workerd.exe' }, execute }), false);
  }
});
