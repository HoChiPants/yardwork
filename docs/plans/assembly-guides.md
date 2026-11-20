# Deterministic assembly guides: implementation contract

The guide should describe physical stages of the saved typed design, rather than treating every declared panel section as an assembly. The existing geometry, section membership, source stock, cuts, joints, labels and user instructions remain authoritative. A generated order is a reviewable construction aid, never a fastening, capacity or code approval.

## Pure stage factory

Add `src/assemblyStages.ts` exporting `assemblyStages(project): AssemblyStage[]` where `AssemblyStage = { ownerId: string; key: string; title: string; memberIds: string[]; notes: string; order: number }`.

`ownerId` is the persisted idea entry ID, otherwise declared section ID, otherwise project ID. `key` is a bounded semantic key scoped to the owner, never a display name or array index. The factory returns nonempty physical stages; zero-part missing-system reviews belong in the notes of the final relevant physical stage or the final review, because the agreed assembly metadata requires at least one member. Every active piece appears exactly once across returned memberIds. Offcuts appear nowhere in assembly ownership and remain in their separate retained-stock table. Purchased supplies and recorded joints are not inferred to be installed meshes.

Resolve bound ownership from entry.sections role-to-section mappings and actual current section membership. Apply roles only within their owned entry. Preserve entry order as explicit proposal order and use family-specific stage order within each entry; full Euler moves must not turn roof work into the first phase by world-height sorting. If role metadata is missing, ambiguous or custom, route every remaining piece to an explicit owner-level review stage. For unbound work, use declared section ID as coarse grouping; assembly strings are display labels for a conservative loose-parts fallback, never family identity.

## Stage map for all five whole builds

| Typed family | Physical stages and owned roles | Required concrete review |
|---|---|---|
| `casework-shelves` | `carcass`: side-left, side-right, back, top, bottom. `shelves`: shelf-1..N. | Dry-fit and clamp the five body panels, check outside dimensions and square, keep access for the actual recorded joints/back fixing. Shelf support/drilling review precedes placing shelves. Only explicit valid shelf-pin plans supply a hole layout; uncovered shelves remain unsupported design intent. Wall restraint is a conditional later review, not an assumed installation. |
| `closet-insert` | `carcass`: actual designRole bottom/top/side-left/tower-left/tower-right/side-right. `tower-shelves`: tower-shelf-1..N. `rods`: hanging-rods section. | Clamp/dry-fit casework and verify clear bays, then review actual shelf supports and rod sockets/center supports before fitting corresponding pieces. Legacy support-role adoption identifies only explicitly mapped dividers/shelves: remaining casework panels stay a coarse carcass/custom-panels review; never guess top/sides from names or order. Missing rods/supports stay explicitly unbuilt. |
| Furniture storage banquette | Per stable module entry: `bottom-frame`: storage bottom plus legs/top rails/cross rails; `shell`: front/rear/left/right shell panels; `seat-lid-back`: actual seat/lid and optional back. | The storage legs start on the bottom panel, so do not describe a free-standing frame built before that bottom. Check storage access and clamp/tool clearance before closing shell. Lid preview is a provisional pivot: hinge, stays/hold-open, pinch/wall clearance and fastening remain unresolved unless explicitly planned. |
| `greenhouse` | `base`: base-framing; `walls`: wall-framing; `opening`: door-opening-framing and door-leaf; `roof`: roof-framing and gable-framing; `glazing`: actual glazing-wall/gable/roof/door-panels sections. | Review anchoring and temporary bracing, dry-fit the opening/leaf, then actual plumb-cut roof members. Bearing/hanger/birdsmouth and fastener decisions remain unresolved. Retain source-specific glazing/flute orientation and actual cut profiles; closures, thermal allowances and fixing system are still conditional. No glazing section means cladding is unbuilt, not transparent installed material. |
| `sauna` | `walls`: wall-framing; `opening`: door-opening-framing; `ceiling`: ceiling-framing. | These are exterior dimensional framing only. Foundation, actual door, insulation/foil/furring/lining, heated benches, heater/electrical/ventilation remain unbuilt. State reserved clear interior/bench volumes from typed dimensions as reservations, not installed components or heat suitability. |

Ordinary framed shelf/cabinet/workbench/bench recipes can use `frame`, `infill/shelves`, and `top-seat-back` when explicit new designRoles exist. Otherwise use one whole-module stage. A legacy independent-panel bookcase is not automatically converted into a typed whole family.

## Minimal annotations

Casework, greenhouse and sauna already expose enough persisted typed section roles. New closet generation already has actual panel designRoles without changing the existing casework-panels/hanging-rods section layout. Storage/furniture recipeParts currently has no role tags. Add explicit tags at each generator add call (e.g. storage-bottom, frame-leg, frame-rail, storage-front/rear/left/right, seat/lid, back, shelf-N); do not parse generated labels into roles. No extra Piece stage field is needed. Old geometry remains unannotated and uses conservative whole-module output. Optional explicit future adoption may match unique full physical signatures to a typed baseline while preserving every actual cut/part/joint; ambiguity or cuts must never be silently blessed.

## Durable phases and regeneration

Format4 `Step.generated` is a discriminated union: retain prep records unchanged and add assembly-stage `{kind, planId:ownerId, stageKey, memberIds, notes, fingerprint}`. Match prior stages by owner+key and preserve their UUID. Store the exact generated notes baseline and strip only that exact text anywhere in edited notes before appending the current baseline. Preserve custom text once. Fingerprint actual member geometry/material/source/stock axis/profile/pose plus relevant actual joints/tool-access inputs, excluding stepId. Same key+same inputs preserves completion; changed physical inputs reset completion. Add the minimal binding kind/role mapping to guide designFingerprint, excluding revision tokens/current fingerprints/generated phase stepIDs.

When one old generic phase splits into several stages, shared custom notes and free-text history cannot be assigned by part-name guesses or copied into each new stage. Retain one custom/historical review phase with its original ID and no obsolete generated installation text; map ambiguous history there. Keep removed stages with custom text/history similarly; remove only unused generated-only phases. Preserve stable shelf-pin/restraint prep IDs and exact custom baseline extraction. A missing/stale prep plan must not resurrect its old generated drilling/installation prose. Section mapping stepIDs remain advisory after guide regeneration; do not rewrite ownership.

Assign each recorded joint exactly once to the later stage owning its actual endpoints; cross-entry joints remain recorded references. Missing/offcut endpoints belong in final connection review. Show real type/quantity/length only, plus an explicit unresolved fastening schedule where absent. Do not invent screws, spacing, clamps as installed hardware, load support or drill coordinates. Reference existing cutInstructions for actual blanks, retained profiles and lineage; geometric face angles are not machine settings.

## Tests for implementation

1. All five families: disjoint ownership equals all active IDs exactly once; offcuts excluded; deterministic semantic order; missing systems remain explicit.
2. Casework default eight panels becomes five carcass + three shelves, with .703 source thickness and cuts untouched. Closet groups actual six carcass/four tower panels and actual rods where present; legacy explicit mappings work without name/order inference.
3. Storage bottom/frame/shell/lid stage order follows actual construction geometry; older no-role storage remains one module stage. Greenhouse retains clipped profiles/flutes; sauna never claims absent heater/lining/bench/door.
4. Reordering names/member arrays and full Euler moves preserve identity/order; removed/missing/custom parts are all visible once. Mixed families, edited cuts and manual additions remain separate/owned safely.
5. Ten regenerations/count/source/dimension changes, save/reopen and imports preserve stable phase IDs, custom notes/history once, prep IDs and valid references. Removed-plan baseline text stays removed. Changed stages reset completion while unchanged stages preserve it.
6. Phase/notes limits fail before mutation with clear errors; no truncation or source/provenance loss.

Implementation now includes the pure stage factory, format-4 metadata, stable review history, anchored manual steps and label-consistent cut exports. Final browser/container qualification is recorded separately in the evidence audit.
