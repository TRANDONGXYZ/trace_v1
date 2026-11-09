# Trace — Product Brief

**Status:** Product draft; requested interaction/rule changes implemented and tested · **Reviewed:** 9 November 2026

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
- Find frequently repeated mistakes even when wording differs.
- See recorded achievements, obstacles and consequences alongside mistakes.
- Distinguish recorded facts from uncertain AI interpretations.

These are needs to validate, not reported research findings.

## Scope and limits

**Observed:** seven event types; keyboard creation with type-specific labels and multiline descriptions; automatic date-based layout; directed connections, including permitted same-date links; incoming-chain highlighting; individual-node/edge deletion; session undo/redo; 3-second browser autosave; mistake clustering; rolling two-month comparisons; opt-in cluster explanations and cancellation. Removing a node preserves its descendants. Wheel/two-finger scrolling pans; Ctrl+wheel and supported pinch gestures zoom. The configured production origin remains **https://trace.trandongxzy.workers.dev/**; the existing single-Worker architecture is unchanged. See [DEPLOYMENT.md](../DEPLOYMENT.md) for operations. This update has not been deployed.

**Limits:** one diagram per browser profile/origin; no login, cloud backup, synchronization, collaboration, export/import, node editing or manual node dragging. Undo/redo history lasts only for the current page session, while the current diagram is autosaved. Core diagram operations do not require inference; cloud AI requires connectivity and available service allowance. Browser storage loss can remove the diagram. Relevant text is sent to Cloudflare for analysis; the full graph is not uploaded by the application. Clustering is approximate, and explanations are hypotheses rather than diagnoses or verified causes.

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
