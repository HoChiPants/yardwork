import assert from "node:assert/strict";
import { test } from "node:test";
import { ollamaTimeoutMs } from "../server/ollamaTimeout";
import { AI_CLIENT_TIMEOUT_MS, AI_SERVER_TIMEOUT_MS } from "../src/aiTiming";

test("local model cold-start deadline stays bounded and expires before the browser", () => {
  assert.equal(AI_SERVER_TIMEOUT_MS, 180000);
  assert.ok(AI_CLIENT_TIMEOUT_MS > AI_SERVER_TIMEOUT_MS);
  assert.equal(ollamaTimeoutMs("45000"), 45000);
  for (const value of ["", "NaN", "Infinity", "0", "999", "180001", "3000.5"])
    assert.throws(() => ollamaTimeoutMs(value));
});
