# Intuitive workshop iteration

User-directed scope, November 16, 2026.

## Research findings

Startup restores browser drafts automatically and otherwise creates the coop. The editor has rotate gizmos and cuts but no direct part gesture and weak discoverability. Three decorative boards in catalog art can be mistaken for a stock limit. Material behavior hardcodes IDs rather than stock families. All recorded screws share one pack regardless of specified length. The assistant accepts one wall/base/coop command; arbitrary furniture requests fail with an irrelevant wall example.

## Implementation

1. Start blank every time. Preserve the previous browser draft for explicit resume, keep the saved-project library, and remove coop creation options. Legacy plans remain importable.
2. Keep internal step references for compatible storage, but remove mandatory step authoring from design. Generate a final guide from sections, geometry, connections, and recorded operations; invalidate it on design changes. Exports can generate the guide automatically.
3. Add a centered work volume in canonical inches with width/depth/height, an outline in 3D, fit-to-zone for an empty workspace, and out-of-bounds findings. Permit long stock outside the zone while cutting it to fit.
4. Add direct part drag on a horizontal plane and Shift-drag yaw rotation; retain precise move/rotation gizmos, expose 90-degree actions, and provide clear camera gestures. Snap matching faces only when the placement avoids introducing solid-part overlap. Show cut axis, retained length/kerf/offcut preview.
5. Expand lumber dimensions/lengths, panel thicknesses, nails, screws and brackets. Use actual dimensions and stock families for cuts and purchasing, per-hardware purchase packs, and conservative connection/bracing advice. Example prices remain labeled; snapshots remain the first-version inventory source.
6. Add a separate idea planner with a bounded, validated multi-part proposal. Offline presets cover banquette seating and common furniture assemblies; unrecognized ideas return questions/suggestions. Connected Ollama can propose bounded parts and section groups. Preview assumptions, dimensions, warnings and added parts before applying; never replace the whole workspace implicitly.

## Ownership and sequencing

- Materials lane: model.ts, engine.ts, catalog/connection tests.
- Interaction lane: Scene.tsx, editing.ts, gesture/snap tests.
- Planning lane: planning.ts, IdeaPlanner.tsx, server planner route, planner tests.
- Integration lane: App.tsx, guide.ts, work-zone form, CSS, browser tests, docs.

Independent lanes implement after this consolidated plan. Integrate through typed interfaces, then run TypeScript/build, meaningful domain/API checks and full browser flows. Inspect rendered desktop/mobile layouts and the actual direct gestures. Do not publish a commit unless requested in this iteration.

## Acceptance

Fresh load is empty even with a prior draft; prior draft and saved projects can be opened explicitly without loss. No coop generator appears. A user can add repeated boards of multiple sizes, rotate by gesture/buttons, choose cut axis, retain offcuts, and see zone and collision findings. A banquette request previews an editable multi-section proposal and assumptions without a wall-only failure. Unsupported ideas receive useful questions. A generated guide includes every active part once and preserves connection/history references, with a visible stale state after edits. Existing JSON imports and snapshot purchasing still work.

## Evidence boundaries

Work-zone, stock-fit, support/contact and bracing checks are geometric heuristics, not structural capacity calculations. Connector fastener guidance must follow manufacturer requirements. Source research: Southern Pine standard sizing and Simpson Strong-Tie connector fastener technical notes. Runtime natural-language quality must be distinguished from mocked protocol tests and local presets.

## Implemented and checked

All listed implementation lanes are integrated. The final local run passed 72 domain/API tests, strict TypeScript/build and all 33 browser tests. Real browser interaction covers direct mesh movement/rotation, cancel, camera isolation, both precision gizmos, surface stacking, catalog drop, work-zone bounds, idea proposals and guide generation/reopening. Additional regressions protect earlier drafts, save revisions and repeated guide regeneration.

The actual broader Ollama smoke remains unrun because no model service or Docker daemon was available locally. Local idea presets work now and are labeled accordingly. Source is left uncommitted as requested by the Git workflow preference.
