import test from "node:test";
import assert from "node:assert/strict";
import { toOllamaSchema } from "../server/ollamaSchema";
import { ideaPlanSchema, localIdeaPlan } from "../src/planning";
test("Ollama format tuples keep all coordinate constraints without boolean items that mask prefixItems", () => {
  const original = ideaPlanSchema.toJSONSchema(),
    before = JSON.stringify(original),
    converted = toOllamaSchema(original);
  let tuples = 0;
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const schema = value as Record<string, unknown>;
    if (Array.isArray(schema.prefixItems)) {
      tuples++;
      assert.equal("items" in schema, false);
      assert.equal(schema.minItems, schema.prefixItems.length);
      assert.equal(schema.maxItems, schema.prefixItems.length);
      assert.ok(
        schema.prefixItems.every((s: unknown) => s && typeof s === "object"),
      );
    }
    Object.values(schema).forEach(walk);
  };
  walk(converted);
  assert.ok(tuples >= 4);
  assert.equal(
    JSON.stringify(original),
    before,
    "The application schema must not be mutated",
  );
  const plan = localIdeaPlan({ prompt: "bench" });
  (plan.modules[0].position as number[]).push(999);
  assert.equal(
    ideaPlanSchema.safeParse(plan).success,
    false,
    "Server still rejects an extra coordinate",
  );
});
test("non-tuple false schemas stay intact and unbounded tuple conversion is refused", () => {
  assert.deepEqual(
    toOllamaSchema({
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" } },
    }),
    {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" } },
    },
  );
  assert.throws(
    () =>
      toOllamaSchema({
        type: "array",
        prefixItems: [{ type: "number" }],
        items: false,
      }),
    /fixed-length/,
  );
});
