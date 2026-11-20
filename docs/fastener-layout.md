# Repeated screw locations

Open a wood-screw plan from a part, connection review or assembly guide. Pick or enter one complete entrance and inward direction on the actual head-side wood face. The origin can still be in the working draft. Its actual members and product references must be current; review changed references or replace missing members through the existing explicit controls first.

1. Choose **Repeat from F001**, or open **Repeat screw locations** and select a complete origin.
2. Choose the part axis to project onto that retained face. The resolved local direction is shown; Reverse changes its sign. Perpendicular axes are unavailable.
3. Enter the total positions **including the origin**, the spacing and a basis/note for this proposed layout. Three positions means one existing point plus two new ones. Each length field has its own inches/feet selector and preserves its canonical physical value.
4. Optionally enable a grid, reverse its second direction or enter a minimum distance from the actual head-face perimeter. These are your geometric layout choices, not manufacturer spacing or end/edge rules.
5. Preview the retained-face diagram and actual 3D entrances. Inspect individual findings. Unknown seating/pilot measurements remain pending; receiver misses, cut-away faces, duplicate paths, intervening parts, entered tip/pilot breakthrough and failed geometric margins remain excluded.
6. Select eligible candidates and choose **Add selected locations to draft**. Inspect the exact software note for the selected cells. Then use **Save fastener plan** to persist. Cancel and preview alone leave the project, purchases and reserved labels unchanged.

The origin and every old location retain their exact IDs, coordinates, directions and names. New points use the same explicitly entered drive and the plan's shared user measurements; no nominal product length becomes an actual seating depth. Ordinary individual F editing stays available. Batch-added rows are collapsed until opened. A saved layout consists of ordinary locations and its software note, so JSON, guide, CSV, purchases and reference refresh/remapping use the existing format7 workflow. The note records software authoring, not real physical measurements.

The preview is bound to the current working draft, actual physical geometry, source evidence and competing screw paths. Changing those facts requires a new preview. Append rechecks the selected paths and protects existing eligible locations. Saved Undo/Redo retains the usual F-label reservations; skipped provisional labels may stay reserved after an accepted subset. Source/reference history is unchanged by repetition and remains append-only when physical references are explicitly refreshed or remapped.

This tool checks modeled centerlines and user geometric constraints. Joint type, required fastener quantity/pattern, wood/plywood-edge suitability, pilot procedure, tool access, loads and code require their own evidence. The reviewed GRK products retain their unresolved drawing/report datum differences. No installed holes, screws, purchased packs or strength approval are created by Preview or Add to draft.
