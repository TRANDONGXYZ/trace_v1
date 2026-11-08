import { CLOUD_EMBEDDING_MODEL, CLOUD_REASONING_MODEL, CLOUD_EMBEDDING_DIMENSIONS } from '../shared/ai-models.js';
import { behaviorSchema, behaviorSystemMessage, validateBehaviorProfile } from '../shared/behavior-contract.js';
import { clusterPrompt } from '../shared/cluster-prompt.js';
import { apiError, readBody, validateTask, validateClusterOutput } from './input.js';

// These counters constrain one isolate. Native rate-limit bindings also limit
// traffic per IP and per location; neither is a strict global concurrency cap.
let active = 0;
const clients = new Set();
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });

function allowedOrigin(origin, env) {
  try {
    const url = new URL(origin);
    if (env.LOCAL_DEVELOPMENT === 'true' && url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.origin === origin) return true;
    return url.protocol === 'https:' && url.origin === env.SITE_ORIGIN && url.origin === origin;
  } catch { return false; }
}

async function generated(env, model, messages, schema, tokenLimit, signal) {
  // The cloud decoder does not support every JSON Schema keyword. Distinct
  // citations remain mandatory in application validation after generation.
  const decoderSchema = structuredClone(schema);
  if (decoderSchema.properties?.evidence_ids) delete decoderSchema.properties.evidence_ids.uniqueItems;
  const output = await env.AI.run(model, {
    messages: [...messages.slice(0, 1).map(message => ({ ...message, content: `${message.content}\nReturn only JSON conforming to this schema: ${JSON.stringify(schema)}` })), ...messages.slice(1)],
    stream: false, max_completion_tokens: tokenLimit, temperature: 0,
    chat_template_kwargs: { enable_thinking: false }, store: false,
    response_format: { type: 'json_schema', json_schema: { name: 'analysis', strict: true, schema: decoderSchema } },
  }, { signal });
  signal.throwIfAborted();
  const choice = output?.choices?.[0];
  if (choice?.finish_reason === 'length' || output?.done_reason === 'length') throw apiError(502, 'invalid_ai_output', 'The AI response was incomplete. Please try again later.');
  const value = choice?.message?.content ?? output?.response ?? output;
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { throw apiError(502, 'invalid_ai_output', 'The AI returned invalid structured output. No conclusion has been assumed.'); }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/api/ai/status') return json({ provider: 'cloudflare', available: env.AI_ENABLED === 'true', cancellation: 'best-effort' });
    if (request.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Use POST for AI tasks.' } }, 405, { Allow: 'POST' });
    let ownsSlot = false, client;
    try {
      // site.js overwrites the IP header using Cloudflare connection metadata.
      if (!allowedOrigin(request.headers.get('origin'), env)) throw apiError(403, 'origin_not_allowed', 'AI requests must come from this website.');
      if (env.AI_ENABLED !== 'true') throw apiError(503, 'ai_disabled', 'AI analysis is temporarily unavailable. The whiteboard remains usable.');
      if (!env.AI || !env.CLIENT_RATE_LIMIT || !env.SITE_RATE_LIMIT) throw apiError(503, 'not_configured', 'The AI service is not configured yet. The whiteboard remains usable.');
      const ip = request.headers.get('x-trace-client-ip') || (env.LOCAL_DEVELOPMENT === 'true' ? 'local-development' : null);
      if (!ip) throw apiError(403, 'invalid_source', 'The AI request source could not be verified.');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      client = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (!(await env.CLIENT_RATE_LIMIT.limit({ key: client })).success || !(await env.SITE_RATE_LIMIT.limit({ key: 'ai' })).success) {
        throw apiError(429, 'rate_limited', 'AI request limit reached. Please wait a minute and try again; the whiteboard remains usable.');
      }
      if (active >= 2 || clients.has(client)) throw apiError(429, 'ai_busy', 'An AI analysis is already running. Wait for it to finish before trying again.');
      const task = path.startsWith('/api/ai/') ? path.slice('/api/ai/'.length) : '';
      const body = validateTask(task, await readBody(request));
      request.signal.throwIfAborted();
      active++; clients.add(client); ownsSlot = true;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
      let result;
      if (task === 'embed') {
        const output = await env.AI.run(CLOUD_EMBEDDING_MODEL, { text: body.texts }, { signal });
        signal.throwIfAborted();
        if (!Array.isArray(output?.data) || output.data.length !== body.texts.length || !output.data.every(vector =>
          Array.isArray(vector) && vector.length === CLOUD_EMBEDDING_DIMENSIONS && vector.every(Number.isFinite) && Math.hypot(...vector) > 0)) {
          throw apiError(502, 'invalid_ai_output', 'The embedding service returned invalid vectors.');
        }
        result = { embeddings: output.data };
      } else if (task === 'profile') {
        const output = await generated(env, CLOUD_REASONING_MODEL,
          [{ role: 'system', content: behaviorSystemMessage }, { role: 'user', content: body.text }], behaviorSchema, 256, signal);
        try { result = validateBehaviorProfile(output, body.text); }
        catch { throw apiError(502, 'invalid_ai_output', 'The behavioral profile cited unsupported evidence. The record remains unclassified.'); }
      } else {
        const { system, schema } = clusterPrompt(body.input);
        const output = await generated(env, CLOUD_REASONING_MODEL,
          [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(body.input) }], schema, 512, signal);
        result = validateClusterOutput(output, body.input);
      }
      return json({ result });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499, headers });
      if (error.isApiError) return json({ error: { code: error.code, message: error.message } }, error.status, error.status === 429 ? { 'Retry-After': '60' } : {});
      // Do not echo/log upstream messages: an inference error can contain user
      // text. These categories expose no prompts, stack traces or secrets.
      const quota = /quota|neurons|daily.*limit|free.*allocation|3040|429|5035/iu.test(error.message ?? '');
      return json({ error: { code: quota ? 'ai_allowance_or_capacity' : 'ai_unavailable', message: quota
        ? 'The free AI allowance or service capacity is temporarily exhausted. Try later; the whiteboard remains usable.'
        : 'AI analysis is temporarily unavailable. Try again later; the whiteboard and recorded findings remain usable.' } }, 503);
    } finally {
      if (ownsSlot) { active--; clients.delete(client); }
    }
  },
};
