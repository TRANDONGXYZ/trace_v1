import { behaviorSchema as schema, behaviorSystemMessage, validateBehaviorProfile } from '../shared/behavior-contract.js';
export { validateBehaviorProfile } from '../shared/behavior-contract.js';
import { cosine, mistakeText } from './mistake-clusters.js';
import { localChat } from './local-ollama-chat.js';
import { CLOUD_AI } from './ai-config.js';
import { cloudAI } from './cloud-ai.js';
import { CLOUD_REASONING_MODEL } from '../shared/ai-models.js';

export const BEHAVIOR_MODEL = CLOUD_AI ? CLOUD_REASONING_MODEL : 'qwen3.5:2b';
export const BEHAVIOR_CACHE_KEY = CLOUD_AI ? 'trace.behavior-profiles.cloudflare-gemma4.v1' : 'trace.behavior-profiles.qwen3.5-2b.v2';
export const BEHAVIOR_OPTIONS = { num_gpu: 0, num_thread: 2, num_ctx: 4096, num_predict: 192, temperature: 0, seed: 1 };
const CACHE_LIMIT = 128;
const invalidProfile = message => Object.assign(new Error(message), { invalidOutput: true });
// Retrieve stated motivations/tradeoffs in either field. Ordinary descriptions
// retain observed-behavior embeddings without assuming unrecorded root causes.
export function hasBehavioralContext(text) {
  return /(?:^|[\s,;])(?:vì|bởi|do|vẫn|ham|sợ|ưu tiên|bất chấp|mặc dù|coi trọng|chú trọng|because|despite|fear|afraid|prioriti[sz]\w*|overly focused|even though)(?=\s|[,;.!?]|$)/iu.test(text) ||
    /\b(?:due to|in order to|for fear of|so that|at the expense of)\b|để\s+(?:có|được|đạt|giữ|tránh|tăng|giảm|phục hồi|hồi phục|nghỉ)/iu.test(text);
}

function readCache() {
  const cache = new Map();
  try {
    const entries = JSON.parse(localStorage.getItem(BEHAVIOR_CACHE_KEY));
    if (Array.isArray(entries)) for (const entry of entries.slice(-CACHE_LIMIT)) {
      try {
        if (Array.isArray(entry) && typeof entry[0] === 'string') cache.set(entry[0], validateBehaviorProfile(entry[1], entry[0]));
      } catch { /* Reject malformed individual profiles. */ }
    }
  } catch { /* A cache is optional. */ }
  return cache;
}

async function profile(text, signal) {
  if (CLOUD_AI) return validateBehaviorProfile(await cloudAI('profile', { text }, signal), text);
  let body;
  try {
    body = await localChat({ model: BEHAVIOR_MODEL, format: schema, options: BEHAVIOR_OPTIONS,
        messages: [{ role: 'system', content: behaviorSystemMessage },
          { role: 'user', content: text }] }, { signal });
  } catch (error) {
    if (signal?.aborted || error.invalidOutput) throw error;
    throw new Error(error.status === 404 ? `Install the local behavior model with “ollama pull ${BEHAVIOR_MODEL}”.` : `${error.message} Start Ollama and try again.`);
  }
  if (body.done_reason === 'length') throw invalidProfile('The local behavioral analysis was incomplete.');
  let parsed;
  try { parsed = JSON.parse(body.message?.content); } catch { throw invalidProfile('The local behavior model returned invalid JSON.'); }
  return validateBehaviorProfile(parsed, text);
}

export async function behaviorProfiles(nodes, signal) {
  const texts = [...new Set(nodes.map(mistakeText))].filter(hasBehavioralContext).sort((a, b) => a.localeCompare(b, 'vi'));
  if (texts.length < 2) return new Map(); // No pair of stated causes to compare.
  const cache = readCache(), profiles = new Map();
  for (const text of texts) {
    signal?.throwIfAborted();
    // Never truncate causal evidence or overflow the model context. Long
    // ambiguous entries remain separate from other reported causes.
    if (new TextEncoder().encode(text).length > 6000) { profiles.set(text, null); continue; }
    let result;
    try { result = cache.get(text) ?? await profile(text, signal); }
    catch (error) {
      if (signal?.aborted || !error.invalidOutput) throw error;
      // An unsupported inferred cause cannot merge this record or erase other
      // valid clusters. Leave it visible as an unclassified singleton; retry
      // on the next analysis rather than caching an invented interpretation.
      profiles.set(text, null); continue;
    }
    signal?.throwIfAborted();
    profiles.set(text, result);
    cache.delete(text); cache.set(text, result);
    try { localStorage.setItem(BEHAVIOR_CACHE_KEY, JSON.stringify([...cache].slice(-CACHE_LIMIT))); } catch { /* Persistence is optional. */ }
  }
  return profiles;
}

export const profileMeaning = profile => profile.mechanism === 'overvalued_goal' ? profile.priority_quote : profile.behavior_label;

export function behavioralMatches(profiles, vectors, threshold, model) {
  // Short source-grounded priorities have a different score distribution from
  // whole records. Similarity is gated by independently classified cause roles.
  const causeThreshold = model.startsWith('@cf/') ? 0.6 : model.startsWith('embeddinggemma:') ? 0.85 : 0.65;
  return (a, b, similarity) => {
    const left = mistakeText(a), right = mistakeText(b);
    if (left === right) return true;
    const p = profiles.get(left), q = profiles.get(right);
    if ((profiles.has(left) && !p) || (profiles.has(right) && !q)) return false;
    if (hasBehavioralContext(left) && hasBehavioralContext(right) && profiles.size) {
      if (!p || !q || p.mechanism !== q.mechanism) return false;
      if (p.mechanism === 'unspecified') return similarity >= threshold;
      if (p.mechanism === 'overvalued_goal' && p.priority_domain !== q.priority_domain) return false;
      // Cloud embeddings score short motivation phrases differently from
      // Ollama, particularly when one quote includes an activity or fear.
      // For a known priority, the independently grounded semantic role is
      // the cause identity: e.g. overvaluing achievement across different
      // activities. Topic keywords cannot establish this role. Unknown goals
      // still require strong embedding support below.
      if (model.startsWith('@cf/') && p.mechanism === 'overvalued_goal' && p.priority_domain !== 'other') return true;
      if (!profileMeaning(p) || !profileMeaning(q)) return false;
      // An unclassified goal needs much stronger semantic support; "other"
      // must never become a catch-all cluster of unrelated motivations.
      const minimum = p.priority_domain === 'other' ? Math.max(0.95, causeThreshold) : causeThreshold;
      return cosine(vectors.get(left), vectors.get(right)) >= minimum;
    }
    return similarity >= threshold;
  };
}
