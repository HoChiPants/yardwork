# Five-build acceptance research and proposed implementation

Research checked November 16, 2026. This is a design/implementation recommendation, not a qualified construction plan, product purchase recommendation, or code-compliance assessment. No runtime files were changed for this research. Dimensions below are deliberately chosen digital test inputs; they are not universal construction or ergonomic prescriptions.

## Current boundary

The current planner expands bench, workbench, cabinet, shelf, frame and panel recipes into oriented rectangular parts. Bench recipes now support enclosed storage and a rear-pivot lid preview. Recipes retain dimensions and can rebuild stock cross-sections correctly. This is a useful base for casework, but it cannot honestly express a finished greenhouse or sauna merely by relabeling a box. Roof joints, glazing systems, layered envelopes, openings, equipment, clearances and trade-specific attachments need their own representation.

A digital acceptance build should prove that the application can represent, revise, cut-list, source, save/import, and sequence its components. Its remaining site/equipment/load/installation decisions must remain visible. A green software test must not become a green construction approval.

## Primary-source findings that affect the data model

### Greenhouse glazing is a system

Palram publishes a [SUNTUF product page with manufacturer installation and greenhouse-plan downloads](https://www.palram.com/us/product/suntuf-diy-polycarbonate-corrugated-sheets/). Its [corrugated accessory system](https://www.palram.com/us/palram-corrugated-system-accessories/) includes matching flashings, closure strips and EPDM-washered fasteners. Those components need separate takeoff rows, not an ordinary deck-screw substitution.

The [manufacturer SUNTUF Full Installation Guide](https://palram.canto.global/direct/document/grvc65bcll51h1r9t63r6qqh24/y61vxYKX0Ewp4FvwXe7vqa5gG1E/original?content-type=application%2Fpdf&name=SUNTUF+Full+Installation+Guide.pdf), PDF page 7, discusses ventilation for heat/condensation, UV-side orientation, thermal-movement drilling, and product/application-specific fasteners. It distinguishes roof and vertical fastening and advises adjustable torque rather than an impact driver. Do not apply that schedule to a different panel family. The downloaded PDF used for this reading has SHA-256 `1fb4fc64496465efb0aac453a42b1463e70c683351f511e0106155fa9cd3637e`.

A different system, [AmeriLux Multiwall Technical & Install Guide](https://ameriluxinternational.com/wp-content/uploads/2021/pdf-downloads/install-guides/amerilux-multiwall-install-guide.pdf), printed pages 14–17 (PDF pages 15–18), requires attention to flute drainage direction, UV face, expansion, compatible profiles, solid/vented edge tapes, compatible sealant, and drilling/washer details. Its profiles and sheet orientations are constraints on nesting and cuts. Its [base-and-cap appendix](https://ameriluxinternational.com/wp-content/uploads/2021/pdf-downloads/install-guides/amerilux-base-cap-install-guide.pdf) describes a separate support/detail system. Corrugated and multiwall materials must have distinct system IDs and rule sets.

### Sauna rules depend on exact equipment and envelope

Use the [Almost Heaven manufacturer manual hub](https://almostheaven.com/pages/download-our-manuals-guides) to identify the correct product/manual rather than choosing an arbitrary online sauna guide. Its linked [Harvia KIP manufacturer manual, Y05-0623 dated 02052023](https://cdn.shopify.com/s/files/1/0555/6355/0889/files/Kip_USA_CN_ENFR_Y05-0623_02052023.pdf?v=1683043679), printed pages 3–4 and 9, separates model/market clearance and room-size requirements, ventilation/sensor placement, heater backing, insulation/vapor layers, suitable interior wood, guardrails, and outward door operation. Electrical installation is explicitly assigned to a licensed electrician. These are equipment/environment-scoped requirements, not a universal “sauna pass.”

The [Custom Cut Sauna installation manual](https://cdn.shopify.com/s/files/1/0555/6355/0889/files/Custom__Cut_Installation_Manual-HarviaNA.pdf?v=1765397563), revision 9/10/2024, gives distinct bench/support, wall-layer, vent and door details. Its tool list includes measuring/level/square tools, drilling/driving, hammer/nail set, rubber mallet and several saw capabilities. A tool checklist therefore needs operation-specific capabilities and consumables, separate from installed materials.

Source conflict to retain: the [Harvia JH60BU1MUL product page](https://www.harvia.com/en/products/JH60BU1MUL/kip60b-60-kw-240v-black-ul) identifies type KIP60B and item JH60BU1MUL, but the retrieved English heading says Kip30B/3.0 kW. Its dimensional table lists 409 × 279 × 599 mm. Do not silently reconcile the inconsistent heading or mix this North American equipment with the separately published 400 V European KIP60. Use an exact regional model, manual revision, confirmed equipment dimensions and unresolved-conflict status before qualifying a clearance rule.

### Closet systems have matching hardware, substrate and cutting rules

The [ClosetMaid ShelfTrack 32175 manufacturer instructions](https://www.homebyames.com/on/demandware.static/-/Sites-root_b2c_closetmaid_catalog/default/dwb1847f29/installationPDFs/3217500_inst.pdf), document 01-11586-00, demonstrate separate track, standard, bracket, shelf, rod/support, end-cap and mounting-hardware components. Attachment details depend on substrate; track/shelf cutting is constrained, and rod-support spacing belongs to that specific system. Advertised loads depend on the prescribed installation and cannot transfer to arbitrary closet geometry. The [manufacturer planning page](https://homedepot.closetmaid.com/en-US/Installation/Pages/how-to-guides.aspx) also calls out room measurements and drawer/door clearance.

The [Knape & Vogt 29201 center support page](https://knapeandvogt.com/products/29201-center-closet-rod-support-bracket) separately ties its support to KV2 adjustable rods and describes included mounting screws. That is evidence for product-family compatibility and kit contents, not permission to substitute that bracket onto any rod.

### Moving lids need more than a rotating seat

[Sugatsune's lid-support catalog](https://www.sugatsune.com/content/page-files/product-literature/catalog-201c-313-382-lid-supports.pdf) distinguishes mechanisms, handedness, mounting geometry and torque selection using lid dimensions/weight. Preserve the current pivot preview, but add product-specific hinge/stay records, lid mass/center-of-gravity inputs and clearance checks before calling hardware selected. A “soft-close” label alone does not establish hold-open or pinch protection.

## Recommended representation

Use dedicated **recipe families sharing a small geometry/operation grammar**, rather than adding dozens of loosely related boolean flags to the current bench module.

- `casework`: carcass panels, frame rails/posts, bays, shelves, cleats, rods, doors and lids. Storage banquettes, shelves and closet inserts compose these parts.
- `greenhouse`: foundation/frame bays, roof form/pitch, door/vent openings, glazing-system reference, edge/support treatments, anchors and drainage details.
- `saunaCabin`: clear interior dimensions, layered envelope, benches/supports, door, ventilation layout, equipment references and model-scoped clearance envelopes.

Every family expands into ordinary editable parts and structured operations. Retain a versioned recipe, stable feature/part keys, dimensions and constraints so editing a dimension rebuilds appropriate members without scaling stock thickness. Keep existing part IDs where a feature is unchanged; invalidate only connections tied to replaced features.

Geometry additions should be explicit and bounded: oriented boxes; cylinders/tubes for rods; planar polygon extrusion for clipped gables/panels; rectangular openings; drill-hole and end-cut features. Arbitrary mesh imports can remain a separate later capability. A rotated bounding box is not an actual plumb-cut rafter or a drilled panel.

Each operation should record the affected part/product, resulting shape, cut/drill dimensions, kerf/tool allowance, orientation restrictions, required tool capability/consumable, prerequisite operations, and source for any manufacturer constraint. Each attachment should specify the real connector/fastener family, count, holes/pattern, substrate, source and qualification status. A touching face, snap, or rendered screw marker must not invent an installation schedule.

Keep product identity, physical material, usable stock and retailer offer separate. An offer needs retailer, product/SKU/variant, exact units/pack contents, store/ZIP or delivery region, observation time and provenance. Manufacturer instructions establish compatibility/specification evidence; they do not establish current Home Depot/Lowe's inventory.

## Five proposed digital fixtures

### 1. Storage banquette — close the current acceptance gap first

Input: three straight 24 in wide × 24 in deep sections, finished seat height 18 in, no above-seat back, enclosed compartments and independent lids. Materials for the geometry fixture: actual 1½ × 3½ in framing stock and ¾ in panels.

Per-section expected cut table from the current storage recipe:

| Part | Count | Physical dimensions, inches |
| --- | ---: | --- |
| Bottom and lid | 2 | 24 × 24 × ¾ |
| Front and rear | 2 | 24 × 16½ × ¾ |
| Left and right | 2 | ¾ × 16½ × 22½ |
| Legs | 4 | 1½ × 13 × 3½ |
| Top rails | 2 | 22½ × 3½ × 1½ |
| Cross rails | 2 | 1½ × 3½ × 19½ |

Acceptance: 42 editable parts total; shell parts meet without volume intersections; closed lids finish at 18 in; opening preserves each rear pivot and IDs; lids return exactly closed after save/import; resize preserves stock cross-sections and unrelated sections; a follow-up changes features without losing dimensions. Hinges, lid supports, mounting schedules, seat loads, finish/cushions and wall/access clearance remain visible unresolved items. Count hardware only after its real compatible product and attachment design are selected.

### 2. Freestanding shelf unit — shared casework foundation

Input: a 36 × 16 × 72 in carcass with three adjustable shelves. A reproducible casework fixture can use two 72 × 16 in side panels, two 34½ × 16 in top/bottom panels, and three 34½ × 15½ in shelves from ¾ in stock. Choose an explicit backing/bracing solution as part of the fixture; do not treat a missing back as already braced.

Acceptance: clear shelf widths subtract real side thickness; shelf locations and support holes stay associated; actual shelf pins/brackets/cleats and anti-tip hardware are separate products and connection records. Four specified pins per shelf would require 12 installed pins; a 50-count offer would produce one package **only when that pack count is verified**. Do not assume those values describe an already selected product. Tools derive from chosen panel cuts, hole pattern and joinery. Span/load and anchoring decisions remain unresolved until their required inputs and evidence exist.

### 3. Closet insert — casework plus rods and room obstacles

Input: a measured 80 × 24 × 84 in opening, with a shelf tower and hanging bays. Before generating a cut table, resolve whether these are clear opening or finished outside dimensions, the intended bay widths, baseboard offsets, door/trim encroachment, floor level, substrate/stud map, and the exact rod/support system. Represent these obstacles in the work zone rather than shrinking a generic box silently.

Acceptance: independently editable carcass/bays; rods use actual diameters and cuttable stock or adjustable ranges; sockets/center supports/fasteners and kit-included screws are counted correctly; shelves and rod spans are measured between real support faces; opening doors and access volumes do not clip the insert. Save/import retains product families and mounting decisions. A purchased kit uses its own manual and included parts; a custom wooden insert cannot inherit the kit's load claims.

### 4. Greenhouse — enclosure and roof/opening features

Input fixture: 72 × 96 in footprint, 72 in eaves, 24 in roof rise, one front door and one opening roof vent. These are software test parameters, not a snow/wind design. The roof's half-span/rise produce a theoretical slope length of about 43.267 in before overhangs and joint allowances; the generator must label that distinction.

Acceptance: real roof framing and clipped gable geometry; no studs or glazing fill the door/vent openings; cut records include angled ends and panel shapes; visible glazing has correct faces/orientation and selected system treatments; door/vent pivots and clearances persist. The takeoff includes selected glazing-system closures, flashings/profiles, tapes where applicable, compatible washered fasteners, door/vent hardware and anchors. Tools include the actual chosen glazing cut/drill/drive capabilities. Required unresolved inputs include site/foundation, exposure, snow/wind loads, panel system/thickness, vent sizing/control, glazing support and anchoring details. These must affect readiness, not disappear behind a generic warning footer.

### 5. Sauna cabin — equipment/environment acceptance, not automatic trade approval

Input fixture: 72 × 72 × 84 in clear interior test envelope, slatted seating, an outward-opening door, equipment location, vent/sensor features and a selectable layered wall/ceiling assembly. Preserve interior dimensions while material layers increase outside dimensions. Select and reconcile one exact North American equipment product/manual before qualifying its clearances; otherwise render a labeled equipment reservation and fail equipment-readiness acceptance.

Acceptance: distinct heat-environment interior material definitions and source evidence; layer/cut/coverage takeoffs; bench/support and concealed fastening features; door swing, heater/guard/service clearance and vent/sensor locations represented; parts and equipment remain editable after save/import. The equipment record is purchased as equipment, not saw-cut lumber. Manufacturer-qualified field rules are separate from unqualified design assumptions. Electrical supply, connection design, heater sizing/selection, drainage, ventilation performance, site enclosure and relevant approvals remain explicitly unresolved; the app must not generate an uncertified “code passed” result.

## Common acceptance gate and implementation order

For each fixture, require: named revision/inputs; actual editable geometry; dimensions/openings verified after resize; feasible cuts with retained orientation and kerf; installed hardware quantities versus purchased packages; owned/buy/rent tool checklist; source links and timestamped retailer evidence; generated sequence tied to real operations; save/export/import round-trip; and a bounded list of unresolved design decisions. A missing required product, package conversion, operation, or equipment rule makes the takeoff/guide incomplete.

Recommended order:

1. Finish and browser-qualify storage recipes, selected-section dimensions, lid access and follow-up preservation already in progress.
2. Add the reusable operation/tool/product/attachment records and casework family; qualify shelf and closet fixtures.
3. Add roof polygons, end cuts, openings, glazing orientation/system constraints and vent/door mechanisms; qualify the greenhouse digital fixture.
4. Add layered assemblies, environment suitability, equipment/clearance rule provenance and source-conflict handling; qualify the sauna digital fixture with unresolved trade decisions preserved.
5. Expand source-backed rule coverage and jurisdiction/grade-specific engineering as separate future work. Do not label heuristic geometry checks as that future system.
