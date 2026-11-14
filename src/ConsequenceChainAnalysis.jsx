import React from 'react';
import { formatDate } from './model.js';
import { NODE_APPEARANCE } from './node-types.js';
import { RecordedEvent } from './ReactionTimeAnalysis.jsx';

const duration = days => `${days} ${days === 1 ? 'day' : 'days'}`;

export function ConsequenceChainAnalysis({ report, selectedId, onSelect }) {
  return <section className="consequence-chain-analysis" aria-labelledby="chain-title">
    <h2 id="chain-title">Consequence Chain Analysis</h2>
    <p>Consecutive Consequence levels and distinct reachable Consequences are separate counts. Deeper chains do not establish severity or causation.</p>
    <ul className="chain-cases" aria-label="Consequence chain ranking">
      {report.entries.map(entry => <li key={entry.mistake.id}>
        <button type="button" className="chain-case" data-testid={`chain-case-${entry.mistake.id}`}
          aria-pressed={selectedId === entry.mistake.id} onClick={() => onSelect(entry.mistake.id)}>
          <span className="reaction-summary" title={entry.mistake.data.mistake}>{entry.mistake.data.mistake}</span>
          <span className="chain-segments" role="img" aria-label={entry.depth === null ? 'Chain depth unavailable: recorded cycle' : `Chain depth: ${entry.depth}`}>
            {Array.from({ length: entry.depth ?? 0 }, (_, level) => <span key={level} className="chain-depth-segment" aria-hidden="true" style={{ backgroundColor: NODE_APPEARANCE.Consequence.fill }} />)}
          </span>
          <span className="chain-row-metrics"><strong>Chain Depth: {entry.depth ?? 'Unavailable (cycle)'}</strong><span>Total Consequences: {entry.totalConsequences}</span></span>
          <span className="reaction-dates">{formatDate(entry.mistake.data.time)}</span>
          {entry.status === 'invalid-dates' && <span>Recorded dates go backward or are invalid; duration unavailable.</span>}
        </button>
      </li>)}
    </ul>
    {!report.entries.length && <p>No Mistake events in this phase for Consequence Chain Analysis.</p>}
  </section>;
}

export function ConsequenceChainJourney({ entry, path }) {
  return <div className="chain-journey">
    <h2 id="phase-list-title">Longest Consequence chain</h2>
    <p className="chain-main-text">{entry.mistake.data.mistake}</p>
    <p>Mistake · {formatDate(entry.mistake.data.time)}</p>
    <dl className="chain-detail-metrics">
      <div><dt>Chain Depth</dt><dd className="chain-depth">{entry.depth ?? 'Unavailable (cycle)'}</dd></div>
      <div><dt>Total Consequences</dt><dd className="chain-total">{entry.totalConsequences}</dd></div>
      <div><dt>Chain Duration</dt><dd className="chain-duration">{entry.durationDays === null ? 'Not available' : duration(entry.durationDays)}</dd></div>
    </dl>
    {entry.status === 'cycle' ? <>
      <p>A consecutive Consequence cycle is reachable. Chain Depth and Chain Duration are unavailable; no longest chain is claimed.</p>
      <RecordedEvent node={entry.mistake} />
    </> : entry.depth === 0 ? <>
      <p>No consecutive Consequence chain is recorded for this Mistake.</p>
      <RecordedEvent node={entry.mistake} />
    </> : <>
      {entry.status === 'invalid-dates' && <p>This recorded chain contains invalid or backward dates. Chain Duration is unavailable; events remain in their actual directed order.</p>}
      <h3>Selected longest chain</h3>
      <ol className="recorded-journey" aria-label="Selected Consequence chain">
        {path.map(node => <li key={node.id} data-node-id={node.id}><RecordedEvent node={node} /></li>)}
      </ol>
    </>}
  </div>;
}
