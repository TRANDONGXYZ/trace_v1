export const VIETNAMESE_MODEL = 'embeddinggemma:300m-qat-q4_0';
export const ENGLISH_MODEL = 'all-minilm:22m';
export const DEFAULT_EMBEDDING_MODEL = VIETNAMESE_MODEL;
export const MODEL_PREFERENCE_KEY = 'trace.mistake-clustering-model.v1';

export const EMBEDDING_MODELS = {
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
