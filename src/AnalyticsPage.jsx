import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NODE_APPEARANCE } from './node-types.js';
import { formatDate } from './model.js';
import { buildPhaseAnalytics, calendarPhase, phaseLabel } from './phase-analytics.js';
import { INITIAL_SPLIT, DIVIDER_SPACE, clampSplit, splitLimits } from './analytics-layout.js';

export function AnalyticsPage({ nodes, edges, onClose }) {
  const [phase, setPhase] = useState(() => calendarPhase());
  const [selectedKind, setSelectedKind] = useState('Mistake');
  const heading = useRef(null);
  const columns = useRef(null), drag = useRef(null);
  const [split, setSplit] = useState(INITIAL_SPLIT);
  const [width, setWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  const ratio = width ? clampSplit(split, width) : INITIAL_SPLIT;
  const limits = splitLimits(width);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(columns.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { heading.current.focus(); }, []);
  useEffect(() => {
    let timer;
    const refresh = () => {
      const now = new Date(), next = calendarPhase(now);
      setPhase(current => current.start === next.start && current.end === next.end ? current : next);
      clearTimeout(timer);
      timer = setTimeout(refresh, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime());
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const report = useMemo(() => buildPhaseAnalytics(nodes, edges, phase), [nodes, edges, phase]);
  const selected = report.categories.find(category => category.kind === selectedKind);
  const maximum = Math.max(1, ...report.categories.map(category => category.count));
  return <main className={`phase-analytics${resizing ? ' is-resizing' : ''}`} aria-labelledby="analytics-title">
    <header className="phase-heading">
      <h1 id="analytics-title" tabIndex={-1} ref={heading}>Analytics</h1>
      <button type="button" onClick={onClose}>Back to whiteboard</button>
    </header>
    <div className="phase-columns" ref={columns} style={{ '--phase-left': `${ratio}fr`, '--phase-right': `${1 - ratio}fr` }}>
      <section id="phase-summary" className="phase-summary" aria-label="Current phase event counts">
        <div role="tablist" aria-label="Analytics time period" className="phase-tabs">
          {['2 Months', '6 Months', '1 Year', 'Custom'].map((period, index) => <button key={period} type="button" role="tab"
            id={`phase-tab-${index}`} aria-selected={index === 0} aria-controls={index === 0 ? 'phase-panel' : undefined}
            disabled={index !== 0} title={index ? 'Not implemented yet' : undefined}>{period}</button>)}
        </div>
        <div role="tabpanel" id="phase-panel" aria-labelledby="phase-tab-0">
          <h2>Current two-month phase</h2>
          <p className="phase-range">{phaseLabel(phase)}</p>
          <p>Both full calendar months are included, including recorded future dates within this phase. The other periods are not implemented yet.</p>
          <ul className="phase-bars" aria-label="Event count chart">
            {report.categories.map(category => <li key={category.kind}>
              <button type="button" className="phase-bar" aria-label={`${category.kind}: ${category.count} events`}
                aria-pressed={selectedKind === category.kind} onClick={() => setSelectedKind(category.kind)}>
                <span className="phase-bar-count">{category.count}</span>
                <span className="phase-bar-track" aria-hidden="true"><span className="phase-bar-fill"
                  style={{ height: `${category.count / maximum * 100}%`, backgroundColor: NODE_APPEARANCE[category.kind].fill }} /></span>
                <span>{category.kind}</span>
              </button>
            </li>)}
          </ul>
          <p>Select a bar to view its recorded events.</p>
        </div>
      </section>
      <div className="phase-divider" role="separator" aria-label="Resize analytics panels" aria-orientation="vertical" tabIndex={0}
        aria-controls="phase-summary phase-detail" aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(limits.min * 100)} aria-valuemax={Math.round(limits.max * 100)}
        aria-valuetext={`${Math.round(ratio * 100)}% chart, ${Math.round((1 - ratio) * 100)}% event list`}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          const bounds = columns.current.getBoundingClientRect();
          drag.current = { id: event.pointerId, offset: event.clientX - bounds.left - (bounds.width - DIVIDER_SPACE) * ratio - DIVIDER_SPACE / 2 };
          event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); setResizing(true);
        }}
        onPointerMove={event => {
          if (drag.current?.id !== event.pointerId) return;
          const bounds = columns.current.getBoundingClientRect();
          setSplit(clampSplit((event.clientX - bounds.left - DIVIDER_SPACE / 2 - drag.current.offset) / (bounds.width - DIVIDER_SPACE), bounds.width));
        }}
        onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; setResizing(false); } }}
        onPointerCancel={() => { drag.current = null; setResizing(false); }}
        onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max : ratio + (event.key === 'ArrowLeft' ? -0.02 : 0.02);
          setSplit(clampSplit(next, width));
        }} />
      <section id="phase-detail" className="phase-detail" aria-labelledby="phase-list-title">
        <h2 id="phase-list-title">{selected.kind} ({selected.count})</h2>
        {selected.targetKind && <p>Ranked by distinct reachable {selected.targetKind} nodes across the entire diagram, including other phases.
          {selected.kind === 'Mistake' ? ' This is a recorded connection count, not a measure of severity.' : ''}</p>}
        <ol className={`phase-event-list${selected.targetKind ? ` phase-ranked-list rank-${selected.kind.toLowerCase()}` : ''}`} aria-label={`${selected.kind} events`}>
          {selected.events.map(({ node, reachableCount }) => <li key={node.id} data-node-id={node.id}>
            <strong>{node.data.mistake}</strong>
            <time dateTime={new Date(node.data.time).toISOString().slice(0, 10)}>{formatDate(node.data.time)}</time>
            {selected.targetKind && <span className="phase-reachable-count">Reachable {selected.targetKind} nodes: {reachableCount}</span>}
            {node.data.description && <p>{node.data.description}</p>}
          </li>)}
        </ol>
        {!selected.count && <p role="status">No {selected.kind} events in this phase.</p>}
      </section>
    </div>
  </main>;
}
