import React, { useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Handle, Position, Controls, MarkerType } from '@xyflow/react';
import { NODE_APPEARANCE } from './node-types.js';
import { formatDate } from './model.js';
import { RecordedEvent } from './ReactionTimeAnalysis.jsx';
import { EventCard } from './EventCard.jsx';
import { achievementPathHighlight } from './achievement-paths.js';
import { layoutAchievementGraph } from './achievement-layout.js';

export function AchievementPathAnalysis({ report, selectedId, onSelect }) {
  return <section className="achievement-analysis" aria-labelledby="achievement-title">
    <h2 id="achievement-title">Achievement Path Analysis</h2>
    <p>Related Actions are recorded connections, not proof of causation or achievement value.</p>
    <ul className="achievement-cases" aria-label="Achievement ranking">
      {report.entries.map(({ achievement, actionCount }) => <li key={achievement.id}>
        <button type="button" className="achievement-case" data-testid={`achievement-case-${achievement.id}`} aria-pressed={selectedId === achievement.id} onClick={() => onSelect(achievement.id)}>
          <span className="journey-event-label"><span className="journey-marker" style={{ backgroundColor: NODE_APPEARANCE[achievement.data.kind].fill }} aria-hidden="true" /><strong>{achievement.data.kind}</strong></span>
          <span className="reaction-summary" title={achievement.data.mistake}>{achievement.data.mistake}</span>
          <span className="reaction-dates">{formatDate(achievement.data.time)}</span>
          <span>{actionCount} related {actionCount === 1 ? 'Action' : 'Actions'}</span>
        </button>
      </li>)}
    </ul>
    {!report.entries.length && <p>No Milestone or Success events in this phase.</p>}
  </section>;
}

function AnalyticalNode({ data, selected }) {
  return <EventCard data={data} selected={selected}>
    <Handle id="in" type="target" position={Position.Top} isConnectable={false} />
    <Handle id="out" type="source" position={Position.Bottom} isConnectable={false} />
  </EventCard>;
}
const nodeTypes = { analyticalEvent: AnalyticalNode };
const fitOptions = { minZoom: 0.65, maxZoom: 1, padding: 0.15 };

function AchievementGraph({ graph, layout, selectedId, highlight, onSelect }) {
  const nodes = useMemo(() => graph.nodes.map(node => ({ id: node.id, type: 'analyticalEvent', data: { ...node.data, chainHighlighted: highlight?.nodeIds.has(node.id) ?? false },
    position: layout.positions.get(node.id), width: 160, height: 96, selected: node.id === selectedId, draggable: false, connectable: false, deletable: false,
    className: highlight && !highlight.nodeIds.has(node.id) ? 'achievement-dimmed' : '', ariaLabel: `${node.data.kind}: ${node.data.mistake}` })), [graph, layout, selectedId, highlight]);
  const edges = useMemo(() => graph.edges.map(edge => {
    const active = highlight?.edgeIds.has(edge.id), dimmed = highlight && !active;
    return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: 'out', targetHandle: 'in', type: 'smoothstep',
      deletable: false, reconnectable: false, selectable: false, focusable: false,
      className: `${active ? 'achievement-path-edge' : ''}${dimmed ? ' achievement-dimmed' : ''}`,
      style: { stroke: active ? 'var(--accent)' : 'var(--edge)', strokeWidth: active ? 3 : 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? 'var(--accent)' : 'var(--edge)' } };
  }), [graph, highlight]);
  return <div className="achievement-graph" role="region" aria-label="Read-only achievement paths">
    <ReactFlowProvider><ReactFlow id="achievement-path-flow" nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
      selectionKeyCode={null} multiSelectionKeyCode={null} connectOnClick={false} zoomOnDoubleClick={false}
      onNodeClick={(_event, node) => onSelect(node.id)} onPaneClick={() => onSelect(null)}
      onNodesChange={changes => { const selection = changes.find(change => change.type === 'select' && change.selected); if (selection) onSelect(selection.id); }}
      fitView fitViewOptions={fitOptions} minZoom={0.1} maxZoom={2} panOnDrag zoomOnScroll={false} panOnScroll zoomOnPinch zoomActivationKeyCode="Control"
      preventScrolling={false} aria-label="Recorded achievement graph">
      <Controls showInteractive={false} fitViewOptions={fitOptions} />
    </ReactFlow></ReactFlowProvider>
  </div>;
}

export function AchievementDetails({ graph }) {
  const [selectedId, setSelectedId] = useState(null);
  const layout = useMemo(() => layoutAchievementGraph(graph), [graph]);
  const highlight = useMemo(() => selectedId ? achievementPathHighlight(graph, selectedId) : null, [graph, selectedId]);
  const selected = graph.index.byId.get(selectedId);
  return <div className="achievement-details">
    <h2 id="phase-list-title">Recorded achievement paths</h2>
    <div className="achievement-summary"><RecordedEvent node={graph.achievement} /><p><strong>Related Actions: {graph.actions.length}</strong></p></div>
    <p>Recorded paths show connections, not causal weights or required Actions.</p>
    <h3>Related Actions</h3>
    <ol className="achievement-actions" aria-label="Related Actions">
      {graph.actions.map(({ node, direct }) => <li key={node.id}>
        <button type="button" aria-pressed={selectedId === node.id} data-testid={`related-action-${node.id}`} onClick={() => setSelectedId(node.id)}>
          <strong>{node.data.mistake}</strong><span>{formatDate(node.data.time)} · {direct ? 'Direct' : 'Indirect-only'}</span>
        </button>
      </li>)}
    </ol>
    {!graph.actions.length && <p>No upstream Actions are recorded for this achievement.</p>}
    {!graph.edges.length && <p>No upstream connections are recorded.</p>}
    <h3>Recorded Paths</h3>
    <p>Drag to pan; use pinch, Ctrl + wheel or the zoom controls. Select a node for its original details; select an Action to highlight all its recorded paths.</p>
    {layout.hasCycles && <p>Recorded cycles are retained. Arrows within cycles may run sideways or upward; layers do not represent chronological order.</p>}
    <button type="button" disabled={!selectedId} onClick={() => setSelectedId(null)}>Clear selection</button>
    {selected && <section className="achievement-selected-event" aria-label="Selected recorded event"><h3>Selected event</h3><RecordedEvent node={selected} /></section>}
    <AchievementGraph graph={graph} layout={layout} selectedId={selectedId} highlight={highlight} onSelect={setSelectedId} />
  </div>;
}
