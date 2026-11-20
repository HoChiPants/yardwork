import test from "node:test";
import assert from "node:assert/strict";
import { assessUnsupportedIntent } from "../src/unsupportedIntent";
import { localIdeaPlan } from "../src/planning";
import { intentToPlan } from "../server/intentPlanner";

test("wire mesh/cloth and chicken wire materials do not become electrical-system requests", () => {
  for (const prompt of [
    "A greenhouse with chicken wire mesh on the sides",
    "Build a cabinet with a chicken wire door",
    "A greenhouse with wire cloth sides",
    "A cabinet with poultry wire doors",
  ]) {
    assert.equal(assessUnsupportedIntent(prompt), null, prompt);
    const local = localIdeaPlan({ prompt });
    assert.ok(local.modules.length + local.structures.length > 0, prompt);
  }
  assert.ok(
    intentToPlan(
      { prompt: "A cabinet with chicken wire doors" },
      { family: "cabinet", operation: "create" },
    ).modules.length > 0,
  );
});
test("a separate electrical action still wins over nearby wire-mesh material mentions", () => {
  for (const prompt of [
    "Build a chicken wire cabinet and wire it for lights",
    "Build a greenhouse with wire mesh and install electrical outlets",
    "Wire a chicken coop for lights",
  ]) {
    assert.equal(assessUnsupportedIntent(prompt)?.primary, true, prompt);
    const local = localIdeaPlan({ prompt });
    assert.equal(local.modules.length + local.structures.length, 0, prompt);
    assert.ok(local.questions.some((question) => /electrical/.test(question)));
  }
});
