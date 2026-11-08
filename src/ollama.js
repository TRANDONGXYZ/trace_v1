import { clusterMistakes, mistakeText, normalizeVector, textChunks } from './mistake-clusters.js';
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS } from './embedding-models.js';
import { withLocalOllama } from './local-ollama-queue.js';
import { behaviorProfiles, behavioralMatches, profileMeaning } from './behavior-patterns.js';

export const EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;
export const OLLAMA_URL = 'http://127.0.0.1:11434/api/embed';
export const EMBEDDING_CACHE_KEY = EMBEDDING_MODELS[EMBEDDING_MODEL].cacheKey;
// Embedding runners need a token batch at least as large as an individual
// input; reducing it to 16 would silently truncate text or reject the request.
export const EMBEDDING_OPTIONS = { num_gpu: 0, num_thread: 2, num_ctx: 512, num_batch: 512 };
// Keep the vector cache's storage budget comparable for 384d and 768d models.
const cacheLimit = config => Math.floor(128 * 384 / config.dimensions);

function readCache(config) {
  try {
    const entries = JSON.parse(localStorage.getItem(config.cacheKey));
    return new Map(Array.isArray(entries) ? entries.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' &&
      Array.isArray(entry[1]) && entry[1].length === config.dimensions && entry[1].every(Number.isFinite) && Math.hypot(...entry[1]) > 0).slice(-cacheLimit(config)) : []);
  } catch { return new Map(); }
}

function saveCache(cache, config) {
  try { localStorage.setItem(config.cacheKey, JSON.stringify([...cache].slice(-cacheLimit(config)))); } catch { /* Analysis still works without a cache. */ }
}

async function embedBatch(input, signal, model, config) {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(90_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST', signal: combined, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: input.map(text => config.prefix + text), truncate: false, keep_alive: 0, options: EMBEDDING_OPTIONS }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('Local analysis timed out. Try again when Ollama is free.');
    throw new Error('Cannot reach local Ollama. Start Ollama, then try again.');
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error(`Install the selected local model with “ollama pull ${model}”, then try again.`);
    if (response.status === 503) throw new Error('Ollama is busy or short of memory. Try again when it is free.');
    throw new Error(`Ollama could not analyze these mistakes. Check that ${model} is installed and Ollama is running.`);
  }
  const body = await response.json();
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== input.length) throw new Error('Ollama returned incomplete embeddings.');
  return body.embeddings.map(vector => {
    if (!Array.isArray(vector) || vector.length !== config.dimensions) throw new Error('Ollama returned unexpected embedding dimensions.');
    return normalizeVector(vector);
  });
}

async function encode(texts, signal, model, config) {
  const cache = readCache(config);
  const missing = [...new Set(texts)].filter(text => !cache.has(text));
  const parts = missing.map(text => textChunks(text));
  const inputs = [...new Set(parts.flat())];
  const vectors = new Map();
  for (let start = 0; start < inputs.length; start += 8) {
    signal?.throwIfAborted();
    const batch = inputs.slice(start, start + 8);
    const result = await embedBatch(batch, signal, model, config);
    batch.forEach((text, index) => vectors.set(text, result[index]));
  }
  signal?.throwIfAborted();
  missing.forEach((text, index) => {
    const sum = Array(config.dimensions).fill(0);
    for (const part of parts[index]) vectors.get(part).forEach((value, dimension) => { sum[dimension] += value * part.length; });
    cache.set(text, normalizeVector(sum));
  });
  if (missing.length) saveCache(cache, config);
  return texts.map(text => cache.get(text));
}

export async function analyzeMistakes(nodes, { signal, model = EMBEDDING_MODEL } = {}) {
  if (!Object.hasOwn(EMBEDDING_MODELS, model)) throw new Error('Choose a supported local embedding model.');
  const config = EMBEDDING_MODELS[model];
  const mistakes = nodes.filter(node => node.data.kind === 'Mistake');
  if (!mistakes.length) return [];
  const texts = mistakes.map(mistakeText);
  if (new Set(texts).size === 1) return clusterMistakes(mistakes, texts.map(() => [1]));
  return withLocalOllama(async () => {
    const embeddings = await encode(texts, signal, model, config);
    const profiles = await behaviorProfiles(mistakes, signal);
    const entries = [...profiles].filter(([, profile]) => profile && profileMeaning(profile));
    const meanings = await encode(entries.map(([, profile]) => profileMeaning(profile)), signal, model, config);
    const vectors = new Map(entries.map(([text], index) => [text, meanings[index]]));
    const matches = behavioralMatches(profiles, vectors, config.threshold, model);
    return clusterMistakes(mistakes, embeddings, config.threshold, matches);
  }, signal);
}
