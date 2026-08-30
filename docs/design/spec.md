# Pantry Pulse product direction

Pantry Pulse should feel like a well-used kitchen notebook made precise: warm
ivory paper, near-black type, spinach green for healthy stock, and restrained
tomato red only for shortages. Thin rules and modest corner radii create
structure without turning every section into a floating card.

## Information hierarchy

1. **Inventory ledger** — the primary desktop surface, with quantity, target,
   status, and direct adjustment controls on each line.
2. **Shopping receipt** — a narrow companion column derived from the inventory
   target, with a one-click Markdown copy action.
3. **Recent scans** — an audit trail that makes hardware behavior legible.
4. **Link tag drawer** — a focused side panel for RFID and optional catalog IDs.

On small screens, inventory, shopping, and activity become three bottom-nav
destinations. A selected item expands in place, keeping one-handed adjustment
near the thumb.

## Interaction principles

- Counts update optimistically only after the API confirms the event.
- Low-stock meaning is expressed in words and color; it never relies on color alone.
- The access screen explains where the token lives and does not persist it
  beyond the browser session.
- Every icon-only control has an accessible name and visible focus treatment.
- Motion is subtle, functional, and disabled by reduced-motion preferences.

## Generated exploration

- `desktop-concept.png` — accepted desktop hierarchy and visual tone.
- `mobile-concept.png` — compact inventory and bottom-navigation behavior.
- `link-tag-concept.png` — right-side setup workflow.
- `access-concept.png` — sparse, left-aligned access gate.

These are direction-setting artifacts rather than pixel contracts; the shipped
interface retains their hierarchy while using accessible live controls.
