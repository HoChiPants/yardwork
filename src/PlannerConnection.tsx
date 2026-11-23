import { useEffect, useState } from "react";
import { plannerConnectionSchema, type PlannerConnectionStatus } from "./plannerConnectionSchema";
import { workshopRequest } from "./workshopTransport";

type Status = PlannerConnectionStatus | { state: "checking" } | { state: "unreachable"; model?: undefined };

function statusMessage(status: Status) {
  switch (status.state) {
    case "checking": return "Checking Ollama…";
    case "installed": return `Ollama · ${status.model} is installed.`;
    case "missing-model": return `Install ${status.model} in Ollama, then check again.`;
    case "unreachable": return "Couldn’t check Ollama. Check that the local service is running.";
    case "built-in": return "Built-in planning presets.";
  }
}

export function PlannerConnection({ onUnavailableChange }: { onUnavailableChange?: (unavailable: boolean) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ state: "checking" });
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      try {
        const response = await workshopRequest("/api/planner/connection", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw Error("Connection status unavailable.");
        const result = plannerConnectionSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setStatus(result);
          onUnavailableChange?.(result.state === "missing-model" || result.state === "unreachable");
        }
      } catch {
        if (!controller.signal.aborted) {
          setStatus({ state: "unreachable" });
          onUnavailableChange?.(true);
        }
      }
    }
    void check();
    return () => controller.abort();
  }, [attempt, onUnavailableChange]);
  return <div className="planner-connection">
    <span role="status">{statusMessage(status)}</span>
    <button type="button" className="text-button" disabled={status.state === "checking"} onClick={() => {
      setStatus({ state: "checking" });
      setAttempt((value) => value + 1);
    }}>Check model again</button>
  </div>;
}
