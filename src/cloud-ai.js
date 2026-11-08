import { AI_API_BASE } from './ai-config.js';

export async function cloudAI(task, payload, signal) {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(90_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(`${AI_API_BASE}/${task}`, { method: 'POST', signal: combined,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json();
    signal?.throwIfAborted();
    if (!response.ok) throw Object.assign(new Error(body.error?.message || 'Cloud AI is temporarily unavailable. The whiteboard remains usable.'),
      { status: response.status, code: body.error?.code, invalidOutput: body.error?.code === 'invalid_ai_output' });
    return body.result;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new Error('Cloud AI analysis timed out. The whiteboard remains usable.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Cannot reach the AI service. The whiteboard and recorded findings remain available.');
    throw error;
  }
}
