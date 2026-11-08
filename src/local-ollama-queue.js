let queue = Promise.resolve();

// Embedding, behavior and explanation models share one queue/browser lock.
// A job releases its model (keep_alive: 0) before another job starts.
export function withLocalOllama(work, signal) {
  const run = async () => {
    signal?.throwIfAborted();
    return globalThis.navigator?.locks
      ? navigator.locks.request('trace-ollama-embeddings', { signal }, work)
      : work();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
