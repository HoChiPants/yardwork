# Shelf support system: Kreg 5 mm pins and drilling jig

Researched **2026-11-16**. Research only; no runtime, catalog or schema edits. [Structured proposal](shelf-support-proposal.json) records three exact product identities, a conditional hole schedule, tooling and specific unknowns. Public references establish no current price or stock at ZIP 84121; no store was selected.

## One concrete system

| Product / manufacturer part | Exact retailer reference | Purchase unit and supported facts |
|---|---|---|
| **Kreg KMA-5MPIN** shelf pins | [Lowe’s 5006037921](https://www.lowes.com/pd/Kreg-0-75-in-L-x-0-332-in-W-x-0-19-in-D-Shelf-pins-20-Pack/5006037921), item 4897499 | **20 pins per pack**. [Manufacturer](https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pins-5mm/KMA-5MPIN.html) specifies 5 mm nominal size, zinc finish and explicit compatibility with its 5 mm shelf-pin jig/bit. No exact HD pin offer verified. |
| **Kreg KMA3232** 5 mm shelf-pin jig | [HD 319450681](https://www.homedepot.com/p/Kreg-Shelf-Pin-Jig-5mm-with-6-hardened-steel-drill-guides-KMA3232/319450681), SKU 1007456246; [Lowe’s 5006041513](https://www.lowes.com/pd/Kreg-Shelf-Pin-Jig-5mm-Create-Perfectly-Spaced-Holes-at-1-1-4-Inch-32mm-Increments/5006041513), item 4897498 | **One jig kit**. [Manufacturer](https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pin-jig-5-mm/KMA3232.html) lists jig, fence, 5 mm bit, collar/set screw, indexing pin, extension, hex wrench and **four pins**. Retailer piece-count7/9 fields do not mean seven/nine kits. |
| **Kreg KMA3215** replacement bit | [Lowe’s 50022250](https://www.lowes.com/pd/Kreg-Shelf-Pin-Jig-Drill-Bit/50022250), item 518048 | **One bit**. [Manufacturer](https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pin-jig-drill-bit-5mm/KMA3215.html) specifies 5 mm HSS brad point,¼in hex shank and published capacity of 5 mm holes 7 mm deep. Current contents list the bit alone; a spare collar/wrench must not be presumed. |

These retrieved offers have no explicit retirement label; `reference` remains distinct from local availability. Existing full kits already supply a bit/collar. The four included pins are identified as 5 mm shelf pins, without a separate KMA-5MPIN part identity. A reusable-tool selection does not establish that those pins are still owned, match a particular installed pin profile or are allocated to this project.

## Geometry that can and cannot be modeled

The [manufacturer product photo](https://www.kregtool.com/dw/image/v2/BDZM_PRD/on/demandware.static/-/Sites-master-kreg/default/dwa20ae695/images/hi-res/KMA-5MPIN-01.jpg?sh=140&sw=140) shows a round pin and flattened spoon/paddle bearing portion. That is a visual shape observation, not a dimensioned support profile. Lowe’s overall fields 0.75 × 0.332 × 0.19 in do **not** identify insertion length, shoulder position, bearing projection or thickness. Insertion depth therefore remains **unknown**, not half the overall length. Nominal5 mm mating size is known; actual shank tolerance is not.

Lowe’s bit title/specification categorizes it as 3/16 in. Keep the manufacturer5 mm identity:3/16 in is 4.7625 mm. Likewise,¼in hex is 6.35 mm rather than an exact 6 mm shank. Do not derive pin or hole dimensions from those rounded retail labels.

## Source-backed drilling pattern and process

The current jig page links this [manufacturer manual](https://www.kregtool.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dw31eb0d3c/manuals/KMA3232_Global.pdf). Its cover explicitly includes **KMA3232**; printed document ID **105707 V1, 1/2021** appears on PDF page 12. It is 72 pages including translations; English/cover pages 1–12 were inspected. SHA256: `b1c727b4dc278b2b0a00bb695b0f1a9970a35ceabd90f738b2bef8533e4a6cf4`. Source PDF and extracted English pages are cached outside runtime in `work/shelf-pin-research`.

- **Pattern:** page 9 identifies nominal **32 mm pitch** and **37 mm from the jig sides**. Preserve metric system values; the paired1.25 in/1.45 in labels are rounded. A generated pattern still needs a chosen panel datum, first-hole height, count, end exclusions and verified front/rear fence reference. Older discontinued KMA3200/KMA3220 manuals use different setback descriptions and must not supply this model’s offsets.
- **Depth:** page 4 sets the collar using the jig’s molded storage-slot gauge, then tightens its set screw. Page8 drills until collar-to-guide contact. The bit product’s **7 mm depth capacity** is a published nominal parameter; the manual gives no calibrated deepest brad-point penetration or pin insertion length. Keep actual depth and tip allowance nullable until checked on the exact setup and panel stock.
- **Execution:** use the matched bit, collar, drill and clamp. Bring the bit up to speed in the bushing before touching wood; withdraw while rotating. Register extended runs in the prior hole and reclamp. The extension/index hole is not a drill guide. Use the same reference end for opposite sides. A clamp, pencil/layout tools and operation-appropriate protection remain separate requirements.

The future coordinate rule is useful now: **row origin + n × 32 mm**, with matched heights on opposite side panels. It is conditional geometry, not a released machining schedule. Confirm the actual hole’s deepest point does not break through the panel or intersect opposite-face bores, joinery, fasteners or existing cuts. No minimum residual-web strength is inferred.

## Application and counting boundaries

The manufacturer advertises25 lb per pin. The retrieved sources do not establish substrate, engagement, shelf span/deflection, restraint, load sharing or the test setup needed for a whole-shelf rating. Do not multiply that number by the pin count or turn it into approval for a generated cabinet.

Count each designed installed support once, then round newly needed loose pins into 20-count purchase packs. Credit a newly purchased kit’s four pins only when explicitly assigned and the supplied pins are verified against the selected installed-part profile; do not subtract them from demand because a tool checkbox is selected. Keep kit contents and standalone replacement purchases distinct.

The exact remaining inputs are: **dimensioned pin insertion/shoulder/bearing geometry; pin/hole tolerances; calibrated deepest-tip depth for the specified collar setup; actual panel thickness; and project-specific row origins, clearances, support count and load assessment**. These prevent an exact installed pin mesh today. They do not prevent saving the real product identity, 20-count procurement unit, 5 mm/32 mm drilling intent and actual jig/bit requirements. Future hole features should persist center, axis, diameter, reviewed depth and source references through transforms and JSON; unknown values must remain explicit.

## Home Depot angled shelf supports

The Everbilt 802064 pack contains eight nickel-plated steel angled supports. Home Depot specifies a 5 mm hole, and the linked package instructions specify a 3/16 in hole. Yardwork leaves the pin insertion and drilling measurements blank. The plan needs the delivered instructions and an actual pin that fits a same-stock 5 mm test bore before it shows derived hole centers. [Product 204273378](https://www.homedepot.com/p/204273378) · [Linked package instructions](https://images.thdstatic.com/catalog/pdfImages/99/9941d57a-35e7-4740-9e3b-357f2de83067.pdf)

The Everbilt 802424 pack contains 24 nickel-plated steel angled supports. The listing gives 5 mm × 3/8 in, while a Supplier Quality answer describes a pin portion of about 1/2 in. Measure the delivered parts and test the bore in matching stock. The 8-, 24- and 48-packs have distinct purchase identities and store observations. Verify shelf assembly capacity separately. [Product 204273814](https://www.homedepot.com/p/204273814)
