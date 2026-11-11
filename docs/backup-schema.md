# Trace backup format

**Format:** `trace-whiteboard` · **Schema:** 1 · **Reviewed:** 10 November 2026

A backup is one UTF-8 JSON file, processed entirely in the browser. It contains the current live diagram, including edits still waiting for autosave. It contains no model caches, analysis results, selection, viewport, popup state, undo history, credentials or application configuration. Backups are **not encrypted**; store them securely.

## Structure

```json
{
  "format": "trace-whiteboard",
  "schemaVersion": 1,
  "exportedAt": "2026-11-10T08:00:00.000Z",
  "diagram": {
    "layoutVersion": 2,
    "nodes": [{
      "id": "a1",
      "kind": "Action",
      "time": 1794268800000,
      "mistake": "Take time to review my technique",
      "description": "First line\nSecond line",
      "position": { "x": 240, "y": 600 },
      "placement": {
        "mode": "origin",
        "columnOffset": 0,
        "origin": { "x": 240, "y": 600 }
      }
    }],
    "edges": []
  }
}
```

`mistake` remains the internal text key for all seven kinds, even though its form label matches Type. `time` is an integer UTC-midnight epoch timestamp representing a calendar date, not a time-of-day event. Empty node/edge arrays are valid.

### Envelope and diagram

All four envelope fields and all three diagram fields shown above are required. `exportedAt` must be a valid canonical UTC ISO timestamp. `schemaVersion` is independent of the application release and layout versions. Layout 2 preserves exact current coordinates; known layout 1 uses the existing shorter-card reflow before import. Other versions and unknown fields are rejected clearly instead of guessed or silently dropped.

### Nodes

| Required field | Validation |
| --- | --- |
| `id` | Nonempty string, up to 256 characters, no whitespace; unique among nodes. |
| `kind` | Mistake, Consequence, Action, Blocked, Goal, Milestone or Success. |
| `time` | Real UTC calendar day from 2000 through 2099, finite number with no fractional day. |
| `mistake` | Non-whitespace text. Complete content is preserved, including text exceeding the two-line display. |
| `description` | String, possibly empty/multiline; at most 500 user-perceived characters, including combined accents/emoji. |
| `position` | Object with finite numeric `x` and `y`. |
| `placement` | Required `mode`: `origin`, `row`, `diagonal`, `stack` or `selected-stack`. |

Optional placement fields are `referenceId` (ID string), `columnOffset` (finite number), `origin` (finite x/y point) and `selectedSameDate` (boolean). A placement reference may point to a deleted node: individual deletion intentionally preserves survivor metadata. Edge endpoints, unlike placement references, must exist. Layout 1 may additionally carry node `height` of 64 or 96 for the known compatibility calculation; layout 2 derives the current dimensions and does not store them.

### Edges

| Field | Requirement |
| --- | --- |
| `id`, `source`, `target` | Required ID strings. Edge IDs are unique; both endpoints must exist and differ. Duplicate directed pairs are rejected. |
| `sourceHandle`, `targetHandle` | Required: `top`, `left` or `right`. |
| `manual` | Required boolean preserving manual versus automatic routing. |
| `labelPosition` | Optional finite x/y point or null. Retained to preserve label placement without expensive route reconstruction. |
| `compatibility` | Optional, only `legacy-consequence-v1`; see below. |

Dates must be nondecreasing along every edge. Same-date cycles are not prohibited by this schema; existing graph traversal guards handle repeated visits. Duration values/units, renderer type, dimensions, interaction flags and accessible labels are reconstructed. Import does not create nodes through the normal node-creation workflow or rearrange compatible coordinates.

### Historical relationships

Current relationship rules include Consequence → Consequence. Known older graphs may also contain Consequence → Mistake/Milestone/Success, which were previously permitted. Export explicitly tags those recorded edges `"compatibility": "legacy-consequence-v1"`. Import preserves them only with that marker and the matching known historical pair. The marker does not bypass date, endpoint, self-link, duplicate or structural checks, and is not proof of file provenance. Unsupported legacy claims and other invalid type pairs are rejected. New interactive links still follow current rules.

## Local save and restore flow

Export maps nodes/edges once, validates essential fields and serializes the complete diagram once. Filename: `trace-backup-YYYY-MM-DD-HHMMSS.json`, using device-local time. A native save picker is used when available; unsupported/blocked pickers fall back to a browser download. Canceling a native picker does not start a download. Download fallback confirms initiation, not that a user has stored a durable copy. [Browser API behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker).

Import checks the 25 MiB file limit, decodes UTF-8 strictly, parses once and validates the entire structure using indexed IDs. It then prepares a graph in memory and asks for confirmation, including node/edge counts. Cancel/invalid data changes nothing. Confirmation synchronously writes the complete localStorage snapshot **before** replacing the live graph, cancels the previous autosave deadline and clears history/selection/highlights. A failed storage write leaves the old live diagram, saved data, pending autosave and history intact. Success is displayed only after commit. Subsequent ordinary changes retain the existing 3-second debounce.

No import/export operation starts clustering or inference. Caches remain local and are not included in the file; the user can request analytics normally after import.

## Versioning and limitations

`src/backup.js` has an explicit reader registry. Currently only schema 1 is supported. A future schema needs its own complete validator and an explicit migration to the current graph before confirmation/commit. Do not implement speculative migration, rewrite IDs, reinterpret unknown essential fields or confuse the localStorage wrapper with a Trace backup. Raw localStorage JSON is not the portable backup format.

Processing is synchronous after the file has been read. Very large diagrams can pause the UI, and rendering a restored graph can take longer than parsing it. The file limit does not guarantee available browser storage; storage failures are reported without replacing current data. Existing multi-tab conflicts, lack of automatic cloud backup and session-only undo remain unchanged.

Tests: [schema and integrity](../tests/backup.test.js), [browser safety](../tests/browser/backup.spec.js). Repeat CPU measurements with `node tests/backup-performance.mjs`; the browser test also reports native-browser timings and a 1,000-node render/Close check. Measurements describe the tested machine and fixtures, not a performance guarantee.

### Measured sample (10 November 2026)

One headless Edge browser run used synthetic mixed-type chains and excluded graph generation from CPU timing:

| Nodes / edges | Export processing | Parse/validate/reconstruct |
| --- | --- | --- |
| 100 / 99 | 3.1 ms | 4.2 ms |
| 1,000 / 999 | 15.7 ms | 21.2 ms |
| 10,000 / 9,999 | 152.6 ms | 183.8 ms |

An automated 1,000-node confirmation → persistence/render → responsive Close check took **2.80 seconds**, including automation overhead. These are observations, not an improvement claim or target. Rendering can dominate processing time; no worker/parser/rendering optimization was added based solely on these prototype measurements.
