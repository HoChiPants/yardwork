import { z } from "zod";
import { AI_SERVER_TIMEOUT_MS } from "../src/aiTiming";

/** CPU-only cold loads need a larger budget than a warm request. Never wait indefinitely. */
export function ollamaTimeoutMs(value = process.env.OLLAMA_TIMEOUT_MS) {
  return value === undefined
    ? AI_SERVER_TIMEOUT_MS
    : z.coerce.number().int().min(1000).max(AI_SERVER_TIMEOUT_MS).parse(value);
}
