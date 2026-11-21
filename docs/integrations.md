# Integration contracts

## Catalog adapter

The first release uses snapshots. An optional `CATALOG_URL` adapter can be configured later. This is a **Yardwork contract**, not an official Home Depot API.

Request: `GET <CATALOG_URL>?zip=84121&store=<exact-store-id>&retailer=home-depot` (or `lowes`). Existing URL query parameters are retained except for those keys. If set, `CATALOG_TOKEN` is sent in `Authorization: Bearer …`. The server limits the call to 15 seconds. Treat credentials as server configuration and keep them out of project exports and Git.

Response: JSON array, at most 100 entries:

```json
[
  {
    "retailer": "home-depot",
    "material": "stud",
    "internetNumber": "123456789",
    "name": "Actual verified matching product",
    "price": 4.25,
    "available": 42,
    "store": "YOUR_STORE",
    "zip": "84121",
    "checkedAt": "2026-11-15T18:00:00.000Z",
    "url": "https://www.homedepot.com/p/actual-product/123456789"
  }
]
```

These values are **format examples**, not real inventory. `material` uses a validated ID from `src/model.ts`; the catalog includes generic planning stock and exact reviewed variants. Omitted retailer identifies legacy Home Depot observations. The URL must use the selected retailer’s official HTTPS host. Exact modeled variants require the corresponding active reviewed offer/product ID and URL, not a similarly named substitution. Product stock dimensions and purchase units must match the corresponding material definitions; do not map a different board length, panel size, grade, or pack count merely because its title sounds similar. Current material definitions are in `src/model.ts`.

Return store-specific **available purchase units**, not a generic in-stock flag or warehouse/delivery inventory. Never turn null/missing quantities into zero or fabricate a checked timestamp from stale data. Respond with an error if the source cannot supply reliable data. The server rejects mismatched retailer/store/ZIP records; the client disregards records older than 24 hours or with future check times.

## Ollama wall/base commands

`OLLAMA_URL` points to the server reachable from the app process. `OLLAMA_MODEL` defaults to `qwen2.5:3b`. The app posts to `/api/chat`, asks for non-streamed schema-constrained JSON, and validates the returned command. The shared bounded inference deadline is180 seconds (configurable downwards with OLLAMA_TIMEOUT_MS). Requests use temperature 0, a fixed seed, a 2,048-token context, and a bounded 256-token structured response. The schema and unit/default instructions are included in the prompt as well as the format field. The optional `compose.ai.yaml` overlay provisions a local engine/model without exposing the model port on the host.

Commands contain `type` (`wall`, `foundation`), `width`, `height`, `depth` (inches), and `spacing` (12/16/24 inches). Width/depth are bounded to 24–192 inches and height to 12–120 inches. New coop commands are rejected. Legacy coop project files remain readable. A targeted request includes `context: { sectionId, name, command, pieceCount }`. The selected section's parameters let the local parser or model retain unspecified dimensions. The server rejects an AI response that changes the targeted section type. Whole-project coop replacement cannot target an individual section. The user previews part and connection changes, pricing limitations and geometric findings before applying the resulting assembly. No execution tool or arbitrary code path is exposed to the model.

## Home Depot material-list handoff

[Home Depot’s own help](https://www.homedepot.com/c/create-a-list) documents a **Paste an Existing List** route within its Lists tool and moving a list into a Project. Yardwork prepares stock-unit quantities and product references as text for that route. It provides a clipboard action and a text download, with a selected-text fallback when clipboard permission is blocked.

This is a user-operated handoff, not an account API. It does not sign in, create lists, accept retailer-generated substitutions, add items to a cart, or submit orders. Retailer-side import/acceptance has not been verified in a signed-in account. The JSON model and full build guide stay in Yardwork. CSV upload compatibility is not assumed.

## Privacy and network use

Project files and browser drafts remain on the host/device unless exported or deliberately sent to an optional provider. AI requests contain the prompt and, for targeted edits, the selected section summary (ID, name, dimensions, spacing, and part count). The full project is not sent. Catalog calls contain store and ZIP. Font assets may load from Google Fonts; system fonts are the fallback. Home Depot product links open separately when the user chooses them. No analytics or background retailer scraping is included.

## Idea planner (`POST /api/planner`)

General ideas use the module proposal schema in `src/planning.ts`, independently of wall/base section revision. The request contains `prompt`, optional centered `workZone` dimensions in inches, and occupied section bounding summaries; it does not send the full project or saved files. Results include title/summary, assumptions, questions, suggestions, at most 12 typed furniture modules and at most 4 typed greenhouse/sauna-frame/closet/casework-shelves structures. Empty modules/structures are a valid clarification response. `previousPlan` lets follow-up requests preserve unspecified parameters; it contains proposal data, not the stored project.

Without `OLLAMA_URL`, local presets cover storage bench/banquette, L-shaped seating, workbench, cabinet, framed shelving, plywood bookcases, box frames, greenhouse, sauna framing and closet inserts. They disclose provisional measurements. Default Ollama requests use a sparse typed intent with native schema-constrained output, a 4,096-token context and a bounded 512-token output. The inference deadline is 180 seconds; `OLLAMA_TIMEOUT_MS` can lower it within 1,000–180,000 ms. The browser allows 190 seconds and provides cancellation; disconnecting a general planner request cancels upstream model generation. The model does not emit geometry. Raw user measurements/scope and validated intent feed the deterministic generators; unspecified edits preserve the prior proposal. The optional full-module `schema` mode uses 16,384/4,096 tokens and requires separate qualification. Module stock families, dimensions, part counts and work-zone fit are validated again before application. Applying retains unrelated geometry/settings and saves design assumptions in project notes. No arbitrary code or automatic joints are accepted.

`casework-shelves` uses outside `width`, `depth`, `height`, integer `shelfCount` (1–6), `shelfClearance` (front setback), origin/yaw and the `caseworkPanels` source selection. Actual selected sheet thickness is fixed, with stable semantic panel roles and equal clear openings. Relative count follow-ups compose with explicit outside dimensions; invalid or unitless combined dimensions retain the prior design and request clarification. Source choices and pose are not inferred from a count change. Legacy independent panel entries remain valid and are not silently converted.

The broader module model path has protocol coverage, but requires real-inference qualification separately from the older wall/base smoke. Local presets are immediately available without an AI service.

After either planner produces an editable proposal, **Cuts and stock** uses the actual candidate geometry and available Cut pool stock in the browser. Requests such as “Show cuts for this proposal” and “Use O001 for this proposal” use that local preview. The cut check keeps the selected stock and its grain orientation, accounts for the listed or measured kerf, and shows what the project would still buy. Applying saves the previewed assignments with their original stock lineage. Confirm panel markings and the saw’s actual cutting loss before making cuts. [APA plywood orientation](https://www.apawood.org/engineered-wood-products/plywood-osb/plywood/) · [Freud saw blade catalog](https://www.freudtools.com/public/catalog/freud-catalog/docs/Freud_GPCatalog_2020_LOWRES.pdf)

`OLLAMA_PLANNER_FORMAT=compact` is the default. The design wire requires only family/operation plus requested fields; the separate clarify variant carries one concise question. Summaries, suggestions and geometry are derived by the application, rather than generated as extra model text. Internal narrative-bearing replay intents remain compatible. Both wire branches reject extra keys; strict intent, plan and geometry validation still run before application. The older value `json` is an alias for this same compact protocol. This is a configured protocol, not a fallback after a rejected response. Plain JSON mode produced wrong field types in real model tests; the compact native grammar prevents those response shapes. The much larger full-module grammar caused severe generation overhead on the tested CPU-only engine. `OLLAMA_PLANNER_FORMAT=schema` explicitly enables that separate full-module protocol; its fixed tuples retain `prefixItems` and equal min/max bounds without Zod's boolean `items:false`, which the tested converter rejected. All responses still pass bounds, stock-family and geometry checks. [Ollama's structured output modes](https://github.com/ollama/ollama/blob/main/docs/api.md), [converter array handling](https://github.com/ggml-org/llama.cpp/blob/master/common/json-schema.cpp).

For actual module-inference qualification with the app connected to Ollama, run:

```sh
node --import tsx scripts/planner-smoke.ts
node --import tsx scripts/planner-families-smoke.ts
```

Use `SMOKE_URL` to target an isolated test instance. Both scripts require the response provider to be Ollama. The first checks a novel 7 × 5 ft L-shaped banquette with 24 in seat depth and 18 in seat height and verifies the footprint/work-zone fit. The second tests the five families plus storage-height follow-up with exact measurements/features, real geometry, profile/guide checks and API save/reopen; it retains six synthetic projects for persistence inspection and emits JSONL receipts. Any failed or skipped dependent case exits nonzero. The manual **Real AI qualification** workflow includes both after the older wall/base smoke. Earlier public workflow results are not qualification of this local, unpushed iteration.


## Project storage format

The health response includes `projectFormatVersion: 4`. Supported project reads accept formats 1, 2 and 3 through explicit in-memory migration and current format 4. Writes store format 4 with the ordinary revision guard. `GET /api/projects/:id` validates the stored record; unsupported/damaged records return 422 and cannot be overwritten. Library summaries retain a `loadError` for those records. `GET /api/projects/:id/original` downloads their exact original bytes; it is a recovery artifact, not a repaired portable plan. See [format and browser-draft recovery](project-format.md).

`attachmentPlans` stays on the project host and in explicit exports. General AI requests contain proposal/context data, not full saved attachment records. Applying a dimension revision does not rebind pin references automatically: changed targets become stale until an explicit user-reviewed refresh. Attachment guides/CSV distinguish candidate coordinates from excluded stale/conflicting schedules. Actual side/shelf stock dimensions, source identity, nominal bore geometry and user measurement provenance do not establish load or code approval.


## Completion and timing receipts

All Ollama response paths require a completed assistant JSON object (`done:true`, normal `done_reason:stop`); length-limited, missing-completion, load/unload-only or tool-call responses cannot become proposals. Cancellation and the existing bounded deadline still propagate; a late response after cancellation is rejected. No silent fallback or retry is introduced.

Compact `/api/planner` responses include a sanitized per-request `timing` receipt, including on handled errors: outcome, HTTP status, wall duration and available load/prompt/decode durations and token counts. Nanosecond counters are converted to milliseconds. Missing/invalid counters remain null. The receipt has no prompt, project content, URL, raw response, model name or error text, and is not automatically logged or persisted in project JSON. The optional observer cannot alter the planning result. These counters support measured qualification; they do not establish improved latency without a native run. Full-schema/legacy command output completion is gated too, but compact timing qualification does not certify those optional modes.

Protocol references: [Ollama chat response](https://docs.ollama.com/api/chat) and [server completion implementation](https://github.com/ollama/ollama/blob/main/server/routes.go).
