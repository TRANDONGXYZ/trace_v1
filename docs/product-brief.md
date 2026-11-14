# Trace — Product Brief

**Status:** Product draft including Consequence Chain Analysis · **Reviewed:** 14 November 2026

This package describes the current source, not an approved roadmap or proof that every behavior is correct. **Observed** means implemented in the reviewed checkout; **Proposed** means suggested for approval; **Assumption/Open** means evidence or a decision is missing. Tests corroborate behavior but do not establish user need or product correctness.

## Problem and product purpose

Trace is a personal timeline whiteboard for recording mistakes, actions and outcomes, seeing their recorded relationships, and reviewing recurring patterns over time. Its working product hypothesis is that a connected visual history and a compact progress comparison can make repeated mistakes and achievements easier to recognize than isolated notes. **This hypothesis has not been validated by user research in the repository.**

## Users and value

**Assumed primary users:** individuals reflecting on their own behavior and progress. Vietnamese-language records are an explicit supported use case; English analysis is also offered. No validated personas, market segments or customer interviews were found.

**Value proposition:** connect dated experiences, identify recurring mistake patterns, compare recent progress with the preceding period, and optionally explore evidence-linked psychological hypotheses. Users can start without an account and retain their diagram in the same browser.

**Working user needs, inferred from implemented capabilities:**

- Capture an event quickly and connect it to relevant experiences.
- Follow actions and outcomes without manually arranging a timeline.
- Resume a saved diagram after reopening the site.
- Back up a complete diagram locally and restore it on another compatible browser/device.
- Find frequently repeated mistakes even when wording differs.
- See recorded achievements, obstacles and consequences alongside mistakes.
- Review a fixed two-calendar-month phase and inspect recorded downstream consequences/actions.
- Review recorded Consequence-to-Action intervals and the original connected events without inferred explanations.
- Find longer recorded Consequence chains and inspect their sequence, duration and original descriptions.
- Distinguish recorded facts from uncertain AI interpretations.

These are needs to validate, not reported research findings.

## Scope and limits

**Observed:** seven event types with two-line text and subtle shape-preserving corner rounding; keyboard or touch-button creation; automatic date-based layout; permitted same-date connections and Consequence chains; incoming-chain highlighting; individual-node/edge deletion; session undo/redo; 3-second autosave; local JSON backup/restore; mistake clustering; rolling progress comparisons; optional cluster explanations/cancellation. The deterministic Analytics page shows fixed two-calendar-month counts, downstream rankings, Reaction Time Analysis and Consequence Chain Analysis. Chain depth, total reachable Consequences and duration remain separate; selecting a Mistake shows one longest recorded sequence with full event details. Measured reaction intervals lead to full recorded journeys; missing/future follow-ups remain separate. Its desktop panels start at 60/40 and resize by dragging; narrow screens stack them. Only the current two-month phase is available; other period tabs remain inactive. Settings provides Export Data, Import Data and Light/Dark/System appearance. The theme applies throughout the website and is saved separately from diagrams. Import validates the complete file, confirms replacement and persists it atomically before changing the live diagram. The production origin remains **https://trace.trandongxzy.workers.dev/** and the single-Worker architecture is unchanged. See [DEPLOYMENT.md](../DEPLOYMENT.md). This update is not deployed.

**Limits:** one active diagram per profile/origin; no login, cloud backup, synchronization, collaboration, event editing or manual node dragging. Backups are manual, unencrypted JSON files, limited to 25 MiB and available browser storage. Import replaces rather than merges and clears prior undo history. Ordinary history remains session-only. Native save-location selection depends on browser support; other browsers download the file. Large diagrams can briefly pause processing/rendering. Core and backup operations require no inference; relevant text goes to Cloudflare only for existing AI analysis. Clustering is approximate and explanations are hypotheses, not diagnoses or verified causes.

## Proposed success measures

No targets, baseline measurements or product telemetry were found. Agree targets and a measurement method before treating these as commitments; adding tracking is not part of this documentation task.

| Measure | Proposed assessment |
| --- | --- |
| First-use effectiveness | Observed task completion: create an event, connect it, and find an upstream Action without assistance. |
| Save reliability | Controlled sessions: content saved after the debounce restores with all node/edge data intact; assess early-close and storage-failure cases separately. |
| Useful grouping | PO-reviewed Vietnamese/English examples: proportion of expected same-cause pairs joined and unrelated pairs kept separate. |
| Explanation usefulness and grounding | Manual review: conditional wording, relevant cited records, and whether the interpretation helps explain a shared pattern. Valid IDs alone are insufficient. |
| Graceful AI failure | Task checks: diagram and factual analytics remain usable during inference failure, limits and cancellation. |

First decisions to resolve are listed in [Requirements Review](requirements-review.md); feature-level behavior is in [User Stories](user-stories.md) and [PRD](prd.md).
