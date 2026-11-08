// Production always uses Cloudflare. Node tests and the explicit Ollama dev
// mode retain the existing local workflow without shipping a laptop dependency.
const build = import.meta.env;
export const CLOUD_AI = typeof __TRACE_CLOUD_AI__ !== 'undefined' ? __TRACE_CLOUD_AI__ : globalThis.process?.env?.TRACE_AI_PROVIDER === 'cloudflare';
export const AI_API_BASE = build?.VITE_AI_API_BASE || '/api/ai';
