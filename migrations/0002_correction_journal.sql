-- Absolute stock corrections can exceed the per-request relative adjustment
-- limit. The journal records both; request schemas enforce command limits.
CREATE TABLE inventory_events_new (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL CHECK (delta != 0),
  source TEXT NOT NULL CHECK (source IN ('admin', 'device', 'mcp')),
  reason TEXT NOT NULL DEFAULT 'adjustment' CHECK (length(reason) BETWEEN 1 AND 80),
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  applied_at TEXT
);

INSERT INTO inventory_events_new
  (id, item_id, delta, source, reason, device_id, created_at, applied_at)
SELECT id, item_id, delta, source, reason, device_id, created_at, applied_at
FROM inventory_events;

DROP TABLE inventory_events;
ALTER TABLE inventory_events_new RENAME TO inventory_events;
CREATE INDEX idx_events_item_created ON inventory_events(item_id, created_at DESC);
CREATE INDEX idx_events_created ON inventory_events(created_at DESC);
