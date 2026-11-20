/** Native /api/chat completion semantics and metrics:
 * https://docs.ollama.com/api/chat
 * https://github.com/ollama/ollama/blob/main/server/routes.go
 * Load/unload acknowledgements are terminal, but are not generated design responses.
 */
export type OllamaOutcome =
  | "success"
  | "http-error"
  | "transport-error"
  | "invalid-response"
  | "incomplete"
  | "invalid-intent"
  | "cancelled"
  | "timeout";
export type OllamaTimingReceipt = Readonly<{
  protocol: "sparse-intent-v1";
  outcome: OllamaOutcome;
  wallDurationMs: number;
  httpStatus: number | null;
  completionReason: "stop" | "length" | "load" | "unload" | "other" | null;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  promptEvalDurationMs: number | null;
  evalDurationMs: number | null;
  promptEvalCount: number | null;
  promptEvalCachedCount: number | null;
  evalCount: number | null;
}>;
export type OllamaTimingObserver = (receipt: OllamaTimingReceipt) => void;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export class OllamaResponseError extends Error {
  constructor(
    readonly outcome: "invalid-response" | "incomplete",
    message: string,
  ) {
    super(`${message} Your workspace has not changed.`);
    this.name = "OllamaResponseError";
  }
}

/** A completed, non-truncated assistant JSON object; no repair or partial acceptance. */
export function completedOllamaJson(input: unknown): Record<string, unknown> {
  if (!record(input))
    throw new OllamaResponseError(
      "invalid-response",
      "The AI planner returned an invalid response envelope.",
    );
  if ("error" in input)
    throw new OllamaResponseError(
      "invalid-response",
      "The AI planner returned an error instead of a proposal.",
    );
  if (input.done !== true)
    throw new OllamaResponseError(
      "incomplete",
      "The AI planner did not confirm a completed response.",
    );
  if (input.done_reason === "length")
    throw new OllamaResponseError(
      "incomplete",
      "The AI planner reached its output limit; a truncated proposal cannot be used.",
    );
  if (input.done_reason !== "stop")
    throw new OllamaResponseError(
      "incomplete",
      "The AI planner did not confirm a normal generation stop.",
    );
  const message = input.message;
  if (
    !record(message) ||
    message.role !== "assistant" ||
    typeof message.content !== "string" ||
    !message.content.trim()
  )
    throw new OllamaResponseError(
      "invalid-response",
      "The AI planner returned no completed assistant proposal.",
    );
  if (
    message.tool_calls !== undefined &&
    (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)
  )
    throw new OllamaResponseError(
      "invalid-response",
      "The AI planner returned tool calls instead of a design proposal.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    // Never echo a JSON parser's raw response excerpt into errors or receipts.
    throw new OllamaResponseError(
      "invalid-response",
      "The AI planner returned unreadable proposal JSON.",
    );
  }
  if (!record(parsed))
    throw new OllamaResponseError(
      "invalid-response",
      "The AI proposal must be a typed JSON object.",
    );
  return parsed;
}

const counter = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
const milliseconds = (value: unknown) => {
  const nanoseconds = counter(value);
  return nanoseconds === null ? null : nanoseconds / 1e6;
};
/** Fixed numeric/enumerated allowlist only: no model names, prompts, URLs, content or errors. */
export function ollamaTimingReceipt(
  outcome: OllamaOutcome,
  wallDurationMs: number,
  httpStatus: number | null,
  body: unknown,
): OllamaTimingReceipt {
  const data = record(body) ? body : {},
    reason = data.done_reason;
  return Object.freeze({
    protocol: "sparse-intent-v1",
    outcome,
    wallDurationMs: Number.isFinite(wallDurationMs)
      ? Math.max(0, wallDurationMs)
      : 0,
    httpStatus:
      httpStatus !== null &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599
        ? httpStatus
        : null,
    completionReason:
      reason === "stop" ||
      reason === "length" ||
      reason === "load" ||
      reason === "unload"
        ? reason
        : typeof reason === "string"
          ? "other"
          : null,
    totalDurationMs: milliseconds(data.total_duration),
    loadDurationMs: milliseconds(data.load_duration),
    promptEvalDurationMs: milliseconds(data.prompt_eval_duration),
    evalDurationMs: milliseconds(data.eval_duration),
    promptEvalCount: counter(data.prompt_eval_count),
    promptEvalCachedCount: counter(data.prompt_eval_cached_count),
    evalCount: counter(data.eval_count),
  });
}
