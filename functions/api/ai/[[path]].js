export async function onRequest({ request, env }) {
  if (!env.TRACE_AI) return Response.json({ error: { code: 'not_configured', message: 'The AI service is not configured. The whiteboard remains usable.' } }, { status: 503 });
  const headers = new Headers(request.headers);
  // A caller cannot choose another client's rate-limit identity.
  headers.delete('x-trace-client-ip');
  headers.set('x-trace-client-ip', request.headers.get('cf-connecting-ip') || 'unknown');
  return env.TRACE_AI.fetch(new Request(request, { headers, signal: request.signal }));
}
