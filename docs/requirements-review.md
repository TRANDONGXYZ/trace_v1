# Trace — Requirements Review

**Status:** Updated after implemented rule/interaction fixes; open questions retained · **Reviewed:** 9 November 2026

Resolved findings below reflect implemented and tested changes, not documentation-only promises. Unrelated open questions remain; start with **B-02/03**, **P-01/02** and **A-01** for data loss, interpretation and ruler expectations. The original site/Cloudflare architecture and AI analysis logic are unchanged; this update is not deployed.

## Ambiguous requirements

| ID | Evidence / ambiguity | PO question |
| --- | --- | --- |
| A-01 | [Axis anchors](../src/model.js) omit ordinary row/stack nodes from some vertical date anchors; same-date rows can span horizontal slots. Earlier requests also call for nodes matching both axes. | Is the vertical ruler a branch reference or must every event sit at its exact date coordinate? Which wins when a horizontal-row rule conflicts? |
| A-02 | [Creation](../src/model.js) chooses the highest outgoing target for duplicate-date placement, keeps the new date column, and uses array order for equal-height ties. Unselected nearest-earlier references also have same-date ties. | Confirm selection overrides chronological reference choice, and specify deterministic ties and expected collision/reflow tolerances. |
| A-03 | [Profiles](../src/behavior-patterns.js) and [presets](../src/embedding-models.js) define approximate grouping; no accepted quality target or general definition of “same underlying mistake” exists. | Which motives should form one group versus separate subtypes? What false-merge/missed-merge rates are acceptable on a reviewed Vietnamese/English set? |
| A-04 | [Period logic](../src/progress-analytics.js) uses rolling calendar-month windows, while explanation eligibility needs two historical members and only one recent member. The trends table uses two recent members for “Recurring.” | Approve these distinct meanings, labels and month-end boundaries, or align them? |

## Missing information

| ID | Missing product definition | Needed input |
| --- | --- | --- |
| M-01 — Partially resolved | Type-specific labels and multiline Description are implemented; the persisted text key remains compatible. Type definitions remain unapproved. Dates stop at 2099, event text has no explicit maximum, and cards remain read-only. | Approve taxonomy, date/text limits and long-term correction workflow. Current deletion is individually undoable in the page session. |
| M-02 | No backup/export, save recovery, invalid-storage recovery, or multi-tab overwrite policy. [Restore](../src/persistence.js) returns empty when a snapshot is rejected. | Decide acceptable loss risk, user-facing recovery/warnings, and ownership of simultaneous edits in one origin/profile. |
| M-03 | No validated personas, research findings, adoption goals, AI evaluation dataset, supported-browser/device matrix, accessibility target or large-diagram performance target were found. | Agree audience, test environments and measurable release criteria before making readiness or usefulness claims. Metrics in the brief are proposals only. |
| M-04 | [Explanation planning](../src/progress-explanations.js) excludes edges and non-Mistake records. Achievements/Blocked items show recorded upstream Actions; Consequences are listed individually. Counts do not establish actual behavior change. | Is this sufficient for the intended “underlying causes,” blocker explanations and consequence summaries, or is additional analysis intended? Define future scope explicitly. |

## Rule findings and resolutions

| ID / status | Implemented resolution or remaining ambiguity | Verification / follow-up |
| --- | --- | --- |
| C-01 — Resolved | Manual and automatic same-date links share type eligibility. Requested direction is preserved on equal dates; different-date arrows still normalize chronologically. Invalid relationships/self-links are rejected. | All type-pair [unit tests](../tests/model.test.js) and manual recreation [browser tests](../tests/browser/interaction-updates.spec.js). |
| C-02 — Lifecycle clarified | The latest individual-deletion requirement permits disconnected survivors. “Mistake followed by Consequence” is a successor-type restriction, not an obligation to automatically add/delete a child. New Consequence creation still requires a selected Mistake/Action. | [Type rules](../src/node-rules.js) and deletion/undo scenarios preserve orphans intentionally. No mandatory-child repair is introduced. |
| C-03 — Resolved for new operations | An earlier Consequence from selected Mistake is rejected with the exact message; Consequence → Mistake/Milestone/Success is prohibited in automatic/manual creation. Equal dates remain valid where permitted. | [Model tests](../tests/model.test.js), exact error/no-mutation [browser test](../tests/browser/interaction-updates.spec.js). Existing stored relationships are not silently purged; see B-03. |
| C-04 — Request conflict interpreted | Section 9 test item 7 asks to allow an earlier Consequence, contradicting section 4's explicit rejection/message requirements. Implementation and acceptance criteria follow the detailed section 4 rejection rule. | No claim that both statements can be satisfied. Change only if the PO explicitly revises the detailed rule; [D-14](decision-log.md) records the interpretation. |

## Implemented behavior that may not match product intent

| ID | Observed behavior / exposure | PO decision |
| --- | --- | --- |
| B-01 — Resolved | [Individual deletion](../src/model.js) removes only the selected node and incident edges; other nodes/edges and positions survive. Ctrl+Z/Ctrl+Y restore/reapply complete content snapshots without confirmation. | [History tests](../tests/history.test.js), [shared-graph tests](../tests/browser/connections.spec.js), [A → B → C and save tests](../tests/browser/interaction-updates.spec.js). |
| B-02 | [Autosave hook](../src/use-local-diagram.js) has no close/reload flush. A write failure silently withholds the checkmark, with no timer-based retry until another content change. | Decide whether loss inside the 3-second window and silent failure are acceptable; define warning/retry expectations. |
| B-03 — Open | [Restore validation](../src/persistence.js) checks shape/IDs but does not reapply all type/date rules. Compatibility deliberately preserves old content, including any legacy relationships now prohibited for new links. Rejected snapshots open empty and may be replaced by a real edit; no cross-tab reconciliation exists. | Define non-destructive legacy validation/recovery and overwrite policies. Persistence integrity is not business-rule validation. Current rendering/history compatibility is tested, not a data-cleanup feature. |
| B-04 | [Cause detection](../src/behavior-patterns.js) depends on a finite Vietnamese/English cue regex and requires two unique qualifying texts. Known matching priority categories can merge despite dissimilar raw wording; oversized (>6,000-byte) qualifying texts can remain separate. [All-time clustering](../src/ollama.js) also includes future dates, which may affect memberships used in historical trends. | Approve these heuristics as prototype limitations or specify alternative behavior. Do not claim arbitrary-language/root-cause accuracy or independence from future records. |

## Decisions requiring Product Owner confirmation

| ID | Current position | Confirmation needed |
| --- | --- | --- |
| P-01 | Opening [Mistake overview](../src/MistakeOverview.jsx) starts clustering and may send text to Cloudflare immediately. A disclosure is displayed; there is no separate consent step. Psychological explanations require a separate click. Caches retain source text/derived analysis in the same browser. | Approve this analysis trigger, disclosure and shared-device/retention expectations. A policy or consent redesign is not implied by this draft. |
| P-02 | [Output validators](../worker/input.js) check structured fields and whether IDs belong to supplied evidence. They cannot prove that the cited text supports each psychological statement. Prompts ask for cautious hypotheses; original records remain visible. | Approve intended use and release evaluation, including how unsupported interpretations will be detected. Valid references must not be presented as proof that hallucinations are impossible. |
| P-03 | [Backend limits](../worker/index.js) are per-location/per-isolate safeguards, not strict global budgets or visitor authentication. Configuration has no paid fallback, but account-wide allowance and provider availability are external. | Confirm acceptable temporary AI unavailability, free-plan operating responsibility and whether anonymous public analysis remains the intended model. |

## Remaining interaction limitations

Undo history is in memory, has no fixed count cap, and ends on reload; only the current diagram is autosaved. Large edit histories may use substantial browser memory. Gesture tests cover mouse-wheel, Ctrl-wheel and the browser's Ctrl-marked pinch event; a physical Windows trackpad/browser matrix has not been certified. Enter/Ctrl+Enter in Description is the documented resolution of natural multiline editing versus the previous single-line Enter submission. These are explicit implementation limits/choices, not new approved roadmap items.

The taller-card follow-up standardizes all seven types at 96 units high with a 32-unit vertical gap. Older coordinates reflow for compatibility without changing event text/dates/relationships or causing a load-time save/history entry. Current-layout saves preserve positions after deletion/reload. The previous pan sign inversion is reversed in both axes; tests model all four natural-trackpad directions and synchronized rulers. Physical finger-to-wheel mapping still depends on device/OS scrolling settings.

## Verification of this update

Passed locally: **103 unit/security tests**, **51 distinct whiteboard browser checks across full and targeted runs**, **5 production-bundle browser tests with mocked AI**, production build, and Wrangler dry run. Coverage includes uniform shapes/dimensions, older overlapping layout restoration, all four pan directions, zoom/rulers, type rules, individual deletion, exact undo/redo, debounce/no-op behavior and multiline/character limits. AI logic/configuration was preserved; no real inference or deployment was performed for this update.

Record confirmed outcomes in the [Decision Log](decision-log.md), then update the affected [PRD rules](prd.md#business-rules) and [acceptance criteria](user-stories.md). None of these open questions authorizes adding features or changing behavior.
