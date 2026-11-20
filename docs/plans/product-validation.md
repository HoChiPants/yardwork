# Product validation program

Owner request, November 16, 2026: keep developing a commercially credible product, with real commonly sold Home Depot/Lowe's offerings, fasteners, materials, cuts and tools. Five acceptance builds drive coverage: greenhouse, sauna, kitchenette storage banquette, shelves, closet insert. Plumbing, sprinklers, electrical, roofing and HVAC are later trades. Real code grading is a later capability, not a current engineering/compliance claim.

## Current baseline to finish

Per-measurement work-zone units and stable top controls; editable storage recipes and opening-lid access previews; iterative idea refinement; exact section placement/dimension rebuild; surface/floor measuring; dedicated two-axis stock cutting. Track physical source stock through cuts/offcuts so purchases do not multiply. Existing drafts, references, snapshots, guides, connections and undo must remain intact.

## Next implementation sequence

1. **Verified product registry.** Separate modeled material/geometry from a manufacturer product and retailer offer. Store manufacturer part/UPC when supported, actual dimensions, grade/finish/pack quantities, authoritative specification sources, verification date and discrepancies. Match only compatible offers; links alone do not prove stock or interchangeability. Retain legacy unverified models with clear status rather than invent product matches. Both retailers remain snapshot-driven: the owner confirmed no partner accounts exist.
2. **Purchasing and tools.** Add retailer/store identity to snapshots, product mappings, selected offered variant, compatible hardware schedules and a non-geometric tool checklist. Keep tools out of structural support/collision/material volume. Include unmatched required equipment and hardware as unresolved purchasing items, not a complete quote.
3. **Reusable construction features.** Extend typed recipes/parts for panels, rails, rods, trim, doors/openings, slope/end cuts and connectors, with durable measurements/cut operations. Avoid giant baked models; every actual piece should remain editable. Keep manufacturer requirements and unresolved assumptions attached to a section/build.
4. **Five digital build fixtures.** For each fixture, verify dimensions/clearances, stock fit, feasible cuts and source quantities, explicit fastener/connectors, tools, build-guide references, JSON round-trip, edits, undo and rendered interaction. Measure unsupported/open components and unresolved design decisions; never convert a missing rule into a pass. Do not claim physical construction acceptance from screenshots or unit tests.
5. **Evidence-based findings.** Split geometric, stock, attachment, manufacturer and future jurisdiction/code findings. A rule records scope, version/source, inputs and pass/warning/unknown status. Future code rules require an identified jurisdiction/adopted edition and authoritative evidence; no universal safety or code score is inferred from contacts and bounding boxes.
6. **Repeat usable product checks.** Exercise the five projects through the UI, not only generator unit tests. Verify importing/exporting edits, cut profiles/stock lineage, real product references and missing-item handling. Run relevant checks/build and regression tests after final source freezes, preventing hot reload/server restarts from invalidating stateful browser tests.

## Family-specific boundaries

- Greenhouse: appropriate glazing, closure/profile/tape, product-specific expansion/fasteners, ventilation, roof geometry and anchorage/site loads.
- Sauna: heater-model room volume/clearances/ventilation and lining/envelope materials require manufacturer-specific review; do not treat generic plywood, pressure-treated wood or nails as automatically heat-compatible. Electrical/heater installation remains outside current supported trades.
- Storage banquette: usable enclosed compartments, separate opening lids, exact body/seat dimensions, stock profiles, joints and unresolved hinge/lid-support requirements.
- Shelves: actual shelf/rail/support parts, material span/load questions, anchorage and fastening choices; no unsupported load-rating claim.
- Closet insert: rods and compatible supports, shelves/cleats, anchorage, actual available wall/door/baseboard clearances, tooling and cut lengths.

Research is in `docs/catalog-research.md` and `docs/build-acceptance-research.md` as those primary-source audits finish. Source remains local and uncommitted until the owner requests a commit/push.
