# Scoped idea refinement

Research and implementation checkpoint, November 16, 2026. The scoped first pass below is implemented; stable proposal/run identities and applied-section revision guards remain a later stage. The original research observations are retained as failure provenance.

## Confirmed failures

Run `npx tsx scripts/refinement-repro.ts` for current read-only observations. Add `--assert-desired` to fail if any of the seven desired behaviors is absent; it now passes after the scoped first implementation. This standalone probe complements the normal regression tests. The historical observations below are local preset behavior before that implementation, not claims about the connected model.

The seed is three enclosed 24 × 24 × 18 inch seats, a 72 inch straight run, with opening lids and no back. Positions are X = −24, 0, 24 inches. Measured widths below come from generated geometry, not the sum of module fields.

| Follow-up                                                          | Actual result                                                                                                                                   | Required behavior                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Overall width 96 inches                                            | Each seat becomes 96 inches; centers remain fixed. Actual envelope is 144 inches, with overlapping compartments, and fails a 96 inch work zone. | Three 32 inch seats, centers −32/0/32, actual outside width 96.                                |
| Banquette section 2, 30 inches wide                                | All three become 30 inches.                                                                                                                     | Only the identified section's width changes; preserve other sections' sizes/features/products. |
| Each section 30 inches wide                                        | Widths change but centers do not. Envelope is 78 instead of 90 inches because neighbors overlap.                                                | Reflow a recorded straight run to centers −30/0/30.                                            |
| Add a 36 × 20 × 60 inch cabinet next to the seats                  | Existing benches become 36 × 20 × 60; no cabinet is added.                                                                                      | Retain the three benches and propose one new cabinet.                                          |
| Four sections, with the middle seat using `.703` plywood           | All four inherit the first seat's generic plywood. No question is asked.                                                                        | Preserve section-specific product choices or ask how to repartition heterogeneous sections.    |
| Change greenhouse width in a mixed greenhouse/sauna/bench proposal | Other structures and all furniture modules disappear from the proposal.                                                                         | Patch the targeted greenhouse; retain every unrelated proposal entry.                          |
| Depth 18, no units                                                 | All seats become 216 inches deep, without a question.                                                                                           | Ask whether 18 means inches or feet and retain the proposal.                                   |

At the research baseline, `localIdeaPlan` mapped every supplied dimension onto every furniture module and its count-change branch merged from the first module. `localStructureIdea` read only the first previous structure and returned a replacement single-family plan. The request schema has a `previousPlan` but no operation, stable target or dimension scope. These are semantic omissions; changing the model prompt alone cannot reliably fix them.

## Smallest maintainable route

Keep the deterministic recipes and family generators. Introduce a small intent/patch layer between language and geometry. Both local parsing and the connected model must produce the same bounded intent. A full generated plan can remain an initial creation format, but follow-ups must pass through the scoped reducer and dimension checks.

Three operations are enough initially:

- **Add:** create a new supported family/recipe beside the current design, retaining existing entries.
- **Revise:** patch an identified proposal entry, layout run, or applied section; preserve every unspecified field.
- **Clarify:** ask a short targeted question, retaining the complete current proposal and workspace.

A new idea starts a separate proposal only through the existing explicit New idea action. “Add” never means revise existing benches. Switching family in a follow-up must not silently delete the previous family. Delete/replace operations can be added later with explicit target IDs and visible removal counts.

Conceptual payload:

```ts
{
  operation: "revise",
  baseRevision: 4,
  target: { kind: "layout-run", id: "seating-run-1" },
  changes: [{ dimension: "outside-width", scope: "run-total", inches: 96 }],
  anchor: "existing-center"
}
```

Use a discriminated Zod schema, enum dimension keys, bounded finite values and explicit optional fields. No arbitrary property paths, code or executable expressions. Return `unchanged + questions` for an unknown/ambiguous target or unsupported operation. A clarification result may include useful suggestions, but must never empty the retained plan to signify a question.

## Targeting, dimensions and layout

Proposal entries need stable IDs, distinct from names and array positions. A persisted layout run records its member IDs, order, origin/yaw, gap and anchor. The three-section preset already knows it created one straight run: record that fact rather than repeatedly guessing from similar yaw values. On apply, retain proposal-entry → section-ID mappings so future edits can address actual saved sections. Legacy/imported plans without this metadata remain editable; infer a run only when adjacency/order are unambiguous, otherwise ask the user to select members.

Request scope must distinguish:

| Scope            | Example                                      | Deterministic effect                                                                                           |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Run total        | “Make the whole banquette eight feet wide.”  | Resize the run envelope, distribute usable width among its members, reflow their centers.                      |
| Each member      | “Make every compartment thirty inches wide.” | Set each member width; compute the new run envelope and centers.                                               |
| Named member     | “Make section two thirty inches wide.”       | Change that member's width only. Reflow dependent poses only inside its recorded run and report moved members. |
| Shared feature   | “Make all seats twenty inches high.”         | Patch bench seat height; do not change a cabinet, roof or sauna clear height.                                  |
| Family dimension | “Sauna clear inside width six feet.”         | Change the declared clear interior, then derive the outside framing.                                           |

For a straight run, preserve its center and yaw by default. With total width `W`, `n` members and gap `g`, usable width is `W − (n−1)g`. Preserve previous member-width ratios unless equal widths are explicitly requested. Member centers follow cumulative widths and gaps in the run's local X axis, then transform through the stored pose. Never scale stock thickness, screws, brackets or cut profiles to obtain the outside dimensions.

For a named-member change, preserve other members' dimensions, product selections and features. A recorded run may require dependent positions to move; show that in the preview (“resize section 2; move sections 1 and 3”). Objects outside the run remain byte-for-byte unchanged. Without a recorded relationship, preserve other poses and flag any resulting intersections; offer a reflow action instead of inventing a connection.

An L/U layout needs explicit run/footprint semantics. “Width” could mean back run, return run or global bounding width. Reuse the existing nonoverlapping L recipe when its footprint parameters are known. Ask which run to change when the target is ambiguous; never apply a global width to each perpendicular member. Repartitioning heterogeneous members must preserve assignments or ask which material/features should be carried to the new compartments.

## Measurement and source fidelity

Parse a measurement once into canonical inches, retaining the raw text, declared unit and whether it is measured or provisional. Support feet/inches combinations and number words through one shared parser instead of separate furniture/structure regular expressions. Do not guess a unit for an isolated follow-up value. The numeric controls already provide explicit units and should emit the same typed changes directly.

Keep semantic dimensions explicit: outside width, seat height, back height, clear inside width, door opening width, roof rise and raw cut-blank length are different fields. Display the actual dimension convention near each control. The sauna's outside framing may exceed its requested clear interior; greenhouse ridge height is eave plus rise. Verify a requested dimension against the derived geometry or its declared reference volume after generation, within a small stated tolerance. Never silently clamp an explicit measurement to a preset, work zone or available stock.

A work zone is measured context, not a command to rescale the idea. Preserve its centered X/Z, floor Y=0 convention, reference linework and obstacles. Check the complete changed assembly against it. “Fit this space” can request a bounded dimension solve; otherwise a size conflict remains a visible finding with alternatives. Preserve existing occupied bounds and access assumptions when placing additions.

Retain exact material IDs and trusted registry references on untouched/unspecified fields. Build using the selected actual stock thickness (`.703`, not `.75`) before calculating clear bays, skins, rails and lid pivots. Validate role qualifications and product geometry through the existing trusted registry. A source-exact identity never grants a structural rating, installation approval or fresh local stock. Do not change source material because an AI response omitted it.

## Preview/apply contract

A reducer takes `current state + validated intent`, producing a candidate, explicit change list, findings and questions. It has no side effects. Compare the base revision before apply so a stale proposal cannot overwrite a more recent manual edit.

Preview the delta: added/changed/removed sections and parts, dependent movements, exact old/new dimensions, stock requirements, affected connections and unresolved assumptions. Unrelated settings, store snapshots, tools, notes, reference lines and pieces survive. Manual cuts/profile/lineage changes make a recipe “modified”; do not quietly rebuild them. Reuse `recipeModified` and `previewRecipeResize` to show what a dimensional rebuild will replace. Keep removed connection counts visible, invalidate the generated guide after geometry changes, and preserve undo/save/import behavior.

Store structured change/assumption metadata with proposal/section provenance; notes remain a readable export, not the only machine identity. Do not carry an old purchased-stock lineage onto newly regenerated, differently sized stock as if it were already cut. Preserve real lineage on rigid moves and lid-open previews.

For the connected model, use the same intent schema and target IDs. Send relevant measured context, not arbitrary replacement authority. Independently compare requested measurements with its proposed changes; invalid or ambiguous output yields a preserved plan plus questions. Provider/schema protocol success and natural-language intent fidelity remain separate qualification claims.

## Implementation sequence and acceptance

1. **Correct the dangerous scope defaults first.** Add one shared measurement extractor and explicit operation/target resolver. Handle total-run vs each-member widths and run reflow. Add/named/mixed-family requests that cannot yet be compiled must preserve the plan and ask a targeted question. Never run them through the current blanket map.
2. **Add stable proposal/run IDs and the pure reducer.** Backward-compatible optional metadata, versioned request shape, explicit add/revise/clarify results. Preserve each family generator and introduce a small family registry describing supported parameters, dimension semantics and build callback. This avoids another large parser branch for each future family.
3. **Connect editing and apply.** Send selected entry/section IDs from the UI, show the change list, guard stale revisions, preserve all unrelated entries, and use existing recipe resize/guide invalidation paths for applied objects. Keep New idea explicit and additions intuitive.
4. **Qualify local and real-model behavior separately.** Move the seven standalone probes into normal regression tests once fixed. Add rotated/nonzero-pose runs, unequal widths, exact `.703` material, mixed cabinet/bench features, stale revisions, manually cut parts, work-zone mismatch and JSON round-trip. Then browser-test a three-seat width change, a named section, adding an adjacent cabinet, and editing a mixed proposal through preview/apply/undo/save/import. Run real model prompts against those same semantic assertions; malformed output must never mutate the design.

Acceptance is geometric and behavioral: the requested outside/clear measurement is actually met; unspecified parts/features/products remain; additions add; scope questions preserve the current plan; edited geometry survives the existing persistence workflow. These checks do not establish construction capacity, manufacturer installation compliance or future jurisdiction/code approval.

## Scoped first implementation

`ideaEdits.ts` now supplies shared measured-unit conversion, scoped furniture edits, recognized straight-run inference/reflow and append/clarify preservation. `localIdeaPlan` retains unrelated mixed-family entries, appends new items at the tail, honors total/each/named dimensions and keeps heterogeneous material choices until their repartition is clarified. `structureIdeas.ts` patches the matching structure in place. Raw explicit measurements precede model-added numeric suffixes; mixed feet/inches, common number words, fractional inches and “five-foot overall return” are covered. A fresh sauna bench reservation is bounded to the clear room without shrinking a previous or explicitly requested bench.

The proposal UI has an overall seating-run width control, scoped individual widths and short add/refine guidance. Its existing per-module count remains a count of actual editable modules. Twenty new edit regressions and three raw-intent grounding tests cover these semantics; the seven original probes now satisfy their desired assertions. Existing planning/recipe/family and compact-intent/API regressions also pass locally. All three browser refinement cases pass after source freeze, including whole-run sizing, per-section numeric controls, additions and preservation of mixed structure proposals. The first targeted run exposed a section ordinal being parsed as a bare measurement; its failure log was retained and the exact regression was added before the successful rerun.

This first pass infers an adjacent straight run rather than persisting stable group IDs. It does not yet provide durable applied-project intent identities, revision-based patching, arbitrary cross-family constraints or construction qualification. Ambiguous L-run width and heterogeneous repartition requests preserve the proposal and ask instead of guessing.
