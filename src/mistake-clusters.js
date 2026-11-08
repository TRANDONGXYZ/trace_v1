export const SIMILARITY_THRESHOLD = 0.58;

export function mistakeText(node) {
  return [node.data.mistake, node.data.description].filter(Boolean).join('\n').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function normalizeVector(vector) {
  if (!Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) throw new Error('Ollama returned an invalid embedding.');
  const length = Math.hypot(...vector);
  if (!length) throw new Error('Ollama returned an empty embedding.');
  return vector.map(value => value / length);
}

export function cosine(a, b) {
  if (a.length !== b.length) throw new Error('Ollama returned inconsistent embedding dimensions.');
  return a.reduce((total, value, index) => total + value * b[index], 0);
}

// Complete-link agglomeration: every pair in a merged cluster must meet the
// threshold. Unlike single-link chains, one ambiguous item cannot join two
// otherwise unrelated groups. The number of groups is discovered from the data.
export function clusterMistakes(nodes, embeddings, threshold = SIMILARITY_THRESHOLD, samePattern = null) {
  if (!nodes.length) return [];
  if (nodes.length !== embeddings.length) throw new Error('Each mistake needs an embedding.');
  const items = nodes.map((node, index) => ({ node, vector: normalizeVector(embeddings[index]) }))
    .sort((a, b) => a.node.id.localeCompare(b.node.id));
  const similarity = items.map(a => items.map(b => cosine(a.vector, b.vector)));
  let groups = items.map((_, index) => [index]);
  while (groups.length > 1) {
    let best = threshold - 1e-9;
    let pair;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      let score = 1;
      for (const a of groups[i]) for (const b of groups[j]) score = Math.min(score,
        samePattern ? (samePattern(items[a].node, items[b].node, similarity[a][b]) ? Math.max(threshold, similarity[a][b]) : -1) : similarity[a][b]);
      if (score > best) { best = score; pair = [i, j]; }
    }
    if (!pair) break;
    const [a, b] = pair;
    groups[a] = [...groups[a], ...groups[b]];
    groups.splice(b, 1);
  }
  return groups.map(group => {
    // Use a real member's wording (the medoid), without a second naming model.
    const representative = [...group].sort((a, b) =>
      group.reduce((sum, other) => sum + similarity[b][other] - similarity[a][other], 0) ||
      items[a].node.data.mistake.length - items[b].node.data.mistake.length || a - b)[0];
    const members = group.map(index => items[index].node).sort((a, b) => a.data.time - b.data.time || a.id.localeCompare(b.id));
    return { id: members.map(node => node.id).sort().join('|'), label: items[representative].node.data.mistake, members, count: members.length };
  }).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

// Short chunks retain long Mistake fields and the full Description rather than
// silently truncating everything after the model's small context window.
export function textChunks(text, limit = 480) {
  const chunks = [];
  let current = '';
  for (const word of text.split(/\s+/u)) {
    const points = Array.from(word);
    if (points.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < points.length; i += limit) chunks.push(points.slice(i, i + limit).join(''));
    } else if (current && Array.from(current).length + points.length + 1 > limit) {
      chunks.push(current); current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}
