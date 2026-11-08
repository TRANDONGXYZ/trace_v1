import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildProgressReport, comparisonPeriods, periodLabel } from './progress-analytics.js';
import { explainProgress, explanationJobs } from './progress-explanations.js';
import { formatDate } from './model.js';

const changeText = change => change > 0 ? `${change} more` : change < 0 ? `${-change} fewer` : 'No change';
const rangeText = range => range ? `${formatDate(range.first)} – ${formatDate(range.last)}` : 'None recorded';

function RecordedEntry({ node }) {
  return <><span>{node.data.kind} · {formatDate(node.data.time)}</span><strong>{node.data.mistake}</strong>{node.data.description && <p>{node.data.description}</p>}</>;
}

function RecordedOutcomes({ title, entries, empty, showActions = true }) {
  return <section className="progress-section"><h2>{title}</h2>{!entries.length ? <p>{empty}</p> : <ul className="recorded-outcomes">{entries.map(({ node, trace }) => <li key={node.id} data-event-id={node.id}>
    <RecordedEntry node={node} />
    {showActions && <><h3>Actions connected upstream</h3>{!trace.actions.length ? <p>No upstream Action is recorded.</p> : <ul>{trace.actions.map(({ node: action, path }) => <li key={action.id}>
      <RecordedEntry node={action} />
      <p className="recorded-path">Recorded path: {path.map(item => `${item.data.kind} “${item.data.mistake}” (${formatDate(item.data.time)})`).join(' → ')}</p>
    </li>)}</ul>}</>}
  </li>)}</ul>}</section>;
}

export function ProgressAnalytics({ nodes, edges, clusters, clusteringError }) {
  const [periods] = useState(comparisonPeriods);
  const report = useMemo(() => buildProgressReport(nodes, edges, clusters, periods), [nodes, edges, clusters, periods]);
  const [interpretation, setInterpretation] = useState(null);
  const [running, setRunning] = useState(false);
  const controller = useRef(null);
  const signature = useMemo(() => JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, data: node.data })), edges, periods,
    clusters: clusters?.map(cluster => [cluster.id, cluster.members.map(node => node.id)]) }), [nodes, edges, periods, clusters]);
  useEffect(() => {
    controller.current?.abort(); controller.current = null;
    setRunning(false); setInterpretation(null);
    return () => controller.current?.abort();
  }, [signature]);
  const explanation = interpretation?.signature === signature ? interpretation : null;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const mistakeCount = report.counts.find(row => row.kind === 'Mistake');
  const cancel = () => {
    controller.current?.abort(); controller.current = null;
    setRunning(false);
    setInterpretation(previous => ({ signature, ...(previous?.signature === signature ? previous : {}), cancelled: true }));
  };
  const interpret = async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setRunning(true); setInterpretation(null);
    let latest = { findings: [], warnings: [] };
    try {
      const findings = await explainProgress(report, { signal: request.signal, onUpdate: update => {
        latest = update;
        if (!request.signal.aborted && controller.current === request) setInterpretation({ signature, ...update });
      } });
      if (!request.signal.aborted && controller.current === request) setInterpretation({ signature, findings, warnings: latest.warnings });
    } catch (error) { if (!request.signal.aborted) setInterpretation({ signature, error: error.message }); }
    finally { if (controller.current === request) { controller.current = null; setRunning(false); } }
  };
  const hasTargets = explanationJobs(report).length > 0;
  return <section className="progress-analytics" aria-label="Personal progress analytics">
    <h2>Recent progress</h2>
    <p className="period-labels"><strong>Most recent two months:</strong> {periodLabel(periods.recent)}<br /><strong>Preceding two months:</strong> {periodLabel(periods.previous)}</p>
    <p className="overview-hint">Rolling calendar-month periods ending today, using your computer’s local date. Findings below describe recorded nodes and connections; missing records do not establish that an event never happened.</p>
    <section className="progress-section"><h2>Recorded findings</h2>
      <div className="analytics-table-wrap"><table className="analytics-table" aria-label="Period comparison"><thead><tr><th>Recorded type</th><th>Recent</th><th>Preceding</th><th>Change</th></tr></thead><tbody>
        {report.counts.map(row => <tr key={row.kind}><th scope="row">{row.kind}</th><td>{row.recent}</td><td>{row.previous}</td><td>{changeText(row.change)}</td></tr>)}
        <tr><th scope="row">Success + Milestone</th><td>{report.achievementCount.recent}</td><td>{report.achievementCount.previous}</td><td>{changeText(report.achievementCount.change)}</td></tr>
      </tbody></table></div>
      <p>{mistakeCount.recent} Mistake nodes recorded recently versus {mistakeCount.previous} in the preceding period: {changeText(mistakeCount.change).toLowerCase()}.</p>
    </section>
    <section className="progress-section"><h2>Recurring mistakes and trends</h2>
      <p>“New in comparison” means recorded recently but absent from the preceding period, even if it occurred earlier in your history. Recurring means at least two recent occurrences. Types are approximate semantic groupings; counts and dates come from their recorded members.</p>
      {report.trends === null ? <p>{clusteringError ? 'Semantic trends are unavailable because clustering failed. Recorded totals and connections remain available.' : 'Waiting for semantic mistake clustering…'}</p>
        : !report.trends.length ? <p>No Mistake nodes recorded in either period.</p>
          : <div className="analytics-table-wrap"><table className="analytics-table" aria-label="Mistake trends"><thead><tr><th>Mistake type</th><th>Recent</th><th>Preceding</th><th>Trend</th><th>First–last recent occurrence</th></tr></thead><tbody>{report.trends.map(row => <tr key={row.id} data-trend-id={row.id}>
            <th scope="row">{row.label}</th><td>{row.recent.length}</td><td>{row.previous.length}</td><td>{row.isNew ? 'New in comparison' : changeText(row.change)}{row.recurring && <><br />Recurring</>}</td><td>{rangeText(row.recentRange)}</td>
          </tr>)}</tbody></table></div>}
    </section>
    <p className="overview-hint">Upstream Actions have a recorded directed path to the event. This shows a recorded relationship, not proof that an Action caused an achievement or obstacle. Same-date events follow arrow direction.</p>
    <RecordedOutcomes title="Recent successes and milestones" entries={report.achievements} empty="No Success or Milestone nodes recorded recently." />
    <RecordedOutcomes title="Recent blocked situations and attempted Actions" entries={report.blocked} empty="No Blocked nodes recorded recently." />
    <RecordedOutcomes title="Recent consequences" entries={report.consequences} empty="No Consequence nodes recorded recently." showActions={false} />
    <section className="progress-section possible-explanations" aria-label="Possible local explanations"><h2>Possible explanations · local LLM</h2>
      <p>Each analysis looks for a shared psychological or behavioral motivation across a recurring Mistake cluster with recent activity, using all its recorded occurrences up to today, including older history. Hypotheses are plausible interpretations, not established facts or diagnoses. Inspect the cited mistakes before drawing conclusions.</p>
      {clusters === null ? <p>{clusteringError ? 'Cluster explanations are unavailable until mistake clustering succeeds.' : 'Waiting for mistake clusters before psychological analysis…'}</p>
        : !hasTargets ? <p>No recurring Mistake clusters with recent activity to interpret. At least two recorded mistakes in a cluster are needed.</p>
          : <button type="button" className="explain-button" disabled={running} onClick={interpret}>{running ? 'Analyzing mistake clusters…' : 'Explain recent patterns locally'}</button>}
      {running && <><button type="button" onClick={cancel}>Cancel</button><p role="status">Analyzing shared patterns locally. Cancel or close this popup to stop the inference request.</p></>}
      {explanation?.cancelled && <p role="status">Analysis canceled. Any completed, validated cluster explanations remain available.</p>}
      {explanation?.error && <p role="alert">{explanation.error}</p>}
      {!!explanation?.warnings?.length && <p role="alert">Some cluster explanations could not be completed. The valid results below are still available. {explanation.warnings.join(' ')}</p>}
      {explanation?.findings && (!explanation.findings.length ? (!running && !explanation.cancelled && !explanation.error && !explanation.warnings?.length && <p>The model found insufficient evidence for a shared psychological explanation. No causes have been assumed.</p>) : <ul className="local-findings">{explanation.findings.map((finding, index) => <li key={index}>
        <h3>{finding.clusterLabel} · {finding.count} recorded mistakes</h3>
        <strong>Shared pattern in cited records — model summary</strong><p>{finding.observedPattern}</p>
        <strong>Possible psychological explanation — not confirmed</strong><p>{finding.text}</p>
        <p>Cited mistakes from this cluster:</p><ul>{finding.evidenceIds.map(id => <li key={id}><RecordedEntry node={byId.get(id)} /></li>)}</ul>
      </li>)}</ul>)}
    </section>
  </section>;
}
