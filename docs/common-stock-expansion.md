# Common stock expansion: reviewed source proposals

Research date: **2026-11-16**. [Machine-readable proposals](common-stock-proposals.json) preserve the research-stage identities, dimensions, count meanings, sources and blockers. A subsequent implementation added the two review-ready wood products below as `lowes-syp-2x4-8` and `lowes-treated-post-4x4-8`, both unpriced. The remaining proposals are research only. The focused source/binding/persistence suites passed 23 tests and TypeScript checking passed; final full UI verification is a separate integration step.

ZIP **84121** is the requested project context. No specific store was selected, no local inventory was observed, and no prices were imported. A public reference page can be regional or cached. `reference` means the retrieved page does not explicitly identify the offer as retired; it does not mean purchasable at a selected store.

## Practical next additions

Two separate Lowe’s commodity variants have an explicit actual profile and one-piece sell pack. Neither establishes a matching Home Depot manufacturer identity.

| Proposed variant | Source identity | Actual profile / sell unit | Evidence limits |
|---|---|---|---|
| Common SYP 2×4×8 | [Lowe’s 5014110787](https://www.lowes.com/pd/Top-Choice-2-in-x-4-in-x-8-ft-Southern-Yellow-Pine-Kiln-dried-Lumber/5014110787), item 5140, retailer model `020408#2 SYP` | 1.5 × 3.5 × 96 in; package 1; kiln-dried, S4S | Title/specs say #2; overview says #2 Prime. Retain #2 and inspect the stamp. Regional availability unknown. |
| Treated SYP 4×4×8 post | [Lowe’s 50121083](https://www.lowes.com/pd/severe-weather-common-4-in-x-4-in-x-8-ft-actual-3-5-in-x-3-5-in-x-8-ft-2-treated-lumber/50121083), item 552328, retailer model `Y2L40408-GC` | 3.5 × 3.5 × 96 in; package 1; #2, kiln-dried field; MCA/ground-contact description | One highlight drops decimal points to “35”; the description and actual-dimension specs agree on 3.5. No treatment retention/use-category number or installation capacity verified. |

Use `retailer-specification` identity and leave manufacturer/MPN null for these commodities. Add variants explicitly; preserve existing generic parts. The current generic `treated` item is **2×6**, so researched treated 2×4 must be a new size rather than a silent product binding to it. JSON wood dimensions use **[thickness,width,length]**, not necessarily the current scene-axis orientation.

## Home Depot and regional wood gaps

| Public reference | Source-backed dimensions and identity | Promotion blocker |
|---|---|---|
| [HD 202046915](https://www.homedepot.com/p/2-in-x-4-in-x-96-in-Prime-Kiln-Dried-Douglas-Fir-Stud-785326/202046915), model 785326, SKU 441317 | Actual 1.5 × 3.5 × 96 in, #2 Premium title | Current page says species varies regionally; do not infer Douglas-fir or kiln-dried status from its older URL. Explicit retail sell pack not retrieved. |
| [Lowe’s 5003667531](https://www.lowes.com/pd/2-in-x-4-in-x-8-ft-2-Douglas-Fir-Kiln-Dried-Lumber/5003667531), model `20496 KDDFL`, item 330568 | Actual 1.5 × 3.5 × 96 in, #2 Douglas-fir, kiln-dried/S4S | Retail pack not retrieved; existing candidate should be updated, not duplicated. |
| [Lowe’s 5014776459](https://www.lowes.com/pd/Interfor-2-in-x-4-in-x-96-in-Spruce-Pine-Fir-S4See-Kiln-dried-Stud/5014776459), model/item 7001 | Actual 1.5 × 3.5 × 96 in, kiln-dried #2 Premium | Package field294. Whether this is logistics or a retail bundle remains unresolved; never rewrite it to 1. |
| [HD 301836994](https://www.homedepot.com/p/WeatherShield-2-in-x-4-in-x-8-ft-2-Prime-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Lumber-291224/301836994), WeatherShield291224, SKU 1001753743 | Actual 1.5 × 3.5 × 96 in, #2 Prime SYP, MCA prose | Retail pack unknown. Ground-contact title/highlights conflict with above-ground-only prose; do not source-qualify treatment from the title alone. |
| [HD 206949446](https://www.homedepot.com/p/2-in-x-4-in-x-8-ft-Brown-Stain-Ground-Contact-Pressure-Treated-Lumber-WW-Actual-1-5-in-x-3-5-in-x-96-in-17463-08/206949446), model 17463-08, SKU 1001765205 | Actual 1.5 × 3.5 × 96 in, copper-azole western wood | Ground-contact title versus above-ground highlight; grade and retail pack unresolved. |
| [Lowe’s 5014119401](https://www.lowes.com/pd/severe-weather-2-4-8-tc-treated-2-prime/5014119401), model 20408MGYPL, item 5302558 | Actual 1.5 × 3.5 × 96 in, #2 Prime SYP, kiln-dried, MCA, ground contact | Package104 needs sell-unit clarification. [11726 / 1002269426](https://www.lowes.com/pd/Severe-Weather-2-in-x-4-in-x-8-ft-2-Prime-Southern-yellow-pine-Ground-contact-Pressure-Treated-Lumber/1002269426) also reports104. |
| [Lowe’s 5016087993](https://www.lowes.com/pd/Severe-Weather-2-in-x-4-in-x-8-ft-Standard-Hem-fir-Ground-contact-Pressure-Treated-Lumber/5016087993), modelHS154CASL0204-08, item 2885596 | Package1; green hem-fir, CAC/ground contact | Overview 1.5 × 3.5 conflicts with actual specs 1.562 × 3.562 in; Standard versus #2 grade wording also conflicts. Keep actual profile null pending resolution. |
| [HD 205220341](https://www.homedepot.com/p/4-in-x-4-in-x-8-ft-2-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Wood-Post-194354/205220341), model 194354, SKU 256276 | Actual3.5 × 3.5 × 96 in, #2 treated SYP/MCA ground-contact reference | Explicit current retail sell pack not retrieved. |

## Fasteners: real identities and honest geometry

| Exact product | Retail references / count | Known specification / remaining geometry |
|---|---|---|
| Grip-Rite `3GCS1` | [HD 204959258](https://www.homedepot.com/p/204959258), [Lowe’s 1000075795](https://www.lowes.com/pd/Grip-Rite-9-x-3-in-Gold-Yellow-Zinc-Bugle-Interior-Wood-Screws-1-lb/1000075795); 1 lb box, **approximately 72** | [Manufacturer](https://grip-rite.com/product/fasteners/hand-drive/screws/interior-screws/construction-screw/) identifies #9 × 3 in, T25, yellow zinc, interior construction. Head/shank diameter unverified;72 is not a guaranteed minimum. |
| Simpson `CSVZ3R70` | [HD 321563361](https://www.homedepot.com/p/321563361), [Lowe’s 1002623380](https://www.lowes.com/pd/Simpson-Strong-Tie-Strong-Drive-174-CSV-Construction-Screw-8212-10-x-3-in-T-25-Flat-Head-Yellow-Zinc-70-Qty/1002623380); **70 screws** | #10 × 3 in; T25 included; yellow-zinc interior wood/engineered-wood scope. Head/shank diameter unverified; a connector-specific fastening schedule is separate. |
| SPAX `4101010500754` | [HD 315163702](https://www.homedepot.com/p/315163702), [Lowe’s 5001701753](https://www.lowes.com/pd/SPAX-10-x-3-in-SPAX-Flat-Head-Unidrive-Zinc-Coated-Screw-1LB-Box-72CT/5001701753); 1 lb box, approximately 72 | [Manufacturer table hosted by HD](https://images.thdstatic.com/catalog/pdfImages/20/204f54c4-36ba-4b79-bdcc-3ef2012baab8.pdf) gives #10 × 3 in, head 0.390 in, thread 2.375 in, Phillips#2/Square#2. Shank unknown. Manufacturer master 5 is five boxes, not a retail five-screw pack. |
| Everbilt `822812` | [HD 317479383](https://www.homedepot.com/p/317479383); **100 screws** | #10 × 1.25 in, Phillips flat, zinc-plated. Head/shank unknown. The 13/64 in pilot suggestion must not become a shank measurement or universal drill size. |
| Hillman `35062` | [Lowe’s 3036075](https://www.lowes.com/pd/Hillman-10-x-1-1-4-in-Silver-Zinc-Plated-Flat-Interior-Wood-Screws-75-Count/3036075); **75 screws** | #10 × 1.25 in, Phillips flat, zinc-plated steel, interior above-ground wood-to-wood, predrilling required, ACQ-approved=false. Head/shank unknown. |

The short screws are separate products, not interchangeable retailer offers. These identities can improve procurement references without fabricated physical envelopes. Do not normalize GRK3⅛in to 3 in or infer shank diameter from #9/#10. Approximate weight-packed counts need a distinct count basis before exact BOM pack arithmetic.

## Hardware cloth: coverage is not slab thickness

| Product | Reviewed coverage / purchase unit | Limits |
|---|---|---|
| Everbilt `308224EB` | [HD 205960837](https://www.homedepot.com/p/Everbilt-Galvanized-Steel-1-2-in-Mesh-2-ft-x-25-ft-19-Gauge-Hardware-Cloth-308224EB/205960837), SKU 266795;24 × 300 in, ½in opening,19-gauge galvanized steel; [retail category sells per roll](https://www.homedepot.com/b/Lumber-Composites-Fencing-Gates-Hardware-Cloth-Fencing/25-ft/N-5yc1vZcd55Z1z112x0) | Wire diameter/welded crossing thickness unknown. |
| Garden Craft `132425` | [Current Lowe’s 5013886931](https://www.lowes.com/pd/GARDEN-CRAFT/5013886931), item 492435; actual24 × 300 in, ½in square opening, galvanized after welding, package 1 | Gauge field0 is unknown/invalid. [Manufacturer catalog](https://originpointbrands.com/wp-content/uploads/2020/10/OP20.OPB-CatalogMidyearUpdateWebRes-compressed.pdf) lists logistics quantity 4; retailer unit remains one roll. |

Garden Craft’s older [5013886929](https://www.lowes.com/pd/GARDEN-CRAFT/5013886929) and [5002677367](https://www.lowes.com/pd/GARDEN-CRAFT/5002677367) pages explicitly say no longer sold. Preserve them as retired even though 5013886931 is a current reference. The current long slug returned 404; the exact-ID short URL retrieved successfully. Do not merge these into the Everbilt identity or treat either as a predator/security guarantee.

The current generic mesh is drawn with 0.04 in thickness. Neither source verifies that slab envelope. A future coverage-based mesh profile can preserve24 × 300 in stock and purchase counts while labeling wire/weld thickness unknown; strict exact-solid binding should remain blocked.

## Integration checks for the next batch

- Add the two review-ready wood variants without changing saved generic geometry or promising a local store offer. Recalculate bounds/cuts with actual dimensions and explicit length-axis metadata.
- Keep unknown packs, package 104/294, conflicting treatment/actual sizes and retired URLs visible; do not silently default them to one.
- Preserve fixed-count versus approximate weight-packed hardware, head versus shank measurements, and one retail roll versus a manufacturer carton.
- Product/source identity and physical fit remain independent of species/treatment verification, joint capacity, engineering approval and exact store snapshots. No accounts or new data provider are needed for these curated references.
