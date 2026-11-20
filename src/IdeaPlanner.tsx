import { RoofVentFields } from "./RoofVentFields";
import { workshopRequest } from "./workshopTransport";
import { formatPreciseInches } from "./measurement";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AI_CLIENT_TIMEOUT_MS } from "./aiTiming";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingReview,
  previewIdeaRevision,
} from "./ideaBindings";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { format, material, type Project, type V3 } from "./model";
import { bounds } from "./engine";
import { Scene } from "./Scene";
import { LengthInput } from "./LengthInput";
import { PricingSummary } from "./PricingSummary";
import { updateStructureParameter } from "./structureIdeas";
import { editFurniturePlan, straightRun } from "./ideaEdits";
import {
  ideaPlanSchema,
  previewIdeaPlan,
  type IdeaPlan,
  type PlanningZone,
} from "./planning";

const noop = () => {};
function PlacementFields({
  name,
  position,
  yaw,
  onPosition,
  onYaw,
}: {
  name: string;
  position: V3;
  yaw: number;
  onPosition: (axis: number, value: number) => void;
  onYaw: (value: number) => void;
}) {
  return (
    <details className="proposal-placement">
      <summary>Position and rotation</summary>
      <div className="planner-module-grid">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <LengthInput
            key={axis}
            label={`Position ${axis}`}
            ariaLabel={`${name} position ${axis}`}
            value={position[index]}
            min={index === 1 ? 0 : -1200}
            max={1200}
            onChange={(value) => onPosition(index, value)}
          />
        ))}
        <label className="field">
          Rotation (degrees)
          <input
            type="number"
            aria-label={`${name} rotation degrees`}
            min={-180}
            max={180}
            step={1}
            value={yaw}
            onChange={(event) => onYaw(Number(event.target.value))}
          />
        </label>
      </div>
    </details>
  );
}
class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty">
        3D preview is unavailable in this browser. Review the dimensions below;
        your workspace has not changed.
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function IdeaPlanner({
  project,
  initialTarget = null,
  onApply,
  onClose,
}: {
  project: Project;
  initialTarget?: { bindingId: string; entryIds?: string[] } | null;
  onApply: (next: Project) => void;
  onClose: () => void;
}) {
  const previousPlan = useRef<IdeaPlan | null>(null);
  const originalPlan = useRef<IdeaPlan | null>(null);
  const [target, setTarget] = useState(initialTarget);
  const [targetToken, setTargetToken] = useState<string | null>(null);
  const [rebuildReviewed, setRebuildReviewed] = useState(false);
  const [baselineChanges, setBaselineChanges] = useState({
    manualEdits: 0,
    missingRoles: 0,
  });
  const activeRequest = useRef<{
    controller: AbortController;
    timeout: AbortSignal;
    cancelled: boolean;
  } | null>(null);
  const [planningStatus, setPlanningStatus] = useState("");
  const [exploredPrompt, setExploredPrompt] = useState("");
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      plan: IdeaPlan;
      provider: string;
      message: string;
    } | null>(null);
  function loadTarget(next: typeof target) {
    const active = activeRequest.current;
    activeRequest.current = null;
    active?.controller.abort();
    setTarget(next);
    setTargetToken(null);
    setRebuildReviewed(false);
    setBaselineChanges({ manualEdits: 0, missingRoles: 0 });
    originalPlan.current = null;
    previousPlan.current = null;
    setResult(null);
    setPrompt("");
    setExploredPrompt("");
    setBusy(false);
    setError("");
    setPlanningStatus("");
    if (next) {
      try {
        const plan = bindingPlan(project, next.bindingId, next.entryIds);
        const review = bindingReview(project, next.bindingId, next.entryIds);
        setBaselineChanges({
          manualEdits: review.manualEdits,
          missingRoles: review.missingRoles,
        });
        setTargetToken(review.token);
        originalPlan.current = plan;
        previousPlan.current = plan;
        setResult({
          plan,
          provider: "Saved design",
          message:
            "Changes update this applied design. Unrelated project work is retained.",
        });
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "This saved design could not be loaded.",
        );
      }
    }
  }
  useEffect(() => {
    loadTarget(initialTarget);
    return () => {
      const request = activeRequest.current;
      activeRequest.current = null;
      request?.controller.abort();
    };
  }, [
    project.id,
    initialTarget?.bindingId,
    initialTarget?.entryIds?.join("|"),
  ]);
  const zone = (project as Project & { workZone?: PlanningZone | null })
    .workZone;
  const preview = useMemo(() => {
    if (
      !result ||
      (!result.plan.modules.length && !result.plan.structures.length)
    )
      return null;
    try {
      if (target) {
        if (!targetToken)
          throw Error("Reload this saved design before previewing changes.");
        const revision = previewIdeaRevision(
          project,
          target.bindingId,
          result.plan,
          targetToken,
          { entryIds: target.entryIds },
        );
        return { value: revision, revision, error: null };
      }
      return {
        value: previewIdeaPlan(project, result.plan),
        revision: null,
        error: null,
      };
    } catch (e) {
      return {
        value: null,
        revision: null,
        error: e instanceof Error ? e.message : "Invalid layout",
      };
    }
  }, [project, result, target, targetToken]);
  const revisionChanged =
    !!result &&
    JSON.stringify(result.plan) !== JSON.stringify(originalPlan.current);
  const selectedBinding = target
    ? project.ideaBindings.find((binding) => binding.id === target.bindingId)
    : null;
  useEffect(() => setRebuildReviewed(false), [result?.plan]);
  const previewView = useMemo(
    () => ({ preset: "iso", nonce: Date.now() }),
    [result?.plan],
  );
  const seatingModules =
      result?.plan.modules.filter((m) => m.kind === "bench") ?? [],
    seatingRun = straightRun(seatingModules);
  function resizeModule(
    index: number,
    field: "width" | "depth" | "height",
    value: number,
  ) {
    setResult((r) =>
      r
        ? {
            ...r,
            plan:
              field === "width" && Number.isFinite(value)
                ? editFurniturePlan(
                    r.plan,
                    `Make section ${index + 1} width ${value} inches`,
                  )
                : {
                    ...r.plan,
                    modules: r.plan.modules.map((m, j) =>
                      j === index ? { ...m, [field]: value } : m,
                    ),
                  },
          }
        : r,
    );
  }
  function cancelPlanning() {
    const request = activeRequest.current;
    if (!request || request.timeout.aborted) return;
    request.cancelled = true;
    request.controller.abort();
  }
  async function generate() {
    if (activeRequest.current || !prompt.trim()) return;
    const previous = result?.plan ?? previousPlan.current,
      previousResult = result;
    const request = {
      controller: new AbortController(),
      timeout: AbortSignal.timeout(AI_CLIENT_TIMEOUT_MS),
      cancelled: false,
    };
    activeRequest.current = request;
    previousPlan.current = previous;
    setBusy(true);
    setError("");
    setPlanningStatus("");
    setResult(null);
    try {
      const targetSections = new Set(
        target
          ? (project.ideaBindings
              .find((binding) => binding.id === target.bindingId)
              ?.entries.filter(
                (entry) =>
                  !target.entryIds || target.entryIds.includes(entry.id),
              )
              .flatMap((entry) =>
                entry.sections.map((section) => section.sectionId),
              ) ?? [])
          : [],
      );
      const existingSections = project.sections
        .filter((section) => !targetSections.has(section.id))
        .map((s) => {
          const pieces = project.pieces.filter((p) =>
              s.pieceIds.includes(p.id),
            ),
            boxes = pieces.map(bounds);
          return {
            name: s.name,
            min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))),
            max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))),
          };
        })
        .filter(
          (s) => s.min.every(Number.isFinite) && s.max.every(Number.isFinite),
        );
      const response = await workshopRequest("/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          workZone: zone ?? null,
          existingSections,
          previousPlan: previous ?? undefined,
        }),
        signal: AbortSignal.any([request.controller.signal, request.timeout]),
      });
      const data = await response.json();
      if (activeRequest.current !== request) return;
      if (request.controller.signal.aborted || request.timeout.aborted)
        throw Error("Planning request ended.");
      if (!response.ok)
        throw Error(
          data.error ??
            "The planner could not make a proposal. Your workspace has not changed.",
        );
      const plan = ideaPlanSchema.parse(data.plan);
      previousPlan.current = plan;
      setExploredPrompt(prompt);
      setResult({ plan, provider: data.provider, message: data.message });
    } catch (error) {
      if (activeRequest.current !== request) return;
      setResult(previousResult);
      if (request.cancelled)
        setPlanningStatus(
          previous
            ? "Planning canceled. Your previous proposal is retained."
            : "Planning canceled.",
        );
      else if (request.timeout.aborted)
        setError(
          previous
            ? "Planning timed out. Your previous proposal is retained. Try again once the local model is ready."
            : "Planning timed out. Try again once the local model is ready.",
        );
      else
        setError(
          error instanceof Error
            ? error.message
            : "Unable to reach the planner. Your workspace has not changed.",
        );
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="idea-planner">
      <div className="modal-icon">
        <Sparkles size={25} />
      </div>
      <span className="eyebrow">START WITH WHAT YOU WANT TO MAKE</span>
      <h2 id="modal-title">
        {target ? "Revise your saved design." : "Tell us your idea."}
      </h2>
      <p>
        Describe the furniture or project, the space it must fit, and what
        matters to you. Review the dimensions and changes before applying them.
      </p>
      {project.ideaBindings.length > 0 && (
        <label className="field">
          Design action
          <select
            aria-label="Design to edit"
            disabled={busy}
            value={
              target
                ? `${target.bindingId}${target.entryIds?.length ? `/${target.entryIds.join(",")}` : ""}`
                : ""
            }
            onChange={(event) => {
              const [bindingId, entryIds] = event.target.value.split("/");
              loadTarget(
                bindingId
                  ? {
                      bindingId,
                      ...(entryIds ? { entryIds: entryIds.split(",") } : {}),
                    }
                  : null,
              );
            }}
          >
            <option value="">Add a new design</option>
            {project.ideaBindings.map((binding) => (
              <optgroup key={binding.id} label={binding.title}>
                <option value={binding.id}>Revise all · {binding.title}</option>
                {binding.entries.map((entry) => (
                  <option key={entry.id} value={`${binding.id}/${entry.id}`}>
                    Revise{" "}
                    {entry.spec.type === "furniture"
                      ? entry.spec.recipe.name
                      : entry.spec.structure.kind.replaceAll("-", " ")}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {target && (
        <p className="provider-pill">
          Editing {selectedBinding?.title ?? "saved design"}
          {target.entryIds?.length ? " · selected assembly" : " · whole design"}
          . This updates the existing build.
        </p>
      )}
      {target &&
        (baselineChanges.manualEdits > 0 ||
          baselineChanges.missingRoles > 0) && (
          <p className="notice">
            This design has custom or missing parts. The dimension controls
            describe its saved recipe. Your existing geometry is retained until
            you approve an affected rebuild.
          </p>
        )}
      {zone && (
        <p className="provider-pill">
          Work zone: {format(zone.width)} wide × {format(zone.depth)} deep ×{" "}
          {format(zone.height)} high
        </p>
      )}
      <label className="field">
        Your project idea
        <textarea
          className="prompt-input"
          aria-label="Describe your idea"
          rows={4}
          value={prompt}
          placeholder="An L-shaped kitchenette banquette, 6 ft along the back with a 4 ft return. I want storage below and a wood back."
          onChange={(e) => {
            setPrompt(e.target.value);
            setError("");
          }}
        />
      </label>
      {!target && (
        <div className="prompt-examples">
          {[
            "Three-section storage banquette with opening lids and no back",
            "Workbench 6 ft wide, 2 ft deep, 36 inches high",
            "Shelving 4 ft wide, 16 inches deep, 5 ft tall",
          ].map((example) => (
            <button
              key={example}
              disabled={busy}
              onClick={() => {
                previousPlan.current = null;
                setExploredPrompt("");
                setPrompt(example);
                setResult(null);
                setError("");
                setPlanningStatus("");
              }}
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <button
        className="button primary full"
        disabled={busy || !prompt.trim()}
        onClick={generate}
      >
        {busy ? (
          <Loader2 size={16} className="spin" />
        ) : (
          <Lightbulb size={16} />
        )}{" "}
        {busy ? "Planning your layout…" : "Explore idea"}
      </button>
      {busy && (
        <>
          <p className="small-note" role="status">
            A cold local model may take up to three minutes to start and plan
            your layout.
          </p>
          <button className="button secondary full" onClick={cancelPlanning}>
            Cancel planning
          </button>
        </>
      )}
      {planningStatus && (
        <p className="notice" role="status">
          {planningStatus}
        </p>
      )}
      {previousPlan.current && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => loadTarget(null)}
        >
          Start a different idea
        </button>
      )}
      {previousPlan.current && (
        <p className="small-note">
          Try “section 2 width 30 inches” or “move the whole design 3 inches
          along +Z.” Use +Y to move up. For a turn, name its pivot, such as
          “rotate the whole design 90 degrees around the workspace origin.”
        </p>
      )}
      {result && prompt !== exploredPrompt && (
        <p className="notice">
          Description changed. Explore again to refine this proposal while
          keeping unspecified dimensions.
        </p>
      )}
      {error && (
        <div className="notice warning" role="alert">
          <AlertTriangle size={16} />
          <p>{error}</p>
        </div>
      )}
      {result && (
        <div className="proposal idea-proposal">
          <div>
            <CheckCircle2 size={19} />
            <strong>{result.plan.title}</strong>
          </div>
          <p>{result.plan.summary}</p>
          <small className="planner-provider">
            {result.provider} · {result.message}
          </small>
          {preview?.value && (
            <div className="idea-preview" aria-label="Proposed layout preview">
              <PreviewBoundary>
                <Scene
                  project={preview.value.project}
                  selected={null}
                  onSelect={noop}
                  onMove={noop}
                  selectedSectionId={null}
                  onSectionMove={noop}
                  mode="rotate"
                  snap={false}
                  explode={false}
                  xray={false}
                  stage={null}
                  view={previewView}
                  onCamera={noop}
                  fitToView
                />
              </PreviewBoundary>
            </div>
          )}
          {result.plan.assumptions.length > 0 && (
            <div className="planner-assumptions">
              <h3>Assumptions to review</h3>
              <ul>
                {result.plan.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {result.plan.questions.length > 0 && (
            <div className="planner-questions">
              <h3>Let's clarify</h3>
              <ul>
                {result.plan.questions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <p>
                Add these details to your description above, then explore again.
              </p>
            </div>
          )}
          {!!result.plan.placementChanges?.length && (
            <div className="planner-assumptions">
              <h3>Placement changes</h3>
              <ul>
                {result.plan.placementChanges.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          )}
          {!!result.plan.pendingPlacement?.length && (
            <div className="planner-questions">
              <h3>Requests to resolve before applying</h3>
              {result.plan.pendingPlacement.map(({ request, question }, i) => {
                const note = `Deferred request: ${request}`;
                return (
                  <div className="field-section" key={request}>
                    <strong>{request}</strong>
                    <p>{question}</p>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={
                        note.length > 400 ||
                        result.plan.assumptions.length >= 12
                      }
                      onClick={() => {
                        const plan = {
                          ...result.plan,
                          pendingPlacement:
                            result.plan.pendingPlacement!.filter(
                              (_, index) => index !== i,
                            ),
                          assumptions: [...result.plan.assumptions, note],
                        };
                        previousPlan.current = plan;
                        setResult({ ...result, plan });
                      }}
                    >
                      Set aside for later
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {result.plan.structures.map((structure, i) => (
            <div className="planner-module" key={`structure-${i}`}>
              <h3>
                {structure.kind === "casework-shelves"
                  ? "Panel bookcase"
                  : structure.kind.replace("-", " ")}
              </h3>
              <p>
                {structure.kind === "casework-shelves"
                  ? `Panel thickness: ${formatPreciseInches(Math.min(...material(structure.selections.caseworkPanels?.materialId ?? "plywood").size))} from the modeled stock. Size and shelf-count controls update the assembled casework. Supports, joints and anchors still need design.`
                  : "Actual parts and profile cuts. Review material choices in Explore whole builds, and resolve the missing-component notes before construction."}
              </p>
              <div className="planner-module-grid">
                {Object.entries(structure.parameters)
                  .filter(
                    ([key, value]) =>
                      typeof value === "number" &&
                      !["yaw", "doorSwing", "shelfCount"].includes(key),
                  )
                  .map(([field, value]) => (
                    <LengthInput
                      key={field}
                      label={
                        structure.kind === "casework-shelves" &&
                        field === "shelfClearance"
                          ? "Shelf front setback"
                          : field.replace(/([A-Z])/g, " $1")
                      }
                      ariaLabel={`${structure.kind} ${field}`}
                      value={value as number}
                      max={240}
                      onChange={(value) =>
                        setResult((r) =>
                          r
                            ? {
                                ...r,
                                plan: {
                                  ...r.plan,
                                  structures: r.plan.structures.map((s, j) =>
                                    j === i
                                      ? updateStructureParameter(
                                          s,
                                          field,
                                          value,
                                        )
                                      : s,
                                  ),
                                },
                              }
                            : r,
                        )
                      }
                    />
                  ))}
                {Object.entries(structure.parameters)
                  .filter(
                    ([key, value]) =>
                      typeof value === "number" &&
                      ["doorSwing", "shelfCount"].includes(key),
                  )
                  .map(([field, value]) => (
                    <label className="field" key={field}>
                      {field === "shelfCount"
                        ? "Shelf count"
                        : "Door opening (degrees)"}
                      <input
                        type="number"
                        aria-label={`${structure.kind} ${field}`}
                        value={value as number}
                        min={field === "shelfCount" ? 1 : 0}
                        max={field === "shelfCount" ? 6 : 90}
                        step={1}
                        onChange={(event) =>
                          setResult((r) =>
                            r
                              ? {
                                  ...r,
                                  plan: {
                                    ...r.plan,
                                    structures: r.plan.structures.map((s, j) =>
                                      j === i
                                        ? updateStructureParameter(
                                            s,
                                            field,
                                            Number(event.target.value),
                                          )
                                        : s,
                                    ),
                                  },
                                }
                              : r,
                          )
                        }
                      />
                    </label>
                  ))}
              </div>
              {structure.kind === "greenhouse" && (
                <RoofVentFields value={structure.parameters.roofVent} onChange={(roofVent) =>
                  setResult((current) => current ? {
                    ...current,
                    plan: {
                      ...current.plan,
                      structures: current.plan.structures.map((item, index) => {
                        if (index !== i || item.kind !== "greenhouse") return item;
                        const parameters = { ...item.parameters };
                        if (roofVent) parameters.roofVent = roofVent;
                        else delete parameters.roofVent;
                        return { ...item, parameters };
                      }),
                    },
                  } : current)
                } />
              )}
              <PlacementFields
                name={structure.kind}
                position={structure.parameters.origin}
                yaw={structure.parameters.yaw}
                onPosition={(axis, value) =>
                  setResult((r) =>
                    r
                      ? {
                          ...r,
                          plan: {
                            ...r.plan,
                            structures: r.plan.structures.map((s, j) => {
                              if (j !== i) return s;
                              const next = structuredClone(s);
                              next.parameters.origin[axis] = value;
                              return next;
                            }),
                          },
                        }
                      : r,
                  )
                }
                onYaw={(value) =>
                  setResult((r) =>
                    r
                      ? {
                          ...r,
                          plan: {
                            ...r.plan,
                            structures: r.plan.structures.map((s, j) =>
                              j === i
                                ? updateStructureParameter(s, "yaw", value)
                                : s,
                            ),
                          },
                        }
                      : r,
                  )
                }
              />
            </div>
          ))}
          {seatingRun && seatingModules.length > 1 && (
            <div className="planner-run-control">
              <LengthInput
                label="Overall seating run width"
                ariaLabel="Overall seating run width"
                value={
                  seatingModules.reduce((sum, m) => sum + m.width, 0) +
                  seatingRun.gaps.reduce((a, b) => a + b, 0)
                }
                min={8 * seatingModules.length}
                max={240}
                onChange={(value) => {
                  if (Number.isFinite(value))
                    setResult((r) =>
                      r
                        ? {
                            ...r,
                            plan: editFurniturePlan(
                              r.plan,
                              `Make overall bench width ${value} inches`,
                            ),
                          }
                        : r,
                    );
                }}
              />
              <p>
                Changes the full run around its existing center. Individual
                widths below change only that compartment; adjacent seats
                reflow.
              </p>
            </div>
          )}
          {result.plan.modules.map((module, i) => (
            <div className="planner-module" key={i}>
              <h3>{module.name}</h3>
              <p>
                {module.kind} · {module.frameMaterial} + {module.panelMaterial}
              </p>
              <div className="planner-module-grid">
                {(["width", "depth", "height"] as const).map((field) => (
                  <LengthInput
                    key={field}
                    label={
                      field === "height" && module.kind === "bench"
                        ? "Seat height"
                        : field[0].toUpperCase() + field.slice(1)
                    }
                    ariaLabel={`${module.name} ${field}`}
                    value={module[field]}
                    max={240}
                    onChange={(value) => resizeModule(i, field, value)}
                  />
                ))}
              </div>
              <PlacementFields
                name={module.name}
                position={module.position}
                yaw={module.yaw}
                onPosition={(axis, value) =>
                  setResult((r) =>
                    r
                      ? {
                          ...r,
                          plan: {
                            ...r.plan,
                            modules: r.plan.modules.map((m, j) => {
                              if (j !== i) return m;
                              const next = structuredClone(m);
                              next.position[axis] = value;
                              return next;
                            }),
                          },
                        }
                      : r,
                  )
                }
                onYaw={(value) =>
                  setResult((r) =>
                    r
                      ? {
                          ...r,
                          plan: {
                            ...r.plan,
                            modules: r.plan.modules.map((m, j) =>
                              j === i ? { ...m, yaw: value } : m,
                            ),
                          },
                        }
                      : r,
                  )
                }
              />
              {module.kind === "bench" && (
                <div className="recipe-options">
                  {[
                    { field: "storage", label: "Closed storage below" },
                    { field: "openingLid", label: "Opening seat / lid" },
                  ].map(({ field, label }) => (
                    <label key={field}>
                      <input
                        type="checkbox"
                        checked={module[field as "storage" | "openingLid"]}
                        onChange={(e) =>
                          setResult((r) =>
                            r
                              ? {
                                  ...r,
                                  plan: {
                                    ...r.plan,
                                    modules: r.plan.modules.map((m, j) =>
                                      i === j
                                        ? {
                                            ...m,
                                            [field]: e.target.checked,
                                            ...(field === "openingLid" &&
                                            e.target.checked
                                              ? { storage: true }
                                              : {}),
                                            ...((field === "storage" &&
                                              !e.target.checked) ||
                                            (field === "openingLid" &&
                                              !e.target.checked)
                                              ? {
                                                  lidOpen: false,
                                                  ...(field === "storage"
                                                    ? { openingLid: false }
                                                    : {}),
                                                }
                                              : {}),
                                          }
                                        : m,
                                    ),
                                  },
                                }
                              : r,
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={module.backHeight > 0}
                      onChange={(e) =>
                        setResult((r) =>
                          r
                            ? {
                                ...r,
                                plan: {
                                  ...r.plan,
                                  modules: r.plan.modules.map((m, j) =>
                                    i === j
                                      ? {
                                          ...m,
                                          backHeight: e.target.checked ? 16 : 0,
                                        }
                                      : m,
                                  ),
                                },
                              }
                            : r,
                        )
                      }
                    />
                    Include a back
                  </label>
                  {module.openingLid && (
                    <label>
                      <input
                        type="checkbox"
                        checked={module.lidOpen}
                        onChange={(e) =>
                          setResult((r) =>
                            r
                              ? {
                                  ...r,
                                  plan: {
                                    ...r.plan,
                                    modules: r.plan.modules.map((m, j) =>
                                      i === j
                                        ? { ...m, lidOpen: e.target.checked }
                                        : m,
                                    ),
                                  },
                                }
                              : r,
                          )
                        }
                      />
                      Preview lid open
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
          {result.plan.suggestions.length > 0 && (
            <div className="planner-suggestions">
              <h3>Things to consider</h3>
              <ul>
                {result.plan.suggestions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {preview?.error && (
            <div>
              <p className="form-error" role="alert">
                {preview.error}
              </p>
              {target && (
                <button
                  className="button secondary"
                  onClick={() => loadTarget(target)}
                >
                  Reload saved design
                </button>
              )}
            </div>
          )}
          {preview?.value && (
            <div className="proposal-impact">
              <p>
                {preview.value.addedParts} editable parts in{" "}
                {result.plan.modules.length + result.plan.structures.length}{" "}
                proposed module(s)/build(s).{" "}
                {target
                  ? "Only affected design parts are rebuilt; other work is retained."
                  : "Existing parts are retained."}
              </p>
              {preview.revision && (
                <>
                  <p>
                    Replace {preview.revision.impact.replacedParts} parts;
                    remove {preview.revision.impact.removedConnections}{" "}
                    connections. {preview.revision.impact.offcuts} cut parts
                    retained for reuse.
                  </p>
                  {preview.revision.impact.affectedFastenerPlans > 0 && (
                    <p>
                      {preview.revision.impact.affectedFastenerPlans} fastening
                      plan(s) are retained for review against the replaced
                      members. Former locations are excluded when their
                      references become stale.
                    </p>
                  )}
                  {preview.revision.impact.affectedHingePlans > 0 && (
                    <p>
                      {preview.revision.impact.affectedHingePlans} measured
                      hinge plan(s) keep their exact old references and history.
                      Review replacement members and remeasure before using
                      motion or drilling coordinates.
                    </p>
                  )}
                  {(preview.revision.impact.manualEdits > 0 ||
                    preview.revision.impact.missingRoles > 0) && (
                    <p>
                      {preview.revision.impact.manualEdits} changed or missing
                      parts and {preview.revision.impact.missingRoles} missing
                      section roles are affected by this rebuild.
                    </p>
                  )}
                  {preview.revision.requiresRebuild && (
                    <label className="rebuild-review">
                      <input
                        type="checkbox"
                        aria-label="Replace reviewed manual edits"
                        checked={rebuildReviewed}
                        onChange={(event) =>
                          setRebuildReviewed(event.target.checked)
                        }
                      />
                      Replace the reviewed manual edits and affected
                      connections. Existing offcuts stay available.
                    </label>
                  )}
                </>
              )}
              <p>
                Proposed bounds:{" "}
                {format(preview.value.max[0] - preview.value.min[0])} ×{" "}
                {format(preview.value.max[2] - preview.value.min[2])} footprint
                · {format(preview.value.max[1])} high.
              </p>
              {!preview.value.workZoneFits && (
                <p className="form-error" role="alert">
                  This layout extends outside your work zone. Adjust the
                  proposal or the available space before adding it.
                </p>
              )}
              {!!preview.revision?.clearanceConflicts.length && (
                <p className="form-error" role="alert">
                  This revision reduces the gap below the recorded minimum at{" "}
                  {preview.revision.clearanceConflicts
                    .map((plane) => plane.label)
                    .join(", ")}
                  . Adjust the design position or update the measured face under
                  Sections.
                </p>
              )}
              <PricingSummary coverage={preview.value.pricing} compact />
              {preview.value.findings.slice(0, 4).map((f) => (
                <p key={f.id}>
                  <AlertTriangle size={12} /> {f.title}
                </p>
              ))}
            </div>
          )}
          {(result.plan.modules.length > 0 ||
            result.plan.structures.length > 0) && (
            <button
              className="button primary full"
              disabled={
                !preview?.value ||
                !preview.value.workZoneFits ||
                !!preview.revision?.clearanceConflicts.length ||
                !!result.plan.pendingPlacement?.length ||
                (target &&
                  (!revisionChanged ||
                    (preview.revision?.requiresRebuild && !rebuildReviewed))) ||
                prompt !== exploredPrompt
              }
              onClick={() => {
                if (!preview?.value || !result) return;
                try {
                  onApply(
                    target && targetToken
                      ? applyIdeaRevision(
                          project,
                          target.bindingId,
                          result.plan,
                          targetToken,
                          {
                            entryIds: target.entryIds,
                            allowRebuild: rebuildReviewed,
                          },
                        )
                      : preview.value.project,
                  );
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "The design could not be applied.",
                  );
                }
              }}
            >
              <Plus size={16} />
              {target ? "Apply design changes" : "Add proposed layout"}
            </button>
          )}
        </div>
      )}
      <p className="small-note">
        Without an AI connection, this uses disclosed local planning presets.
        With Ollama configured, it can interpret broader ideas using the same
        editable module system. Parts, stock fit and work-zone checks are
        geometric; joinery and load capacity need design review. Build
        instructions are generated from the finished layout.
      </p>
      <button className="button ghost full" onClick={onClose}>
        Back to workspace
      </button>
    </div>
  );
}
