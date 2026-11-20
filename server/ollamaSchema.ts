/** Ollama's grammar converter prefers `items` over `prefixItems` and rejects
 * Zod's boolean `items:false`. A closed, fixed-length tuple needs only its
 * prefix schemas and equal min/max bounds. Response validation remains Zod's job.
 * See ggml-org/llama.cpp common/json-schema.cpp build_array(). */
export function toOllamaSchema(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const schema = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, visit(child)]),
    );
    if (schema.items === false && Array.isArray(schema.prefixItems)) {
      const length = schema.prefixItems.length;
      if (schema.minItems !== length || schema.maxItems !== length)
        throw Error(
          "Ollama tuple conversion requires closed fixed-length min/max bounds.",
        );
      delete schema.items;
    }
    return schema;
  };
  return visit(input) as Record<string, unknown>;
}
