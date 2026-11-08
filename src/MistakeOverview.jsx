import React, { useEffect, useRef, useState } from 'react';
import { analyzeMistakes } from './ollama.js';
import { EMBEDDING_MODELS, readModelPreference, saveModelPreference } from './embedding-models.js';
import { formatDate } from './model.js';
import { ProgressAnalytics } from './ProgressAnalytics.jsx';

export function MistakeOverview({ nodes, edges, onClose }) {
  const dialog = useRef(null);
  const close = useRef(null);
  const [model, setModel] = useState(readModelPreference);
  const [result, setResult] = useState(null);
  const current = result?.model === model && result.nodes === nodes ? result : null;
  const clusters = current?.clusters ?? null;
  const error = current?.error ?? '';
  const mistakes = nodes.filter(node => node.data.kind === 'Mistake');
  useEffect(() => { dialog.current.showModal(); close.current.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    analyzeMistakes(nodes, { signal: controller.signal, model }).then(clusters => {
      if (!controller.signal.aborted) setResult({ model, nodes, clusters });
    }).catch(reason => { if (!controller.signal.aborted) setResult({ model, nodes, error: reason.message }); });
    return () => controller.abort();
  }, [nodes, model]);
  const largest = clusters?.[0]?.count ?? 1;
  return <dialog className="mistake-overview" ref={dialog} onCancel={onClose} aria-labelledby="overview-title">
    <div className="dialog-heading"><h1 id="overview-title">Mistake overview</h1><button type="button" ref={close} className="close-dialog" aria-label="Close overview" onClick={onClose}>×</button></div>
    <label htmlFor="clustering-model">Clustering model</label>
    <select id="clustering-model" value={model} onChange={event => {
      setModel(event.target.value); saveModelPreference(event.target.value);
    }}>{Object.entries(EMBEDDING_MODELS).map(([id, config]) => <option key={id} value={id}>{config.label}</option>)}</select>
    <ProgressAnalytics nodes={nodes} edges={edges} clusters={clusters} clusteringError={error} />
    <h2 className="all-time-title">All-time mistake clusters</h2>
    {error ? <p role="alert">{error} Close and reopen the overview to retry.</p> : clusters === null
      ? <p role="status">Analyzing mistakes locally…</p>
      : !mistakes.length ? <p>No Mistake nodes yet. Create a Mistake node to see it here.</p>
        : <>
          <p className="overview-summary">{mistakes.length} {mistakes.length === 1 ? 'mistake' : 'mistakes'} · {clusters.length} {clusters.length === 1 ? 'cluster' : 'clusters'}</p>
          <p className="overview-hint">Approximate groups use Mistake and Description, comparing stated motivations where available. Inspect the original entries to verify each grouping. Larger, darker bars show more frequent mistakes.</p>
          <div className="mistake-clusters">{clusters.map(cluster => {
            const weight = cluster.count / largest;
            const darkness = cluster.count > 1 ? 48 - 14 * weight : 74;
            return <article className="mistake-cluster" key={cluster.id} data-count={cluster.count}>
              <div className="cluster-heading"><h2>{cluster.label}</h2><span className="cluster-count" style={{ fontSize: `${18 + 14 * weight}px` }}>{cluster.count}<small>{cluster.count === 1 ? 'occurrence' : 'occurrences'}</small></span></div>
              <p className="cluster-date-range">First–last recorded occurrence: {formatDate(Math.min(...cluster.members.map(node => node.data.time)))} – {formatDate(Math.max(...cluster.members.map(node => node.data.time)))}</p>
              <div className="cluster-bar" role="img" aria-label={`${cluster.count} of ${mistakes.length} mistakes`}><div style={{ width: `${weight * 100}%`, background: `hsl(5 60% ${darkness}%)` }} /></div>
              <details><summary>View occurrences</summary><ul>{cluster.members.map(node => <li key={node.id}><time>{formatDate(node.data.time)}</time><strong>{node.data.mistake}</strong>{node.data.description && <p>{node.data.description}</p>}</li>)}</ul></details>
            </article>;
          })}</div>
        </>}
  </dialog>;
}
