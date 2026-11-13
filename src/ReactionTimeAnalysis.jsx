import React from 'react';
import { DAY, formatDate } from './model.js';
import { NODE_APPEARANCE } from './node-types.js';
import { recordedCalendarDay } from './reaction-time.js';

const daysLabel = days => `${days} ${days === 1 ? 'day' : 'days'}`;

export function ReactionTimeAnalysis({ report, selectedId, onSelect }) {
  const maximum = Math.max(1, report.measured[0]?.days ?? 0);
  return <section className="reaction-analysis" aria-labelledby="reaction-title">
    <h2 id="reaction-title">Reaction Time Analysis</h2>
    <p>Time to First Recorded Action · longest recorded intervals first. Longer does not necessarily mean worse.</p>
    <ul className="reaction-cases" aria-label="Measured reaction times">
      {report.measured.map(entry => <li key={entry.consequence.id}>
        <button type="button" className="reaction-case" data-testid={`reaction-case-${entry.consequence.id}`}
          aria-pressed={selectedId === entry.consequence.id} onClick={() => onSelect(entry.consequence.id)}>
          <span className="reaction-case-heading"><span className="reaction-summary" title={entry.consequence.data.mistake}>{entry.consequence.data.mistake}</span><strong>{daysLabel(entry.days)}</strong></span>
          <span className="reaction-scale" aria-hidden="true"><span className={`reaction-duration${entry.days === 0 ? ' zero-day' : ''}`} style={{ width: `${entry.days / maximum * 100}%` }}>
            <span className="reaction-duration-line" /><span className="consequence-marker" style={{ backgroundColor: NODE_APPEARANCE.Consequence.fill }} /><span className="action-marker" style={{ backgroundColor: NODE_APPEARANCE.Action.fill }} />
          </span></span>
          <span className="reaction-dates">Consequence {formatDate(entry.consequence.data.time)} → Action {formatDate(entry.action.data.time)}{entry.days === 0 ? ' · Same day' : ''}</span>
        </button>
      </li>)}
    </ul>
    {!report.measured.length && <p>No completed reaction times recorded in this phase.</p>}
    <h3>No Recorded Follow-up Action</h3>
    <ul className="reaction-cases" aria-label="Consequences without a recorded follow-up">
      {report.unmeasured.map(entry => <li key={entry.consequence.id}>
        <button type="button" className="reaction-case" data-testid={`reaction-case-${entry.consequence.id}`}
          aria-pressed={selectedId === entry.consequence.id} onClick={() => onSelect(entry.consequence.id)}>
          <span className="reaction-summary" title={entry.consequence.data.mistake}>{entry.consequence.data.mistake}</span>
          <span className="reaction-dates">{formatDate(entry.consequence.data.time)}</span>
          <span>{entry.futureAction ? `Future-dated follow-up · ${formatDate(entry.futureAction.data.time)} · not completed` : 'No qualifying subsequent Action recorded'}</span>
        </button>
      </li>)}
    </ul>
    {!report.unmeasured.length && <p>No observed Consequences without a qualifying Action in this phase.</p>}
  </section>;
}

function RecordedEvent({ node }) {
  return <><div className="journey-event-label"><span className="journey-marker" style={{ backgroundColor: NODE_APPEARANCE[node.data.kind].fill }} aria-hidden="true" /><strong>{node.data.kind}</strong> <time dateTime={new Date(node.data.time).toISOString().slice(0, 10)}>{formatDate(node.data.time)}</time></div>
    <p className="journey-main-text">{node.data.mistake}</p>
    {node.data.description ? <p className="journey-description">{node.data.description}</p> : <p className="journey-missing-description">No Description recorded.</p>}</>;
}

export function ReactionJourney({ entry }) {
  return <div className="reaction-journey">
    <h2 id="phase-list-title">{entry.action ? 'Time to First Recorded Action' : 'No Recorded Follow-up Action'}</h2>
    {entry.action ? <>
      <p className="reaction-total"><strong>{daysLabel(entry.days)}</strong></p>
      <p>No reason for this interval is inferred. Review the original recorded text for context.</p>
      <h3>Recorded journey</h3>
      <ol className="recorded-journey" aria-label="Recorded event path">
        {entry.path.map((node, index) => <li key={node.id} data-node-id={node.id}>
          {index > 0 && <p className="journey-gap">{daysLabel((recordedCalendarDay(node.data.time) - recordedCalendarDay(entry.path[index - 1].data.time)) / DAY)} since previous event</p>}
          <RecordedEvent node={node} />
        </li>)}
      </ol>
    </> : <>
      <p>No qualifying subsequent Action is recorded in the graph as of today.</p>
      {entry.futureAction && <p>The earliest qualifying connected Action is future-dated: {formatDate(entry.futureAction.data.time)}. It is not a completed response.</p>}
      <RecordedEvent node={entry.consequence} />
    </>}
  </div>;
}
