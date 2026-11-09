# Trace — Product Requirements Document

**Status:** Current-state baseline; latest requested rules/interactions verified locally · **Reviewed:** 9 November 2026

Purpose and proposed outcomes: [Product Brief](product-brief.md). Observable acceptance criteria: [User Stories](user-stories.md). Unresolved or potentially incorrect behavior: [Requirements Review](requirements-review.md). The requirements below describe **observed implementation**, unless explicitly marked otherwise; they do not silently convert code into approved policy.

## Scope and feature relationships

| ID | Functional scope | Dependencies / acceptance |
| --- | --- | --- |
| FR-01 | Record immutable dated events and arrange them automatically. | Form validation → type rules → layout → optional connection; US-01/02. |
| FR-02 | Create directed links, including permitted same-date links; inspect upstream chains; delete individual nodes/edges. | Existing events; shared type/date validation; node deletion removes incident edges only; US-03/04/05. |
| FR-03 | Persist content locally and restore it. | All successful graph mutations; independent of AI and navigation; US-06. |
| FR-04 | Cluster all recorded Mistakes and emphasize frequency. | Mistake/Description text → embeddings and, when applicable, cause profiles → grouping; US-07. |
| FR-05 | Compare recent/prior periods and trace upstream Actions. | Dates/types/edges yield facts without AI; cluster membership additionally enables semantic trends; US-08. |
| FR-06 | Generate optional, cited cluster hypotheses with cancellation. | Successful clustering → eligible cluster history → validated model output; US-09. Relevant text goes to cloud inference; the UI discloses this. |
| FR-07 | Undo/redo content changes, with exact graph snapshots and normal autosave. | Creates/deletes from FR-01/02; no viewport/selection history; US-10. |

Not implemented: visitor accounts, multiple-board management, shared editing, synchronization, cloud diagram storage, import/export, persisted undo history, event editing, manual positioning or clinical assessment. There is no approved roadmap for these capabilities.

## Business rules

### BR-01 — Event vocabulary and appearance

| Type | Observed appearance |
| --- | --- |
| Mistake | Red arrow-rectangle |
| Consequence | Orange rectangle, 160 × 96 canvas units; other node sizes unchanged |
| Action | Blue hexagon |
| Blocked | Yellow triangle |
| Goal | Light blue cylinder |
| Milestone | Light green diamond |
| Success | Dark green circle |

All types share the fields below. Precise semantic distinctions between Goal, Milestone and Success remain open; there is no completion-state model.

### BR-02 — Event data

Type, event text and Time are required. The text field label immediately matches the selected type; its persisted key remains `data.mistake` for compatibility. Text must contain non-whitespace characters and is trimmed on creation; it has no explicit maximum length. Description is an optional four-row textarea limited to **500 user-perceived characters** (grapheme clusters), not words. Enter inserts a newline there; Ctrl+Enter submits. Enter in other fields continues submitting, and Tab retains the field order. Dates accept real calendar days in strict `DD/MM/YY`, interpreted as 2000–2099. The default day is computer-local; persisted event days use UTC midnight to avoid time-of-day effects. Future dates are allowed. Cards are read-only after creation.

### BR-03 — Creation and connection eligibility

- Creating Consequence requires a selected Mistake or Action. Selecting Mistake permits creation only of Consequence.
- Directed edges from Mistake may target only Consequence; incoming edges to Consequence may originate only from Mistake or Action.
- Consequence may not have outgoing edges to Mistake, Milestone or Success. This is checked on the actual directed relationship in automatic and manual operations.
- Creating Consequence from a selected Mistake requires an equal or later date. An earlier date shows **“A Consequence must occur after the Mistake.”**, focuses Time, keeps the dialog open, and adds no node, edge or history entry. Equal dates remain allowed. No additional date restriction is imposed on creation from Action beyond the existing chronological/type rules.
- Different-date connections point from earlier to later regardless of drag/creation order. Selected creation also checks the resulting directed type pair. Selection is retained after successful creation.
- Equal dates retain requested direction (selection → new node for creation; drag source → target manually) and use the same directed type eligibility rules. They do not require a strictly earlier timestamp. A reversed same-date gesture cannot turn a forbidden Consequence → Mistake into an allowed arrow.
- Self-links, invalid endpoints/ports and duplicate directed pairs are rejected. Fan-out and merged incoming paths are supported. Placement references alone are not graph connections.

Different-date arrows remain earlier → later; reverse gestures are normalized before type checks. Nodes may remain disconnected after deletion; there is no mandatory-child invariant. Existing saved content is not automatically rewritten or purged for newly prohibited relationships; these rules govern new operations. Review statuses are recorded under **C-01/02/03**.

### BR-04 — Automatic placement

1. Unselected, duplicate date: stack above the highest existing node on that date, retaining that node's horizontal slot. Do not connect it.
2. Unselected, new date: use the closest **strictly earlier** existing date as placement reference; do not connect it. If no predecessor exists, create an independent earlier anchor using axis extrapolation.
3. Selected, new date: the selection is the reference. With no outgoing edges, keep its row; otherwise use a diagonal branch. Chronology/type checks still apply.
4. Selected, date already present anywhere in the graph: with outgoing edges, place above the highest directly connected outgoing target; when target dates differ, retain the new event's date column. With no outgoing edges, use the selected node's row and an available horizontal slot for the new date. Incoming edges do not count as outgoing edges. This override does **not** require the selection itself to share the date.

Spacing uses logarithmic time growth rather than day-proportional distance. At zoom 1, growth is `90 × ln(1 + |days| / 14)`; horizontal base spacing is 264. Vertical base spacing uses half the combined card heights plus 24 units (88 for two ordinary cards). Stacks retain a 24-unit gap. Different-height cards on the same row align by vertical center; collision checks, edge anchors and rulers account for the taller Consequence. Global constraints can enlarge distances and reflow nodes; formulas are not guaranteed final pairwise gaps. Missing tie-break and axis semantics decisions remain **A-01/02**.

### BR-05 — Time display

Edge labels use calendar days below one calendar month, calendar months below one year, then years; month/year fractions are rounded to two decimals. Same-date labels are zero days. Rulers show `MM/YY` markers at month starts for months represented by nodes, not every intervening month. They project from actual layout anchors, interpolating between dates and logarithmically extrapolating outside the anchors. Horizontal rows and same-date stacks make the vertical ruler a branch/layout reference rather than a universal exact date coordinate for every card; see **A-01**.

### BR-06 — Deletion and graph inspection

Deleting an edge changes only that relationship. Deleting a node immediately removes **only that node and its incoming/outgoing edges**. Every other node and unrelated edge remains, including shared and downstream nodes, with existing positions unchanged. There is no confirmation dialog; content undo/redo is available under BR-11. Incoming-chain highlighting still recursively includes the selected node and all ancestors/connecting edges, not descendants; traversal guards prevent repeated visits.

### BR-07 — Save boundary

Create/delete node or edge operations change the saved content snapshot. Save after **3 seconds without another content change**; selection, highlighting, zoom and pan are excluded. Restore graph content and layout metadata from the same browser profile/origin, not viewport or selection state. The checkmark represents a successfully persisted current snapshot. Invalid storage opens empty without immediate overwrite; failed writes withhold confirmation. There is no unload flush, automatic failure retry or multi-tab reconciliation (**B-02/03**, **M-02**).

### BR-08 — Mistake grouping

Only Mistake nodes participate; both text fields are normalized and combined. Equal combined texts join without inference. Otherwise, embeddings support complete-link grouping: a group merge requires compatibility across all member pairs. Cause profiles are attempted only when at least two unique records match implemented Vietnamese/English motivation cues. Quoted priorities must occur in source text; known matching overvalued-goal categories can override low surface similarity. Invalid/oversized causal profiles can keep records separate. A real member provides the group label. There is no manual reassignment or accuracy guarantee (**A-03**, **B-04**).

All-time clustering includes future-dated Mistakes. Its counts count records, not severity or proven behavior frequency. Presets change grouping thresholds; cloud presets use the same model. Cached analysis can reduce repeat inference, but caches are bounded and optional.

### BR-09 — Comparison and recorded relationships

Periods are fixed when the overview mounts. Let `end` be tomorrow's local calendar day; recent is `[end minus 2 calendar months, end)`, previous is `[recent start minus 2 calendar months, recent start)`. Each subtraction clamps to month end. On **9 November 2026**, these are **10 September–9 November** and **10 July–9 September**. Older/future events are excluded from period counts.

“Recurring” means at least two recent cluster members. “New in comparison” means a recent occurrence and none in the preceding period, even if older history exists. Change is the absolute count difference, not a rate or proof of improvement. Upstream Action traces follow valid non-backward directed paths through intermediate nodes, allow older Actions, deduplicate Actions, and show one discovered path per Action. A path is an association, not causation.

### BR-10 — Explanation scope and evidence

Eligibility requires at least one recent occurrence and at least two past/present Mistakes in a cluster, including older history. This differs from “recurring” in the trends table. All relevant Mistake/Description text is processed in bounded excerpts/collective summaries; graph edges and non-Mistake text are not hypothesis inputs. A final explanation references **2–4 distinct allowed records** and separates an observed-pattern model summary from a conditional hypothesis. Structured validation establishes reference membership and output bounds, not semantic truth. Prompts instruct against unsupported events, diagnoses or motives asserted as facts. Empty/invalid results do not justify an invented cause.

Valid completed findings can be cached and retained during partial failure/cancellation. Cancel/close/data changes invalidate active responses. Cloud cancellation is best effort, not guaranteed immediate provider resource release.

### BR-11 — Undo and redo

Ctrl+Z undoes the last content change; Ctrl+Y reapplies the last undone change. Each valid create/delete node or edge operation is one snapshot, including any automatic edge and layout reflow. Restore exact content, positions, IDs, metadata and relationships; do not rerun placement to reconstruct an old state. After undo, a real new content change discards redo history. Invalid/no-op operations, panning, zooming, selection and highlighting add no history. Shortcuts inside forms/text editors remain normal editing shortcuts. Selection/highlights clear on diagram undo/redo.

History is in memory for the current page session only. Undo/redo participates in the existing debounce; returning to an already saved snapshot needs no redundant write. Reload restores the latest saved diagram but starts empty history. Existing stored nodes keep their data/layout; display sizing adapts without a load-time storage migration.

### BR-12 — Viewport gestures

Ordinary wheel and two-finger scrolling pan in both axes: positive/downward or rightward input moves the canvas content downward or rightward. Dragging empty canvas still pans. Only Ctrl+wheel and supported browser trackpad pinch zoom; ordinary scrolling and double-clicking empty canvas do not zoom. Double-clicking a node still highlights its chain. Rulers track the resulting viewport. Neither panning nor zooming changes content, undo history or diagram autosave.

## Constraints and exceptions

| ID | Observed constraint / failure behavior |
| --- | --- |
| NFR-01 | React/React Flow browser UI; existing `trace` Worker serves static assets and same-origin API; optional Ollama is explicit local development only. No database or visitor authentication. |
| NFR-02 | Application sends only analysis text/context to inference, does not store diagrams on the backend, and avoids content logging. localStorage, including analysis caches, is not encrypted by this app. Browser/storage loss and shared-profile access remain limitations. |
| NFR-03 | Server fixes permitted models/parameters, validates bodies, limits payloads to 16 KiB and cluster input to 4,800 bytes. Configured limits: about 20 requests/minute/IP and 60/minute/location; one active request/IP and two/isolate. These are not strict global limits. |
| NFR-04 | Service/quota/network errors preserve graph use and factual analytics. Clustering failure prevents semantic trends/hypotheses; malformed output is rejected. Client request deadline is 90 seconds; cloud inference deadline is 60 seconds. No paid fallback is configured. Actual external account quotas are not reverified by this documentation review. |
| NFR-05 | Keyboard-first creation and graph ports imply a desktop workflow. Some accessible labels/focus handling exist; no accessibility conformance, supported-device matrix, scale target or service-level commitment is established. |

Proposed success measures are in the brief; numerical targets remain open. Deployment commands and provider quota references belong in [DEPLOYMENT.md](../DEPLOYMENT.md), not in the business acceptance baseline.

## Source and test map

- BR-01/02: [node vocabulary](../src/node-types.js), [form](../src/main.jsx); [form tests](../tests/browser/node-creation.spec.js).
- BR-03–06: [type rules](../src/node-rules.js), [graph/layout model](../src/model.js), [edge routes](../src/edge-routing.js); [model tests](../tests/model.test.js), [browser scenarios](../tests/browser/whiteboard.spec.js).
- BR-07: [storage validation](../src/persistence.js), [save hook](../src/use-local-diagram.js); [autosave scenarios](../tests/browser/autosave.spec.js).
- BR-11/12: [history](../src/diagram-history.js), [shortcuts/viewport](../src/main.jsx); [history tests](../tests/history.test.js), [interaction and legacy-data scenarios](../tests/browser/interaction-updates.spec.js).
- BR-08: [pipeline](../src/ollama.js), [grouping](../src/mistake-clusters.js), [cause gating](../src/behavior-patterns.js), [presets](../src/embedding-models.js); [clustering tests](../tests/clustering.test.js).
- BR-09/10: [reports](../src/progress-analytics.js), [explanations](../src/progress-explanations.js), [UI](../src/ProgressAnalytics.jsx), [prompt](../shared/cluster-prompt.js); [report tests](../tests/progress.test.js), [explanation tests](../tests/cluster-explanations.test.js).
- NFRs: [public Worker](../worker/site.js), [inference](../worker/index.js), [validation](../worker/input.js), [configuration](../wrangler.jsonc), [local transport](../src/local-ollama-chat.js); [backend tests](../tests/worker.test.js), [production scenarios](../tests/cloud-browser/production.spec.js).
