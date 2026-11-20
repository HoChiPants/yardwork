# Explicit wood-fastener locations

The current pairwise connection records have product quantities but no physical drive location. Add a separate editable plan for actual wood members and individually authored entrance points and drive directions. Existing quantities remain readable; no pattern or joinery is inferred from proximity or part names.

## Implementation

1. Trusted GRK R4 103101 and cabinet 113079 references retain their exact 100-screw packs, drive requirements, nominal dimensions, conflicting sources and length datums. They remain purchase references without an installed screw solid. Nominal length never becomes an assumed entrance-surface-to-tip depth.
2. Format 5 adds `fastenerPlans`, initially empty. Each plan stores actual head-side/receiver references, source geometry and baseline relative poses, zero or more explicit locations with durable local labels, and nullable user measurements with basis/date. Formats 1–4 migrate in memory without rewriting originals or inventing locations. Missing/cut/replaced references remain reviewable.
3. Retained convex-solid ray intersections calculate the head exit, receiving entry/exit, gap and candidate tip penetration. Surface position, inward direction, missed receivers, overlap and breakthrough are checked. Unknown measurements remain unknown. A reviewed centerline does not establish thread engagement, pilot requirements, driver access, installation, capacity or code compliance.
4. The Part inspector opens a dedicated fastener editor without another permanent navigation tab. Exact local coordinates, axis-direction shortcuts, editable unit direction, measured seating/drill data, source context, explicit refresh and Undo are available. Scene markers display intent only.
5. Explicit nonstale, nonconflicting locations contribute provisional screw demand. Existing supply rows alone purchase complete packs, rounded once and added only on user action. Legacy pairwise connections remain separate with duplicate-representation warnings. Tools remain capability reviews, not ownership or drilling approval.
6. Guides preserve custom text and phase history, stale on changed fastening inputs and provide a source-local location appendix and CSV. Every schedule identifies actual P labels, durable fastener labels, candidate/pending/excluded state and measurement provenance. No stale coordinates become released instructions.

## Required evidence

- Real .703-inch casework and manual lumber fixtures; explicit locations, no automatic fastening pattern.
- Inward/outward, missing/cutout, thin stock, short reach, exposed tip, full-Euler rigid movement, relative movement and source-change counterexamples.
- Exact source/pack arithmetic, idempotent add-missing actions, retained legacy connection records and user snapshots.
- Stable labels, saved custom guide/history, reviewed refresh/Undo, formats 1–4 recovery and unsupported future/raw-byte refusal.
- Desktop/phone authoring, saved/reopened/imported JSON, useful print/CSV, immutable Docker restart and a bounded real AI edit preserving manually authored work.

Implementation and qualification are recorded in the requirements audit when complete. This plan grants no load, installation or code approval.
