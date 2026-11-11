-- Last time someone stated an absolute on-hand count: item creation or a
-- dashboard/API count correction, including confirming an unchanged count.
-- Relative station scans and +/- adjustments never confirm a total.
ALTER TABLE items ADD COLUMN counted_at TEXT;

UPDATE items
SET counted_at = COALESCE(
  (
    SELECT MAX(created_at)
    FROM inventory_events
    WHERE inventory_events.item_id = items.id
      AND source = 'admin'
      AND reason = 'dashboard setup'
      AND applied_at IS NOT NULL
  ),
  created_at
);
