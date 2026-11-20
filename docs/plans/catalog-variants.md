# Incremental catalog, capability evidence and purchase-pack plan

Prepared 2026-11-16 against the current source. This document changes no runtime behavior. The next implementation batch is six sourced tool references plus correct bundled-stock purchasing; the later catalog migration and sauna materials are separate follow-ups. No account or new inventory provider is needed.

## Current behavior and constraints

| Area | Current implementation | Consequence for the next batch |
|---|---|---|
| Editable materials | `src/model.ts` defines28 `materialIds`, a static `MaterialId` union and `catalog`. Pieces, joints, inventory and section recipes use `z.enum(materialIds)`. `material(id)` assumes a matching record. `src/structureIdeas.ts` and `src/structures.ts` also use those IDs. | Keep these IDs and schemaVersion1 unchanged for this batch. Tools do not need material IDs. Loosening one schema to an arbitrary string would create unresolved engine references. |
| Product identities | `src/retailerCatalog.ts` is a separate, author-reviewed registry with bounded IDs, exact offers, source records, status, stock profile, optional material family and scoped role qualifications. It permits10,000 records. | A larger registry need not imply thousands of editable material enums. Exact products and reusable geometry profiles can grow separately. |
| Material binding | `checkProductBinding` compares reviewed identity, exact actual dimensions, stock kind, wood/nonwood and pack count; discrepancies block material binding. `reviewedOfferForMaterial` already excludes retired offers. | Preserve those checks. A geometry match is eligibility for a specific procurement reference, not structural/application approval. Existing geometry must never resize when a product is selected. |
| Tool reviews | Project `toolSelections` persists product ID and ISO `checkedAt`, defaulting to[]. `selectedToolsForProject` accepts reviewed tools but identifies evidence only through a DEWALT hostname and `/Instruction_Manual/` pathname. | Replace the URL heuristic with explicit, scoped author-reviewed evidence. Preserve existing saw/drill selection IDs and review behavior. |
| Tool panel | `ToolsPanel.tsx` infers manufacturer pages from `/product/`, instruction links from `/Instruction_Manual/`, and renders all offers without distinguishing retired ones. | Render evidence by declared type and scope. Show reference offers as retailer links; retired offers belong in labeled audit details. |
| Purchase quantity | `bom` counts linear bins, packed sheets and valid physical cut-source groups. Hardware already uses `ceil((placed items + connection items)/packCount)`. Linear and sheet branches ignore `packCount`. | Count required physical stock first, then convert it once to purchase units. Never apply another division to existing hardware purchase quantities. |
| Snapshots and exports | BOM price/availability use the selected retailer/store/ZIP, matching material ID and snapshot freshness. App, CSV and handoff use `row.quantity` and `Material.unit`. | Keep `row.quantity` meaning purchase units. A bundle snapshot is priced/countable per bundle, while cut layouts still count individual boards/sheets. |
| Physical cut history | `cutStock` identifies original stock and nonoverlapping source-local regions. Valid shared sources are counted once; invalid sources fall back conservatively and are flagged. Sheet nesting now plans unrelated rectangular parts separately. | Bundle conversion must run after these source-counting decisions. It must not merge independent stock sources or count an offcut as an additional purchased board. |

## Batch A: six useful tools with exact capability evidence

Use [the research table](../common-tools-research.md) and [structured proposals](../common-tool-proposals.json). Add the following registry IDs without adding construction materials:

| Registry ID | Exact reference | Narrow capability | Reference-status retailer offer |
|---|---|---|---|
| `dewalt-dwht38125s` | DWHT38125S tape | `measure` | HD317266301. Exact Lowe’s5019101837 is retired marketplace; keep it labeled in audit data. |
| `swanson-s0101` | S0101 square plus Blue Book | `square` | Lowe’s3048693. |
| `swanson-s0101-c` | S0101-C square plus Blue Book and Speed Clip | `square` | HD312986101. This is a different package, not an offer alias for S0101. |
| `bessey-gscc2-524` | GSCC2.524 clutch clamp | `clamp` | HD204986197. No invented Lowe’s counterpart. |
| `estwing-e3-16s` | E3-16S rip hammer | `drive-nail` | HD100351734 and Lowe’s1111955, exact same model. |
| `3m-90565-4dc-ps` | 90565-4DC-PS earmuff | `ppe-hearing` | HD301277013; one earmuff per retail pack, four packs per case. |

All six retain null body geometry. Partial measurements such as blade length, clamp opening and hammer head weight keep their own semantics. Manufacturer/retailer field conflicts remain visible; they need not erase an independently documented function. A clamp force is not an assembly capacity, and a hearing NRR is not personal attenuation or measured operation noise.

### Evidence schema and adapter

Add a bounded `toolCapabilityEvidence` array to the author-reviewed product schema, defaulting to[] for record compatibility. Use the existing capability IDs from `src/tools.ts`; importing the tuple directly must first avoid a new `tools → model → retailerCatalog → tools` cycle. Extract only the primitive capability constants/types into a dependency-free module, or keep a schema-local enum with an equality test until that extraction is worthwhile.

Suggested record shape:

```ts
type ToolCapabilityEvidence = {
  capabilities: ToolCapability[];
  evidenceType:
    | "manufacturer-manual"
    | "manufacturer-use-instructions"
    | "manufacturer-product-specification"
    | "retailer-hosted-manufacturer-document";
  sourceRefs: string[]; // exact existing product.sources URLs
  scope: string;
  requirements: string[];
};
```

Require nonempty bounded capability/source/scope/requirement values. Every source reference must equal a reviewed source on that product, every capability must be one of its declared functions, and only reviewed tool records may supply usable evidence. Add only the researched primary hosts to the approved-source list. A trusted hostname alone must never grant a capability. The registry is application-owned source data; project JSON, snapshots and AI responses may select a registry ID but cannot introduce or override evidence, roles, review status or source approval.

Populate explicit evidence for the existing DWE575SB and DCD771C2 records using their current manufacturer manuals and revision limitations. Do not retain a fallback that attributes every flat capability to every product URL. For each selected tool, the adapter should create `SelectedTool.evidence` entries using only that entry’s capabilities and referenced source dates. A selected model supports the union of those evidenced functions. Preserve the existing nonfuture source/user review checks and also reject a future product review date. An empty evidence array remains visibly unknown even if a flat capability name is present.

For the hand tools, accurately label specification/use-instruction evidence rather than inventing a model-specific manual. The Swanson PDF link is known, but the reviewed product page directly documents the narrow square function; do not claim image-only PDF contents were extracted. The hammer evidence is scoped to common nails. None of these records automatically supports `connector-install`, material cutting, eye protection or respiratory protection.

Update the panel and guide to display manufacturer evidence with its type, scope and requirements. Keep checkboxes as a record of the user’s review; preserve unknown-ID, candidate, duplicate and invalid/future-date warnings. Preserve existing project selection serialization and export unknown selections rather than dropping them. No tool prices or stock are introduced.

### Batch A file boundaries and checks

- `src/retailerCatalog.ts`: evidence schema, exact source membership/category checks, six records, two existing tool evidence records, narrowly expanded source hosts.
- `src/toolGuide.ts`: evidence adapter and accurate export labels; no filename/host substring inference.
- `src/ToolsPanel.tsx`: evidence display and reference-offer filtering; audit labels for retired offers. No changes to material placement or structural support.
- Tests: new `tests/tool-products.test.ts`; extend `tests/tool-guide.test.ts` and `tests/retailer-catalog.test.ts`; extend `tests/browser/tools.spec.ts` for actual review/persistence/rendering.

Acceptance: existing two tools keep their documented functions after reopening a saved project; selecting tape/square/clamp/hammer produces only the corresponding supported functions with exact sources; unsupported operations remain unknown. Forged source refs, an unrelated primary URL, non-tool/candidate records, missing evidence and future review dates cannot produce supported status. A scope for one capability cannot be inherited by another. The retired tape offer is not rendered as a current buying reference. Tools still do not appear in material BOM, cost, support or collision geometry.

## Batch B: purchase bundles without changing cut geometry

Keep `Material.size`/`stockSize` as dimensions of **one physical board, sheet or hardware item**. Keep `packCount` as physical stock items per purchase unit; it is not a master-carton count. Keep `Material.unit` as the sell-unit label, such as board, sheet, box or bundle. Existing records with `packCount:1` retain every current quantity and price.

Add explicit BOM bookkeeping so the display does not infer stock units from purchase quantity:

```ts
type PurchaseCount = {
  stockUnits: number;       // required source boards/sheets, or physical hardware
  packCount: number;        // physical items per purchase unit
  quantity: number;         // ceil(stockUnits / packCount), remains purchase units
  purchasedStockUnits: number;
  spareStockUnits: number;  // purchasedStockUnits - stockUnits
};
```

Use a small pure purchase-count helper that rejects invalid noninteger/nonpositive pack counts. Compute `stockUnits` once from each existing planner branch. Linear stock uses the final `bins.length`; cuttable sheets use unique valid physical sources plus packed new sheets, retaining current invalid-source fallback; noncuttable sheets use the existing per-stock count. Hardware uses its raw placed-plus-connection count and then the same helper, removing its existing inline division. Rolls should retain their current supported behavior; apply bundle conversion only after the roll planner’s physical count and only when a curated roll pack is actually defined. Do not silently generalize the mesh-specific planner to unknown flexible products.

For all branches, `quantity` drives snapshot comparison and `total = pricePerPurchaseUnit * quantity`. The planner’s bins/sheets/rolls remain physical stock layouts, not bundles. Keep oversized parts excluded and unresolved. Existing conservative placed-hardware versus connection-item double-count warnings remain until those records gain real shared identity.

Examples that must pass:

| Physical requirement | Pack | Purchase result | Geometry/cut result |
|---|---|---|---|
| Five full boards | Six boards/bundle | One bundle, five required boards, one spare board | Five source-board layouts, not one giant board. |
| Seven full boards | Six boards/bundle | Two bundles, seven required boards, five spare boards | Seven source-board layouts. |
| Kept pieces and retained offcuts from two sequential cuts of one board | Six boards/bundle | One bundle, one required board, five spare boards | One validated cut source; do not charge three boards. |
| One board ripped into two strips | Six boards/bundle | One bundle, one required board | Preserve one source group even though both strips are full length. |
| Three required source sheets | Two sheets/pack | Two packs, one spare sheet | Three physical stock layouts/source references. |
| 121 connector nails | 120 nails/box | Two boxes,119 spare nails | No second division of the already-rounded quantity. |

Do not treat spare purchased boards as placed project geometry or as cut-source records. They are purchasing surplus, not reusable modeled remnants until explicitly introduced into the project. Do not reduce quantity because a user reports owned stock; ownership/inventory reuse needs its own explicit later model.

Update the BOM row display, shopping CSV, retailer handoff and printed guide to state, for bundles, for example “2 bundles ×6 boards;7 stock boards required;5 spare.” Keep existing cut-layout heading based on physical bins. Append explicit stock/pack/surplus columns to CSV while retaining the existing purchase-quantity meaning. Clarify snapshot import/sample documentation: price and available count are purchase units of the exact selected pack. `checkProductBinding` must still reject mismatched pack variants; two identical board dimensions in1-pack and6-pack are different procurement variants.

Batch B files: `src/engine.ts`, `src/handoff.ts`, the BOM/print sections of `src/App.tsx`, snapshot/CSV documentation, and a new `tests/purchase-packs.test.ts`. If a helper is extracted, keep it independent of registry/model to simplify unit testing. Use synthetic stock/count fixtures or scoped cloned material fixtures; do not add a fictional retailer product just to exercise six-board arithmetic. No sourced bundle should enter the editable catalog before its geometry, actual sell unit and source identity are reviewed.

Regression coverage: all pack1 catalog counts; empty requirement=0; counts below/exactly/above one pack; linear kerf packing; shared sources and retained remnants; rotated source geometry; invalid/overlapping/out-of-source lineage conservative counts; nested new sheets plus physical sheets; oversized exclusions; hardware pack100/120 and unresolved sizes; snapshot stock1 versus two required bundles; total price per bundle; JSON reopening, handoff, CSV and printed-unit descriptions. `bins.length` and `sheets.length` must never be overwritten with the rounded bundle quantity.

## Later: larger SKU catalogs with stable geometry

Keep the static enum for the immediate batch. It gives current imports strict resolution and is not a blocker for six reusable tools. Avoid adding a generic free-form string now merely because the registry allows10,000 products.

When real material variants outgrow the curated enum, introduce an explicit catalog resolver and a versioned project migration:

1. Preserve existing material IDs as legacy geometry-profile aliases. Introduce separate bounded `MaterialProfileId`, `ProductVariantId` and retailer-offer identity. A nominal “1×4” family, an actual¾×3½×96 in board and an exact pack/grade/retailer SKU are different identities.
2. Resolve pieces against a project/catalog context before relaxing any schema enum. Replace global `material(id)!` assumptions across engine, planning, generators, sections, inventory and import/export. Validate every referenced ID at the boundary; retain unresolved imported definitions with visible diagnostics instead of silently substituting or deleting pieces.
3. Save the immutable physical profile snapshot and profile revision used by each project. A later registry correction or retailer refresh may propose an explicit migration with before/after dimensions and affected joints/cuts; it must not reshape old projects on load. Persisted geometry cannot grant a trusted application role or reviewed procurement status.
4. Keep procurement binding independent of placement. A compatible profile may offer several reviewed procurement variants, but a change of pack, grade, material system or actual thickness needs explicit validation. The HD and Lowe’s generic pine references remain separate retailer-specification identities; matching nominal names do not prove one manufacturer MPN across stores.
5. Give profile dimensions explicit meanings and axes: actual cross-section, length, thickness, full width, effective installed cover, fastener head/shank, hollow envelope and profile orientation. Current sorted bounding-box comparisons are insufficient for future T&G coverage/grain/channel orientation. Renderer detail may remain approximate while exact purchase profile metadata is retained and labeled.
6. Version snapshot mapping by exact product/pack identity and retain store/ZIP/time. Keep source reference review, user-recorded snapshot stock and price distinct. No “live” claim follows from a public listing or successful source fetch.

This migration needs a dedicated compatibility suite covering schemaVersion1 fixtures, legacy IDs, section recipes, joints, snapshots, cut lineage, local archive, JSON import/export, unsupported IDs and old guide regeneration. Ship it only when a concrete next set of dynamic material variants needs it.

## Scoped manufacturer roles and the Cedarbrook gate

Keep existing `roleQualifications` author-owned: `{role,scope,sourceRefs,requirements}`. Require exact source membership and reviewed record status. A caller/AI may select `{materialId,productRegistryRef}` but cannot assert `verifiedRole`, override a qualification or suppress its requirements. Preserve `resolveStructureMaterial` behavior: missing special-role evidence omits unsupported replacement geometry and explains what remains unresolved; generic framing may remain geometry-only with explicit unresolved suitability.

Compatibility and application evidence stay separate. SUNLITE H/U profiles and closure tape belong to a material family; one greenhouse role does not make a TUFTEX accessory interchangeable. A source-qualified casework panel does not inherit outdoor exposure or sauna heat suitability. A closet rod/support role does not establish span/load. Tool evidence does not qualify a connection schedule. Renderer envelopes and nominal flange dimensions must not silently become exact fit evidence.

Only after batches A/B should the [sauna proposals](../sauna-material-options.md) become editable catalog work. Cedarbrook `6-1X4-TNG` is positively sourced for raw sauna wall/ceiling lining, six boards/bundle,72 in length,3⅜ in full width,11/16 in thickness and3 in effective installed cover. Its bundle math can use Batch B, but installed cover/T&G geometry needs a distinct profile treatment before repeating solid boxes at3 in pitch. Specialist manufacturer-retail offers also need an explicit supported channel: the current registry requires an HD/Lowe’s numeric product offer, and none was verified for this bundle. Do not fabricate one.

Thermory Aspen sauna bench surface requires a new correctly scoped surface role if implemented; it must not be mislabeled `saunaBenchFrame`. Cedarbrook foil is order-length roll stock with unknown thickness, and its prehung sauna door has leaf/rough-opening/jamb dimensions plus included hardware. Those need their own geometry and purchase semantics. A whole retailer sauna kit remains one assembly with included-component provenance, not a source of invented cuttable boards or automatic insulation layers.

## Implementation order and verification

1. End the current runtime freeze only after parent verification; preserve the current passing baseline and all dirty work. No commit/push is part of this plan.
2. Implement Batch A evidence schema and migrate the two existing power-tool records; run targeted registry/tool adapter tests. Add six references and then panel/guide rendering tests.
3. Implement Batch B count conversion and additive bookkeeping; run pack arithmetic, BOM/provenance/sheet/hardware/handoff tests before UI copy changes. Finish CSV, snapshot-unit documentation and print review.
4. Run `npm run check` using the supported Node22 runtime, then the targeted browser flows. Recheck the five build studies for changes in tool coverage and material-unit reporting; their unrelated structural/application questions should remain visible.
5. Update [catalog coverage](../catalog-coverage.md) with the actual final counts and tool statuses. State evidence boundaries: sourced references, editable geometry, snapshot price/stock and completed operations are separate facts.

Suggested targeted command after implementation:

```sh
npx tsx --test tests/retailer-catalog.test.ts tests/tool-products.test.ts tests/tool-guide.test.ts tests/tools.test.ts tests/purchase-packs.test.ts tests/cut-stock.test.ts tests/sheet-plans.test.ts tests/reviewed-stock.test.ts tests/handoff-hardware.test.ts
npx playwright test tests/browser/tools.spec.ts tests/browser/materials.spec.ts tests/browser/build-studies.spec.ts
```

New test files in this command are planned deliverables, not tests already run. This planning change itself is verified only for source correspondence and document consistency.
