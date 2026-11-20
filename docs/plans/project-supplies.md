# Saved hardware and supplies

November 16, 2026. Continue the owner's five-build product-validation program after the packaged AI checkpoint. Retailer references and observed snapshots remain the authorized data source.

## Problem and behavior

The registry includes reviewed hinges, lid stays, glazing profiles/tape and closet-rod supports, but a user cannot yet add these as persistent project purchases without pretending they have known 3D geometry. Add a compact hardware-and-supplies editor to the materials workflow. The user chooses a reviewed accessory, enters the number of purchase packs, and records an optional usage note. Aggregate repeated product selections by exact identity. Keep purpose labels and installation questions with the selection. Do not create parts, joints, installation approvals or ownership claims from a shopping selection.

## Implementation

1. Add default-empty, backward-compatible project fields for supply selections and exact-product store observations. Bound quantities and text, reject duplicate record IDs, preserve unknown reference identities for readable import diagnostics. Existing saved projects and undo continue through the ordinary project schema.
2. Derive supply rows from application-owned product records, never imported specification or approval claims. New selections require reviewed accessory identities with a known purchase pack and a current reference offer. Historical or missing saved products remain visible and unresolved. Product role/manufacturer requirements remain attached to every selected product.
3. Sum purchase units once per exact product. Preserve typed pack contents: a tape kit contains distinct top/bottom rolls, a socket pair contains one open and one closed socket, and an H-connector assembly contains a base plus cap. Do not use homogeneous pack division for these sets. An item linked to an already modeled material must be flagged as a possible duplicate, with no automatic deduction. The physical scene, connection schedule and stock cutting remain unchanged.
4. Record price and availability per purchase pack using the exact selected retailer offer. Validate HTTPS retailer host, URL path/product number, store, ZIP and timestamp. Only fresh observations for the selected retailer/store/ZIP enter pricing and stock coverage. Snapshot JSON imports use the same validation; project export preserves observations.
5. Render editing in a disclosure under the materials list. Include persisted purchase quantities and pack contents, seller and source links, usage notes and outstanding manufacturer requirements. Provide removal and snapshot entry/import without a second project-management flow.
6. Include accessories in shopping CSV/text, price completeness, guide Markdown and print output. Never count an accessory as installed or close a missing attachment finding merely because it is on the list. Tools remain a separate review checklist.

## Verification

Domain/API checks cover legacy imports, strict quantities and exact offer matching, cross-store/retailer and stale snapshot exclusion, repeated-purchase aggregation and heterogeneous pack contents, unresolved imports and duplicate warnings, JSON round-trip and exported quantities/notes. Browser checks cover adding a banquette hinge, editing its quantity, recording its snapshot, changing retailer, saving/reopening, shopping exports and removing the selection. Include a phone viewport and confirm no supply operation mutates geometry or joints. Run these after source is frozen, separately from CPU-heavy model qualification.

## Boundaries

Quantities are user decisions until a source-backed schedule exists. A hinge does not select its lid stay; a socket does not establish loaded rod span; glazing tape does not determine expansion allowance. Do not automatically select marketplace accessories or silently substitute another retailer's product. Do not invent unknown hinge/connector envelopes to make the scene appear complete.
