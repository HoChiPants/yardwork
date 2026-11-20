import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import type { MaterialId, Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import { guidePlacementTargets } from "./guidePlacement";
import {
  fittedStockFaces,
  fittedStockMaterials,
  previewFittedStock,
  resolveFittedStockFace,
  type FittedFaceRef,
  type FittedStockFace,
  type FittedStockPreview,
  type FittedStockSpec,
} from "./fittedStock";

export type FittedFacePickTarget = {
  which: "first" | "second";
  pieceId: string;
};
export type PickedFittedFace = FittedFacePickTarget & {
  ref: FittedFaceRef;
  nonce: number;
};
export type FittedStockPanelProps = {
  project: Project;
  initialPair?: { firstId: string; secondId: string; nonce: number };
  onBack: () => void;
  onPreview: (preview: FittedStockPreview | null) => void;
  onApply: (preview: FittedStockPreview) => void;
  onPlanConnections?: (blockId: string, endpoints: [string, string]) => void;
  onRequestFacePick?: (target: FittedFacePickTarget) => void;
  pickedFace?: PickedFittedFace | null;
  pickingFace?: "first" | "second" | null;
  onCancelPick?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onFacesChange?: (faces: {
    first: FittedFaceRef | null;
    second: FittedFaceRef | null;
  }) => void;
  onInspectPreview?: () => void;
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Review the fitted-stock inputs.";
const measure = (value: number) => formatPreciseInches(value);
const vector = (point: V3) => point.map(measure).join(", ");

/** Text is kept independently of the canonical value, including an unfinished exponent. */
export function parseFittedNumber(
  text: string,
  scale = 1,
  nativeBadInput = false,
): { value: number | null; pending: boolean } {
  if (!text.trim()) return { value: null, pending: nativeBadInput };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()))
    return { value: null, pending: true };
  const value = Number(text) * scale;
  return {
    value: Number.isFinite(value) ? value : null,
    pending: !Number.isFinite(value) || nativeBadInput,
  };
}

export function FittedLengthInput({
  label,
  value,
  onChange,
  onPending,
  onEdit,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onPending: (pending: boolean) => void;
  onEdit: () => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1,
    [text, setText] = useState(value === null ? "" : String(value)),
    emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(emitted.current, value)) {
      emitted.current = value;
      setText(value === null ? "" : String(value / scale));
    }
  }, [value, scale]);
  return (
    <label className="field length-field">
      <span>{label}</span>
      <div className="length-entry">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          placeholder="Enter a value"
          maxLength={64}
          aria-invalid={
            parseFittedNumber(text, scale).pending ||
            (value !== null && (!Number.isFinite(value) || value < 0))
          }
          onChange={(event) => {
            onEdit();
            setText(event.target.value);
            const parsed = parseFittedNumber(event.target.value, scale);
            emitted.current = parsed.value;
            onPending(parsed.pending);
            onChange(parsed.value);
          }}
        />
        <select
          aria-label={`${label} units`}
          value={unit}
          onChange={(event) => {
            onEdit();
            const next = event.target.value as "in" | "ft";
            setText(
              value === null ? text : String(value / (next === "ft" ? 12 : 1)),
            );
            setUnit(next);
            onPending(parseFittedNumber(text).pending);
          }}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </div>
      {value !== null && value < 0 && (
        <small className="form-error">
          Enter zero or a positive end clearance.
        </small>
      )}
    </label>
  );
}

function DatumInput({
  value,
  onChange,
  onPending,
  onEdit,
}: {
  value: V3 | null;
  onChange: (value: V3 | null) => void;
  onPending: (pending: boolean) => void;
  onEdit: () => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1,
    [text, setText] = useState(value ? value.map(String) : ["", "", ""]),
    axes = useRef<(number | null)[]>(value ? [...value] : [null, null, null]),
    emitted = useRef(JSON.stringify(value)),
    serialized = JSON.stringify(value);
  useEffect(() => {
    if (serialized !== emitted.current) {
      emitted.current = serialized;
      axes.current = value ? [...value] : [null, null, null];
      setText(axes.current.map((n) => (n === null ? "" : String(n / scale))));
    }
  }, [serialized, scale]);
  const emit = (next: V3 | null) => {
    emitted.current = JSON.stringify(next);
    onChange(next);
  };
  return (
    <fieldset className="fitted-datum">
      <legend>First-face cross-section center</legend>
      <div className="fitted-coordinate-grid">
        {["X", "Y", "Z"].map((axis, index) => (
          <label className="field" key={axis}>
            {axis}
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Fitted datum ${axis}`}
              value={text[index]}
              maxLength={64}
              placeholder="Unknown"
              onChange={(event) => {
                onEdit();
                const parsed = parseFittedNumber(event.target.value, scale),
                  next = text.map((n, i) =>
                    i === index ? event.target.value : n,
                  );
                setText(next);
                axes.current[index] = parsed.value;
                const complete = axes.current.every((n) => n !== null),
                  any = next.some((n) => n.trim()) || parsed.pending;
                onPending(parsed.pending || (any && !complete));
                emit(
                  complete && !parsed.pending
                    ? ([...axes.current] as V3)
                    : null,
                );
              }}
            />
          </label>
        ))}
      </div>
      <label className="field">
        Datum units
        <select
          aria-label="Fitted datum units"
          value={unit}
          onChange={(event) => {
            onEdit();
            const next = event.target.value as "in" | "ft";
            setText(
              axes.current.map((n, i) =>
                n === null ? text[i] : String(n / (next === "ft" ? 12 : 1)),
              ),
            );
            setUnit(next);
          }}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </label>
      {text.some((n) => n.trim()) && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onEdit();
            axes.current = [null, null, null];
            setText(["", "", ""]);
            onPending(false);
            emit(null);
          }}
        >
          Clear datum
        </button>
      )}
    </fieldset>
  );
}

const faceKey = (face: FittedStockFace) =>
  JSON.stringify([
    face.ref.pieceId,
    face.normalLocal,
    face.normalLocal.reduce((sum, n, i) => sum + n * face.centerLocal[i], 0),
  ]);
const facesFor = (project: Project, id: string) => {
  if (!id) return [];
  try {
    return fittedStockFaces(project, id);
  } catch {
    return [];
  }
};
const resolveFace = (project: Project, ref: FittedFaceRef | null) => {
  if (!ref) return null;
  try {
    return resolveFittedStockFace(project, ref);
  } catch {
    return null;
  }
};

export function FittedStockPanel(props: FittedStockPanelProps) {
  const { project } = props,
    materials = useMemo(() => fittedStockMaterials(), []),
    members = useMemo(
      () =>
        project.pieces.filter(
          (piece) => !piece.offcut && facesFor(project, piece.id).length > 0,
        ),
      [project],
    ),
    [firstId, setFirstId] = useState(props.initialPair?.firstId ?? ""),
    [secondId, setSecondId] = useState(props.initialPair?.secondId ?? ""),
    [firstRef, setFirstRef] = useState<FittedFaceRef | null>(null),
    [secondRef, setSecondRef] = useState<FittedFaceRef | null>(null),
    [datum, setDatum] = useState<V3 | null>(null),
    [datumEpoch, setDatumEpoch] = useState(0),
    [materialId, setMaterialId] = useState<MaterialId | "">(""),
    [roll, setRoll] = useState("0"),
    [clearanceA, setClearanceA] = useState<number | null>(null),
    [clearanceB, setClearanceB] = useState<number | null>(null),
    [destination, setDestination] = useState(""),
    [stepId, setStepId] = useState(project.steps[0]?.id ?? ""),
    [stageChoice, setStageChoice] = useState(""),
    [name, setName] = useState("Fitted block"),
    [pending, setPending] = useState<Record<string, boolean>>({}),
    [preview, setPreview] = useState<FittedStockPreview | null>(null),
    [error, setError] = useState(""),
    [edited, setEdited] = useState(false),
    lastProject = useRef(project),
    lastPair = useRef(props.initialPair?.nonce),
    consumedPick = useRef(props.pickedFace?.nonce ?? 0),
    requestedPick = useRef<FittedFacePickTarget | null>(null),
    resultsRef = useRef<HTMLElement | null>(null),
    pendingResultsFocus = useRef<string | null>(null),
    stageTargets = useMemo(() => guidePlacementTargets(project), [project]),
    selectedStage = stageTargets.find(
      (target) =>
        JSON.stringify([target.ownerId, target.stageKey]) === stageChoice,
    ),
    firstFaces = useMemo(() => facesFor(project, firstId), [project, firstId]),
    secondFaces = useMemo(
      () => facesFor(project, secondId),
      [project, secondId],
    ),
    firstFace = useMemo(
      () => resolveFace(project, firstRef),
      [project, firstRef],
    ),
    secondFace = useMemo(
      () => resolveFace(project, secondRef),
      [project, secondRef],
    ),
    dirty = edited || preview !== null;

  const cancelPick = () => {
    requestedPick.current = null;
    consumedPick.current = Math.max(
      consumedPick.current,
      props.pickedFace?.nonce ?? 0,
    );
    props.onCancelPick?.();
  };
  const edit = () => {
    setEdited(true);
    setPreview(null);
    pendingResultsFocus.current = null;
    setError("");
    cancelPick();
  };
  useEffect(() => {
    props.onPreview(preview);
  }, [preview, props.onPreview]);
  useEffect(() => {
    if (!preview || pendingResultsFocus.current !== preview.blockId) return;
    // Wait for the parent to show its canvas preview/banner before locating the result.
    const frame = requestAnimationFrame(() => {
      if (pendingResultsFocus.current !== preview.blockId) return;
      pendingResultsFocus.current = null;
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [preview]);
  useEffect(() => {
    props.onDirtyChange?.(dirty);
  }, [dirty, props.onDirtyChange]);
  useEffect(() => {
    props.onFacesChange?.({
      first: firstFace ? firstRef : null,
      second: secondFace ? secondRef : null,
    });
  }, [firstFace, secondFace, firstRef, secondRef, props.onFacesChange]);
  useEffect(
    () => () => {
      props.onPreview(null);
      props.onFacesChange?.({ first: null, second: null });
      props.onCancelPick?.();
      props.onDirtyChange?.(false);
    },
    [],
  );
  useEffect(() => {
    if (lastProject.current === project) return;
    const changedProject = lastProject.current.id !== project.id;
    lastProject.current = project;
    pendingResultsFocus.current = null;
    setPreview(null);
    cancelPick();
    if (changedProject) {
      setFirstId("");
      setSecondId("");
      setFirstRef(null);
      setSecondRef(null);
      setDatum(null);
      setDatumEpoch((n) => n + 1);
      setMaterialId("");
      setClearanceA(null);
      setClearanceB(null);
      setRoll("0");
      setDestination("");
      setStepId(project.steps[0]?.id ?? "");
      setStageChoice("");
      setName("Fitted block");
      setPending({});
      setEdited(false);
      setError("");
    } else
      setError(
        "The project changed. Review the current faces and preview again.",
      );
  }, [project]);
  useEffect(() => {
    const pair = props.initialPair;
    if (!pair || pair.nonce === lastPair.current) return;
    lastPair.current = pair.nonce;
    if (dirty) {
      setError(
        "Finish or cancel this fitted-stock draft before choosing another pair.",
      );
      return;
    }
    setFirstId(pair.firstId);
    setSecondId(pair.secondId);
    setFirstRef(null);
    setSecondRef(null);
    setDatum(null);
    setDatumEpoch((n) => n + 1);
    setPreview(null);
    cancelPick();
  }, [props.initialPair]);
  useEffect(() => {
    const pick = props.pickedFace;
    if (!pick || pick.nonce <= consumedPick.current) return;
    consumedPick.current = pick.nonce;
    const expected = requestedPick.current;
    if (
      !expected ||
      expected.which !== pick.which ||
      expected.pieceId !== pick.pieceId ||
      pick.pieceId !== (pick.which === "first" ? firstId : secondId)
    )
      return;
    setEdited(true);
    setPreview(null);
    setError("");
    requestedPick.current = null;
    if (pick.which === "first") {
      setFirstRef(pick.ref);
      setDatum([...pick.ref.pointLocal]);
      setDatumEpoch((n) => n + 1);
      setPending((old) => ({ ...old, datum: false }));
    } else setSecondRef(pick.ref);
  }, [props.pickedFace, firstId, secondId]);

  const valuesReady =
    !!firstFace &&
    !!secondFace &&
    firstId !== secondId &&
    !!datum &&
    !!materialId &&
    destination !== "" &&
    !!stepId &&
    (!stageChoice || !!selectedStage) &&
    !!name.trim() &&
    Number.isFinite(parseFittedNumber(roll).value) &&
    parseFittedNumber(roll).value !== null &&
    !parseFittedNumber(roll).pending &&
    clearanceA !== null &&
    Number.isFinite(clearanceA) &&
    clearanceA >= 0 &&
    clearanceB !== null &&
    Number.isFinite(clearanceB) &&
    clearanceB >= 0 &&
    !Object.values(pending).some(Boolean);
  const spec = (): FittedStockSpec => {
    if (
      !valuesReady ||
      !firstRef ||
      !secondRef ||
      !datum ||
      !materialId ||
      clearanceA === null ||
      clearanceB === null
    )
      throw Error(
        "Choose both faces, a complete datum, stock, clearances and destination before previewing.",
      );
    return {
      first: firstRef,
      second: secondRef,
      datumLocal: datum,
      material: materialId,
      rollDegrees: Number(roll),
      clearanceA,
      clearanceB,
      sectionId: destination === "loose" ? null : destination,
      stepId,
      name: name.trim(),
      ...(selectedStage
        ? {
            guidePlacement: {
              ownerId: selectedStage.ownerId,
              stageKey: selectedStage.stageKey,
            },
          }
        : {}),
    };
  };
  const chooseMember = (which: "first" | "second", id: string) => {
    edit();
    if (which === "first") {
      setFirstId(id);
      setFirstRef(null);
      setDatum(null);
      setDatumEpoch((n) => n + 1);
      setPending((old) => ({ ...old, datum: false }));
    } else {
      setSecondId(id);
      setSecondRef(null);
    }
  };
  const chooseFace = (which: "first" | "second", key: string) => {
    edit();
    const face = (which === "first" ? firstFaces : secondFaces).find(
      (row) => faceKey(row) === key,
    );
    if (which === "first") {
      setFirstRef(face?.ref ?? null);
      setDatum(null);
      setDatumEpoch((n) => n + 1);
      setPending((old) => ({ ...old, datum: false }));
    } else setSecondRef(face?.ref ?? null);
  };
  const pickFace = (which: "first" | "second") => {
    edit();
    const target = { which, pieceId: which === "first" ? firstId : secondId };
    requestedPick.current = target;
    props.onRequestFacePick?.(target);
  };
  const cancel = () => {
    pendingResultsFocus.current = null;
    cancelPick();
    props.onDirtyChange?.(false);
    props.onPreview(null);
    props.onFacesChange?.({ first: null, second: null });
    setEdited(false);
    setPreview(null);
    props.onBack();
  };
  const add = () => {
    if (!preview) return;
    try {
      if (JSON.stringify(spec()) !== JSON.stringify(preview.spec))
        throw Error("The fit inputs changed. Preview again before adding.");
      cancelPick();
      props.onDirtyChange?.(false);
      props.onApply(preview);
    } catch (problem) {
      props.onDirtyChange?.(true);
      setError(errorText(problem));
    }
  };
  return (
    <section
      className="fitted-stock-panel"
      aria-label="Fit stock between faces"
    >
      <button type="button" className="text-button" onClick={cancel}>
        <ArrowLeft size={14} /> Cancel and go back
      </button>
      <h2>Fit stock between faces</h2>
      <p className="small-note">
        Choose two opposed faces and a stock center datum. Preview a real
        square-ended block before adding it.
      </p>
      {(["first", "second"] as const).map((which) => {
        const id = which === "first" ? firstId : secondId,
          selectedFace = which === "first" ? firstFace : secondFace,
          faces = which === "first" ? firstFaces : secondFaces;
        return (
          <div className="fitted-face-choice field-section" key={which}>
            <h3>
              {which === "first"
                ? "1 · First member and face"
                : "2 · Second member and face"}
            </h3>
            <label className="field">
              Actual member
              <select
                aria-label={`Fitted ${which} member`}
                value={id}
                onChange={(event) => chooseMember(which, event.target.value)}
              >
                <option value="">Choose actual wood member</option>
                {members.map((piece) => (
                  <option key={piece.id} value={piece.id}>
                    {partLabel(project, piece.id)} · {piece.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Retained face
              <select
                aria-label={`Fitted ${which} face`}
                value={selectedFace ? faceKey(selectedFace) : ""}
                disabled={!id}
                onChange={(event) => chooseFace(which, event.target.value)}
              >
                <option value="">Choose a retained face</option>
                {faces.map((face) => (
                  <option value={faceKey(face)} key={faceKey(face)}>
                    {face.label}
                  </option>
                ))}
              </select>
            </label>
            {props.onRequestFacePick && (
              <button
                type="button"
                className="button secondary small"
                disabled={!id}
                onClick={() => pickFace(which)}
              >
                {props.pickingFace === which
                  ? "Click the actual face · Escape cancels"
                  : which === "first"
                    ? "Pick first face and datum in 3D"
                    : "Pick second face in 3D"}
              </button>
            )}
            {which === "second" && firstId && firstId === secondId && (
              <p className="form-error">Choose a different second member.</p>
            )}
          </div>
        );
      })}
      <div className="field-section">
        <h3>3 · First-face datum</h3>
        <p className="small-note">
          Local coordinates start at{" "}
          {firstId ? partLabel(project, firstId) : "the first member"}'s blank
          center. This point is the new stock's cross-section center, not a
          fastening hole.
        </p>
        <button
          type="button"
          className="button secondary small"
          disabled={!firstFace}
          onClick={() => {
            edit();
            setDatum([...firstFace!.centerLocal]);
            setDatumEpoch((n) => n + 1);
            setPending((old) => ({ ...old, datum: false }));
          }}
        >
          Use face center
        </button>
        <DatumInput
          key={datumEpoch}
          value={datum}
          onChange={setDatum}
          onEdit={edit}
          onPending={(value) => setPending((old) => ({ ...old, datum: value }))}
        />
      </div>
      <div className="field-section">
        <h3>4 · Stock and fit</h3>
        <label className="field">
          Actual stock
          <select
            aria-label="Fitted stock material"
            value={materialId}
            onChange={(event) => {
              edit();
              setMaterialId(event.target.value as MaterialId | "");
            }}
          >
            <option value="">Choose a real stock size</option>
            {materials.map((stock) => (
              <option key={stock.id} value={stock.id}>
                {stock.name} ·{" "}
                {stock.size
                  .filter(
                    (_, axis) =>
                      axis !== stock.size.indexOf(Math.max(...stock.size)),
                  )
                  .map(measure)
                  .join(" × ")}{" "}
                actual · {measure(Math.max(...stock.size))} stock
              </option>
            ))}
          </select>
        </label>
        <p className="small-note">
          Catalog dimensions set the cross-section. Store prices and
          availability still require matching snapshots.
        </p>
        <label className="field">
          Cross-section roll, degrees
          <div className="fitted-roll-entry">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Fitted stock roll degrees"
              value={roll}
              maxLength={64}
              onChange={(event) => {
                edit();
                setRoll(event.target.value);
                setPending((old) => ({
                  ...old,
                  roll: parseFittedNumber(event.target.value).pending,
                }));
              }}
            />
            <button
              type="button"
              className="button secondary small"
              aria-label="Rotate fitted cross-section 90 degrees"
              onClick={() => {
                edit();
                setRoll(String((parseFittedNumber(roll).value ?? 0) + 90));
                setPending((old) => ({ ...old, roll: false }));
              }}
            >
              <RotateCw size={14} /> 90°
            </button>
          </div>
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            edit();
            setClearanceA(0);
            setClearanceB(0);
            setPending((old) => ({
              ...old,
              firstClearance: false,
              secondClearance: false,
            }));
          }}
        >
          Use exact modeled span · zero end clearances
        </button>
        <FittedLengthInput
          key={`${project.id}/first-clearance`}
          label="First end clearance"
          value={clearanceA}
          onChange={setClearanceA}
          onEdit={edit}
          onPending={(value) =>
            setPending((old) => ({ ...old, firstClearance: value }))
          }
        />
        <FittedLengthInput
          key={`${project.id}/second-clearance`}
          label="Second end clearance"
          value={clearanceB}
          onChange={setClearanceB}
          onEdit={edit}
          onPending={(value) =>
            setPending((old) => ({ ...old, secondClearance: value }))
          }
        />
        <label className="field">
          Destination section
          <select
            aria-label="Fitted destination section"
            value={destination}
            onChange={(event) => {
              edit();
              setDestination(event.target.value);
              const section = project.sections.find(
                  (row) => row.id === event.target.value,
                ),
                first = section?.pieceIds
                  .map((id) => project.pieces.find((p) => p.id === id))
                  .find(Boolean);
              if (first) setStepId(first.stepId);
            }}
          >
            <option value="">Choose a destination</option>
            <option value="loose">Loose custom part</option>
            {project.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        {destination && destination !== "loose" && (
          <p className="small-note">
            Added as custom work. Later generated-design revisions may require
            rebuild review.
          </p>
        )}
        <label className="field">
          Build stage
          <select
            aria-label="Fitted stock build stage"
            value={stageChoice}
            onChange={(event) => {
              edit();
              setStageChoice(event.target.value);
            }}
          >
            <option value="">Automatic</option>
            {stageChoice && !selectedStage && (
              <option value={stageChoice}>Selected stage is unavailable</option>
            )}
            {stageTargets.map((target) => {
              const key = JSON.stringify([target.ownerId, target.stageKey]);
              return (
                <option key={key} value={key}>
                  {target.title}
                </option>
              );
            })}
          </select>
        </label>
        <p
          className={
            stageChoice && !selectedStage ? "form-error" : "small-note"
          }
        >
          {stageChoice && !selectedStage
            ? "Choose a current build stage or Automatic before previewing."
            : selectedStage
              ? "This part will stay in the selected task when the guide is regenerated. Its physical section stays unchanged."
              : "Automatic groups this part when the guide is regenerated. Choose a task here to keep an explicit placement."}
        </p>
        <details>
          <summary>Name and initial step</summary>
          <label className="field">
            Part name
            <input
              aria-label="Fitted stock name"
              maxLength={100}
              value={name}
              onChange={(event) => {
                edit();
                setName(event.target.value);
              }}
            />
          </label>
          <label className="field">
            Initial step
            <select
              aria-label="Fitted stock initial step"
              value={stepId}
              onChange={(event) => {
                edit();
                setStepId(event.target.value);
              }}
            >
              {project.steps.map((step) => (
                <option value={step.id} key={step.id}>
                  {step.title}
                </option>
              ))}
            </select>
          </label>
          {!stageChoice && (
            <p className="small-note">
              Initial step controls the current timeline. Automatic guide
              grouping may change it when you regenerate the guide.
            </p>
          )}
        </details>
      </div>
      <button
        type="button"
        className="button primary full"
        disabled={!valuesReady}
        onClick={() => {
          try {
            cancelPick();
            const next = previewFittedStock(project, spec());
            pendingResultsFocus.current = next.blockId;
            setPreview(next);
            setError("");
          } catch (problem) {
            pendingResultsFocus.current = null;
            setPreview(null);
            setError(errorText(problem));
          }
        }}
      >
        Preview fitted stock
      </button>
      {Object.values(pending).some(Boolean) && (
        <p className="small-note">
          Finish the entered number or all three datum coordinates before
          previewing.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview ? (
        <FittedStockResults
          preview={preview}
          regionRef={resultsRef}
          onInspect={props.onInspectPreview}
          onAdd={add}
          onCancel={cancel}
          disabled={!valuesReady}
        />
      ) : (
        <div className="fitted-actions">
          <button type="button" className="button primary" disabled>
            Add fitted block
          </button>
          <button type="button" className="button secondary" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      <p className="small-note">
        Adds ordinary stock and cut records. Connection, load and material-use
        suitability remain separate; future member moves do not resize this
        block automatically.
      </p>
    </section>
  );
}

export function FittedStockResults({
  preview,
  regionRef,
  onInspect,
  onAdd,
  onCancel,
  disabled = false,
}: {
  preview: FittedStockPreview;
  regionRef?: Ref<HTMLElement>;
  onInspect?: () => void;
  onAdd: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <section
      className="fitted-stock-results"
      aria-label="Fitted stock result"
      tabIndex={-1}
      ref={regionRef}
    >
      <h3>Preview result</h3>
      <div className="fitted-actions">
        <button
          type="button"
          className="button primary"
          disabled={disabled}
          onClick={onAdd}
        >
          Add fitted block
        </button>
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        {onInspect && (
          <button
            type="button"
            className="button secondary fitted-inspect"
            onClick={onInspect}
          >
            Inspect fitted stock in 3D
          </button>
        )}
      </div>
      <FittedStockSummary preview={preview} />
    </section>
  );
}

export function FittedStockSummary({
  preview,
}: {
  preview: FittedStockPreview;
}) {
  const block = preview.project.pieces.find(
      (piece) => piece.id === preview.blockId,
    ),
    placement = preview.spec.guidePlacement,
    stage =
      placement &&
      guidePlacementTargets(preview.project).find(
        (target) =>
          target.ownerId === placement.ownerId &&
          target.stageKey === placement.stageKey,
      );
  return (
    <div
      className="fitted-stock-summary field-section"
      aria-label="Fitted stock preview summary"
      data-block-id={preview.blockId}
    >
      <h3>
        {partLabel(preview.project, preview.blockId)} ·{" "}
        {block?.name ?? "Fitted stock"}
      </h3>
      <dl>
        <dt>Face-to-face span</dt>
        <dd>{measure(preview.span)}</dd>
        <dt>Retained length</dt>
        <dd>{measure(preview.cutLength)}</dd>
        <dt>Source length</dt>
        <dd>{measure(preview.sourceLength)}</dd>
        <dt>Modeled kerf loss</dt>
        <dd>{measure(preview.kerfLoss)}</dd>
        <dt>Build stage</dt>
        <dd>
          {placement
            ? (stage?.title ?? "Selected stage is unavailable")
            : "Automatic"}
        </dd>
        {block && (
          <>
            <dt>Actual block size</dt>
            <dd>{block.size.map(measure).join(" × ")}</dd>
          </>
        )}
      </dl>
      {preview.offcutIds.length ? (
        <ul>
          {preview.offcutIds.map((id) => {
            const offcut = preview.project.pieces.find(
              (piece) => piece.id === id,
            );
            return (
              <li key={id}>
                {partLabel(preview.project, id)} · remnant{" "}
                {offcut?.size.map(measure).join(" × ")}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small-note">No separate remnant is created.</p>
      )}
      <p className="small-note">
        One physical source · no automatic fastener plans or purchase
        selections.
      </p>
      <details>
        <summary>Fit and source details</summary>
        <p>First-face datum: {vector(preview.spec.datumLocal)}</p>
        <p>
          End clearances: {measure(preview.spec.clearanceA)} /{" "}
          {measure(preview.spec.clearanceB)} · roll {preview.spec.rollDegrees}°
        </p>
        <ul>
          {preview.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
