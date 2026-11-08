import { CLUSTER_INPUT_BYTES, MAX_REQUEST_BYTES } from '../shared/ai-models.js';

export const apiError = (status, code, message) => Object.assign(new Error(message), { status, code, isApiError: true });
const invalid = () => { throw apiError(400, 'invalid_request', 'The AI request is invalid or exceeds its allowed size.'); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, maximum) => typeof value === 'string' && Array.from(value).length <= maximum;
const reference = value => typeof value === 'string' && /^R[1-9]\d{0,4}$/u.test(value);
const date = value => typeof value === 'string' && /^\d{2}\/\d{2}\/\d{2}$/u.test(value);

export async function readBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw apiError(415, 'invalid_content_type', 'Send JSON task data.');
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) throw apiError(413, 'request_too_large', 'The AI request is too large.');
  const reader = request.body?.getReader();
  if (!reader) invalid();
  let length = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) { await reader.cancel(); throw apiError(413, 'request_too_large', 'The AI request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { invalid(); }
}

export function validateTask(task, body) {
  if (task === 'embed') {
    if (!keys(body, ['texts']) || !Array.isArray(body.texts) || body.texts.length < 1 || body.texts.length > 8 ||
      !body.texts.every(item => text(item, 600) && item.trim() && new TextEncoder().encode(item).length <= 2048)) invalid();
    return body;
  }
  if (task === 'profile') {
    if (!keys(body, ['text']) || !text(body.text, 6000) || !body.text.trim() || new TextEncoder().encode(body.text).length > 6000) invalid();
    return body;
  }
  if (task !== 'explain') throw apiError(404, 'not_found', 'Unknown AI task.');
  if (!keys(body, ['input'])) invalid();
  const input = body.input;
  if (!keys(input, ['cluster', 'mode', 'partial', 'records', 'observations']) ||
    !['explain', 'observe'].includes(input.mode) || typeof input.partial !== 'boolean' ||
    !keys(input.cluster, ['label', 'count', 'first', 'last']) || !text(input.cluster.label, 160) ||
    !Number.isInteger(input.cluster.count) || input.cluster.count < 2 || input.cluster.count > 100_000 ||
    !date(input.cluster.first) || !date(input.cluster.last) ||
    !Array.isArray(input.records) || input.records.length > 80 || !Array.isArray(input.observations) || input.observations.length > 32 ||
    new TextEncoder().encode(JSON.stringify(input)).length > CLUSTER_INPUT_BYTES) invalid();
  for (const record of input.records) {
    if (!keys(record, ['id', 'date', 'text', 'part']) || !reference(record.id) || !date(record.date) || !text(record.text, 300) || !record.text.trim() ||
      typeof record.part !== 'string' || !/^\d{1,7}\/\d{1,7}$/u.test(record.part)) invalid();
  }
  for (const note of input.observations) {
    if (!keys(note, ['text', 'evidence_ids']) || !text(note.text, 600) || !note.text.trim() || !Array.isArray(note.evidence_ids) ||
      note.evidence_ids.length < 2 || note.evidence_ids.length > 4 || !note.evidence_ids.every(reference) || new Set(note.evidence_ids).size < 2) invalid();
  }
  const ids = new Set([...input.records.map(record => record.id), ...input.observations.flatMap(note => note.evidence_ids)]);
  if (ids.size < 2 || (input.records.length && input.observations.length)) invalid();
  return body;
}

export function validateClusterOutput(value, input) {
  const fail = () => { throw apiError(502, 'invalid_ai_output', 'The AI response did not meet its evidence requirements. No conclusion has been assumed.'); };
  if (!keys(value, ['evidence_ids', 'observed_pattern', 'explanation']) || !text(value.observed_pattern, 600) || !text(value.explanation, 1400) || !Array.isArray(value.evidence_ids)) fail();
  if (!value.explanation.trim() && (input.mode !== 'observe' || !value.observed_pattern.trim())) return { evidence_ids: [], observed_pattern: '', explanation: '' };
  const allowed = new Set([...input.records.map(record => record.id), ...input.observations.flatMap(note => note.evidence_ids)]);
  const ids = [...new Set(value.evidence_ids)];
  if (!value.observed_pattern.trim() || ids.length < 2 || ids.length > 4 || !ids.every(id => allowed.has(id))) fail();
  return { evidence_ids: ids, observed_pattern: value.observed_pattern.trim(), explanation: input.mode === 'observe' ? '' : value.explanation.trim() };
}
