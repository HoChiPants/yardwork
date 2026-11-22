import { z } from "zod";
import type { PlannerConnectionStatus } from "../src/plannerConnectionSchema";

export const defaultOllamaModel = "qwen2.5:3b";

const modelsSchema = z.object({
  models: z.array(z.object({ name: z.string().optional(), model: z.string().optional() })),
});

function modelTag(name: string) {
  const tag = name.slice(name.lastIndexOf("/") + 1).includes(":") ? name : `${name}:latest`;
  return tag.toLowerCase().replace(/^registry\.ollama\.ai\//, "").replace(/^library\//, "");
}

export async function plannerConnectionStatus(signal: AbortSignal): Promise<PlannerConnectionStatus> {
  const host = process.env.OLLAMA_URL;
  if (!host) return { state: "built-in" };
  const configuredModel = process.env.OLLAMA_MODEL ?? defaultOllamaModel;
  const model = /^[\w./:-]{1,128}$/.test(configuredModel) ? configuredModel : "Configured model";
  try {
    const response = await fetch(new URL("/api/tags", host), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]),
      redirect: "error",
    });
    if (!response.ok) return { state: "unreachable", model };
    const { models } = modelsSchema.parse(await response.json());
    const modelName = modelTag(configuredModel);
    const installed = models.some(({ name, model }) =>
      [name, model].some((listed) => listed && modelTag(listed) === modelName));
    return { state: installed ? "installed" : "missing-model", model };
  } catch {
    return { state: "unreachable", model };
  }
}
