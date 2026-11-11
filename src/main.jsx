import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Handle, Position, BaseEdge, ConnectionMode, useReactFlow, useViewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { NODE_APPEARANCE, NODE_KINDS, limitDescription, localDateInput, nodeHeight } from './node-types.js';
import { creationTypeError } from './node-rules.js';
import { manualEdgePath } from './edge-routing.js';
import { useLocalDiagram } from './use-local-diagram.js';
import { MistakeOverview } from './MistakeOverview.jsx';
import { SettingsDialog } from './SettingsDialog.jsx';
import { AnalyticsPage } from './AnalyticsPage.jsx';
import { AppearanceProvider } from './AppearanceProvider.jsx';
import { initializeAppearance } from './appearance.js';
import { NODE_WIDTH, axisAnchors, canConnectNodes, connectNodes, createEvent, deleteNode, deleteEdge, formatDate, formatMonth, monthTicks, parseDate, projectTime, upstreamChain } from './model.js';

function EventNode({ data, selected }) {
  const appearance = NODE_APPEARANCE[data.kind];
  const shape = appearance.path;
  const height = nodeHeight({ data });
  const details = [data.kind, data.mistake, formatDate(data.time), data.description].filter(Boolean).join('\n');
  return <div className={`event-node nopan ${data.kind.toLowerCase()} ${selected ? 'is-selected' : ''}`} style={{ height }} title={details} data-shape={appearance.shape}>
    <svg className="node-geometry" viewBox={`0 0 160 ${height}`} aria-hidden="true">
      <path className="node-shape" d={shape} fill={appearance.fill} stroke={appearance.stroke} />
      {appearance.detail && <path className="node-detail" d={appearance.detail} stroke={appearance.stroke} />}
      {(selected || data.chainHighlighted) && <path className="selection-outline" d={shape} />}
    </svg>
    <div className="node-content"><strong>{data.kind}</strong><span className="node-mistake">{data.mistake}</span><span className="node-time">{formatDate(data.time)}</span></div>
    <Handle id="top" type="source" position={Position.Top} className="nodrag nopan" aria-label="Top connection point" />
    <Handle id="right" type="source" position={Position.Right} style={{ right: 160 - appearance.right }} className="nodrag nopan" aria-label="Right connection point" />
    <Handle id="left" type="source" position={Position.Left} style={{ left: appearance.left }} className="nodrag nopan" aria-label="Left connection point" />
  </div>;
}

function TimeEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const highlighted = data.highlighted;
  let path, labelX, labelY;
  if (data.manual) {
    [path, labelX, labelY] = manualEdgePath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  } else if (sourcePosition === Position.Top && targetX > sourceX && targetY < sourceY) {
    const r = Math.min(16, (targetX - sourceX) / 2, (sourceY - targetY) / 2);
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${targetY + r} Q ${sourceX} ${targetY} ${sourceX + r} ${targetY} L ${targetX} ${targetY}`;
    // Sibling edges share the vertical trunk; their horizontal runs occupy
    // separate rows, so labels there cannot pile up on top of one another.
    labelX = (sourceX + r + targetX) / 2;
    labelY = targetY;
  } else if (Math.abs(sourceY - targetY) < 1) {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = sourceY;
  } else {
    const midX = (sourceX + targetX) / 2;
    path = `M ${sourceX} ${sourceY} C ${midX} ${sourceY} ${midX} ${targetY} ${targetX} ${targetY}`;
    labelX = midX;
    labelY = (sourceY + targetY) / 2;
  }
  if (data.labelPosition) {
    labelX = data.labelPosition.x;
    labelY = data.labelPosition.y;
  }
  const markerId = `arrow-${id}`;
  return <>
    <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={highlighted ? 'var(--accent)' : 'var(--edge)'} /></marker></defs>
    <BaseEdge id={id} path={path} markerEnd={`url(#${markerId})`} interactionWidth={24} style={{ stroke: highlighted ? 'var(--accent)' : 'var(--edge)', strokeWidth: highlighted ? 3 : 1.6 }} />
    <g className={`edge-label ${highlighted ? 'highlighted' : ''}`} transform={`translate(${labelX},${labelY})`} data-testid={`label-${id}`}>
      <title>{data.days} {data.days === 1 ? 'day' : 'days'} elapsed</title>
      <rect x="-31" y="-23" width="62" height="46" rx="4" />
      <text textAnchor="middle"><tspan x="0" y="-3">{data.value}</tspan><tspan x="0" y="13">{data.unit}</tspan></text>
    </g>
  </>;
}

const nodeTypes = { event: EventNode };
const edgeTypes = { time: TimeEdge };

function TimeAxes({ nodes }) {
  const { x, y, zoom } = useViewport();
  const ticks = useMemo(() => monthTicks(nodes), [nodes]);
  const xs = useMemo(() => axisAnchors(nodes, 'x'), [nodes]);
  const ys = useMemo(() => axisAnchors(nodes, 'y'), [nodes]);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return <div className="axes" aria-label="Time axes">
    <div className="axis horizontal-axis" data-testid="horizontal-axis">{ticks.map(time => {
      const left = projectTime(time, xs) * zoom + x;
      return left >= 64 && left < size.width - 12 ? <span key={time} className="horizontal-tick" style={{ left }} data-month={formatMonth(time)} data-time={time}>{formatMonth(time)}</span> : null;
    })}</div>
    <div className="axis vertical-axis" data-testid="vertical-axis">{ticks.map(time => {
      const top = -projectTime(time, ys) * zoom + y;
      return top > 12 && top < size.height - 64 ? <span key={time} className="vertical-tick" style={{ top }} data-month={formatMonth(time)} data-time={time}>{formatMonth(time)}</span> : null;
    })}</div>
    <div className="axis-corner" />
  </div>;
}

function CreateDialog({ onCreate, onClose, selectedNode }) {
  const [kind, setKind] = useState(selectedNode?.data.kind === 'Mistake' ? 'Consequence' : 'Mistake');
  const [mistake, setMistake] = useState('');
  const [time, setTime] = useState(() => localDateInput());
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const mistakeError = error?.field === 'mistake';
  const dateError = error?.field === 'time';
  const typeError = error?.field === 'kind';
  const dialog = useRef(null);
  const typeField = useRef(null);
  useEffect(() => { dialog.current.showModal(); typeField.current.focus(); }, []);
  const submit = event => {
    event.preventDefault();
    if (!mistake.trim()) { setError({ message: `Enter ${kind === 'Action' ? 'an' : 'a'} ${kind.toLowerCase()}.`, field: 'mistake' }); document.getElementById('mistake').focus(); return; }
    const date = parseDate(time);
    if (date === null) { setError({ message: 'Enter a valid date in DD/MM/YY format.', field: 'time' }); document.getElementById('time').focus(); return; }
    const failure = onCreate({ kind, mistake, time: date, description });
    if (failure) {
      setError(failure); document.getElementById(failure.field).focus();
    }
  };
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="create-title" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const fields = [...dialog.current.querySelectorAll('select,input,textarea,button:not([hidden])')].filter(field => field.getClientRects().length);
    if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1).focus(); }
    if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0].focus(); }
  }}>
    <form onSubmit={submit}>
      <div className="dialog-heading"><h1 id="create-title">New node</h1><button type="button" className="close-dialog" aria-label="Close" onClick={onClose}>×</button></div>
      <label htmlFor="kind">Type</label>
      <select id="kind" ref={typeField} autoFocus required value={kind} onChange={e => { setKind(e.target.value); setError(null); }} aria-invalid={typeError} aria-describedby={typeError ? 'form-error' : undefined} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}>
        {NODE_KINDS.map(type => <option key={type} disabled={!!creationTypeError(type, selectedNode?.data.kind)}>{type}</option>)}
      </select>
      <label htmlFor="mistake">{kind}</label>
      <input id="mistake" required value={mistake} onChange={e => { setMistake(e.target.value); setError(null); }} aria-invalid={mistakeError} aria-describedby={mistakeError ? 'form-error' : undefined} autoComplete="off" />
      <label htmlFor="time">Time</label>
      <input id="time" required placeholder="DD/MM/YY" maxLength={8} value={time} onChange={e => { setTime(e.target.value); setError(null); }} aria-describedby={dateError ? 'form-error' : undefined} aria-invalid={dateError} autoComplete="off" inputMode="numeric" />
      <label htmlFor="description">Description</label>
      <textarea id="description" rows={4} placeholder="Optional, up to 500 characters" value={description} onChange={e => setDescription(limitDescription(e.target.value))} onKeyDown={event => {
        if (event.key === 'Enter' && event.ctrlKey && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.currentTarget.form.requestSubmit();
        }
      }} />
      {error && <p id="form-error" role="alert">{error.message}</p>}
      <p className="dialog-hint">Enter to create · Description: Enter for a new line, Ctrl+Enter to create · Esc to cancel</p>
      <button type="submit" className="create-submit">Create node</button>
    </form>
  </dialog>;
}

function Whiteboard() {
  const [graph, setGraph, saved, { undo, redo, importDiagram }] = useLocalDiagram();
  const [selectedId, setSelectedId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [chainRootId, setChainRootId] = useState(null);
  const [command, setCommand] = useState('');
  const [creating, setCreating] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const analyticsButton = useRef(null);
  const graphRef = useRef(graph);
  const selectedRef = useRef(selectedId);
  const highlightedRef = useRef(highlightedId);
  const commandRef = useRef('');
  const root = useRef(null);
  const flow = useReactFlow();
  graphRef.current = graph;
  selectedRef.current = selectedId;
  highlightedRef.current = highlightedId;
  const chain = useMemo(() => upstreamChain(graph, chainRootId), [graph, chainRootId]);
  const closeDialog = () => { setCreating(false); requestAnimationFrame(() => root.current?.focus()); };
  const openCreate = () => { commandRef.current = ''; setCommand(''); setCreating(true); };
  const replaceDiagram = imported => {
    importDiagram(imported);
    setSelectedId(null); setHighlightedId(null); setChainRootId(null);
    setOverviewOpen(false); setCreating(false); commandRef.current = ''; setCommand('');
  };

  useLayoutEffect(() => {
    const keydown = event => {
      if (analyticsOpen) return;
      if (event.target.closest?.('input,textarea,select,dialog,[contenteditable="true"]')) return;
      if (event.isComposing) return;
      if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'z') undo(); else redo();
        setSelectedId(null); setHighlightedId(null); setChainRootId(null);
        commandRef.current = ''; setCommand(''); return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Delete' && (selectedRef.current || highlightedRef.current)) {
        event.preventDefault();
        const deletedId = selectedRef.current;
        const deletedEdge = highlightedRef.current;
        setGraph(current => deletedId ? deleteNode(current, deletedId) : deleteEdge(current, deletedEdge));
        if (deletedId) setChainRootId(null);
        setSelectedId(null); setHighlightedId(null);
        return;
      }
      if (event.key === 'Escape') {
        commandRef.current = ''; setCommand(''); setSelectedId(null); setHighlightedId(null); setChainRootId(null); return;
      }
      if (event.key === '/') { event.preventDefault(); commandRef.current = '/'; setCommand('/'); }
      else if (event.key.toLowerCase() === 'n' && commandRef.current === '/') { event.preventDefault(); commandRef.current = '/n'; setCommand('/n'); }
      else if (event.key === 'Enter' && commandRef.current === '/n') {
        event.preventDefault(); openCreate();
      } else if (event.key === 'Backspace' && commandRef.current) {
        event.preventDefault(); commandRef.current = commandRef.current.slice(0, -1); setCommand(commandRef.current);
      } else if (event.key.length === 1 || event.key === 'Enter') { commandRef.current = ''; setCommand(''); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [undo, redo, setGraph, analyticsOpen]);

  const create = fields => {
    const rect = root.current.getBoundingClientRect();
    const center = flow.screenToFlowPosition({ x: rect.left + rect.width / 4, y: rect.top + rect.height / 2 });
    const firstPosition = { x: center.x - NODE_WIDTH / 2, y: center.y - nodeHeight({ data: fields }) / 2 };
    try {
      const next = createEvent(graphRef.current, { ...fields, selectedId: selectedRef.current, firstPosition, id: crypto.randomUUID() });
      setGraph(next);
      closeDialog();
      return '';
    } catch (error) {
      return { message: error.message, field: error.field ?? 'kind' };
    }
  };

  const nodes = useMemo(() => graph.nodes.map(n => ({
    ...n, height: nodeHeight(n), style: { ...n.style, height: nodeHeight(n) }, selected: n.id === selectedId,
    className: chain.nodeIds.has(n.id) ? 'chain-highlighted' : undefined,
    data: { ...n.data, chainHighlighted: chain.nodeIds.has(n.id) },
  })), [graph.nodes, selectedId, chain]);
  const edges = useMemo(() => graph.edges.map(e => ({
    ...e, selected: e.id === highlightedId,
    className: chain.edgeIds.has(e.id) ? 'chain-highlighted' : undefined,
    zIndex: e.id === highlightedId || chain.edgeIds.has(e.id) ? 1000 : 0,
    data: { ...e.data, highlighted: e.id === highlightedId || chain.edgeIds.has(e.id) },
  })), [graph.edges, highlightedId, chain]);
  return <><main className="whiteboard" ref={root} tabIndex={-1} aria-label="Timeline whiteboard"
    inert={analyticsOpen} aria-hidden={analyticsOpen ? true : undefined} style={analyticsOpen ? { visibility: 'hidden' } : undefined}
    onPointerDownCapture={event => {
      if (!chainRootId) return;
      const node = event.target.closest?.('.react-flow__node');
      const edge = event.target.closest?.('.react-flow__edge');
      if (!(node && chain.nodeIds.has(node.getAttribute('data-id'))) && !(edge && chain.edgeIds.has(edge.getAttribute('data-id')))) setChainRootId(null);
    }}
    onDoubleClickCapture={event => {
      const node = event.target.closest?.('.react-flow__node');
      if (!node) return;
      // Stop this node gesture before the viewport's native double-click zoom.
      event.preventDefault(); event.stopPropagation();
      const id = node.getAttribute('data-id');
      setChainRootId(id); setSelectedId(id); setHighlightedId(null);
    }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable edgesReconnectable={false} connectionMode={ConnectionMode.Loose}
      isValidConnection={connection => canConnectNodes(graphRef.current, connection)}
      onConnect={connection => setGraph(current => connectNodes(current, connection))}
      deleteKeyCode={null} multiSelectionKeyCode={null} selectionKeyCode={null}
      minZoom={0.15} maxZoom={3} autoPanOnNodeFocus={false} elevateEdgesOnSelect={false}
      panOnScroll panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch zoomActivationKeyCode="Control" zoomOnDoubleClick={false}
      onNodesChange={changes => {
        const selected = changes.find(c => c.type === 'select' && c.selected);
        if (selected) setSelectedId(selected.id);
      }}
      onNodeClick={(_, node) => { setSelectedId(node.id); setHighlightedId(null); }}
      onEdgeClick={(event, edge) => { event.stopPropagation(); setHighlightedId(current => current === edge.id ? null : edge.id); setSelectedId(null); }}
      onPaneClick={() => { setSelectedId(null); setHighlightedId(null); setChainRootId(null); }}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--grid)" />
      <TimeAxes nodes={graph.nodes} />
    </ReactFlow>
    {!graph.nodes.length && <div className="empty-hint">Tap <strong>+</strong> or type <kbd>/n</kbd> then <kbd>Enter</kbd> to create a node.</div>}
    {!!graph.nodes.length && <div className="keyboard-hint"><kbd>/n</kbd> + <kbd>Enter</kbd> creates a node{selectedId ? ' · Delete removes selected node' : highlightedId ? ' · Delete removes selected edge' : ''}</div>}
    <div className="board-tools">
      <button type="button" className="create-button" aria-label="Create node" aria-haspopup="dialog" onClick={openCreate}>+</button>
      <button type="button" className="overview-button" aria-haspopup="dialog" onClick={() => setOverviewOpen(true)}>Mistake overview</button>
      <button type="button" className="overview-button" ref={analyticsButton} onClick={() => { commandRef.current = ''; setCommand(''); setAnalyticsOpen(true); }}>Analytics</button>
    </div>
    <button type="button" className="settings-button" aria-label="Settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3Z" /><circle cx="12" cy="11" r="3" /></svg>
    </button>
    {saved && <div className="save-confirmation" role="status" aria-label="All changes saved locally" title="All changes saved locally">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>}
    {command && <div className="command" role="status">{command}<span>Enter</span></div>}
    {creating && <CreateDialog onCreate={create} onClose={closeDialog} selectedNode={graph.nodes.find(node => node.id === selectedId)} />}
    {overviewOpen && <MistakeOverview nodes={graph.nodes} edges={graph.edges} onClose={() => { setOverviewOpen(false); requestAnimationFrame(() => root.current?.focus()); }} />}
    {settingsOpen && <SettingsDialog getGraph={() => graphRef.current} onImport={replaceDiagram} onClose={() => { setSettingsOpen(false); requestAnimationFrame(() => root.current?.focus()); }} />}
  </main>
    {analyticsOpen && <AnalyticsPage nodes={graph.nodes} edges={graph.edges} onClose={() => {
      setAnalyticsOpen(false); requestAnimationFrame(() => analyticsButton.current?.focus());
    }} />}
  </>;
}

initializeAppearance();
createRoot(document.getElementById('root')).render(<React.StrictMode><AppearanceProvider><ReactFlowProvider><Whiteboard /></ReactFlowProvider></AppearanceProvider></React.StrictMode>);
