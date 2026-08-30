PRAGMA foreign_keys = ON;

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  unit TEXT NOT NULL DEFAULT 'item' CHECK (length(unit) BETWEEN 1 AND 32),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  target_quantity INTEGER NOT NULL DEFAULT 1 CHECK (target_quantity >= 0),
  rfid_uid TEXT UNIQUE,
  catalog_provider TEXT,
  provider_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (catalog_provider IS NULL AND provider_item_id IS NULL) OR
    (catalog_provider IS NOT NULL AND provider_item_id IS NOT NULL)
  )
);

CREATE TABLE inventory_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL CHECK (delta != 0 AND delta BETWEEN -1000 AND 1000),
  source TEXT NOT NULL CHECK (source IN ('admin', 'device', 'mcp')),
  reason TEXT NOT NULL DEFAULT 'adjustment' CHECK (length(reason) BETWEEN 1 AND 80),
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  applied_at TEXT
);

-- Compact idempotency records remain after detailed events age out. Hardware
-- outboxes may reconnect after a long offline period, so deleting an event ID
-- would make a successful old scan apply twice.
CREATE TABLE event_tombstones (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  device_id TEXT
);

CREATE INDEX idx_items_status ON items(quantity, target_quantity, name);
CREATE INDEX idx_events_item_created ON inventory_events(item_id, created_at DESC);
CREATE INDEX idx_events_created ON inventory_events(created_at DESC);
