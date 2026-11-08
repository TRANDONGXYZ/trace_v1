import test from 'node:test';
import assert from 'node:assert/strict';
import { localChat } from '../src/local-ollama-chat.js';

test('streaming chat preserves split UTF-8/NDJSON and accepts only a completed response', async t => {
  const bytes = new TextEncoder().encode([
    { message: { content: 'Có thể ' }, done: false }, { message: { content: 'áp lực' }, done: false }, { message: { content: '' }, done: true, done_reason: 'stop' },
  ].map(JSON.stringify).join('\n'));
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true); assert.equal(body.keep_alive, 0);
    assert.equal(body.think, false);
    return new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  });
  assert.equal((await localChat({ model: 'test' })).message.content, 'Có thể áp lực');
});

test('cancel aborts the active HTTP request and reader, discards partial output, and can start again', async t => {
  const controller = new AbortController();
  let cancelled = false, transport;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    transport = options.signal;
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{"message":{"content":"partial"},"done":false}\n'));
    }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  });
  await assert.rejects(localChat({ model: 'test' }, { signal: controller.signal, onContent: () => controller.abort() }), { name: 'AbortError' });
  assert.equal(transport.aborted, true);
  assert.equal(cancelled, true);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: { content: 'complete' }, done: true }));
  assert.equal((await localChat({ model: 'test' })).message.content, 'complete');
});

test('timeout also cancels the body read and incomplete or malformed streams are rejected', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('{"message":{"content":"unfinished"},"done":false}\n')); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const keepTestAlive = setTimeout(() => {}, 100);
  await assert.rejects(localChat({ model: 'test' }, { timeoutMs: 10 }), /timed out/);
  clearTimeout(keepTestAlive);
  assert.equal(cancelled, true);
  for (const content of ['{"message":{"content":"partial"},"done":false}', 'not json']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(content, { headers: { 'Content-Type': 'application/x-ndjson' } }));
    await assert.rejects(localChat({ model: 'test' }));
  }
});
