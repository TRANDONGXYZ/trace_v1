import { clusterPrompt } from '../shared/cluster-prompt.js';
import { formatDate } from './model.js';
import { textChunks } from './mistake-clusters.js';
import { withLocalOllama } from './local-ollama-queue.js';
import { localChat } from './local-ollama-chat.js';
import { BEHAVIOR_MODEL } from './behavior-patterns.js';
import { CLOUD_AI } from './ai-config.js';
import { cloudAI } from './cloud-ai.js';

export const EXPLANATION_MODEL = BEHAVIOR_MODEL;
export const EXPLANATION_OPTIONS = { num_gpu: 0, num_thread: 2, num_ctx: 4096, num_batch: 128, num_predict: 512, temperature: 0, seed: 1 };
export const EXPLANATION_INPUT_LIMIT = 4800;
const cache = new Map();
const persistentCacheKey = 'trace.cluster-explanations.cloudflare-gemma4.v1';
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const invalidOutput = message => Object.assign(new Error(message), { invalidOutput: true });
const idsIn = job => [...new Set([...job.records.map(record => record.id), ...(job.observations ?? []).flatMap(note => note.evidenceIds)])];

function readSavedFindings() {
  if (!CLOUD_AI) return new Map();
  try {
    const entries = JSON.parse(localStorage.getItem(persistentCacheKey));
    return new Map(Array.isArray(entries) ? entries.filter(entry => Array.isArray(entry) && /^[a-f0-9]{64}$/u.test(entry[0])).slice(-32) : []);
  } catch { return new Map(); }
}

async function findingCacheKey(job) {
  const value = JSON.stringify({ version: 6, model: EXPLANATION_MODEL, job });
  if (!CLOUD_AI) return value;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function saveFindingCache() {
  if (!CLOUD_AI) return;
  try { localStorage.setItem(persistentCacheKey, JSON.stringify([...cache].slice(-32))); } catch { /* The diagram's save flow remains independent. */ }
}

export function evidenceAliases(job) {
  const ids = idsIn(job);
  const toAlias = new Map(ids.map((id, index) => [id, `R${index + 1}`]));
  return {
    aliases: new Map(ids.map(id => [toAlias.get(id), id])),
    input: {
      cluster: { label: Array.from(job.cluster.label).slice(0, 160).join(''), count: job.cluster.count,
        first: formatDate(job.cluster.first), last: formatDate(job.cluster.last) },
      mode: job.mode, partial: job.mode === 'observe',
      records: job.records.map(record => ({ ...record, id: toAlias.get(record.id) })),
      observations: (job.observations ?? []).map(note => ({ text: note.text, evidence_ids: note.evidenceIds.map(id => toAlias.get(id)) })),
    },
  };
}

// One plan per recurring cluster with recent activity. Include its older
// history too, but never future events or non-Mistake nodes. Full fields are
// retained as excerpts rather than truncated to fit the model context.
export function explanationJobs(report) {
  return (report.trends ?? []).filter(cluster => cluster.recent.length).flatMap(cluster => {
    const members = [...new Map(cluster.members.filter(node => node.data.kind === 'Mistake' && node.data.time < report.periods.recent.end)
      .map(node => [node.id, node])).values()].sort((a, b) => a.data.time - b.data.time || a.id.localeCompare(b.id));
    if (members.length < 2) return [];
    const chunks = members.map(node => textChunks(`Mistake: ${node.data.mistake}\nDescription: ${node.data.description ?? ''}`, 300)
      .map((text, index, parts) => ({ id: node.id, date: formatDate(node.data.time), text, part: `${index + 1}/${parts.length}` })));
    const records = [];
    // Interleave excerpts across occurrences so batches compare records
    // collectively instead of explaining a long individual entry.
    for (let part = 0; part < Math.max(...chunks.map(parts => parts.length)); part++) {
      for (const parts of chunks) if (parts[part]) records.push(parts[part]);
    }
    return [{ cluster: { id: cluster.id, label: cluster.label, count: members.length, first: members[0].data.time, last: members.at(-1).data.time }, records, mode: 'explain' }];
  });
}

export function clusterBatches(job) {
  const anchors = [...new Map(job.records.map(record => [record.id, job.records.find(other => other.id === record.id)])).values()].slice(0, 2);
  const rest = job.records.filter(record => !anchors.includes(record));
  const batches = [];
  let records = [...anchors];
  for (const record of rest) {
    if (bytes(evidenceAliases({ ...job, records: [...records, record] }).input) > EXPLANATION_INPUT_LIMIT) {
      batches.push(records); records = [...anchors];
    }
    records.push(record);
  }
  batches.push(records);
  return batches;
}

export function validateFinding(value, job, aliases = new Map()) {
  if (!value || typeof value.explanation !== 'string' || typeof value.observed_pattern !== 'string' || !Array.isArray(value.evidence_ids)) {
    throw invalidOutput('The local model returned an invalid cluster explanation.');
  }
  const text = value.explanation.trim(), observedPattern = value.observed_pattern.trim();
  if (job.mode !== 'observe' && !text) return null;
  if (job.mode === 'observe' && !observedPattern) return null;
  if (!observedPattern || observedPattern.length > 600 || text.length > 1400) throw invalidOutput('The local cluster explanation exceeded its supported length or omitted the recorded pattern.');
  const allowed = new Set(idsIn(job));
  const ids = [...new Set(value.evidence_ids.map(reference => {
    if (typeof reference !== 'string') return null;
    const ref = reference.trim();
    return aliases.get(ref) ?? (allowed.has(ref) ? ref : null);
  }))];
  if (ids.length < 2 || ids.length > 4 || ids.some(id => !allowed.has(id))) {
    throw invalidOutput('The local model must cite at least two distinct recorded mistakes in this cluster; unsupported evidence was rejected.');
  }
  return { clusterId: job.cluster.id, clusterLabel: job.cluster.label, count: job.cluster.count, observedPattern,
    text: job.mode === 'observe' ? '' : text, evidenceIds: ids };
}

async function analyzeJob(job, signal) {
  const { input, aliases } = evidenceAliases(job);
  if (bytes(input) > EXPLANATION_INPUT_LIMIT) throw invalidOutput('The cluster context exceeded the local model limit.');
  const { system, schema } = clusterPrompt(input);
  let body;
  try {
    body = CLOUD_AI ? { message: { content: JSON.stringify(await cloudAI('explain', { input }, signal)) } } : await localChat({ model: EXPLANATION_MODEL, format: schema, options: EXPLANATION_OPTIONS,
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] }, { signal });
  } catch (error) {
    if (signal?.aborted || error.invalidOutput) throw error;
    throw new Error(error.status === 404 ? `Install the local model with “ollama pull ${EXPLANATION_MODEL}”. Recorded findings remain available.`
      : `${error.message} Recorded findings remain available.`);
  }
  if (body.done_reason === 'length') throw invalidOutput('The local cluster explanation was incomplete. Recorded findings remain available.');
  let parsed;
  try { parsed = JSON.parse(body.message.content); } catch { throw invalidOutput('The local model did not return a valid cluster explanation.'); }
  signal?.throwIfAborted();
  return validateFinding(parsed, job, aliases);
}

async function explainCluster(job, signal) {
  const batches = clusterBatches(job);
  if (batches.length === 1) return analyzeJob(job, signal);
  let observations = [];
  for (const records of batches) {
    signal?.throwIfAborted();
    const result = await analyzeJob({ ...job, records, mode: 'observe' }, signal);
    // Do not present a whole-cluster conclusion after silently losing an
    // unsupported portion of its evidence.
    if (!result) return null;
    observations.push({ text: result.observedPattern, evidenceIds: result.evidenceIds });
  }
  // Hierarchical evidence reduction reads every field while keeping all
  // prompts bounded. Final hypotheses are generated once per cluster.
  for (;;) {
    const final = { ...job, records: [], observations, mode: 'explain' };
    if (bytes(evidenceAliases(final).input) <= EXPLANATION_INPUT_LIMIT) return analyzeJob(final, signal);
    const groups = []; let group = [];
    for (const note of observations) {
      if (group.length && bytes(evidenceAliases({ ...final, observations: [...group, note] }).input) > EXPLANATION_INPUT_LIMIT) {
        groups.push(group); group = [];
      }
      group.push(note);
    }
    if (group.length) groups.push(group);
    if (groups.length >= observations.length) throw invalidOutput('The cluster observations could not be reduced within the local context limit.');
    const reduced = [];
    for (const notes of groups) {
      signal?.throwIfAborted();
      const result = await analyzeJob({ ...final, observations: notes, mode: 'observe' }, signal);
      if (!result) return null;
      reduced.push({ text: result.observedPattern, evidenceIds: result.evidenceIds });
    }
    observations = reduced;
  }
}

export async function explainProgress(report, { signal, onUpdate } = {}) {
  if (report.trends === null) throw new Error('Wait for mistake clustering before analyzing shared psychological patterns.');
  const jobs = explanationJobs(report);
  return withLocalOllama(async () => {
    const findings = [], warnings = [];
    const cachedAtStart = new Map([...readSavedFindings(), ...cache]);
    const publish = () => onUpdate?.({ findings: [...findings], warnings: [...new Set(warnings)] });
    for (const job of jobs) {
      signal?.throwIfAborted();
      const key = await findingCacheKey(job);
      signal?.throwIfAborted();
      if (cachedAtStart.has(key)) {
        const stored = cachedAtStart.get(key);
        if (stored === null) { publish(); continue; }
        try {
          const valid = validateFinding({ evidence_ids: stored.evidenceIds, observed_pattern: stored.observedPattern, explanation: stored.text }, job);
          if (valid) { findings.push(valid); cache.set(key, valid); publish(); continue; }
        } catch { /* A malformed stored interpretation must be regenerated. */ }
      }
      try {
        const finding = await explainCluster(job, signal);
        signal?.throwIfAborted();
        cache.set(key, finding);
        if (cache.size > 32) cache.delete(cache.keys().next().value);
        saveFindingCache();
        if (finding) findings.push(finding);
        publish();
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push(error.message); publish();
        if (!error.invalidOutput) break;
      }
    }
    if (!findings.length && warnings.length) throw new Error(warnings[0]);
    return findings;
  }, signal);
}
