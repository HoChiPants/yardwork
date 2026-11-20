# Henley kit: component evidence and modeling proposal

Researched 2026-11-16. Runtime is unchanged. [henley-kit-proposal.json](henley-kit-proposal.json) contains the revision-scoped component inventory, source hashes, page references, dimension meanings, nested heater contents and explicit unknowns.

**A useful model beyond an empty frame is feasible.** The original Henley kit has a manufacturer-linked manual with factory part IDs, quantities, dimensions and assembly drawings. It should become one purchased kit with contained, nonpurchasable components. It is not evidence that the kit’s cedar boards or hardware are separately stocked products, or that arbitrary changes preserve the manufacturer’s design.

## Match the original retail kit before using current-generation data

The manufacturer’s public [US/Canada catalog for 2504769](https://sites.salsify.com/40145723-90b1-446d-b736-b25f8237d96d/ca06ad7f-3732-4dad-aa25-5387e322f005/en-US/product/2504769/Henley-2-4-Person-Outdoor-Cabin-Sauna/) explicitly maps base SKU2504769 to prepaid part2504769com. It gives UPC752113504769 and prepaid UPC752113594760. This supports the identity behind [HD341003031 / 2504769com](https://www.homedepot.com/p/341003031) and [Lowe’s5018283975 / item8638981 / 2504769COM](https://www.lowes.com/pd/Backyard-Discovery-81-5-in-H-x-89-in-W-x-62-25-in-D-Wood-Electric-sauna/5018283975). The catalog labels the original model **“Discontinued When Out of Stock.”** Neither that lifecycle label nor a public retailer listing proves current stock in84121.

The same manufacturer URL now presents **2504769B**, with a different [B assembly manual](https://images.salsify.com/image/upload/s--gOuOLc1O--/ryrddyxy2uiyp2yaumx4). It must remain a different kit revision. Do not attach its fan, heater or control system to the original COM retailer identity by stripping the B suffix.

| Document | Exact identity / revision | Role |
|---|---|---|
| [Original manufacturer assembly](https://images.salsify.com/image/upload/s--6Vrqf17_--/rzsfzdenm5rfqqauaxcs.pdf) | 2504769 /2504769-V; cover3-12-2026;100 pages | Primary component and assembly basis for the proposed original-kit model. |
| [Original retailer assembly](https://images.thdstatic.com/catalog/pdfImages/73/73fe6e20-2b3c-5460-8661-68718087d0bd.pdf) and [Lowe’s copy](https://pdf.lowes.com/productdocuments/8b3fab44-2650-4e93-8b90-72756a7c6d3b/80054895.pdf) | 2504769; cover09-11-2025;96 pages | Both downloads have the identical SHA256. Older parts/electrical data must not override the newer matched manufacturer manual. |
| [Original heater supplement](https://images.salsify.com/image/upload/s--ZBuV8Q2w--/tuaqov3c8w2nhooqeah3.pdf) | 9250253; English cover10-14-25;30 pages with English then French | Exact heater ID appears in the original kit inventory. Provides a contained heater inventory and manufacturer installation reference. |
| [Current B assembly](https://images.salsify.com/image/upload/s--gOuOLc1O--/ryrddyxy2uiyp2yaumx4) | 2504769B /2504769B-V; cover8-12-2026;101 pages | Comparison only; not substituted into the original proposal. |
| [Current general owner manual](https://images.salsify.com/image/upload/s--3JEkncDE--/melzftecsbs0zevtrzwh) | Identifies9250253B;19 pages | Different heater identity. No automatic original-heater qualification. |

Large files exceeded the web extraction limit, so their public primary URLs were downloaded and read locally. Text-layer inventory extraction was supplemented by visually inspected drawings. OCR was used to locate relevant assembly pages; unreviewed OCR is not an authority for dimensions. PDF copies/caches remain outside the runtime repository, in the task’s work directory. The JSON retains hashes and page numbers for reproducibility.

## What the machine-readable inventory contains

The matched original manual’s parts tables on PDF/printed pages4–15 yield **143 distinct row keys**:

| Kind | Rows | Interpretation |
|---|---:|---|
| Factory wood parts | 71 | Precut stock/profile references; not retail lumber substitutions. |
| Factory wood assemblies | 6 | Door/wall/bench/frame/handle assemblies retained as assemblies. |
| Other accessory | 1 | Thermometer; no invented body dimensions. |
| Factory accessories | 29 | Roofing, feet, vents, controls, wire, heater and similar included items. |
| Hardware | 28 | Manufacturer item quantities/specifications, not retail box sizes. |
| Included tool accessories | 8 | Bits/drivers/wrench/adapter listed with the kit. General assembly tools remain separate. |

The heterogeneous quantity sum is1,248 listed items; it is **not** a count of every atomic component inside assemblies. There are85 published metric triples and75 proposed wood-part/assembly reference envelopes after six explicit same-manual drawing resolutions. Full profiles, machining, hole coordinates and assembled transforms are not supplied by this extraction.

Each row retains its stamped label, part ID **as printed**, quantity, supply/procurement relationship, published inch text, metric dimensions, meaning, source page, unresolved issues and any drawing resolution. Do not flatten manufacturer part ID alone into a unique key: the inventory repeats W4L22359 for three different roof-board labels.

Useful contained assemblies include BA01/W2A04918 and BA02/W2A04920, each published50×486×1276 mm, and WP01/W2A04911 door-wall assembly at60×692×1972 mm. Those dimensions describe complete assemblies; they do not establish individual slat geometry, glass-leaf size or hinge pivot. The parent kit purchase includes them once.

Six inventory errors can be carried forward transparently with better evidence **inside the same manual**:

- SP03/SP04 inventory inch lengths conflict with1862 mm; the right/left wall drawings on pages26/25 both give73 5/16 in and1862 mm.
- OJ14 inventory width30 mm conflicts with its inch width; page39 gives30×134×1572 mm.
- OR04/OR05 inventory repeats W4L22359; page60 identifies W4L22355 and W4L22358, while OJ10 remains W4L22359. Each original entry stays in the JSON with the specific drawing resolution.

OG13’s mixed-unit thickness text and OG01’s missing separator remain flagged. Roofing’s7 mm first dimension must not become solid-metal thickness: the29-gauge sheets have a profile. Page67 establishes sheet order, one-rib overlap and the printed¼ in/6 mm side gap, but not a dimensioned rib section or effective coverage. Folded trims/brackets likewise need real profile geometry before exact collision/fastener fit.

## Overall space and component placement

For this original manual revision, page2 distinguishes roof, shell and sloped dimensions. Its plan roof projection is1583 mm wide ×2302 mm deep, maximum front height2070 mm; the sloped side roof edge is2306 mm. These are reference dimensions with rounded inch/mm pairs, not manufacturing tolerances. The shell/base diagram is1394×1716 mm. Page3’s1454×1630 mm and2184 mm diagonal refer to **anchor-hole layout**, not body footprint.

HD lists62.25 W×90.75 D×81.5 H inches; Lowe’s lists89 W×62.25 D×81.5 H. Keep the Lowe’s axis/value conflict visible. Shipping cartons are never substituted for assembled geometry. The manufacturer’s current B page rounds exterior dimensions and is not an original-revision CAD authority.

HD’s interior reference is50.5 W×63.2 D×73 H inches. The roof slopes and benches/heater occupy the room. A single height label is not verified clear headroom throughout; a flat rectangular volume would also differ from the stated130.5 cu ft. The proposal leaves the precise clear-room solid unresolved.

The drawing index gives concrete modeling work: floor/walls pages19–41; handle42; benches43–53; heater/mount/guard54–58; roof59–71; controls/lighting/sensor/trim72–96; anchors97–99; finish100. Page43 gives cleat elevations355/730 mm above floor, not final seat-top heights. Digitize transforms against those matched drawings, retaining part orientation and preassembled containment. Do not scale dimensions out of an image marked “not to scale.”

## Included heater and site-provided work

The original kit contains9250253. Its linked heater supplement identifies the same model and supplies a ten-row nested inventory: body, deflector, four wall brackets, shelf, guard, three screw types, control box and stone package. The control box A4M05590-01 is **the same item already listed in the kit**, and must be linked rather than counted twice. A6P01495 is one supplied rock package, not one rock. Manufacturer labels are also included; no sizes or separate retail availability are invented.

No independent numeric heat-clearance envelope was established from the exact matched material. Pages54/57/58 locate factory mounts/guard/heater; they do not authorize arbitrary placement or turn mount offsets into general combustible clearances. The original heater’s exact body envelope remains null in the proposal.

Electrical revisions are explicit research findings, not generated installation instructions: the old retailer cover says30 A; current original assembly says50 A. The heater supplement and current [manufacturer guide](https://www.backyarddiscovery.com/pages/outdoor-sauna-electrical-guide) differ on conductor details. The delivered revision, qualified installation and applicable local requirements must resolve that; no automatic wire/breaker purchase schedule or code approval is produced. B uses different heater/control part IDs and adds a fan.

Concrete anchors and ground stakes are included, with alternative anchoring steps. Wood-deck attachment hardware is explicitly not included. Foundation preparation and service-side electrical materials are site work with unresolved quantities. General tools on page17 are user tools; an illustrative bolt bag on the sorting page is not another kit part. Included bits/drivers belong to the kit and are not added again as purchases.

## Next implementable model

Add a versioned `kit assembly` type whose procurement count is one, whose factory children cannot become separately purchased generic stock, and whose included hardware/consumables reference that parent. Start with the sourced shell, floor/walls, two contained benches, door-wall assembly and roof; use explicit markers for accessories with unknown envelopes. Add source-based transforms and guide phases incrementally. Preserve raw inventory conflicts and the six documented resolutions alongside the selected manual revision.

This provides a recognizable, source-traceable sauna assembly while precise profiles, clearances and supplied-part reconciliation continue. It must not claim exact CAD, stock availability, capacity, electrical/heat approval, or interchangeability with loose cedar and the B generation.
