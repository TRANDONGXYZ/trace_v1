import { CLOUD_AI } from './ai-config.js';
import { CLOUD_EMBEDDING_MODEL, CLOUD_EMBEDDING_DIMENSIONS, CLOUD_ENGLISH_PRESET } from '../shared/ai-models.js';

export const VIETNAMESE_MODEL = 'embeddinggemma:300m-qat-q4_0';
export const ENGLISH_MODEL = 'all-minilm:22m';
export const DEFAULT_EMBEDDING_MODEL = CLOUD_AI ? CLOUD_EMBEDDING_MODEL : VIETNAMESE_MODEL;
export const MODEL_PREFERENCE_KEY = CLOUD_AI ? 'trace.mistake-clustering-model.cloudflare.v1' : 'trace.mistake-clustering-model.v1';

export const EMBEDDING_MODELS = CLOUD_AI ? {
  [CLOUD_EMBEDDING_MODEL]: { label: 'Vietnamese + multilingual — Cloudflare Qwen3 embeddings', dimensions: CLOUD_EMBEDDING_DIMENSIONS,
    threshold: 0.5, causeThreshold: 0.6, prefix: '', cacheKey: 'trace.mistake-embeddings.cloudflare-qwen3-0.6b.v1' },
  [CLOUD_ENGLISH_PRESET]: { label: 'English — Cloudflare Qwen3 embeddings', dimensions: CLOUD_EMBEDDING_DIMENSIONS,
    threshold: 0.7, causeThreshold: 0.6, prefix: '', cacheKey: 'trace.mistake-embeddings.cloudflare-qwen3-0.6b.v1' },
} : {
  [VIETNAMESE_MODEL]: {
    label: 'Vietnamese + multilingual — EmbeddingGemma (239 MB)',
    dimensions: 768,
    threshold: 0.925,
    prefix: 'task: clustering | query: ',
    cacheKey: 'trace.mistake-embeddings.embeddinggemma-300m-qat-q4_0.clustering.v1',
  },
  [ENGLISH_MODEL]: {
    label: 'English only — MiniLM (46 MB)',
    dimensions: 384,
    threshold: 0.58,
    prefix: '',
    cacheKey: 'trace.mistake-embeddings.all-minilm-22m.v1',
  },
};

export function readModelPreference() {
  try {
    const model = localStorage.getItem(MODEL_PREFERENCE_KEY);
    if (Object.hasOwn(EMBEDDING_MODELS, model)) return model;
  } catch { /* Use the multilingual default when storage is unavailable. */ }
  return DEFAULT_EMBEDDING_MODEL;
}

export function saveModelPreference(model) {
  try { localStorage.setItem(MODEL_PREFERENCE_KEY, model); } catch { /* The choice still works for this session. */ }
}

