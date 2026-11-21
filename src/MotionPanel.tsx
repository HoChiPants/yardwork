import { clearGreenhouseLatch } from "./greenhouseLatch";
import { GreenhouseLatchPanel } from "./GreenhouseLatchPanel";
import { ventBackingSummary, type VentBackingReview } from "./greenhouseVentBacking";
import { GreenhouseVentEditor } from "./GreenhouseVentPanel";
import { SaunaDoorEditor } from "./SaunaDoorPanel";
import {
  saunaDoorChoices,
  saunaDoorPlanEntry,
  saunaDoorReview,
} from "./saunaDoors";
import { greenhouseVentChoices, greenhouseVentReview } from "./greenhouseVents";
import { useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { MotionPairClearanceFields } from "./MotionPairClearanceFields";
import { MeasuredHingePathFields } from "./MeasuredHingePathFields";
import { MotionSequenceTargetsFields } from "./MotionSequenceTargetsFields";
import {
  GreenhouseDoorDetails,
  GreenhouseDoorEditor,
} from "./GreenhouseDoorPanel";
import { addMissingDoorKits, greenhouseDoorChoices } from "./greenhouseDoors";
import {
  canParkMotion,
  motionDirections as directions,
  motionDistance,
  motionPairClearanceLine,
  motionPivotPreset,
  motionReviewDistance,
  motionReviewTravel,
  motionSetup,
  removeMotionTestScenario,
  runMotionTest,
  saveMotionPlan,
  saveMotionTestScenario,
  saveMotionTestSetup,
  type HeldMotion,
  type MotionPhase,
  type MotionPreview,
  type MotionReferenceFrame,
  type MotionReview,
  type MotionTestSelection,
} from "./mechanismMotion";
import type { Project, V3 } from "./model";
import {
  drawerSideLabels,
  motionTestNameLength,
  motionTestScenarioLimit,
  type DrawerSlideSetup,
  type HingePath,
  type MotionOpeningOrder,
  type MotionPlan,
  type MotionPlanInput,
  type MotionPairClearance,
  type MotionSequenceTargets,
  type MotionTestSetup,
} from "./motionPlanSchema";
import { accuride3732 } from "./drawerSlideReference";
import {
  addMissingDrawerSlides,
  drawerSlideDemand,
  reviewDrawerSlide,
} from "./drawerSlides";
import { ensurePartLabels } from "./partLabels";
import { rotate } from "./spatial";
import { useMotionPlayback } from "./useMotionPlayback";
import type { MotionCollisionFocus } from "./motionCamera";

const drawerSideKeys = Object.keys(drawerSideLabels) as Array<
  keyof typeof drawerSideLabels
>;
const hingeEdgeDirections = { left: 2, right: 3, back: 0, front: 1 };
const directionIndex = (axis: V3) =>
  directions.findIndex((row) =>
    row.axis.every((n, i) => Math.abs(n - axis[i]) < 1e-6),
  );

function MotionEditor({
  project,
  selectedIds,
  existing,
  labels,
  onSave,
  onCancel,
}: {
  project: Project;
  selectedIds: string[];
  existing?: MotionPlan;
  labels: Map<string, string>;
  onSave: (draft: MotionPlanInput) => void;
  onCancel: () => void;
}) {
  const active = project.pieces.filter((p) => !p.offcut);
  const [initial] = useState(() => {
    if (!existing) return null;
    try {
      return motionSetup(project, existing);
    } catch {
      return null;
    }
  });
  const [ids, setIds] = useState(() =>
    (existing?.memberIds ?? selectedIds)
      .filter((id) => active.some((p) => p.id === id))
      .slice(0, 32),
  );
  const [kind, setKind] = useState(existing?.mechanism.kind ?? "hinge");
  const initialDrawerSlide =
    existing?.mechanism.kind === "slide"
      ? existing.mechanism.drawerSlide
      : undefined;
  const [useDrawerSlide, setUseDrawerSlide] = useState(!!initialDrawerSlide);
  const [drawerSides, setDrawerSides] = useState(
    initialDrawerSlide ??
      ({
        productId: accuride3732.productId,
        cabinetLeft: "",
        drawerLeft: "",
        drawerRight: "",
        cabinetRight: "",
      } satisfies DrawerSlideSetup),
  );
  const [edge, setEdge] = useState<
    "left" | "right" | "back" | "front" | "exact"
  >(existing ? "exact" : "left");
  const [frame, setFrame] = useState<MotionReferenceFrame>(() => {
    if (!existing) return "moving-part";
    if (
      initial &&
      directionIndex(initial.mechanism.axis) < 0 &&
      directionIndex(existing.mechanism.axis) >= 0
    )
      return "moving-part";
    return "workspace";
  });
  const [axis, setAxis] = useState<number>(() => {
    if (!initial) return 2;
    return directionIndex(
      frame === "moving-part" && existing
        ? existing.mechanism.axis
        : initial.mechanism.axis,
    );
  });
  const [name, setName] = useState(existing?.label ?? "");
  const [travel, setTravel] = useState(existing?.mechanism.travel ?? 90);
  const [hingePath, setHingePath] = useState<HingePath | undefined>(
    initial?.mechanism.kind === "hinge" ? initial.mechanism.hingePath : undefined,
  );
  const [pivot, setPivot] = useState<V3>(() =>
    initial?.mechanism.kind === "hinge" ? initial.mechanism.pivot : [0, 0, 0],
  );
  const [error, setError] = useState("");
  const reference = active.find((p) => p.id === ids[0]);
  const partName = (id: string) =>
    `${labels.get(id) ?? "Part"} · ${active.find((p) => p.id === id)?.name ?? "Missing part"}`;
  function chooseKind(next: typeof kind) {
    setKind(next);
    setTravel(
      next === "hinge" ? 90 : useDrawerSlide ? accuride3732.travel : 18,
    );
    setAxis(
      next === "slide" ? 4 : edge === "exact" ? 2 : hingeEdgeDirections[edge],
    );
  }
  function chooseEdge(next: typeof edge) {
    if (next === "exact" && edge !== "exact" && ids.length)
      setPivot(motionPivotPreset(project, ids, edge, frame));
    if (next !== "exact") setAxis(hingeEdgeDirections[next]);
    setEdge(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const direction = directions[axis]?.axis;
      const worldAxis =
        direction && frame === "moving-part" && reference
          ? rotate(direction, reference.rotation)
          : direction ?? initial?.mechanism.axis;
      if (!worldAxis) throw Error("Choose the direction of movement.");
      onSave({
        label:
          name.trim() ||
          (kind === "hinge" ? "Hinged door or lid" : "Sliding drawer or panel"),
        memberIds: ids,
        mechanism:
          kind === "slide"
            ? {
                kind,
                axis: worldAxis,
                travel,
                ...(useDrawerSlide ? { drawerSlide: drawerSides } : {}),
              }
            : {
                kind,
                axis: worldAxis,
                travel,
                ...(hingePath && { hingePath }),
                pivot:
                  edge === "exact"
                    ? pivot
                    : motionPivotPreset(project, ids, edge, frame),
              },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the movement setup.");
    }
  }
  return (
    <form className="field-section" onSubmit={submit}>
      <label className="field">
        Motion name
        <input
          value={name}
          maxLength={100}
          placeholder={kind === "hinge" ? "Cabinet door" : "Top drawer"}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        Movement
        <select
          value={kind}
          onChange={(e) =>
            chooseKind(e.target.value === "slide" ? "slide" : "hinge")
          }
        >
          <option value="hinge">Swing · door or lid</option>
          <option value="slide">Slide · drawer or panel</option>
        </select>
      </label>
      <label className="field">
        Add moving part
        <select
          value=""
          disabled={ids.length >= 32}
          onChange={(e) => {
            if (e.target.value) setIds([...ids, e.target.value]);
          }}
        >
          <option value="">Choose a part…</option>
          {active
            .filter((p) => !ids.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {labels.get(p.id)} · {p.name}
              </option>
            ))}
        </select>
      </label>
      <ul className="motion-findings">
        {ids.map((id, index) => (
          <li key={id}>
            {partName(id)}{" "}
            {frame === "moving-part" && index > 0 && (
              <button
                type="button"
                className="text-button"
                aria-label={`Use ${partName(id)} as motion reference`}
                onClick={() =>
                  setIds([id, ...ids.filter((partId) => partId !== id)])
                }
              >
                Use as reference
              </button>
            )}
            <button
              type="button"
              className="text-button"
              aria-label={`Remove ${partName(id)} from motion`}
              onClick={() => setIds(ids.filter((partId) => partId !== id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label className="field">
        Reference frame
        <select
          value={frame}
          onChange={(e) =>
            setFrame(e.target.value === "moving-part" ? "moving-part" : "workspace")
          }
        >
          <option value="moving-part">Moving part axes</option>
          <option value="workspace">Workspace axes</option>
        </select>
      </label>
      {frame === "moving-part" && reference && (
        <p className="small-note">Uses the axes of {partName(reference.id)}.</p>
      )}
      {kind === "hinge" && (
        <label className="field">
          Hinge position
          <select
            value={edge}
            onChange={(e) => chooseEdge(e.target.value as typeof edge)}
          >
            <option value="left">Left edge</option>
            <option value="right">Right edge</option>
            <option value="back">Back edge · lid</option>
            <option value="front">Front edge · lid</option>
            <option value="exact">Exact position</option>
          </select>
        </label>
      )}
      {kind === "hinge" && edge === "exact" && (
        <>
          <p className="small-note">Enter the exact pivot on the workspace grid.</p>
          <div className="three-col">
            {(["X", "Y", "Z"] as const).map((letter, index) => (
              <label key={letter} className="field">
                Pivot {letter} (in)
                <input
                  type="number"
                  step="any"
                  required
                  value={Number.isFinite(pivot[index]) ? pivot[index] : ""}
                  onChange={(e) => {
                    const next = [...pivot] as V3;
                    next[index] = e.target.valueAsNumber;
                    setPivot(next);
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}
      <label className="field">
        {kind === "hinge"
          ? "Hinge axis and swing direction"
          : "Slide direction"}
        <select value={axis} onChange={(e) => setAxis(Number(e.target.value))}>
          {axis === -1 && <option value={-1}>Keep current direction</option>}
          {directions.map((row, index) => (
            <option key={row.label} value={index}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      {kind === "slide" && (
        <>
          <label className="field">
            Slide hardware
            <select
              value={useDrawerSlide ? accuride3732.productId : ""}
              onChange={(e) => {
                const selected = !!e.target.value;
                setUseDrawerSlide(selected);
                if (selected) setTravel(accuride3732.travel);
              }}
            >
              <option value="">Custom slide travel</option>
              <option value={accuride3732.productId}>
                {accuride3732.name}
              </option>
            </select>
          </label>
          {useDrawerSlide && (
            <fieldset className="field-section">
              <legend>Mounting panels</legend>
              <p className="small-note">
                Pick left and right as you face the closed drawer from the
                opening.
              </p>
              {drawerSideKeys.map((key) => {
                const moving = key.startsWith("drawer");
                const options = active.filter(
                  (p) => ids.includes(p.id) === moving,
                );
                return (
                  <label key={key} className="field">
                    {drawerSideLabels[key]}
                    <select
                      value={drawerSides[key]}
                      required
                      onChange={(e) =>
                        setDrawerSides({
                          ...drawerSides,
                          [key]: e.target.value,
                        })
                      }
                    >
                      <option value="">Choose a panel…</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {partName(p.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </fieldset>
          )}
        </>
      )}
      {kind === "hinge" ? (
        <label className="field">
          Maximum opening (degrees)
          <input
            type="number"
            step="any"
            min="0.01"
            max="180"
            required
            value={Number.isFinite(travel) ? travel : ""}
            onChange={(e) => setTravel(e.target.valueAsNumber)}
          />
        </label>
      ) : (
        <LengthInput
          label="Maximum extension"
          value={travel}
          onChange={setTravel}
          max={useDrawerSlide ? accuride3732.travel : 240}
        />
      )}
      {kind === "hinge" && (
        <MeasuredHingePathFields travel={travel} hingePath={hingePath} setHingePath={setHingePath} />
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={
          !ids.length ||
          !Number.isFinite(travel) ||
          (kind === "slide" &&
            useDrawerSlide &&
            drawerSideKeys.some(
              (key) =>
                !active.some(
                  (p) =>
                    p.id === drawerSides[key] &&
                    ids.includes(p.id) === key.startsWith("drawer"),
                ),
            ))
        }
      >
        Save and test motion
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel setup
      </button>
    </form>
  );
}

function heldMotions(
  project: Project,
  active: MotionPlan,
  positions: Map<string, number>,
) {
  const held: HeldMotion[] = [];
  for (const [id, percent] of positions) {
    const other = project.motionPlans?.find((plan) => plan.id === id);
    if (
      !other ||
      !canParkMotion(
        project,
        active,
        other,
        held.map(({ plan }) => plan),
      )
    )
      continue;
    held.push({
      plan: other,
      travel: (other.mechanism.travel * percent) / 100,
    });
  }
  return held;
}

function testSetupFrom(linkedId: string, positions: ReadonlyMap<string, number>, openingOrder?: MotionOpeningOrder, clearance?: MotionPairClearance, sequenceTargets?: MotionSequenceTargets): MotionTestSetup | undefined {
  if (!linkedId && !positions.size && !clearance) return undefined;
  return {
    ...(linkedId && { linkedId }),
    ...(linkedId && openingOrder && { openingOrder }),
    ...(clearance && { clearance }),
    ...(linkedId && openingOrder && sequenceTargets && { sequenceTargets }),
    held: [...positions].map(([motionId, percent]) => ({ motionId, percent })),
  };
}

function heldPositionsFrom(setup?: MotionTestSetup) {
  return new Map(setup?.held.map(({ motionId, percent }) => [motionId, percent]));
}

export function MotionPanel({
  project,
  ventBacking,
  onShowSashGaps,
  shownLatchId,
  onShowLatch,
  selectedIds,
  preview,
  initialTest,
  onPreview,
  onChange,
}: {
  project: Project;
  selectedIds: string[];
  preview: MotionPreview | null;
  initialTest?: MotionTestSelection;
  onPreview: (preview: MotionPreview | null, source?: Project) => void;
  ventBacking: readonly VentBackingReview[];
  onShowSashGaps: (entryId: string) => void;
  shownLatchId: string | null;
  onShowLatch: (id: string | null) => void;
  onChange: (project: Project) => Project;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState(initialTest?.plan.id ?? "");
  const [scenarioId, setScenarioId] = useState(initialTest?.scenarioId ?? "");
  const [scenarioName, setScenarioName] = useState(() =>
    initialTest?.plan.testScenarios?.find(({ id }) => id === initialTest.scenarioId)?.name ?? "",
  );
  const [setupDraft, setSetupDraft] = useState<{
    motionId: string;
    linkedId: string;
    openingOrder?: MotionOpeningOrder;
    clearance?: MotionPairClearance;
    sequenceTargets?: MotionSequenceTargets;
    positions: Map<string, number>;
  } | null>(() =>
    initialTest ? {
      motionId: initialTest.plan.id,
      linkedId: initialTest.setup?.linkedId ?? "",
      openingOrder: initialTest.setup?.openingOrder,
      clearance: initialTest.setup?.clearance,
      sequenceTargets: initialTest.setup?.sequenceTargets,
      positions: heldPositionsFrom(initialTest.setup),
    } : null,
  );
  const [error, setError] = useState(initialTest?.result.error ?? "");
  const { cancel, play: animate } = useMotionPlayback(project, !!preview);
  const labels = useMemo(
    () =>
      new Map(
        ensurePartLabels(project).partLabels.map((row) => [
          row.partId,
          row.label,
        ]),
      ),
    [project],
  );
  const plans = project.motionPlans ?? [];
  const selected = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
  const scenarios = selected?.testScenarios ?? [];
  const selectedScenario = scenarios.find(({ id }) => id === scenarioId);
  const savedSetup = selectedScenario?.setup ?? selected?.testSetup;
  const savedPositions = useMemo(() => heldPositionsFrom(savedSetup), [savedSetup]);
  const draft = setupDraft?.motionId === selected?.id ? setupDraft : null;
  const heldPositions = draft?.positions ?? savedPositions;
  const linkedId = draft ? draft.linkedId : savedSetup?.linkedId ?? "";
  const openingOrder = draft ? draft.openingOrder : savedSetup?.openingOrder;
  const clearance = draft ? draft.clearance : savedSetup?.clearance;
  const sequenceTargets = draft ? draft.sequenceTargets : savedSetup?.sequenceTargets;
  const testSetup = testSetupFrom(linkedId, heldPositions, openingOrder, clearance, sequenceTargets);
  const sameSetup = JSON.stringify(testSetup) === JSON.stringify(
    testSetupFrom(savedSetup?.linkedId ?? "", savedPositions, savedSetup?.openingOrder, savedSetup?.clearance, savedSetup?.sequenceTargets),
  );
  const trimmedName = scenarioName.trim();
  const nameMatch = scenarios.find(({ name }) => name.toLowerCase() === trimmedName.toLowerCase());
  const atScenarioLimit = scenarios.length >= motionTestScenarioLimit;
  const namedTestUnchanged = sameSetup && trimmedName === selectedScenario?.name;
  const held = useMemo(
    () => (selected ? heldMotions(project, selected, heldPositions) : []),
    [project, selected, heldPositions],
  );
  const availableMotions = useMemo(() => {
    if (!selected) return [];
    const heldPlans = held.map(({ plan }) => plan);
    return (project.motionPlans ?? []).filter((plan) =>
      canParkMotion(project, selected, plan, heldPlans),
    );
  }, [project, selected, held]);
  const linked = availableMotions.find((plan) => plan.id === linkedId);
  const otherMotions = availableMotions.filter(
    (plan) =>
      plan.id !== linked?.id &&
      (!linked || canParkMotion(project, linked, plan)),
  );
  const [activeReview, setActiveReview] = useState<{
    project: Project;
    value: MotionReview;
    setup?: MotionTestSetup;
  } | null>(() => initialTest?.result.review
    ? { project, value: initialTest.result.review, setup: initialTest.setup }
    : null,
  );
  const review =
    activeReview?.project === project &&
    activeReview.value.plan.id === selected?.id
      ? activeReview.value
      : null;

  function test(
    plan: MotionPlan,
    source = project,
    position = 0,
    setup: MotionTestSetup | null | undefined = testSetup,
  ) {
    cancel();
    const { review: value, error } = runMotionTest(source, plan, setup ?? undefined);
    setError(error ?? "");
    if (value) {
      setActiveReview({ project: source, value, setup: setup ?? undefined });
      onPreview(value.preview(position), source);
    } else {
      setActiveReview(null);
      onPreview(null);
    }
  }

  function loadTestSetup(plan: MotionPlan, setup?: MotionTestSetup, startClosed = false) {
    const positions = heldPositionsFrom(setup);
    const companion = setup?.linkedId ?? "";
    setSetupDraft({ motionId: plan.id, linkedId: companion, positions, openingOrder: setup?.openingOrder, clearance: setup?.clearance, sequenceTargets: setup?.sequenceTargets });
    const restart = startClosed || openingOrder !== setup?.openingOrder || (openingOrder && linkedId !== companion);
    test(plan, project, restart ? 0 : preview?.travel ?? 0, setup ?? null);
  }

  function selectScenario(id: string) {
    if (!selected) return;
    const chosen = scenarios.find((scenario) => scenario.id === id);
    setScenarioId(chosen?.id ?? "");
    setScenarioName(chosen?.name ?? "");
    loadTestSetup(selected, chosen?.setup ?? selected.testSetup, true);
  }

  function saveNamedTest() {
    if (!selected || !testSetup || !review) return;
    try {
      const { project: next, scenario } = saveMotionTestScenario(project, selected.id, scenarioName, testSetup);
      const saved = onChange(next);
      const plan = saved.motionPlans!.find(({ id }) => id === selected.id)!;
      setScenarioId(scenario.id);
      setScenarioName(scenario.name);
      setSetupDraft(null);
      test(plan, saved, preview?.travel ?? 0, scenario.setup);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save the named clearance test.");
    }
  }

  function removeNamedTest() {
    if (!selected || !selectedScenario) return;
    const saved = onChange(removeMotionTestScenario(project, selected.id, selectedScenario.id));
    const plan = saved.motionPlans!.find(({ id }) => id === selected.id)!;
    setScenarioId("");
    setScenarioName("");
    setSetupDraft(null);
    test(plan, saved, 0, plan.testSetup ?? null);
  }

  function saveTestSetup(setup?: MotionTestSetup) {
    if (!selected) return;
    try {
      const saved = onChange(saveMotionTestSetup(project, selected.id, setup));
      const plan = saved.motionPlans!.find(({ id }) => id === selected.id)!;
      setError("");
      if (preview)
        test(plan, saved, preview.travel, setup ?? null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save this test setup.");
    }
  }

  function hold(id: string, percent?: number) {
    if (!selected) return;
    const next = new Map(heldPositions);
    if (percent === undefined) next.delete(id);
    else next.set(id, percent);
    setSetupDraft({ motionId: selected.id, linkedId, positions: next, openingOrder, clearance, sequenceTargets });
    if (preview) test(selected, project, preview.travel, testSetupFrom(linkedId, next, openingOrder, clearance, sequenceTargets) ?? null);
    else {
      setActiveReview(null);
      setError("");
    }
  }

  function show(value: number, siteFaceId?: string, phase?: MotionPhase, focusPair?: MotionCollisionFocus) {
    cancel();
    if (review) onPreview({
      ...review.preview(value, undefined, siteFaceId, phase),
      focusPair,
      focusTest: focusPair ? { planId: review.plan.id, setup: activeReview?.setup, scenarioId: selectedScenario?.id } : undefined,
    });
  }

  function link(id: string, order: MotionOpeningOrder | null | undefined = openingOrder) {
    if (!selected) return;
    const nextOrder = id ? order ?? undefined : undefined;
    const targets = id === linkedId && nextOrder ? sequenceTargets : undefined;
    setSetupDraft({ motionId: selected.id, linkedId: id, positions: heldPositions, openingOrder: nextOrder, clearance, sequenceTargets: targets });
    if (preview)
      test(selected, project, openingOrder || nextOrder ? 0 : preview.travel, testSetupFrom(id, heldPositions, nextOrder, clearance, targets) ?? null);
    else {
      setActiveReview(null);
      setError("");
    }
  }

  function play(opening: boolean) {
    if (!review || !preview) return;
    const end = motionReviewTravel(review);
    const from = preview.travel;
    const {
      travel: target,
      inspectAt,
      uncertain,
      siteFaceId,
      phase,
    } = review.playbackLimit(from, opening ? end : 0);
    animate(from, target, end, (value, stopped) =>
      onPreview({
        ...review.preview(
          value,
          stopped ? inspectAt : undefined,
          stopped ? siteFaceId : undefined,
          stopped ? phase : undefined,
        ),
        uncertainLimit: stopped && uncertain,
      }),
    );
  }

  const edit = (id: string | null) => {
    cancel();
    setEditing(id);
    setError("");
    onPreview(null);
  };
  const kind = selected?.mechanism.kind ?? "hinge";
  const distance = (value: number, phase?: MotionPhase) =>
    review ? motionReviewDistance(review, value, phase) : motionDistance(value, kind);
  const sliderLabel = review?.sequence ? "Sequence progress" : kind === "hinge" ? "Opening angle" : "Extension";
  const slideFit = useMemo(
    () => (selected ? reviewDrawerSlide(project, selected) : null),
    [project, selected],
  );
  const existing = plans.find((plan) => plan.id === editing);
  const greenhouseEditor =
    editing === "greenhouse-new" ||
    (existing?.mechanism.kind === "hinge" &&
      !!existing.mechanism.greenhouseDoor);

  const ventEditor =
    editing === "greenhouse-vent-new" ||
    (existing?.mechanism.kind === "hinge" &&
      !!existing.mechanism.greenhouseVent);
  const ventReview = selected ? greenhouseVentReview(project, selected) : null;
  const ventEntryId = selected?.mechanism.kind === "hinge" ? selected.mechanism.greenhouseVent?.entryId : undefined;
  const sashBacking = ventBacking.find(({ id }) => id === ventEntryId);
  const saunaEditor =
    editing === "sauna-door-new" || (existing && saunaDoorPlanEntry(existing));
  const saunaReview = selected ? saunaDoorReview(project, selected) : null;

  function saveDraft(draft: MotionPlanInput) {
    const setup =
      draft.mechanism.kind === "hinge"
        ? draft.mechanism.greenhouseDoor
        : undefined;
    const matchingDoor =
      setup &&
      plans.find(
        (plan) =>
          plan.mechanism.kind === "hinge" &&
          plan.mechanism.greenhouseDoor?.entryId === setup.entryId,
      );
    if (matchingDoor && existing?.id !== matchingDoor.id)
      throw Error(
        "That greenhouse already has a saved swing. Open its setup to edit it.",
      );
    const vent =
      draft.mechanism.kind === "hinge"
        ? draft.mechanism.greenhouseVent
        : undefined;
    if (
      vent &&
      plans.some(
        (plan) =>
          plan.id !== existing?.id &&
          plan.mechanism.kind === "hinge" &&
          plan.mechanism.greenhouseVent?.entryId === vent.entryId,
      )
    )
      throw Error(
        "That roof vent already has a saved swing. Open its setup to edit it.",
      );
    const saunaDoor =
      draft.mechanism.kind === "hinge" ? draft.mechanism.saunaDoor : undefined;
    if (
      saunaDoor &&
      plans.some(
        (plan) =>
          plan.id !== existing?.id &&
          saunaDoorPlanEntry(plan) === saunaDoor.entryId,
      )
    )
      throw Error(
        "That sauna door already has a saved swing. Open its setup to edit it.",
      );
    const { project: next, plan } = saveMotionPlan(
      project,
      draft,
      existing?.id,
    );
    const saved = onChange(next);
    setSelectedPlanId(plan.id);
    setScenarioId("");
    setScenarioName("");
    setSetupDraft(null);
    setEditing(null);
    test(plan, saved, 0, plan.testSetup ?? null);
  }

  const describe = (id: string) =>
    `${labels.get(id) ?? "Part"} · ${project.pieces.find((p) => p.id === id)?.name ?? "Missing part"}`;
  return (
    <section className="lid-motion-panel" aria-label="Motion and clearance">
      <h2>Motion &amp; clearance</h2>
      <p className="small-note">
        Use the closed position of a door, lid, drawer or panel. Pick every part
        that moves with it.
      </p>
      {plans.length > 0 && editing === null && (
        <label className="field">
          Saved motion
          <select
            value={selected?.id ?? ""}
            onChange={(e) => {
              setSelectedPlanId(e.target.value);
              setScenarioId("");
              setScenarioName("");
              onShowLatch(null);
              setSetupDraft(null);
              setActiveReview(null);
              edit(null);
            }}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {scenarios.length > 0 && editing === null && (
        <label className="field">
          Clearance test
          <select value={selectedScenario?.id ?? ""} onChange={(event) => selectScenario(event.target.value)}>
            <option value="">Working test setup</option>
            {scenarios.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      )}
      {availableMotions.length > 0 && editing === null && (
        <label className="field">
          Second motion
          <select
            value={linked?.id ?? ""}
            onChange={(e) => link(e.target.value)}
          >
            <option value="">No second motion</option>
            {availableMotions.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && linked && editing === null && (
        <label className="field">
          Opening order
          <select value={openingOrder ?? ""} onChange={(event) => {
            const value = event.target.value;
            link(linked.id, value === "selected-first" || value === "companion-first" ? value : null);
          }}>
            <option value="">Move together</option>
            <option value="selected-first">{selected.label} first, then {linked.label}</option>
            <option value="companion-first">{linked.label} first, then {selected.label}</option>
          </select>
          <span className="small-note">
            {openingOrder
              ? "The first motion completes before the second starts. Closing reverses the order."
              : "Both motions use the same percentage of their own travel."}
          </span>
        </label>
      )}
      {selected && linked && openingOrder && editing === null && (
        <MotionSequenceTargetsFields
          key={JSON.stringify(["travel targets", selected.id, linked.id, sequenceTargets])}
          selected={selected}
          companion={linked}
          current={sequenceTargets}
          onTest={(targets) => loadTestSetup(selected, testSetupFrom(linkedId, heldPositions, openingOrder, clearance, targets), true)}
        />
      )}
      {(otherMotions.length > 0 || held.length > 0) && editing === null && (
        <details className="field-section" open={savedSetup?.held.length ? true : undefined}>
          <summary>
            Hold other parts open{held.length ? ` (${held.length})` : ""}
          </summary>
          <p className="small-note">
            Set the positions of nearby doors, drawers or lids for this test.
          </p>
          {held.map(({ plan, travel }) => (
            <div className="motion-held-row" key={plan.id}>
              <label className="field">
                {plan.label} · {motionDistance(travel, plan.mechanism.kind)}
                <input
                  type="range"
                  aria-label={`${plan.label} held position`}
                  aria-valuetext={motionDistance(travel, plan.mechanism.kind)}
                  min={0}
                  max={100}
                  value={heldPositions.get(plan.id) ?? 100}
                  onChange={(e) => hold(plan.id, e.target.valueAsNumber)}
                />
              </label>
              <button
                type="button"
                className="text-button"
                aria-label={`Release ${plan.label}`}
                onClick={() => hold(plan.id)}
              >
                Release
              </button>
            </div>
          ))}
          {otherMotions.length > 0 && (
            <label className="field">
              Add a motion to hold
              <select
                value=""
                onChange={(e) => e.target.value && hold(e.target.value, 100)}
              >
                <option value="">Choose a motion…</option>
                {otherMotions.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </details>
      )}
      {selected && editing === null && (
        <MotionPairClearanceFields
          key={JSON.stringify(["minimum gap", selected.id, linked?.id, clearance])}
          pieces={project.pieces}
          movingIds={[...selected.memberIds, ...linked?.memberIds ?? []]}
          labels={labels}
          current={clearance}
          onTest={(next) => loadTestSetup(selected, testSetupFrom(linkedId, heldPositions, openingOrder, next, sequenceTargets))}
        />
      )}
      {selected && editing === null && (testSetup || savedSetup) && (
        <section className="field-section motion-test-setup" aria-label="Motion test setup">
          {savedSetup && <p className="small-note">{sameSetup ? selectedScenario ? "Named test setup saved" : "Saved test setup" : testSetup ? "Test setup changed" : "Testing motion alone"}</p>}
          <div className="motion-actions">
            {!selectedScenario && testSetup && !sameSetup && (
              <button type="button" className="button secondary small" disabled={!review}
                onClick={() => saveTestSetup(testSetup)}>Save test setup</button>
            )}
            {testSetup && (
              <button type="button" className="text-button"
                onClick={() => loadTestSetup(selected)}>Test motion alone</button>
            )}
            {savedSetup && !sameSetup && (
              <button type="button" className="text-button"
                onClick={() => loadTestSetup(selected, savedSetup)}>Restore saved setup</button>
            )}
            {!selectedScenario && savedSetup && !testSetup && (
              <button type="button" className="text-button"
                onClick={() => saveTestSetup()}>Remove saved test setup</button>
            )}
          </div>
        </section>
      )}
      {selected && editing === null && (testSetup || selectedScenario) && (
        <details className="field-section" open={selectedScenario ? true : undefined}>
          <summary>{selectedScenario ? "Manage named test" : "Keep this test under a name"}</summary>
          <label className="field">
            Clearance test name
            <input type="text" value={scenarioName} maxLength={motionTestNameLength}
              onChange={(event) => setScenarioName(event.target.value)} />
          </label>
          <div className="motion-actions">
            <button type="button" className="button secondary small"
              disabled={!review || !testSetup || !trimmedName || (!nameMatch && atScenarioLimit) || namedTestUnchanged}
              onClick={saveNamedTest}>{nameMatch ? "Update named test" : "Save named test"}</button>
            {selectedScenario && (
              <button type="button" className="text-button" onClick={removeNamedTest}>Remove named test</button>
            )}
          </div>
          {atScenarioLimit && <p className="small-note">{motionTestScenarioLimit} named tests saved. Remove one to add another.</p>}
        </details>
      )}
      {saunaEditor ? (
        <SaunaDoorEditor
          project={project}
          existing={existing}
          onSave={saveDraft}
          onCancel={() => edit(null)}
        />
      ) : ventEditor ? (
        <GreenhouseVentEditor
          project={project}
          existing={existing}
          onSave={saveDraft}
          onCancel={() => edit(null)}
        />
      ) : greenhouseEditor ? (
        <GreenhouseDoorEditor
          project={project}
          existing={existing}
          onSave={saveDraft}
          onCancel={() => edit(null)}
        />
      ) : editing !== null ? (
        <MotionEditor
          project={project}
          selectedIds={selectedIds}
          existing={existing}
          labels={labels}
          onCancel={() => edit(null)}
          onSave={saveDraft}
        />
      ) : (
        <div className="motion-actions">
          <button
            type="button"
            className="button secondary"
            disabled={!project.pieces.some((p) => !p.offcut)}
            onClick={() => edit("new")}
          >
            New motion
          </button>
          {greenhouseDoorChoices(project).some(
            ({ entry }) =>
              !plans.some(
                (plan) =>
                  plan.mechanism.kind === "hinge" &&
                  plan.mechanism.greenhouseDoor?.entryId === entry.id,
              ),
          ) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => edit("greenhouse-new")}
            >
              Set up greenhouse door
            </button>
          )}
          {greenhouseVentChoices(project).some(
            ({ entry }) =>
              !plans.some(
                (plan) =>
                  plan.mechanism.kind === "hinge" &&
                  plan.mechanism.greenhouseVent?.entryId === entry.id,
              ),
          ) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => edit("greenhouse-vent-new")}
            >
              Set up greenhouse roof vent
            </button>
          )}
          {saunaDoorChoices(project).some(
            ({ entry }) =>
              !plans.some((plan) => saunaDoorPlanEntry(plan) === entry.id),
          ) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => edit("sauna-door-new")}
            >
              Set up sauna door
            </button>
          )}
          {selected && !preview && (
            <button
              className="button primary"
              type="button"
              onClick={() => test(selected)}
            >
              Test motion
            </button>
          )}
          {selected && (
            <button
              className="text-button"
              type="button"
              onClick={() => edit(selected.id)}
            >
              Edit setup
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {review && preview && editing === null && (
        <div className="field-section">
          <label className="field">
            {sliderLabel} ·{" "}
            <output>{preview.positionText ?? distance(preview.travel)}</output>
            {review.linked && (
              <span className="small-note">
                {review.linked.label} ·{" "}
                {motionDistance(
                  (review.linked.mechanism.travel * preview.travel) /
                    review.plan.mechanism.travel,
                  review.linked.mechanism.kind,
                )}
              </span>
            )}
            <input
              aria-label={sliderLabel}
              aria-valuetext={preview.positionText ?? distance(preview.travel)}
              type="range"
              min={0}
              max={motionReviewTravel(review)}
              step={review.sequence || kind === "hinge" ? 0.25 : 0.01}
              value={preview.travel}
              onChange={(e) => show(e.target.valueAsNumber)}
            />
          </label>
          <div className="motion-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => play(true)}
            >
              Play opening
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => play(false)}
            >
              Play closing
            </button>
          </div>
          <div className="motion-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => show(0)}
            >
              Inspect fully closed
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => show(motionReviewTravel(review))}
            >
              {review.sequence?.some(({ plan, travel }) => travel < plan.mechanism.travel) ? "Inspect test endpoint" : "Inspect fully open"}
            </button>
            {review.sequence && (
              <button type="button" className="text-button"
                onClick={() => show(motionReviewTravel(review) / 2, undefined, 0)}>
                Inspect after {review.sequence[0].plan.label} opens
              </button>
            )}
          </div>
          {review.clearance && (
            <section aria-label="Minimum gap result" className="field-section">
              <p className="small-note" role="status">{motionPairClearanceLine(project, review)}</p>
              {review.clearance.result.status === "short" && (() => {
                const { requirement, result, phase } = review.clearance;
                return (
                  <button type="button" className="text-button"
                    onClick={() => show(result.at, undefined, phase, [requirement.movingId, requirement.otherId])}>
                    Inspect the gap
                  </button>
                );
              })()}
            </section>
          )}
          {!review.hits.length &&
            !review.zone.length &&
            !review.siteFindings.length &&
            !review.unresolvedIds.length && (
              <p className="small-note">
                No modeled interference found along this travel.
              </p>
            )}
          {(review.hits.length > 0 ||
            review.zone.length > 0 ||
            review.siteFindings.length > 0) && (
            <ul className="motion-findings">
              {review.hits.map((hit) => (
                <li key={`${hit.movingId}/${hit.obstacleId}/${hit.phase ?? ""}`}>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => show(hit.inspectAt, undefined, hit.phase)}
                  >
                    {hit.kind === "solid"
                      ? "Collision"
                      : hit.kind === "envelope"
                        ? "Possible collision · part envelope"
                        : "Clearance needs review"}{" "}
                    near {distance(hit.first, hit.phase)}
                  </button>
                  {hit.kind !== "uncertain" &&
                    distance(hit.closingAt, hit.phase) !== distance(hit.inspectAt, hit.phase) && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => show(hit.closingAt, undefined, hit.phase)}
                      >
                        Inspect closing near {distance(hit.closingAt, hit.phase)}
                      </button>
                    )}
                  <p className="small-note">
                    {describe(hit.movingId)} against {describe(hit.obstacleId)}
                  </p>
                  <button type="button" className="text-button"
                    aria-label={`Focus these parts for ${describe(hit.movingId)} against ${describe(hit.obstacleId)}`}
                    onClick={() => show(
                      preview.travel === hit.closingAt ? hit.closingAt : hit.inspectAt,
                      undefined, hit.phase, [hit.movingId, hit.obstacleId],
                    )}>
                    Focus these parts
                  </button>
                </li>
              ))}
              {review.zone.map((hit) => (
                <li key={`${hit.movingId}/${hit.label}/${hit.phase ?? ""}`}>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => show(hit.inspectAt, undefined, hit.phase)}
                  >
                    Inspect {hit.label} work-zone limit
                  </button>
                  <p className="small-note">{describe(hit.movingId)}</p>
                </li>
              ))}
              {review.siteFindings.map(
                ({ movingId, plane, status, inspectAt, phase }) => (
                  <li key={`${movingId}/${plane.id}/${phase ?? ""}`}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        show(inspectAt ?? (phase === undefined ? preview.travel : phase * motionReviewTravel(review) / 2), plane.id, phase)
                      }
                    >
                      {status === "short"
                        ? "Inspect measured clearance"
                        : "Review close pass"}{" "}
                      · {plane.label}
                    </button>
                    <p className="small-note">{describe(movingId)}</p>
                  </li>
                ),
              )}
            </ul>
          )}
          {review.unresolvedIds.length > 0 && (
            <p className="small-note">
              Clearance could not be checked for{" "}
              {review.unresolvedIds.map(describe).join(", ")}.
            </p>
          )}
          <p className="small-note">
            The blue line shows the{" "}
            {kind === "hinge" ? "hinge axis" : "slide path"}. Playback stops at
            modeled obstructions. Use the slider to inspect either side. Verify
            actual hardware movement, mounting and loads.
          </p>
        </div>
      )}
      {ventReview && editing === null && (
        <section
          className="field-section"
          aria-label="Greenhouse roof vent review"
        >
          <h3>Greenhouse roof vent</h3>
          {ventReview.warning && (
            <p className="form-error">{ventReview.warning}</p>
          )}
          {ventReview.lines.map((line) => (
            <p className="small-note" key={line}>
              {line}
            </p>
          ))}
          {sashBacking && (
            <>
              <p className="small-note">{ventBackingSummary(sashBacking)}</p>
              {sashBacking.edges.some(({ gaps }) => gaps.length > 0) && (
                <button type="button" className="button secondary small" onClick={() => onShowSashGaps(sashBacking.id)}>
                  Show sash backing gaps in 3D
                </button>
              )}
            </>
          )}
        </section>
      )}
      {saunaReview && editing === null && (
        <section className="field-section" aria-label="Sauna door review">
          <h3>Sauna door</h3>
          {saunaReview.warning && (
            <p className="form-error">{saunaReview.warning}</p>
          )}
          {saunaReview.lines.map((line) => (
            <p className="small-note" key={line}>
              {line}
            </p>
          ))}
        </section>
      )}
      {selected && editing === null && (
        <GreenhouseLatchPanel key={selected.id} project={project} plan={selected}
          shown={shownLatchId === selected.id}
          onShow={(id) => {
            cancel();
            onPreview(null);
            onShowLatch(id);
          }}
          onChange={(next) => {
            cancel();
            onPreview(null);
            onChange(next);
          }}
        />
      )}
      {selected && editing === null && (
        <GreenhouseDoorDetails
          project={project}
          plan={selected}
          onFitStops={(next) => {
            setError("");
            const saved = onChange(next);
            if (preview) test(selected, saved, 0);
          }}
          onAdd={(kit) => {
            setError("");
            try {
              const next = addMissingDoorKits(project, kit);
              if (next === project) return;
              const saved = onChange(next);
              if (preview) test(selected, saved, preview.travel);
            } catch (problem) {
              setError(
                problem instanceof Error
                  ? problem.message
                  : "Could not add door hardware.",
              );
            }
          }}
        />
      )}
      {slideFit && editing === null && (
        <DrawerSlideFit
          project={project}
          fit={slideFit}
          onAdd={() => {
            setError("");
            try {
              const next = addMissingDrawerSlides(project);
              if (next === project) return;
              const saved = onChange(next);
              if (selected && preview) test(selected, saved, preview.travel);
            } catch (problem) {
              setError(
                problem instanceof Error
                  ? problem.message
                  : "Could not add slide pairs.",
              );
            }
          }}
        />
      )}
      {selected && editing === selected.id && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onChange(clearGreenhouseLatch({
              ...project,
              motionPlans: plans.filter((row) => row.id !== selected.id),
            }, selected.id));
            onShowLatch(null);
            setScenarioId("");
            setScenarioName("");
            edit(null);
          }}
        >
          Remove motion
        </button>
      )}
    </section>
  );
}

function DrawerSlideFit({
  project,
  fit,
  onAdd,
}: {
  project: Project;
  fit: NonNullable<ReturnType<typeof reviewDrawerSlide>>;
  onAdd: () => void;
}) {
  const demand = drawerSlideDemand(project);
  return (
    <section className="field-section" aria-label="Drawer slide fit">
      <h3>Drawer slide fit</h3>
      <p className="small-note">
        {accuride3732.orderModel} ·{" "}
        {fit.ready
          ? "Modeled dimensions match the slide reference."
          : "Review the flagged dimensions."}
      </p>
      <ul className="motion-findings">
        {fit.rows.map((row) => (
          <li key={row.label}>
            <strong>
              {row.label}
              {!row.matches && " · Review"}
            </strong>
            <p className="small-note">{row.detail}</p>
          </li>
        ))}
      </ul>
      <p className="small-note">
        Compare the delivered slide and mounting instructions. These checks use
        flat, frameless cabinet sides and the modeled drawer box.
      </p>
      <p className="small-note">
        <a href={accuride3732.manual} target="_blank" rel="noreferrer">
          Accuride 3732 installation and travel
        </a>
      </p>
      <p className="small-note">
        {demand.needed} planned {demand.needed === 1 ? "pair" : "pairs"} ·{" "}
        {demand.selected} in shopping list
      </p>
      {demand.missing > 0 && (
        <button type="button" className="button secondary" onClick={onAdd}>
          Add missing slide {demand.missing === 1 ? "pair" : "pairs"} to list
        </button>
      )}
    </section>
  );
}
