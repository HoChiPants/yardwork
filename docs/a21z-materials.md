# A21Z connector references and provisional purchase comparison

Primary sources reviewed 2026-11-17 UTC; trusted evidence revision `simpson-a21z-2026-11-17-v1`. This adds no registry product, material geometry or retailer offer: totals remain **34 modeled stocks, 48 registry records, 65 offer references and 15 tool/accessory references**. The existing exact N10DHDG-R reference now has a manual 120-nail supply option, bringing purchase-only supply definitions from 14 to **15**. Existing definitions and purchase identities are retained. Prices and store/ZIP availability require exact manual snapshots; no live inventory was imported.

## Source facts and limits

The US [A-angle table](https://www.strongtie.com/framinganglesandplates_anglesandplates/a_angle/p/a) identifies A21Z as ZMAX, 18 gauge, one connector, with named dimensions **W1=2 in, W2=1½ in, L=1⅜ in**. Those dimensions name flanges/length, rather than a verified outer solid envelope. Gauge is not a measured leaf thickness. No exact US hole-center pattern, bend radius or leaf perimeter is supplied to the application.

Choose one complete source-specific alternative:

| Schedule  | Base member          | Post member          | Total per C intent | Exact manual purchase unit |
| --------- | -------------------- | -------------------- | ------------------ | -------------------------- |
| `sd9112`  | 2 SD9112             | 2 SD9112             | 4 screws           | SD9112R100, 100-screw box  |
| `n10dhdg` | 2 .148 × 1½ in nails | 2 .148 × 1½ in nails | 4 nails            | N10DHDG-R, 120-nail box    |

The A-angle screw table and [approved-connector table](https://www.strongtie.com/products/fastening-systems/technical-notes/sd-connector-screw-approved-connectors) identify the A21 SD9 × 1½ in reference. The [2026–2027 catalog p314](https://ssttoolbox.widen.net/content/llqi0appt0/original/C-C-2026-p314.pdf?download=true) supplies the two-plus-two nail schedule. [General installation notes pp20–23](https://ssttoolbox.widen.net/content/s9lk6yrvfj/original/C-C-2026-p020-023.pdf?download=true) retain specified fasteners, required holes and seating constraints. Generic GRK screws, bright common nails, mixed SD/nail schedules and other-angle schedules are not substituted. No published load value is adopted.

Exact public purchase references remain:

| Product                 | Home Depot                                                | Lowe's                                                                                                              |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A21Z · one angle        | [100375047 / A21Z](https://www.homedepot.com/p/100375047) | [1114951 / A21Z](https://www.lowes.com/pd/simpson-strong-tie-a21z-angle-z-max/1114951)                              |
| SD9112R100 · 100 screws | [202071152](https://www.homedepot.com/p/202071152)        | [3242494](https://www.lowes.com/pd/Simpson-Strong-Tie-100-Count-9-x-1-1-2-Galvanized-Wood-Screws/3242494)           |
| N10DHDG-R · 120 nails   | [206101770](https://www.homedepot.com/p/206101770)        | [1002681308](https://www.lowes.com/pd/Simpson-Strong-Tie-1-1-2-in-Hot-Dipped-Galvanized-Steel-120-Count/1002681308) |

The Lowe's A21Z fields 1.548/1.375/2.048 in use a different dimension convention. No .048 in thickness or bend offset is derived from them. Regional UK A21 dimensions/holes/box200, sibling Q&A and a linked generic lumber dimension sheet do not become US manufacturing data. Drawing geometry is described as approximate. Work-only retrieval evidence and document hashes are retained in the workspace's `work/a21z-joint-choice-research/`; no CAD, product imagery or PDF binaries are redistributed here.

## What the comparison means

One current, source/reference-valid C plan budgets one angle plus its complete four-fastener alternative provisionally, even while measured entries are blank. Any error, stale reference, missing/unsupported member or conflicting entered path excludes that whole one-plus-four schedule; it never becomes a three-of-four purchase schedule. The excluded intent and reasons remain visible. Count all included same-product demand first, then round 100-screw or 120-nail packs once.

`connectorPurchaseSummary` compares that intent with explicit same-product manual supply selections. Recomputing never adds supplies, meshes, holes or paid BOM rows. Manual supplies remain the sole purchase selections for the comparison. Separate placed hardware and legacy joint quantities remain separately counted and produce duplicate-review warnings; there is no hidden offset, on-hand inference or credit for tool-kit contents. Missing/stale plans make the takeoff incomplete, and nominal spares are only relative to included provisional demand.

Each connector fastener enters its assigned single wood member through a metal leaf. These C entry paths are separate from a GRK W wood-to-wood ray. User wood-entry-to-tip and deepest pilot-tip measurements require their own basis/date and do not supply manufactured metal-hole coordinates. Sawn-wood frame references do not establish sheet/casework-edge, heated-sauna, completed-seat, racking, corrosion/exposure, code or installation approval.

## Tool separation

SD9112's [manufacturer reference](https://www.strongtie.com/strongdrive_exteriorwoodscrews/sd_screw/p/strong-drive-sd-connector-screw) specifies a ¼ in hex drive. The checklist keeps `drive-quarter-hex` accessory review separate from `drive-screw` function. No existing T25/T15 bit satisfies it, and an included-driver listing creates no reviewed tool selection or ownership. Pilot drilling is conditional on actual instructions/entered proposals; neither nominal fastener length nor schedule quantity supplies a pilot size/depth.

The nail alternative derives a generic nail-driving function and a separate connector-installation review. Existing hammer evidence remains limited to its documented function; it does not approve Simpson hole fit, seating, pneumatic collation or load capacity. Stale/conflicting plans contribute no current driving/drilling setup. Tools never enter material geometry or priced stock. A checked tool remains a review record, not ownership or installation.
