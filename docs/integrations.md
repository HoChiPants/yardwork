# Integration contracts

## Catalog adapter

The first release uses snapshots. An optional `CATALOG_URL` adapter can be configured later. This is a **Yardwork contract**, not an official Home Depot API.

Request: `GET <CATALOG_URL>?zip=84121&store=<exact-store-id>`. Existing URL query parameters are retained except for those keys. If set, `CATALOG_TOKEN` is sent in `Authorization: Bearer …`. The server limits the call to 15 seconds. Treat credentials as server configuration and keep them out of project exports and Git.

Response: JSON array, at most 100 entries:

```json
[
  {
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

These values are **format examples**, not real inventory. `material` maps to `stud`, `treated`, `post`, `plywood`, `siding`, `roof`, `mesh`, or `screw`. Product stock dimensions and purchase units must match the corresponding material definitions; do not map a different board length, panel size, grade, or pack count merely because its title sounds similar. Current material definitions are in `src/model.ts`.

Return store-specific **available purchase units**, not a generic in-stock flag or warehouse/delivery inventory. Never turn null/missing quantities into zero or fabricate a checked timestamp from stale data. Respond with an error if the source cannot supply reliable data. The server rejects mismatched store/ZIP records; the client disregards records older than 24 hours or with future check times.

## Ollama

`OLLAMA_URL` points to the server reachable from the app process. `OLLAMA_MODEL` defaults to `qwen2.5:1.5b`. The app posts to `/api/chat`, asks for non-streamed schema-constrained JSON, and validates the returned command. Timeout: 60 seconds. Requests use temperature 0, a fixed seed, a 2,048-token context, and a bounded 256-token structured response. The schema and unit/default instructions are included in the prompt as well as the format field. The optional `compose.ai.yaml` overlay provisions a local engine/model without exposing the model port on the host.

Commands contain `type` (`wall`, `foundation`, `coop`), `width`, `height`, `depth` (inches), and `spacing` (12/16/24 inches). Width/depth are bounded to 24–192 inches and height to 12–120 inches. A coop command loads the fixed concept; it does not invent a custom coop for arbitrary dimensions. A targeted request includes `context: { sectionId, name, command, pieceCount }`. The selected section's parameters let the local parser or model retain unspecified dimensions. The server rejects an AI response that changes the targeted section type. Whole-project coop replacement cannot target an individual section. The user previews part and connection changes, pricing limitations and geometric findings before applying the resulting assembly. No execution tool or arbitrary code path is exposed to the model.

## Home Depot material-list handoff

[Home Depot’s own help](https://www.homedepot.com/c/create-a-list) documents a **Paste an Existing List** route within its Lists tool and moving a list into a Project. Yardwork prepares stock-unit quantities and product references as text for that route. It provides a clipboard action and a text download, with a selected-text fallback when clipboard permission is blocked.

This is a user-operated handoff, not an account API. It does not sign in, create lists, accept retailer-generated substitutions, add items to a cart, or submit orders. Retailer-side import/acceptance has not been verified in a signed-in account. The JSON model and full build guide stay in Yardwork. CSV upload compatibility is not assumed.

## Privacy and network use

Project files and browser drafts remain on the host/device unless exported or deliberately sent to an optional provider. AI requests contain the prompt and, for targeted edits, the selected section summary (ID, name, dimensions, spacing, and part count). The full project is not sent. Catalog calls contain store and ZIP. Font assets may load from Google Fonts; system fonts are the fallback. Home Depot product links open separately when the user chooses them. No analytics or background retailer scraping is included.
