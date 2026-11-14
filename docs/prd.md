# Trace — Product Requirements Document

**Status:** Current-state baseline including Consequence Chain Analysis · **Reviewed:** 14 November 2026

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
| FR-08 | Back up and replace the complete diagram using local, versioned JSON. | Settings → export live state or validate/confirm/persist one import; independent of AI; US-11. |
| FR-09 | Review fixed two-calendar-month event counts and ranked downstream relationships. | Live graph → calendar phase → seven selectable bars/lists; no inference; US-12. |
| FR-10 | Choose Light, Dark or System appearance independently of diagram content. | Settings → browser preference → shared UI theme; US-13. |
| FR-11 | Review time from a Consequence to its first completed recorded Action and inspect the actual journey. | FR-09's phase/layout + directed graph + device-local day → measured/unmeasured cases; US-14. |
| FR-12 | Rank phase Mistakes by consecutive Consequence depth and inspect one longest chain, distinct total and duration. | FR-09's phase/layout and shared graph totals; independent of AI and reaction completion eligibility; US-15. |

Not implemented: visitor accounts, multiple-board management, shared editing, synchronization, cloud diagram storage, encrypted/automatic backups, persisted undo history, event editing, manual positioning or clinical assessment. There is no approved roadmap for these capabilities.

## Business rules

### BR-01 — Event vocabulary and appearance

| Type | Observed appearance |
| --- | --- |
| Mistake | Red arrow-rectangle |
| Consequence | Orange rectangle |
| Action | Blue hexagon |
| Blocked | Yellow triangle |
| Goal | Light blue cylinder |
| Milestone | Light green diamond |
| Success | Dark green circle |

All seven types use a **160 × 96** layout box and retain their shapes/colors. Polygon corners have subtle rounding; Goal stays cylindrical and Success stays circular. Main text displays up to two lines with visual truncation for overflow; the full stored text and hover details are unchanged. All types share the fields below. Precise Goal/Milestone/Success definitions remain open; no completion-state model exists.

### BR-02 — Event data

The **+** button beside Mistake overview and `/n` then Enter open the same dialog with the same selection context and validation. The button has a 44-unit tap target; mobile/coarse-pointer layouts expose the existing form's submit button. Type, event text and Time are required. The text label follows Type; storage still uses `data.mistake`. Non-whitespace text is trimmed on creation with no explicit maximum. Description is an optional four-row textarea capped at **500 grapheme clusters**, not words. Enter inserts a newline there; Ctrl+Enter submits. Enter submits from other fields; Tab retains order. Dates are valid `DD/MM/YY` days in 2000–2099, defaulting to computer-local today and stored as UTC midnight. Future dates remain allowed; cards are read-only.

### BR-03 — Creation and connection eligibility

- Creating Consequence requires a selected Mistake, Action **or Consequence**. Selecting Mistake still permits creation only of Consequence.
- Mistake may point only to Consequence; Consequence may receive from Mistake, Action or Consequence. Consequence → Consequence is valid manually and automatically under the same date/layout rules.
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

Spacing uses logarithmic time growth rather than day-proportional distance. At zoom 1, growth remains `90 × ln(1 + |days| / 14)`; horizontal base spacing remains 264. Vertical base spacing is **128**: 96-unit cards plus a **32-unit clear gap**, applied consistently to stacks and vertical collision clearance. Row alignment, collision checks, edge anchors and rulers use actual card dimensions. Global constraints can enlarge distances and reflow nodes; formulas are not guaranteed final pairwise gaps. Missing tie-break and axis semantics decisions remain **A-01/02**.

### BR-05 — Time display

Edge labels use calendar days below one calendar month, calendar months below one year, then years; month/year fractions are rounded to two decimals. Same-date labels are zero days. Rulers show `MM/YY` markers at month starts for months represented by nodes, not every intervening month. They project from actual layout anchors, interpolating between dates and logarithmically extrapolating outside the anchors. Horizontal rows and same-date stacks make the vertical ruler a branch/layout reference rather than a universal exact date coordinate for every card; see **A-01**.

### BR-06 — Deletion and graph inspection

Deleting an edge changes only that relationship. Deleting a node immediately removes **only that node and its incoming/outgoing edges**. Every other node and unrelated edge remains, including shared and downstream nodes, with existing positions unchanged. There is no confirmation dialog; content undo/redo is available under BR-11. Incoming-chain highlighting still recursively includes the selected node and all ancestors/connecting edges, not descendants; traversal guards prevent repeated visits.

### BR-07 — Save boundary

Create/delete node or edge operations change the saved content snapshot. Save after **3 seconds without another content change**; selection, highlighting, zoom and pan are excluded. Restore graph content and layout metadata from the same browser profile/origin, not viewport or selection state. Older shorter-card layouts are reflowed on open under BR-11, without a load-time save. The checkmark represents a successfully persisted/restored content snapshot. Invalid storage opens empty without immediate overwrite; failed writes withhold confirmation. There is no unload flush, automatic failure retry or multi-tab reconciliation (**B-02/03**, **M-02**).

### BR-08 — Mistake grouping

Only Mistake nodes participate; both text fields are normalized and combined. Equal combined texts join without inference. Otherwise, embeddings support complete-link grouping: a group merge requires compatibility across all member pairs. Cause profiles are attempted only when at least two unique records match implemented Vietnamese/English motivation cues. Quoted priorities must occur in source text; known matching overvalued-goal categories can override low surface similarity. Invalid/oversized causal profiles can keep records separate. A real member provides the group label. There is no manual reassignment or accuracy guarantee (**A-03**, **B-04**).

All-time clustering includes future-dated Mistakes. Its counts count records, not severity or proven behavior frequency. Presets change grouping thresholds; cloud presets use the same model. Cached analysis can reduce repeat inference, but caches are bounded and optional.

### BR-09 — Comparison and recorded relationships

The existing **Mistake overview → Recent progress** retains rolling periods, fixed when the overview mounts. Let `end` be tomorrow's local calendar day; recent is `[end minus 2 calendar months, end)`, previous is `[recent start minus 2 calendar months, recent start)`. Each subtraction clamps to month end. On **9 November 2026**, these are **10 September–9 November** and **10 July–9 September**. Older/future events are excluded from those period counts. The separate Analytics page follows BR-14 instead.

“Recurring” means at least two recent cluster members. “New in comparison” means a recent occurrence and none in the preceding period, even if older history exists. Change is the absolute count difference, not a rate or proof of improvement. Upstream Action traces follow valid non-backward directed paths through intermediate nodes, allow older Actions, deduplicate Actions, and show one discovered path per Action. A path is an association, not causation.

### BR-10 — Explanation scope and evidence

Eligibility requires at least one recent occurrence and at least two past/present Mistakes in a cluster, including older history. This differs from “recurring” in the trends table. All relevant Mistake/Description text is processed in bounded excerpts/collective summaries; graph edges and non-Mistake text are not hypothesis inputs. A final explanation references **2–4 distinct allowed records** and separates an observed-pattern model summary from a conditional hypothesis. Structured validation establishes reference membership and output bounds, not semantic truth. Prompts instruct against unsupported events, diagnoses or motives asserted as facts. Empty/invalid results do not justify an invented cause.

Valid completed findings can be cached and retained during partial failure/cancellation. Cancel/close/data changes invalidate active responses. Cloud cancellation is best effort, not guaranteed immediate provider resource release.

### BR-11 — Undo and redo

Ctrl+Z undoes the last content change; Ctrl+Y reapplies the last undone change. Each valid create/delete node or edge operation is one snapshot, including any automatic edge and layout reflow. Restore exact content, positions, IDs, metadata and relationships; do not rerun placement to reconstruct an old state. After undo, a real new content change discards redo history. Invalid/no-op operations, panning, zooming, selection and highlighting add no history. Shortcuts inside forms/text editors remain normal editing shortcuts. Selection/highlights clear on diagram undo/redo.

History is in memory for the current page session only. Undo/redo participates in the debounce; returning to an already saved snapshot needs no redundant write. Reload starts empty history. Successful import also starts a fresh history and cannot be undone into the overwritten diagram. Older short-card layouts adapt while preserving event fields, IDs and relationships; restoration itself adds no save/history entry. The next genuine save records a layout marker so current-layout deletion survivors keep their positions after reload.

### BR-12 — Viewport gestures

Ordinary wheel and two-finger scrolling pan in both axes. The previous sign inversion is removed: native scroll deltas pan the viewport in the opposite delta direction, matching the user's reported natural trackpad mapping. With that mapping, fingers down/up/right/left move the canvas down/up/right/left. Finger motion and raw browser scroll-delta signs must not be confused. Dragging empty canvas still pans. Only Ctrl+wheel and supported browser trackpad pinch zoom; ordinary scrolling and double-clicking empty canvas do not zoom. Rulers remain synchronized. Navigation changes neither content, undo history nor diagram autosave.

### BR-13 — Portable local backup

The bottom-right Settings gear contains **Export Data**, **Import Data**, the required plaintext-backup privacy notice and **Appearance** under BR-15. Backup behavior is unchanged: export includes the live diagram's pending unsaved edits in one versioned UTF-8 JSON serialization. It preserves event data, IDs, positions, layout metadata, ports and edge labels; durations/renderer defaults are recalculated. UI state, appearance, panel widths, history, caches, credentials and temporary analytics are excluded. Native save-location selection is used where available, otherwise standard download; native cancellation does not download. No network/inference is used.

Import reads/decodes/parses once, validates the whole file and prepares a graph in memory. Confirmation explicitly replaces rather than merges and clears prior history. Commit saves one complete localStorage snapshot before replacing the displayed diagram, invalidates older pending autosaves, and clears selection/highlights. Invalid, canceled or storage-failed imports leave current content and saved data intact; storage failure also preserves pending ordinary autosave/history. Success follows persistence, not merely file selection. No per-node saves or automatic AI analyses occur.

Schema 1 supports current exact coordinates and known older layout adaptation. Essential unknown fields/versions, broken endpoints, duplicates, invalid types/dates/text/coordinates and unsupported relationships are rejected. Known historical Consequence → Mistake/Milestone/Success records require an explicit supported compatibility marker and remain recorded data; new links still obey current rules. The file limit is 25 MiB; browser storage may be smaller. See [Backup schema](backup-schema.md) for fields, compatibility and failure rules.

### BR-14 — Fixed-phase Analytics page

The whiteboard's **Analytics** button opens a read-only page, initially 60% chart / 40% list on desktop. A vertical divider supports mouse/touch dragging in either direction and keyboard Left/Right, Home/End. Minimum widths take precedence over the ratio: 320px chart and 280px details. Content wraps within resized panels. On screens up to 700px wide, panels stack and the divider is hidden. Width choice lasts only while this page is open; reopening starts at 60/40 subject to minimums. Resizing changes neither graph/history nor the autosave deadline. Back to whiteboard preserves graph content, viewport and history. **2 Months** is the only implemented tab; **6 Months**, **1 Year** and **Custom** are visible but disabled.

Use the device-local date to select January–February, March–April, May–June, July–August, September–October or November–December. Internally use `[first odd-month day, first day after the even month)` against recorded calendar-day timestamps. The displayed range includes the even month's final day. Include every event in both complete months, even if future-dated relative to today; exclude other phases. Refresh an open page at local midnight or when returning to the tab. November 11 and December 12, 2026 both select November 1–December 31; January 1, 2027 selects January–February 2027.

Seven bars show exact phase counts in whiteboard colors. Selecting a bar shows only that type's phase records with complete main text, date and optional Description; zero counts remain selectable with an empty message. Initially select Mistake. Other five types use simple chronological lists without rankings/gradients.

The left panel contains the period tabs, event-count chart, Reaction Time Analysis and then Consequence Chain Analysis. Selecting a reaction case or chain Mistake replaces the existing right-panel list with its details; selecting any chart bar restores its type list. The most recent selection across all three views wins and is visibly selected. No additional columns, popup or page are introduced; the existing divider, themes and narrow-screen stacking remain.

For each phase Mistake, count distinct downstream Consequence nodes; for each phase Consequence, count distinct downstream Action nodes. Follow all recorded outgoing paths through intermediate types **across phase boundaries**. Deduplicate targets per starting node, exclude the start and unrelated nodes, ignore broken endpoint references, and guard cycles. Do not repair/filter historical recorded relationships using today's creation rules. Sort descending by count, then ascending event date and ID for ties. These counts express recorded associations, not severity or causation.

Each ranked list has one continuous theme-aware red/orange gradient on its entire container, with no individual item gradients. Light mode retains the red/orange-to-light appearance; Dark uses darker shades with light text. Calculations use deterministic local JavaScript; page interactions do not invoke AI, mutate the graph or enter history/reset autosave. Existing rolling reports, connection rules and persistence remain unchanged.

### BR-15 — Appearance preference

Settings offers **Light**, **Dark** and **System**. Selection applies immediately across the board, grid, axes, arrows, highlights, dialogs, controls, overview and Analytics. Light retains the light palette; Dark changes UI surfaces/text/borders while preserving the seven node fills and readable node text. Chart fills keep their corresponding node colors, and ranked gradients adapt with the theme.

System follows `prefers-color-scheme` at startup and on live system changes. Explicit Light/Dark override it. Default to System when no valid preference exists. Persist only the chosen mode under `trace.appearance.v1`, separate from diagram data, backups and history. Preference changes never trigger diagram autosave or reset a pending save. If preference storage fails, apply the mode for this session and report that it could not be saved; diagram persistence remains independent. No new inference or backend configuration is involved.

### BR-16 — Time to First Recorded Action

Include Consequences inside the current fixed phase whose recorded calendar date is no later than the device-local today. For each, follow outgoing links across the whole graph and choose the reachable Action with the earliest date satisfying **Consequence date ≤ Action date ≤ today**. Calendar-day differences use the recorded UTC calendar dates, not local elapsed hours. Same-day responses are **0 days**. Chart counts under BR-14 still include the whole phase, including future records.

Reaction journeys ignore broken references, invalid dates/types and backward-dated links so each displayed path is both an actual directed path and chronological. Same-date cycles and duplicate paths terminate through visited IDs. Existing creation rules/data and BR-14's general reachability rankings are unchanged. Equal-date Actions use ascending stable ID order; the journey uses a fewest-edge path found by BFS, with neighbors ordered by date then ID for deterministic alternatives.

Measured cases sort by descending days, then Consequence date and ID. Each selectable row shows shortened Consequence text, both dates, exact days and orange/blue markers. Bar lengths share one linear scale within the measured list; zero-day markers coincide as an orange ring/blue center and explicitly say Same day. Unmeasured cases have **null**, not zero, duration and appear separately under **No Recorded Follow-up Action**. A qualifying future Action is identified as future-dated, never completed. Future Consequences are excluded from both groups.

Details show full original type/date/text/Description for the Consequence, chosen Action and every intermediate event on the selected path, with per-step day gaps and node colors. Missing descriptions and follow-ups use neutral messages. Trace neither judges longer times as worse nor infers a reason for the interval or a decision date; recorded wording is shown without deciding whether it explains the delay.

Calculations share a graph index with existing phase analytics and are memoized by graph content, phase and local calendar day. Case/bar selection, panel resizing, theme changes and board pan/zoom do not traverse the graph again or save derived statistics. Local midnight/focus refreshes completion eligibility even within the same phase. No new fields, inference, persistence or graph mutations are introduced.

Only the current phase is selectable in the UI. The calculator accepts an explicit phase, and the December 28 → January 3 six-day example is verified with a November–December phase and an as-of date after January 3; historical-phase navigation is not added in this iteration.

### BR-17 — Consequence Chain Analysis

Include starting Mistakes in the entire current fixed phase, including future dates within it. Consequences may lie in any phase or after today. This is structural analysis of recorded connections, unlike BR-16's completed-response filter. Use three separate metrics:

| Metric | Definition |
| --- | --- |
| Chain Depth | Maximum count of consecutive Consequence nodes after the starting Mistake. Stop each path at its first non-Consequence, including another Mistake. Parallel branches do not add depth. No direct Consequence means depth 0. |
| Total Consequences | Distinct reachable Consequences through any recorded directed path, including intermediate types; reuse BR-14's count. Merges/cycles never double-count. This can be positive even at depth 0. |
| Chain Duration | Calendar days from the Mistake to the last Consequence on the selected longest chain. Depth 0 has no duration; a valid same-day chain has 0 days. |

Choose the deepest chain, then the latest final Consequence date, then ascending lexicographic stable node-ID path order. Duration never uses a later event from a shorter/unrelated branch. Rank Mistakes by descending depth, descending total, ascending Mistake date and ID. One fixed-size orange segment represents each depth level, with the exact numeric value; large bars scroll inside the panel. Depth 0 has no filled segments.

Selection shows complete Mistake text/date and the three labeled metrics, then the Mistake and every Consequence on the chosen path in actual arrow order. Show full original text, dates and available multiline Descriptions, with red Mistake/orange Consequence markers. Missing descriptions and depth-zero cases have neutral messages; never invent a chain or interpret depth as severity, hidden cause or proof of causation.

Ignore broken references during traversal. Preserve structural depth and actual path order for invalid/backward legacy dates, explicitly warn, and withhold duration rather than taking an absolute value. Invalid endpoint dates rank below valid dates when selecting equal-depth chains. If a consecutive Consequence cycle is reachable from a root, depth/duration are **unavailable**, not zero; retain the distinct total and original Mistake without claiming a longest chain. Sort these unavailable cases after computed depths. This conservative cycle policy avoids arbitrary cutoffs or exponential simple-path searches; unrelated cycles beyond non-Consequence nodes do not invalidate depth.

Share indexed adjacency and existing totals; compute acyclic tails iteratively and reconstruct only the selected path. Memoize by graph content and phase boundaries, not selection, resizing, appearance or viewport changes. No derived metrics enter saved data, backups, undo history or AI requests. Historical-phase navigation and displaying every tied path remain outside scope.

## Constraints and exceptions

| ID | Observed constraint / failure behavior |
| --- | --- |
| NFR-01 | React/React Flow browser UI; existing `trace` Worker serves static assets and same-origin API; optional Ollama is explicit local development only. No database or visitor authentication. |
| NFR-02 | Application sends only analysis text/context to inference, does not store diagrams on the backend, and avoids content logging. localStorage, including analysis caches, is not encrypted by this app. Browser/storage loss and shared-profile access remain limitations. |
| NFR-03 | Server fixes permitted models/parameters, validates bodies, limits payloads to 16 KiB and cluster input to 4,800 bytes. Configured limits: about 20 requests/minute/IP and 60/minute/location; one active request/IP and two/isolate. These are not strict global limits. |
| NFR-04 | Service/quota/network errors preserve graph use and factual analytics. Clustering failure prevents semantic trends/hypotheses; malformed output is rejected. Client request deadline is 90 seconds; cloud inference deadline is 60 seconds. No paid fallback is configured. Actual external account quotas are not reverified by this documentation review. |
| NFR-05 | Desktop keyboard and mobile/touch creation share one form. Mobile-emulated tap/submit tests pass; no full device matrix or accessibility conformance claim is established. |
| NFR-06 | Backup preparation uses indexed O(nodes + edges) structure/relationship checks for current layouts; legacy reflow reuses existing layout logic. Processing and graph rendering are synchronous and can pause large-diagram UI. No added backend, library, compression or encryption. |

Proposed success measures are in the brief; numerical targets remain open. Deployment commands and provider quota references belong in [DEPLOYMENT.md](../DEPLOYMENT.md), not in the business acceptance baseline.

## Source and test map

- BR-01/02: [node vocabulary](../src/node-types.js), [form](../src/main.jsx); [form tests](../tests/browser/node-creation.spec.js).
- BR-03–06: [type rules](../src/node-rules.js), [graph/layout model](../src/model.js), [edge routes](../src/edge-routing.js); [model tests](../tests/model.test.js), [browser scenarios](../tests/browser/whiteboard.spec.js).
- BR-07: [storage validation](../src/persistence.js), [save hook](../src/use-local-diagram.js); [autosave scenarios](../tests/browser/autosave.spec.js).
- BR-11/12: [history](../src/diagram-history.js), [shortcuts/viewport](../src/main.jsx); [history tests](../tests/history.test.js), [interaction and legacy-data scenarios](../tests/browser/interaction-updates.spec.js).
- BR-13: [backup codec](../src/backup.js), [settings](../src/SettingsDialog.jsx), [commit coordination](../src/use-local-diagram.js); [schema tests](../tests/backup.test.js), [backup browser tests](../tests/browser/backup.spec.js), [mobile/readability tests](../tests/browser/usability-updates.spec.js).
- BR-14: [fixed phases and traversal](../src/phase-analytics.js), [page](../src/AnalyticsPage.jsx); [calculation tests](../tests/phase-analytics.test.js), [interaction tests](../tests/browser/phase-analytics.spec.js).
- BR-14/15: [panel limits](../src/analytics-layout.js), [appearance preference](../src/appearance.js), [provider](../src/AppearanceProvider.jsx), [theme styles](../src/styles.css); [logic tests](../tests/appearance-layout.test.js), [mouse/touch/theme regressions](../tests/browser/appearance-layout.spec.js).
- BR-16: [shared graph index](../src/recorded-graph.js), [reaction calculations](../src/reaction-time.js), [list/journey](../src/ReactionTimeAnalysis.jsx); [calculation tests](../tests/reaction-time.test.js), [UI regressions](../tests/browser/reaction-time.spec.js).
- BR-17: [chain calculation](../src/consequence-chains.js), [ranking/timeline](../src/ConsequenceChainAnalysis.jsx); [graph/date/tie tests](../tests/consequence-chains.test.js), [selection/layout/safety tests](../tests/browser/consequence-chains.spec.js).
- BR-08: [pipeline](../src/ollama.js), [grouping](../src/mistake-clusters.js), [cause gating](../src/behavior-patterns.js), [presets](../src/embedding-models.js); [clustering tests](../tests/clustering.test.js).
- BR-09/10: [reports](../src/progress-analytics.js), [explanations](../src/progress-explanations.js), [UI](../src/ProgressAnalytics.jsx), [prompt](../shared/cluster-prompt.js); [report tests](../tests/progress.test.js), [explanation tests](../tests/cluster-explanations.test.js).
- NFRs: [public Worker](../worker/site.js), [inference](../worker/index.js), [validation](../worker/input.js), [configuration](../wrangler.jsonc), [local transport](../src/local-ollama-chat.js); [backend tests](../tests/worker.test.js), [production scenarios](../tests/cloud-browser/production.spec.js).
