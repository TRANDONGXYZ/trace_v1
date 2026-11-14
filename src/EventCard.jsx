import React from 'react';
import { NODE_APPEARANCE, nodeHeight } from './node-types.js';
import { formatDate } from './model.js';

export function EventCard({ data, selected, children }) {
  const appearance = NODE_APPEARANCE[data.kind], shape = appearance.path, height = nodeHeight({ data });
  const details = [data.kind, data.mistake, formatDate(data.time), data.description].filter(Boolean).join('\n');
  return <div className={`event-node nopan ${data.kind.toLowerCase()} ${selected ? 'is-selected' : ''}`} style={{ height }} title={details} data-shape={appearance.shape}>
    <svg className="node-geometry" viewBox={`0 0 160 ${height}`} aria-hidden="true">
      <path className="node-shape" d={shape} fill={appearance.fill} stroke={appearance.stroke} />
      {appearance.detail && <path className="node-detail" d={appearance.detail} stroke={appearance.stroke} />}
      {(selected || data.chainHighlighted) && <path className="selection-outline" d={shape} />}
    </svg>
    <div className="node-content"><strong>{data.kind}</strong><span className="node-mistake">{data.mistake}</span><span className="node-time">{formatDate(data.time)}</span></div>
    {children}
  </div>;
}
