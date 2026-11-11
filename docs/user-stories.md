# Trace — User Stories and Acceptance Criteria

**Status:** Acceptance baseline including local backup and mobile usability · **Reviewed:** 10 November 2026

These stories consolidate observed capabilities. They are not PO approval of the implementation. Central business rules are defined once in the [PRD](prd.md#business-rules); criteria below reference those rules. **Review flags** point to unresolved exceptions in [Requirements Review](requirements-review.md).

## Capture and organize experiences

### US-01 — Record a dated event

As a person reflecting on an experience, I want to record its type, date and text so I can build a useful personal history quickly.

Acceptance criteria:

1. The desktop shortcut `/n` then Enter and the tappable **+** beside Mistake overview open the identical focused form with the selected context. Tab traverses Type → event text → Time → Description. Enter submits outside Description; there it inserts a newline and Ctrl+Enter submits. The shared mobile form also exposes Create node. Escape/Close creates nothing.
2. Available types, appearance and field validation follow **BR-01/02**. Invalid or whitespace-only required text and invalid calendar dates keep the dialog open and identify an error; successful creation adds exactly one node and closes it.
3. The date defaults to the computer's current local calendar date each time the dialog opens. Description input preserves complete user-perceived characters at its limit.
4. Selection constrains available types under **BR-03**; submission rechecks the restrictions. With a Mistake selected, Consequence is the default and only allowed successor type.
5. Changing Type immediately changes the required text label without losing entered text. Description is visibly multiline, optional, and retains newlines within its existing character limit.
6. Earlier-dated Consequence creation from Mistake shows the exact **BR-03** error, keeps the dialog open with Time focused, and leaves content unchanged; equal/later dates work. All seven types render at the taller dimensions under **BR-01**, retaining their shapes/colors, including restored older records.
7. Each card displays up to two lines of main text, visually truncating overflow without altering stored content. Full text/Description remain in hover details. Minimal rounding retains the seven recognizable shapes; existing colors/dimensions remain. Cards stay read-only and fixed in place.

Remaining review: **M-01** (taxonomy/limits). Evidence: [creation UI](../src/main.jsx), [form tests](../tests/browser/node-creation.spec.js), [updated interactions](../tests/browser/interaction-updates.spec.js).

### US-02 — Read an automatically arranged timeline

As a diagram author, I want events positioned by date and branching context so I can understand order without arranging every card.

Acceptance criteria:

1. The first node appears near one-quarter of the visible canvas width and half its height, accounting for zoom.
2. Unselected creation, selected creation and duplicate dates follow **BR-04**, including no automatic edge for an unselected node.
3. Adding an intermediate date can reflow existing nodes; nodes retain their dates and have at least a 32-unit clear gap when stacked above overlapping horizontal positions. Older short-card layouts reflow on restore without changing event data or connections. Manual node movement remains disabled.
4. Fixed bottom/left rulers display unique represented-month markers and follow pan/zoom using **BR-05**. A month containing several events has one marker, not one per event.
5. Regression examples cover January → May → May → March and an April 30 insertion beside a connected cluster; date order remains coherent under the documented row/stack exceptions.

Review flags: **A-01/02**. Evidence: [layout and axes](../src/model.js), [layout tests](../tests/model.test.js), [timeline browser tests](../tests/browser/whiteboard.spec.js), [duplicate-date tests](../tests/browser/same-date.spec.js).

### US-03 — Connect related events

As a diagram author, I want to link existing or newly created events so I can express relationships and follow their direction.

Acceptance criteria:

1. Creating a node with a selection automatically adds one permitted connection; invalid type combinations do not partially add a node or edge.
2. Dragging between top or side ports connects existing nodes when **BR-03** permits it. Fan-out and multiple incoming paths are supported.
3. Different-date drag direction is normalized to chronological order. Self-links, missing endpoints, duplicates and invalid port/type combinations leave the graph unchanged.
4. Equal-date links retain the requested direction and obey the same type rules as automatic links. A removed automatic same-date Action → Goal edge can be recreated manually; Consequence → Mistake/Milestone/Success is rejected. Rejection creates no content/history entry.
5. Consequence → Consequence can be created from an existing selection or linked manually. Equal-date row/branch placement and different-date chronological normalization remain unchanged.
6. Manual linking does not move existing nodes or change dates. Existing edges cannot be reconnected by dragging their endpoints.
7. Arrows show direction; labels use **BR-05**. Clicking a label selects its edge.

Resolved rule findings: **C-01/03**. Evidence: [connection model](../src/model.js), [connection tests](../tests/browser/connections.spec.js), [type-pair tests](../tests/model.test.js).

## Inspect and maintain the diagram

### US-04 — Navigate and inspect a connected history

As a person reviewing an outcome, I want to highlight every incoming path so I can inspect what was recorded as leading to it.

Acceptance criteria:

1. Dragging empty canvas pans. Ordinary wheel/two-finger scrolling pans in the matching direction on both axes without changing zoom. Ctrl+wheel and supported trackpad pinch zoom under **BR-12**; dot-grid and rulers stay synchronized.
2. A selected node receives the same outline style regardless of type. Clicking an edge toggles its individual highlight.
3. Double-clicking a node highlights it, all recursively upstream nodes, and every arrow in those paths, including merged paths; unrelated and downstream events are excluded.
4. Double-clicking never zooms the canvas. On a node it highlights the chain; clicking outside the chain or pressing Escape clears it, while clicking within it retains the chain highlight.
5. These interactions do not change diagram content or trigger diagram autosave.

Evidence: [selection UI](../src/main.jsx), [chain traversal](../src/model.js), [highlight tests](../tests/browser/connections.spec.js).

### US-05 — Remove an individual node or edge

As a diagram author, I want to remove one event or relationship so I can correct my diagram without losing connected experiences.

Acceptance criteria:

1. With an edge selected, Delete removes only that edge; nodes, other edges and existing positions remain unchanged.
2. With a node selected, Delete immediately removes only that node and its incident edges under **BR-06**. Descendants/shared nodes and their other edges remain at exactly their previous positions; no confirmation appears.
3. Deletion works for automatically and manually created edges. Subsequent creation uses the remaining outgoing edges to decide placement.
4. Successful deletion counts as a content change for autosave; an empty diagram can also be saved and restored.

Resolved deletion finding: **B-01**. Evidence: [deletion model](../src/model.js), [deletion tests](../tests/browser/connections.spec.js), [undo/redo scenario](../tests/browser/interaction-updates.spec.js).

### US-06 — Resume locally saved work

As a returning user, I want content saved automatically so I can reopen the same website and continue without rebuilding my diagram.

Acceptance criteria:

1. Content changes follow **BR-07**: another change during the waiting period restarts the debounce; navigation/highlights do not restart it or cause a write.
2. The saved checkmark disappears for unsaved content and appears only when the current snapshot has been successfully written, or a saved snapshot has restored successfully.
3. Reloading current-layout data restores types, text, descriptions, dates, positions, metadata and edges. Legacy layouts adapt spacing for the taller cards while preserving event content/relationships. Restore adds no history entry or storage write; current-layout deletion survivors retain their coordinates after reload. Selection/highlights/viewport are not restored.
4. Blocked storage or a failed write keeps the board usable, retains the previous stored snapshot, and never falsely confirms the new content was saved.
5. Invalid/unreadable saved data opens an empty usable board and is not overwritten merely by opening or navigating.

Review flags: **B-02/03**, **M-02**. Evidence: [persistence](../src/persistence.js), [autosave hook](../src/use-local-diagram.js), [autosave tests](../tests/browser/autosave.spec.js).

## Review mistakes and progress

### US-07 — See recurring mistake clusters

As a person reviewing my mistakes, I want similar underlying patterns grouped and frequent groups emphasized so I can identify what recurs most often.

Acceptance criteria:

1. Opening Mistake overview starts clustering of Mistake nodes using both text fields; other event types are excluded. Empty, single-record and identical-text inputs can be handled without inference.
2. Grouping follows **BR-08**. The provided Vietnamese performance-over-rest examples should group together in the regression fixture, while data-entry, missing-instruction, recovery and approval-seeking controls remain separate. This is a regression expectation, not a universal accuracy guarantee.
3. Groups are sorted by occurrence count. Larger groups have greater bar/count emphasis, show first/last dates, and expose all original entries. The label comes from a member's wording.
4. Changing the supported language preset is remembered locally, cancels superseded work, and cannot display stale results. Repeated unchanged analysis reuses valid caches where available.
5. Failure shows an actionable message rather than fabricated clusters. Closing the overview cancels/invalidate pending work; the diagram remains unchanged.

Review flags: **A-03**, **B-04**, **M-03**. Evidence: [clustering pipeline](../src/ollama.js), [overview](../src/MistakeOverview.jsx), [semantic fixtures](../tests/cloud-live.mjs), [cluster tests](../tests/browser/clustering.spec.js).

### US-08 — Compare recent recorded progress

As a person reviewing my progress, I want comparable period totals and connected Action paths so I can see changes in mistakes, obstacles and achievements.

Acceptance criteria:

1. Opening the overview displays both period boundaries and deterministic totals using **BR-09**, even while semantic clustering is pending or unavailable.
2. The comparison includes Mistake, Success, Milestone, Blocked and Consequence counts, plus combined achievements and absolute changes.
3. Successful clustering adds recent/prior counts by mistake cluster, recurring/new labels and recent first/last occurrence dates under **BR-09**.
4. Recent achievements and Blocked entries show their text, optional Description and upstream Actions with recorded paths. Indirect/merged paths deduplicate Actions; earlier Actions outside the comparison periods may be included. No recorded path is explicitly reported.
5. Recent Consequences remain individual recorded entries. Connected paths are described as recorded associations, not proven causes; older/future records do not enter period totals.

Review flags: **A-04**, **M-04**. Evidence: [report calculations](../src/progress-analytics.js), [analytics UI](../src/ProgressAnalytics.jsx), [period/path tests](../tests/progress.test.js).

### US-09 — Explore and cancel possible explanations

As a person reviewing recurring mistakes, I want evidence-linked, optional explanations so I can consider a shared motivation without confusing it with established fact.

Acceptance criteria:

1. Explanations start only through the explicit button after clusters are available; eligibility and historical scope follow **BR-10**. No eligible cluster produces an informative empty state.
2. Results distinguish a model summary of shared observations from a possible psychological explanation and display the original cited Mistakes.
3. Output validation enforces **BR-10**. Invalid/incomplete output is not presented as a supported conclusion; an insufficient-evidence result does not invent a cause.
4. Failure in one cluster preserves completed valid findings. Unsupported output can be retried; service failure stops further queued cluster work. Unchanged completed findings can be reused from cache.
5. Cancel and closing the popup abort/invalidate current work, prevent late responses from overwriting newer results, and retain already completed valid findings when the popup remains open. Cloud resource cancellation is stated as best effort.
6. Relevant text transfer and temporary AI unavailability follow **FR-06 / NFR-02** in the PRD; no inference result modifies the diagram.

Review flags: **P-01/02**, **M-03/04**. Evidence: [explanation planning/validation](../src/progress-explanations.js), [prompts](../shared/cluster-prompt.js), [explanation tests](../tests/cluster-explanations.test.js), [production tests](../tests/cloud-browser/production.spec.js).

### US-10 — Undo and redo diagram content

As a diagram author, I want to reverse and reapply content changes so I can recover from mistakes without rebuilding events or relationships.

Acceptance criteria:

1. Ctrl+Z/Ctrl+Y follow **BR-11** for node/edge creation and deletion, restoring exact IDs, data, positions and connections; an automatic edge/layout update belongs to its node-creation operation.
2. For A → B → C, deleting B leaves A/C, undo restores B and both original edges, and redo removes only B and those edges again.
3. New content after undo clears redo. Invalid/no-op operations and navigation/selection do not consume history or clear an otherwise valid redo branch.
4. Undo/redo outside a form does not interfere with native text editing inside inputs/textarea. Empty history makes no content change.
5. Restored content uses the normal save debounce. Undo back to the saved snapshot produces no unnecessary save. Reload restores saved content with a fresh session history; legacy field names remain readable.

Evidence: [history reducer](../src/diagram-history.js), [history tests](../tests/history.test.js), [interaction/save/compatibility scenarios](../tests/browser/interaction-updates.spec.js).

### US-11 — Back up and restore the complete diagram

As a diagram author, I want a portable local backup so I can protect my work or restore it on another device without an account or cloud storage.

Acceptance criteria:

1. The bottom-right gear opens Settings with only Export Data, Import Data and the plaintext privacy notice; both actions are usable on desktop/mobile.
2. Export follows **BR-13**, including empty diagrams and pending unsaved changes. A download/native save contains complete recoverable data without UI/cache/history/secrets; original content and autosave timing remain unchanged.
3. Selecting a valid file shows replacement confirmation and counts before any write or live change. Cancel leaves content intact. Invalid JSON/UTF-8, IDs, endpoints, constraints or unsupported versions show a clear error and no confirmation/partial import.
4. Confirming performs one coordinated save/replace. An older pending autosave cannot overwrite the imported snapshot; no separate per-node writes occur. A storage failure preserves old live/saved content, pending autosave and history, and shows no success message.
5. Successful import restores exact current-layout coordinates, fields, metadata and relationships; known legacy layouts/marked historical relationships follow the explicit compatibility policy. Reload retains the imported graph.
6. Import clears prior history/selection/highlights; subsequent edits still undo/redo and autosave normally. An export → import → export round trip preserves all essential diagram information.
7. Import/export does not upload files or trigger inference/analytics. Native picker cancellation does not silently start a download. Performance is measured on representative sizes without promising universal latency.

Evidence: [codec tests](../tests/backup.test.js), [atomicity/download/performance tests](../tests/browser/backup.spec.js), [schema contract](backup-schema.md).
