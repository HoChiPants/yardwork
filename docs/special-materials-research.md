# Special material catalog proposals

Researched 2026-11-16. These are isolated proposals for future catalog work, not runtime mappings, store snapshots, purchasing advice, or live availability checks. The default ZIP 84121 was not used to assert stock. An identified listing does not establish a complete installation system.

## Data rules

- Keep manufacturer/model identity separate from retailer offer identity. Similar private-label products are not the same product without evidence.
- Keep overall size, effective cover, material thickness, and profile envelope separate. Corrugation height is not solid plastic thickness; rod outside diameter is not wall thickness.
- A bundle, accessory pair, tape combination, and individual piece have different purchase units. Preserve mixed-pack contents.
- Record unknown dimensions as `null`, not zero or an inferred value. Do not scale connectors from product photographs.
- Application evidence is separate from identity evidence: `manufacturer-listed-application`, `retailer-listed-application`, or `unverified`. None means that a generated assembly has been approved.
- Preserve retired offers and conflicting source fields as evidence; do not present them as selectable current matches. No exact cross-retailer match was verified for the glazing, closet hardware, sauna boards, or sauna foil below.

## Greenhouse: Home Depot SUNLITE multiwall system

| Proposed ID | Manufacturer/model | Verified facts | Offer / evidence | Binding status |
|---|---|---|---|---|
| `sunlite-132506` | Palram SUNLITE 132506 | One clear panel, 24 × 96 in; 8 mm twinwall. Retailer thickness is rounded to 0.313 in. | [HD 202091947](https://www.homedepot.com/p/Sunlite-24-in-x-8-ft-Multiwall-Polycarbonate-Panel-in-Clear-132506/202091947), [manufacturer SUNLITE](https://www.palram.com/us/product/sunlite/) | Identity/dimensions reviewed; greenhouse use is explicitly listed. No identical Lowe’s offer verified. |
| `sunlite-96714` | SUNLITE 96714 | 96 in H-profile connection set for 8 mm SUNLITE; base plus cap form one connector set. Full cross-section is unknown. | [HD 202091948](https://www.homedepot.com/p/202091948) | Compatible family listed; do not count base and cap as two connectors. |
| `sunlite-96715` | SUNLITE 96715 | 96 in U-profile for 8 mm SUNLITE panel edges. Full cross-section and exact retail pack count remain unverified. | [HD 202091949](https://www.homedepot.com/p/202091949) | Candidate pending pack and profile verification. |
| `sunlite-92763` | SUNLITE 92763 | Combo contains one 32 ft nonvented top tape roll and one 32 ft vented bottom tape roll for 8 mm panels. Tape width is unknown. | [HD 205713443](https://www.homedepot.com/p/Sunlite-8-mm-Anti-Dust-Tape-Combo-Pack-92763/205713443) | Mixed contents need two footage requirements; not two interchangeable rolls. |
| `woodtite-92523` | Palram/Woodtite 92523 | 2 in wood fastener with EPDM washer, 50 pack; 1/4 in describes hex drive, not shank diameter. | [HD 100095071](https://www.homedepot.com/p/100095071) | Fastener candidate; selected panel/roof/wall instructions must determine use and length. |
| `woodtite-92522` | Palram/Woodtite 92522 | 1 in wood fastener with EPDM washer, 50 pack. | [HD 100017073](https://www.homedepot.com/p/100017073) | Distinct length; no automatic substitution for 92523. |

Use the [panel’s installation guide](https://images.thdstatic.com/catalog/pdfImages/a0/a03f682e-0dd7-4594-a1e2-2cd0c9e01918.pdf) and [Palram FAQ](https://www.palram.com/us/faq/?cat%5B0%5D=3) for panel orientation, expansion, tape and attachment requirements. The retailer’s generic “adhesive” installation field does not replace that guide. The panel’s UV side and flute drainage direction are meaningful orientation metadata.

Do not equate Lowe’s SUNLITE **400995 / 5014342661** with this panel: its [listing](https://www.lowes.com/pd/Sunlite-0-31-in-T-x-48-in-W-x-24-in-L-Clear-Polycarbonate-Sheet/5014342661) is a five-piece unit, with a 48 in URL width versus a rendered 4 in width discrepancy. Keep blocked until resolved.

## Greenhouse: Lowe’s TUFTEX PolyCarb alternative

This is a different assembly family. It cannot reuse 8 mm multiwall flute tape/U/H-profile rules.

| Proposed ID | Manufacturer/model | Verified facts | Offer / evidence | Binding status |
|---|---|---|---|---|
| `tuftex-1418a` | TUFTEX PolyCarb 1418A | Clear corrugated polycarbonate, 26 × 96 in overall; 24 in cover after side-lap per handbook. Corrugation envelope 9/16 in; plastic wall thickness unknown. | [Lowe’s 3043439](https://www.lowes.com/pd/Tuftex-PolyCarb-2-17-ft-x-8-ft-Corrugated-PolyCarbonate-Plastic-Roof-Panel/3043439), [manufacturer handbook](https://tuftex-ondura.com/wp-content/uploads/2024/04/product-handbook-tuftex-polycarb_0.pdf) | Greenhouse application documented. Retail pack count remains unverified; do not use wholesale bundle counts. No identical HD offer verified. |
| `tuftex-9025821` | TUFTEX 9025821 | #10 × 2 in screw; 1/4 in hex drive; 16 mm EPDM washer; 50 pack. | [Lowe’s 5020564731](https://www.lowes.com/pd/Tuftex-1-4-in-x-2-in-Galvanized-Galvanized-Self-drilling-Roofing-Screws-50-Count/5020564731), [current manufacturer brochure](https://pdf.lowes.com/productdocuments/b31ccb87-a98c-4cb7-80e0-69cefad2d569/82471074.pdf) | Preserve #10 shank versus 1/4 in drive distinction. Do not encode the listing’s “9/32-mm” predrill typo. |
| `tuftex-2216` | TUFTEX 2216 | Square-profile closure foam, 3 ft strips, five pack, matching PolyCarb profile. | [Lowe’s 3005549](https://www.lowes.com/pd/Tuftex-5-Pack-Cross-Link-Polyethylene-Solid-Roof-Panel-Closure-Strips/3005549), [manufacturer specifications](https://pdf.lowes.com/productdocuments/33abeb72-446a-489c-b677-e100181f8ce2/10085953.pdf) | Retail offer says no longer sold. Historical compatible accessory, not a current selectable purchase. |

The [2023 manufacturer brochure](https://pdf.lowes.com/productdocuments/6b812589-9fab-4abf-ba53-fd984af1588f/64226587.pdf) identifies square plastic closure **2231**, square wood **2223**, and vertical wood **2224**. Current exact retailer offers and dimensions were not verified; these remain missing components. Round-profile closure 2214 is not a substitute. Historical screw model 849 is not silently normalized to 9025821 without an OEM supersession reference.

The [2026 manufacturer brochure](https://pdf.lowes.com/productdocuments/b31ccb87-a98c-4cb7-80e0-69cefad2d569/82471074.pdf) identifies Palram Americas; older TUFTEX documents carry Onduline branding. Keep source dates and model identity. Do not import old span tables as generic structural approval.

**Rejected shortcut:** the [Palruf PVC installation instructions](https://www.homedepot.com/catalog/pdfImages/0e/0ea30232-ce72-46b4-bb26-ce99c446a92d.pdf) expressly exclude enclosed greenhouse applications. Metal roofing is not transparent glazing. Similar-looking roofing cannot satisfy a greenhouse glazing requirement.

## Closet rods: separate compatible retailer families

| Proposed ID | Brand/model | Verified facts | Offer | Remaining checks |
|---|---|---|---|---|
| `everbilt-eh-wsthdus-319` | Everbilt EH-WSTHDUS-319 | White tubular steel closet rod, 72 in long, 1-5/16 in OD; cut-to-fit listed. | [HD 300262527](https://www.homedepot.com/p/Everbilt-Product-width-1-5-16-in-length-6-ft-White-Steel-Heavy-Duty-Closet-Rod-EH-WSTHDUS-319/300262527) | Wall thickness/ID, exact retail pack and mounting schedule not established. Do not represent as solid steel. |
| `everbilt-eh-wsthdus-311v` | Everbilt EH-WSTHDUS-311V | White heavy-duty sockets, two pack; listed for 1-5/16 in rod. | [HD 334188235](https://www.homedepot.com/p/334188235) | Body geometry and substrate-specific installation unresolved. Older 311 is a distinct model record. |
| `project-source-27773pholg` | Project Source 27773PHOLG | One white heavy-duty steel rod, 72 × 1.3125 in OD; cut-to-fit listed. | [Lowe’s 1000442349](https://www.lowes.com/pd/Blue-Hawk-72-in-L-x-1-3125-in-H-x-1-3125-in-W-Wood-Closet-Rod/1000442349) | Source recommends bracket spacing no greater than 32 in for this rod; do not apply that to other rods or infer a load rating. |
| `project-source-23723phslg` | Project Source 23723PHSLG | Two heavy-duty white flanges, one open and one closed, hardware included; listed for rods up to 1-5/16 in. | [Lowe’s 50005274](https://www.lowes.com/pd/Blue-Hawk-2-72-in-Shelf-Bracket/50005274) | Title/body envelope fields disagree; keep body geometry null. Included fastener identity/quantity and suitable substrates remain unverified. |

These are retailer-level application matches within each heavy-duty family. Their private-label OEM identity was not verified, so do not make a single “same model at both stores” record. End sockets alone do not complete the longer rod assembly: a verified compatible center support plus mounting/anchoring evidence is still required. No exact current center-support SKU was confirmed in this pass. Standard-duty Project Source 23703PHILG is not automatically a heavy-duty system replacement merely because the opening fits.

The [Knape & Vogt catalog](https://www.knapeandvogt.com/sites/default/files/OL3275-KV-Catalog.pdf) documents a separate John Sterling 0015 rod / 0010 flange family. That is useful compatibility evidence, not proof that either private-label family is the same OEM or that wholesale carton counts are retail pack counts.

## Sauna: application-supported specialist stock

No matching Home Depot/Lowe’s offers were verified for the following sauna-specific products. This is an explicit catalog gap, not a reason to map arbitrary cedar as sauna-approved.

| Proposed ID | Manufacturer/model | Verified facts | Application / source | Purchase gaps |
|---|---|---|---|---|
| `thermory-vsl0038` | Thermory VSL0038, Aspen STP | Not thermally modified; 15 × 90 mm cross-section, 80 mm cover, bundle of six. Length not specified by this model page. | [Manufacturer sauna wall panel](https://thermory.com/product/wall-panel-stp-aspen/) | Dealer offer, selected length, retail purchase unit and installation review required. “Not modified” is the manufacturer’s classification; do not infer every treatment/finish attribute. |
| `thermory-vsl0184` | Thermory VSL0184, Thermo-aspen STP | Medium thermally modified Aspen; 15 × 90 mm, 80 mm cover, six per bundle. Length unknown. | [Manufacturer sauna wall panel](https://thermory.com/product/wall-panel-stp-thermo-aspen/) | This is thermally modified, so it must not be labeled untreated stock. No exact HD/Lowe’s offers verified. |
| `thermory-vll0044` | Thermory VLL0044, SHP Thermo-aspen bench board | 28 × 90 mm cross-section; four per bundle. Length unknown. | [Manufacturer sauna bench product](https://thermory.com/product/thermory-sauna-bench-board-shp-thermo-aspen/) | Specialist source only in this research. Cross-section and intended application do not establish bench span/load capacity. |
| `cedarbrook-foil-vapor` | Cedarbrook FOIL-VAPOR | Sauna aluminum foil vapor barrier, 54 in roll width; supplied length depends on room requirements. Fixed roll length/pack is unknown. | [Manufacturer product](https://cedarbrooksauna.com/sauna-foil-vapor-barrier/) | No exact HD/Lowe’s counterpart verified. Need selected assembly overlaps, seam tape and quantity evidence. |

The [Finnleo construction overview](https://www.finnleo.com/sauna-construction) and [custom-cut sauna instructions](https://www.finnleo.com/hubfs/Finnleo%20Downloads/710-0101%20Custom%20Cut%20Instruction%2012-18-2018.pdf) support selecting sauna-specific paneling, insulation and foil as an assembly. The latter specifies unfaced fiberglass and kit foil; it does not establish that every mineral-wool batt, reflective bubble product, cedar board, or generic plastic vapor barrier is approved. Preserve the chosen sauna/heater instructions and their revision rather than combine requirements from different kits.

## Sauna: big-box candidates with application unresolved

| Candidate | Known identity / size | Evidence | Why not an automatic sauna binding |
|---|---|---|---|
| HD cedar 906909 | Nominal 1 × 6 × 12 ft; actual 0.625 × 5.37 × 144 in in listing. | [HD 100071949](https://www.homedepot.com/p/Pattern-Stock-Cedar-Tongue-and-Groove-Board-Common-1-in-x-6-in-x-12-ft-Actual-0-625-in-x-5-37-in-x-144-in-906909/100071949) | Generic cedar pattern stock. Sauna use, exact species, finish/treatment and grade not established. |
| RELIABILT CD10608TG | 11/16 × 5-3/8 × 96 in unfinished cedar T&G. | [Lowe’s 1000456701](https://www.lowes.com/pd/RELIABILT-5-375-in-x-8-ft-Unfinished-Cedar-Tongue-and-Groove-Wall-Plank-Covers-3-58-sq-ft/1000456701) | General wall plank, not proof of suitability near sauna heat or for skin-contact benches. Older offer 1000456631 is retired. |
| ROCKWOOL RXCB351525 | Comfortbatt R15; actual 3.5 × 15.25 × 47 in; 12 batts/bag, 59.7 sq ft. | [Manufacturer technical sheet](https://www.rockwool.com/north-america/syssiteassets/o2-rockwool/documentation/technical-data-sheets/residential/comfortbatt-exterior-wood-and-steel-stud-thermal-batt-insulation-techdata-us.pdf), [HD 202090820](https://www.homedepot.com/p/ROCKWOOL-R-15-Comfortbatt-3-1-2-in-x-15-in-x-47-in-Fire-Resistant-Stone-Wool-Insulation-Batt-59-7-sq-ft-RXCB351525/202090820) | General cavity insulation, not a heater shield or a sauna-system approval. HD title rounds width to 15 in; use reviewed 15.25 in. |

Lowe’s **3388304 / item 138683** is associated with the same ROCKWOOL MPN on its [review page](https://www.lowes.com/reviews/rockwool-rxcb351525-insulation-accessories/3388304). A canonical live product offer was not successfully verified, so this is an identity lead, not an enabled offer. Older Lowe’s **3285108** is [retired](https://www.lowes.com/pd/Roxul-12-Pack-15-25-W-x-R-15-Fiberglass-Insulation-Batts/3285108); its “fiberglass” URL/title conflicts with stone-wool material. No availability inference should survive that mismatch.

Aromatic closet cedar, treated lumber, coated stock, and generic reflective bubble insulation are not accepted substitutes based solely on their names. Sauna-specific application remains unknown until the exact product and assembly instructions support it.

## Implementation consequences and remaining work

1. Introduce profiled sheet/tube/cladding products without pretending they are solid cuboids. Selection geometry can initially be an identified envelope, explicitly separate from purchase area, thickness and engineering behavior.
2. Store compatible family and profile IDs; tape direction, UV side, cover width and corrugated overlap belong to the assembly specification. A hardware item’s retailer category alone does not prove compatibility.
3. Keep matching end sockets, intermediate supports and mounting hardware as separate requirements. “Hardware included” is not enough to generate an exact fastener BOM.
4. Keep sauna materials as candidate-only when application evidence is missing. A five-build acceptance fixture should report these unresolved components instead of passing because generic lumber was substituted.
5. Validate exact retailer model, selected length, pack contents and current user-imported stock snapshot before adding any purchase-ready mapping. This research has not reconciled the existing 21 ordinary lumber/panel choices; that counterpart-family work is separate.

No runtime catalog files changed. No accounts, paid providers, purchases or anti-bot bypasses were used.
