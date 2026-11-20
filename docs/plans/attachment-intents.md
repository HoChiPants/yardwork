# Planned attachment system

The first shelf-pin planning slice is implemented locally. Anti-tip hardware/attachment geometry remains future work. Current tests and packaged evidence are tracked in the requirements audit.

## Implemented shelf-support workflow

**Sections → Plan shelf supports** opens a dedicated editor. The user selects actual shelf roles, side-edge row offsets and either custom target heights or Kreg 32 mm rows with an explicit bottom datum. Each selected shelf receives four saved bearing intentions. Round markers denote bearing targets; diamonds denote computed candidate hole centers. These are diagrams rather than installed pin meshes or removed material.

Pin insertion, bearing projection/vertical offset, full-diameter bore depth and deepest drill-tip penetration stay unknown until recorded with a user basis and date. Partial measurements remain partial. Checks cover wood-sheet stock/source thickness, role/part identity, independent movement, stock/profile edges, bearing reach, row spacing and duplicate/opposing holes. A whole rigid move keeps local points aligned. Changed, cut or replaced members require explicit refresh with a preview; stale records are preserved and excluded from the current pin estimate.

List and Checks expose missing pin-pack selections. The purchase comparison rounds active planned pins into 20-pin packs once and subtracts already selected purchase packs for its explicit **Add missing pin packs** action. It adds no duplicate BOM row, tool purchase or kit-content credit. Purchasing and planned fit remain separate.

Generated guides include a real preparation/review phase before assembly, detailed attachment coordinates and conditional process instructions. A separate support-schedule CSV labels pending candidates and withholds active drill coordinates from stale/conflicting plans. Preparation history and custom notes survive regeneration. Project format 2 and recovery protect the new records; see [project format](../project-format.md).

## Design contract

Persist planned connections between a saved shelf role and its side-panel roles. Keep local points and axes, source product identity, the selected row datum, dimensions and measurement provenance. Physical parts, purchase packs and planned connections remain separate records. Existing screw/nail/bracket joints cannot represent pin engagement adequately.

Provide an explicit layout setup rather than generating pins from the shelf count. The Kreg KMA3232 system documents a 5 mm hole system, 32 mm pitch and reference offsets. Pin insertion length, bearing projection/height and calibrated deepest drill-tip penetration still require verified dimensions. Until those are known, render plan markers and unresolved dimensions rather than fabricated installed meshes.

Validate geometry independently of capacity: points inside the intended shelf footprint; matching support heights; correct side-face directions; duplicate or opposing holes; panel breakthrough; conflicts with cuts and other planned fasteners. Preserve transformed local coordinates during rigid moves. A changed, cut or regenerated referenced part invalidates the affected plan until reviewed. Save/reopen must retain the exact measurement source and status.

Generate a schedule of the explicit points, hole coordinates, datums, tools and missing measurements. Conditional guide operations include consistent registration, collar setup, clamping, test drilling and depth verification before planned drilling/fit checks. Count only explicitly planned pins, then round demand into the reviewed 20-pin purchase pack. Do not automatically credit the pins originally included with a jig or buy an additional bit when the reviewed jig already includes one. The user's on-hand inventory is a separate input.

## Separate anti-tip review

Record the selected kit/manual, actual wall substrate and location evidence, strong carcass attachment member, baseboard standoff, fittings and the manual's fasteners. Show the connection chain from carcass member through both fittings and restraint to the actual wall substrate. A thin back panel or a selected strap product does not complete that chain. Keep carcass assembly joints and restraint review independent; no universal strap quantity, screw length or penetration is inferred.

## Acceptance

- Save/reopen and export preserve every record and provenance field.
- Rigid moves keep local geometry consistent; cuts, replacement and missing references produce explicit stale plans.
- Missing bearing/depth/substrate facts remain unresolved after tool or supply selection.
- Geometric conflicts are reproducible; changing a support record clears only its corresponding geometric issue.
- Explicit planned demand rounds once to purchase packs; manual supply additions cannot silently double-count it.
- No geometric, contact or completed-review state claims shelf load capacity or code/engineering approval.

Primary references: [Kreg jig and instructions](https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pin-jig-5-mm/KMA3232.html), [Kreg pin specifications](https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pins-5mm/KMA-5MPIN.html), [CPSC installation guidance](https://www.anchorit.gov/how-to-anchor/how-to-install-a-kit/) and [kit selection guidance](https://www.anchorit.gov/how-to-anchor/what-youll-need/). Source review is recorded separately in the shelf-support research; none establishes an assembled shelf rating.
