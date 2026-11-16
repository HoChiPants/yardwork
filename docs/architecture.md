# Architecture and extension plan

## Working model

All persisted lengths are **inches**, with actual physical dimensions. Three.js renders in feet. Every part has a material ID, local XYZ dimensions, world position, XYZ Euler rotation in radians, assembly label, and build-step reference. The renderer uses actual box geometry, rather than a single prebuilt coop mesh.

`src/model.ts` owns Zod validation, schema version 1, sample material definitions, templates, constrained generator commands, and persistent section records. A section owns a disjoint set of part IDs, an anchor/rotation, and optional generator dimensions. Existing version 1 files default to an empty section list; the app does not guess generator dimensions for imported loose parts. `src/spatial.ts` keeps XYZ rotation/composition consistent across generators and transforms. `src/sections.ts` owns grouping, whole-section transforms, regeneration previews, duplication, and membership reconciliation. `src/SectionsPanel.tsx` provides the section inspector. `src/engine.ts` owns cuts, bounds, material packing, connection checks, validation, operation records, and exports. `src/packing.ts` produces feasible non-overlapping rectangular stock layouts for roll materials; `src/handoff.ts` and `src/HomeDepotHandoff.tsx` prepare the retailer paste workflow without sending data externally. `src/Scene.tsx` owns rendering, object transforms, camera controls, and assembly animations. `src/App.tsx` owns interaction, undo/redo, panels, and persistence requests. `src/InventoryForm.tsx` records explicitly user-supplied store observations.

The server owns atomic file persistence and optional integration calls. It never accepts an arbitrary request URL from a client. Catalog/AI endpoints are configured by the self-hosting operator. Default outbound operations are disabled. The UI font uses Google Fonts with system fallbacks; browsers can request those font assets. No analytics is installed.

## Saved state

Each server file is `{ project, revision }`. Writes require the base revision and are serialized per project within one process. Each write uses a private temporary file and an atomic rename. Conflicts return 409 and preserve the existing version. Run **one** server process per data directory; multi-process locking, database transactions, and live collaboration are not implemented.

Browser storage retains one draft, separate from the server library. A browser draft is not a cloud backup. Import creates a new ID. Undo/redo stores up to 60 project states. The activity record keeps the latest 5,000 operations. Dimensions/transforms and explicit joint records can regenerate a shopping handoff and build guide.

## Qualified limitations

- Cutting changes the longest local box dimension, removes a ⅛ in kerf, and retains the remaining box as an offcut. It does not support miters, notches, holes, or arbitrary boolean mesh cuts.
- Screw records require nearby parts, but do not simulate threads, entry direction, clamping, edge distance, or shear/pullout behavior. The visual marker is an assembly cue.
- Stock packing is a greedy planning estimate. Hardware cloth uses a 2D shelf layout with zero-kerf snip cuts. Panels do not nest. The app does not optimize global material costs or choose alternative stock lengths automatically.
- Geometric support and collision checks are heuristics, not engineering calculations. Angled members and intentional joinery require review.
- Wall generation creates a simple single-top-plate concept without openings, headers, bracing, or a code-selected framing specification. It is not a prescriptive load-bearing wall design.
- The coop template is a visual starting point, not a complete chicken housing specification.
- No authentication, shared-user permissions, or hostile multi-tenant deployment support exists in this local-first release.

## Roadmap

1. Qualify an authorized retailer catalog adapter and exact product mappings; preserve stock dimensions, grade, material/environment suitability, price units, store, and timestamp. Qualify native retailer handoff only against a supported interface.
2. Add openings, headers, sheathing, rafter assemblies, 2D dimensions, connector families, richer attachment constraints, and sheet nesting.
3. Expand beyond the implemented targeted wall/base revisions into openings, roof/coop generators, multi-section repair proposals, and richer project context for the optional AI provider.
4. Add plan image/PDF underlays with explicit calibration and user-verified tracing; later consider IFC/model imports. Never infer safety from a visual plan alone.
5. Model site features as typed constraints: polygons/excavation volumes, fixed drains and utilities, grades, clearances, setbacks, waterproofing zones, service access, and jurisdiction-specific review requirements.
6. Build bathroom and pool project families around these constraints, rather than representing plumbing or excavation as generic lumber.
7. Add databases/authentication and collaborative editing before hosted multi-user deployment.

A future schema migration should explicitly version new site features, assets, material stock definitions, and connection families. Existing project files must remain importable through tested migrations.
