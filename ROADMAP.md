# Pantry Pulse feature roadmap

Updated 2026-10-26. Proposed release order, not delivery dates or evidence of customer demand. Targets below are pilot decision gates, not measured results.

## User and outcome

A household that wants an accurate replenishment list without maintaining a spreadsheet or remembering every scan.

## Current baseline

The station already records idempotent consume/restock events, keeps stock and shopping needs, and exposes guarded MCP reads/writes. The dashboard supports inventory correction and tag/catalog linking.

Planning evidence: [README](README.md) and [MCP tools](src/server/mcp.ts) at `3ec9457b4156`. This focused product pass does not claim a complete new code audit or live-provider validation.

## Prioritized releases

| Order | Feature                                  | User value and scope                                                                                                                 | Release acceptance                                                                                                                    |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Now   | A trustworthy weekly restock review      | Show why each item is on the queue, its target/current quantity and when it was last confirmed; support quick household corrections. | A shopper can review a week’s queue and distinguish confirmed stock from quantities that need a check.                                |
| Next  | Acknowledge and recover station mistakes | Provide an easy last-scan undo/correction flow and a visible unsynced-event state at the station/dashboard boundary.                 | An accidental consume can be corrected once; reconnecting or replaying events never applies the correction twice.                     |
| Next  | Send an approved queue to shopping       | Export a versioned queue with quantities and catalog references for Shopping MCP, then track what was accepted or remains unmatched. | The user previews the transfer; retrying an import does not double the shopping quantities and does not falsely mark items restocked. |
| Later | Usage-informed replenishment             | Suggest target levels from observed use with an explanation and an explicit accept/reject control.                                   | The household can inspect the evidence, keep manual targets and exclude irregular items.                                              |

## Measure value before expanding

Use a two-week household pilot: compare the proposed queue with a physical count, record forgotten essentials and correction effort. First gate: reviewing/correcting the weekly queue takes under three minutes and every exported quantity is traceable.

Collect the baseline before building the first slice. Use voluntary pilot feedback and minimal aggregate events; do not log private content or credentials to measure adoption. If the first workflow is not used again, revisit the problem before adding the later features. Revenue impact is unvalidated.

## Next shippable slice

Add “last confirmed” and “why replenish” details to the existing shopping queue before building prediction.

## Dependencies and deliberate limits

Keep this a household product initially. No automatic purchasing. Inventory uncertainty must be visible; expiry and food-safety claims require actual data rather than inference from scan history.

Engineering work belongs in the milestone only when it enables that acceptance criterion. Prefer existing native libraries and test runners. Update this roadmap when a user-visible increment ships, recording the outcome and remaining limits rather than checking off implementation activity alone.
