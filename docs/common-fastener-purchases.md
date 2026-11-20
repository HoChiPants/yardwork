# Counted and mass-based common fastener purchases

Primary manufacturer/retailer references were reread **2026-11-17 UTC**; author-review timestamp `2026-11-17T06:40:20.000Z`. These are purchase identities and reported product facts. No store, current stock, price, installed hardware, hole pattern, load or code approval is supplied.

| Trusted ID | Reviewed purchase unit | Current retailer references |
|---|---|---|
| `simpson-sd9112r100` | SD9112R100, #9 × nominal1½in, **100 screws**, ¼in hex | [HD202071152](https://www.homedepot.com/p/202071152), modelSD9112R100/SKU477314; [Lowe’s3242494](https://www.lowes.com/pd/Simpson-Strong-Tie-100-Count-9-x-1-1-2-Galvanized-Wood-Screws/3242494), item130014. |
| `grip-rite-16c5` | 16C5, **advertised5-lb box**, exact nail count **unknown** | [HD202308546](https://www.homedepot.com/p/202308546), model16C5/SKU196290. [Lowe’s3334512](https://www.lowes.com/pd/Grip-Rite-3-1-2-in-8-Gauge-Bright-Steel-Common-Nails-5-lbs/3334512), item69245, is **retired/conflicting**, not a current counterpart. |

The [Simpson product table](https://www.strongtie.com/strongdrive_exteriorwoodscrews/sd_screw/p/strong-drive-sd-connector-screw) reports .370in head/.130in shank and mechanically galvanized Class55 for the exact100-pack. The existing registry identity and head-envelope/material binding remain intact. Its current HD reference is202071152; earlier306373352 is retained only in source notes because direct retrieval failed, which does not prove retirement. The retailer’s generic uncoated field contradicts its own Class55 highlights/manufacturer. Resolve delivered coating/exposure and the actual connector instructions. Reported dimensions and nominal length do not establish seating depth, tip shape, pilot or a complete installed solid. A counted box creates no automatic A21Z schedule or generic GRK substitution.

The [Grip-Rite table](https://grip-rite.com/product/fasteners/hand-drive/nails/exterior-nails/common-nail/) identifies16C5 as bright steel16d common nails, nominal3½in,8gauge, smooth shank, flat head and diamond point, with an11/32in head-size field. It labels235 as approximate; HD says around220 in narrative and235 in specifications. Neither count is used as an exact pack size. Decimal shank diameter, tolerance, full profile, tip datum and mass convention remain unknown. Bright nails are for interior non-treated wood where corrosion is not a concern. No exterior greenhouse, heated sauna or connector-specific qualification is inferred. Retired Lowe’s Grip-Rite/smooth/approximately220 content also conflicts with Fas-n-Tite/ring/223 search rendering; the variants are not merged.

## Trusted unit contract

`retailerCatalog.ts` adds author-reviewed `purchaseSpec`:

- Counted: `{kind:"counted", count, sourceRefs}`. Its count must equal the existing profile’s exact `packCount`.
- Mass: `{kind:"mass", amount:5, unit:"lb", qualifier:"advertised", exactCount:null, sourceRefs}`. `profile.packCount` remains null. Source references must be distinct reviewed sources belonging to the product. Candidates cannot declare this evidence.

Legacy reviewed counted profiles retain their existing stock-unit evidence without changing stored projects. A heterogeneous pair/kit’s component list remains separate from its outer stock unit. `SupplyContent` adds optional `unit:"count"|"lb"` and `qualifier:"advertised"`; omitted unit preserves the legacy counted format. `formatSupplyContent(content)` is shared by UI, Markdown and CSV integration. Mass content prints advertised lb and exact piece count unknown, never pieces or exact nail coverage/spares.

A selection quantity2 means **two5-lb boxes**. Available3 means three matching purchase boxes, and an observed per-box price multiplies the selected boxes once. Count-to-pound conversion and automatic nail-demand rounding are absent. These two supply choices do not add a MaterialId, mesh or wood-fastener-plan product enum. Existing placed SD parts/connections remain separate procurement with a duplicate warning rather than an automatic offset.

Selections and exact observations keep their format6 shape. Unknown imported product IDs remain reviewable. Old SD306373352 observations remain saved but cannot price the current202071152 reference; fresh current-ID observations can. Admission/pricing still enforce retailer/product URL, direct seller, selected store/ZIP, age and future-date rules. Retired Grip-Rite Lowe’s observations cannot qualify. A genuinely observed zero price remains distinct from unknown.

## Verification and counts

**39 focused tests passed**, including seven new regressions for exact units/IDs, schema source trust, mass unknown counts, no geometry/automatic roles, JSON compatibility, per-box observations, zero/stale/future/store/ZIP/retired gates, old/current SD observations and duplicate procurement. Strict TypeScript checking passed. UI/build/container acceptance remains the parent integration step.

Actual delta: **+1 registry identity, +2 offer rows and +2 supply choices**. SD already existed and was updated, not duplicated. Totals: **41 registry records,55 offers,14 supplies,32 editable stocks (11 exact/21 generic),10 tools/accessories**. Of55 offers,51 are reference,3 retired and1 marketplace-retired. Research caches, blocked-request evidence and bounded-source manifest remain under `work/common-fastener-next/`; no access bypasses or account changes were used.
