# Measured hinge stock and purchases

The first physical hinge reference reuses **Everbilt29256**, [Home Depot314150989](https://www.homedepot.com/p/314150989), a single nominal48×1.5in bright-nickel continuous hinge. There is no verified matching Lowe's reference, current store-stock claim or imported price. The catalog/product/supply counts do not increase for this feature.

The [retailer-linked instructions](https://images.thdstatic.com/catalog/pdfImages/43/43ad05ea-dd8a-438f-b10c-33d2ccdf1c95.pdf) describe transferring holes from the actual hinge and a1/16in pilot. They do not provide the axis offset, leaf/knuckle profile, hole-center pattern, supplied screw identity/count, pilot depth or installation capacity. Nominal48in versus the generic48.03in retailer height is preserved as a discrepancy, not resolved by inventing an actual length. No National V570 geometry or Everbilt19844 lid-support instructions are substituted.

`hingeProducts.ts` contains author-reviewed, revision-scoped reference facts. Measured dimensions remain project/user evidence: a source's `usableLength` and measurement date/basis start unknown. A proposed metal cut also starts with unknown source-local position and kerf. The wood-cut1/8in default is never used for hinge cuts.

## Physical source, segments and remnants

One `HingeStockSource` represents one physical hinge source, not a new modeled `Piece`, material variant or price row. A cut removes the interval `[position,position+kerf]` measured from its original end. Known, coherent measurements and nonfuture provenance are required before retained segments are derived. Unknown fields remain pending; overlapping/outside kerfs, coincident cuts and zero-length retained segments produce conflicts and no usable segments.

Segments keep deterministic identities from the source UUID and neighboring cut UUIDs. Their ends distinguish the original source start/end from each cut's before/after edge. Reordering the same cut records does not rename the segments. Later cuts split affected segments while unrelated original segments retain identity. Unallocated retained intervals are remnants, not newly purchased hinges. For example, a24in cut plus⅛in kerf in a measured48in source leaves23⅞in, so it cannot supply two full24in lengths.

The physical fingerprint includes source/product/evidence identity, measured usable length and cut IDs/positions/kerfs. It excludes notes, purchase links, basis/date and history; current review still checks provenance separately. Explicit stock edits append exact previous/next snapshots, bounded at50 records without deleting old history. No-op edits preserve the original object; Undo/Redo helpers preserve immutable receipts while restoring active values. Retained-source history truncation/rewriting is rejected through the exported prefix assertion.

## Purchase boundary

`hingePurchaseSummary(project,allocations)` consumes derived hinge-plan allocations and checks the measured source/segment again. Distinct segments of the same physical source count one hinge. Duplicate claims to the same physical segment, missing segments, unmeasured/conflicted sources and excluded/stale plan allocations do not silently add feasible demand. The summary lists included sources, allocated segments/remnants and unresolved reasons.

Existing manual supply selections remain the sole priced purchase records. Same-product quantities cover the source-unit requirement once; linked supply IDs are provenance, not a claim of ownership or automatic stock. `addMissingHingePacks` is an explicit user action, adds only the current shortfall, and creates no source, remnant, mesh, screw, hole or joint. A reviewed Home Depot reference stays visible when Lowe's is selected, but the add action respects the selected retailer and chooses no substitute. Existing exact-product/store/ZIP/time/manual-snapshot validation remains in force.

Supplied screw count/identity, metal-cut tooling, actual hinge mounting, head/leaf fit, lid stays, pinch protection, closed-seat load paths and capacity remain separate reviews. A feasible measured1D source layout is called `geometry-reviewed`; it does not approve the product identification, installation or loading. User-entered measurements must be displayed with their basis/date rather than presented as manufacturer facts.

Research provenance and cached primary documents are retained in `work/banquette-lid-next/` at the workspace root. No additional research, retailer account, purchase, live inventory connection or product mesh was introduced by this layer.
