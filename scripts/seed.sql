INSERT OR IGNORE INTO items (
  id, name, unit, quantity, target_quantity, rfid_uid, catalog_provider, provider_item_id
) VALUES
  ('itm-coffee', 'Coffee beans', 'bag', 1, 2, NULL, NULL, NULL),
  ('itm-oats', 'Rolled oats', 'canister', 2, 2, NULL, NULL, NULL),
  ('itm-tomatoes', 'Canned tomatoes', 'can', 3, 6, NULL, NULL, NULL),
  ('itm-rice', 'Jasmine rice', 'bag', 1, 1, NULL, NULL, NULL),
  ('itm-olive-oil', 'Olive oil', 'bottle', 0, 1, NULL, NULL, NULL),
  ('itm-chickpeas', 'Chickpeas', 'can', 5, 4, NULL, NULL, NULL),
  ('itm-pasta', 'Rigatoni', 'box', 2, 3, NULL, NULL, NULL);
