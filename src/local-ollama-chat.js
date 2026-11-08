// Keep the HTTP response open while generating. Canceling its reader and
// aborting the request disconnects the client, which cancels Ollama's request
// context/inference. Never stop the shared Ollama service or another job.
export async function localChat(payload, { signal, timeoutMs = 120_000, onContent } = {}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const abort = () => controller.abort(combined.reason);
  combined.addEventListener('abort', abort, { once: true });
  let reader;
  const cancelReader = () => { reader?.cancel(controller.signal.reason).catch(() => {}); };
  controller.signal.addEventListener('abort', cancelReader, { once: true });
  let content = '', final;
  const accept = part => {
    if (part.error) throw new Error(`Ollama: ${part.error}`);
    if (typeof part.message?.content === 'string') {
      content += part.message.content;
      if (content.length > 24_000) throw Object.assign(new Error('The local model response exceeded its limit.'), { invalidOutput: true });
      onContent?.(part.message.content);
    }
    if (part.done === true) final = part;
  };
  try {
    if (combined.aborted) abort();
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ ...payload, stream: true, keep_alive: 0, think: false, truncate: false }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error('Ollama could not generate the analysis.'), { status: response.status });
    }
    if (response.headers.get('content-type')?.includes('application/json')) {
      // Ollama can send a JSON error before starting an NDJSON stream. A
      // complete JSON response is also accepted, but never an incomplete one.
      accept(await response.json());
    } else {
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (!final) {
        controller.signal.throwIfAborted();
        const chunk = await reader.read();
        pending += decoder.decode(chunk.value, { stream: !chunk.done });
        if (pending.length > 64_000) throw new Error('The local response stream was malformed.');
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) if (line.trim()) accept(JSON.parse(line));
        if (chunk.done) { if (pending.trim()) accept(JSON.parse(pending)); break; }
      }
    }
    controller.signal.throwIfAborted();
    if (!final) throw Object.assign(new Error('The local response ended before generation completed.'), { invalidOutput: true });
    return { ...final, message: { role: 'assistant', content } };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new Error('Local analysis timed out. Try again when Ollama is free.');
    if (error instanceof SyntaxError) throw Object.assign(new Error('The local model returned a malformed stream.'), { invalidOutput: true });
    throw error;
  } finally {
    // Close the active transport even on parse failures or body-read timeout.
    controller.abort();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    combined.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancelReader);
  }
}
