// Server-owned model allowlist. Browsers send task data, never model names or
// generation parameters. These models are available on Workers Free.
export const CLOUD_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b';
export const CLOUD_REASONING_MODEL = '@cf/google/gemma-4-26b-a4b-it';
export const CLOUD_EMBEDDING_DIMENSIONS = 1024;
// The English preset uses the same fixed backend model and cached vectors;
// only the browser's calibrated grouping threshold differs.
export const CLOUD_ENGLISH_PRESET = `${CLOUD_EMBEDDING_MODEL}:english`;
export const MAX_REQUEST_BYTES = 16_384;
export const CLUSTER_INPUT_BYTES = 4800;
