# Pantry Pulse feature roadmap

Updated 2026-10-26. Proposed release order, not delivery dates or evidence of customer demand. Targets below are pilot decision gates, not measured results.

## User and outcome

A household that wants an accurate replenishment list without maintaining a spreadsheet or remembering every scan.

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

**Shipped 2026-11-11.** Each queue line now shows its current count and target, its latest inventory change, and when its count was last confirmed. Counts not confirmed within 14 days are marked as needing a check. A **Count is right** action records a confirmation without changing stock. The same fields reach MCP snapshots and exports.

Remaining limits:

- Station scans are relative and never confirm a total, so a station-only household sees "needs a check" until someone confirms on the dashboard.
- `lastChange` disappears once an item's history passes the 90-day retention window.
- The 14-day window is a starting guess; tune it from pilot data.

## Dependencies and deliberate limits

Keep this a household product initially. No automatic purchasing. Inventory uncertainty must be visible; expiry and food-safety claims require actual data rather than inference from scan history.

Update this roadmap when a user-visible increment ships, recording its outcome and remaining limits.
