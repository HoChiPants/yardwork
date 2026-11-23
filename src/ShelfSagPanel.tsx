import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { Project } from "./model";
import type { PanelBearingReview } from "./panelBearing";
import {
  beamSource,
  reviewShelfSag,
  saveShelfSagPlan,
  shelfSagGeometry,
  shelfSagScope,
  shelfSagSummary,
  stiffnessSource,
} from "./shelfSag";
import type { ShelfSagPlan } from "./shelfSagSchema";
import { ShelfDividerPanel } from "./ShelfDividerPanel";
import type { ShelfDividerPreview } from "./shelfDivider";

function SagInputForm({
  geometry,
  plan,
  onSave,
}: {
  geometry: NonNullable<ReturnType<typeof shelfSagGeometry>>;
  plan?: ShelfSagPlan;
  onSave: (plan: ShelfSagPlan) => void;
}) {
  const [weight, setWeight] = useState(plan?.weight ?? NaN);
  const [stiffness, setStiffness] = useState(plan?.stiffness ?? NaN);
  const [target, setTarget] = useState(plan?.target ?? NaN);
  const [basis, setBasis] = useState(plan?.basis ?? "");
  const [error, setError] = useState("");
  const { identity } = geometry;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onSave({ ...identity, weight, stiffness, target, basis });
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Review the shelf inputs.",
      );
    }
  }
  return (
    <form onSubmit={save}>
      <p className="small-note">
        Longest support span {formatStockLength(geometry.longest.length)} ·
        Sheet thickness {formatPreciseInches(identity.thickness)}. The span runs{" "}
        {identity.spanAxis === identity.stockLengthAxis ? "along" : "across"}{" "}
        the recorded stock length direction. Match the reference stiffness to
        the actual panel and strength axis.
      </p>
      <label className="field">
        Evenly spread weight including shelf (lb)
        <input
          type="number"
          required
          step="any"
          min={0.001}
          max={10000}
          value={Number.isFinite(weight) ? weight : ""}
          onChange={(event) => setWeight(event.target.valueAsNumber)}
        />
      </label>
      <label className="field">
        Panel stiffness EI (lbf·in² per ft)
        <input
          type="number"
          required
          step="any"
          min={0.001}
          max={1e10}
          value={Number.isFinite(stiffness) ? stiffness : ""}
          onChange={(event) => setStiffness(event.target.valueAsNumber)}
        />
      </label>
      <label className="field">
        Stiffness reference
        <input
          required
          maxLength={400}
          placeholder="Sheet grade, strength direction and table or datasheet"
          value={basis}
          onChange={(event) => setBasis(event.target.value)}
        />
      </label>
      <LengthInput
        label="Maximum sag target"
        required
        min={0.00001}
        max={12}
        value={target}
        onChange={setTarget}
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="button secondary full">
        Save and compare sag
      </button>
    </form>
  );
}

export function ShelfSagPanel({
  project,
  pieceId,
  row,
  onChange,
  divider,
  onPreviewDivider,
  onCommitDivider,
  focus,
}: {
  project: Project;
  pieceId: string;
  row?: PanelBearingReview;
  onChange: (project: Project) => void;
  divider: ShelfDividerPreview | null;
  onPreviewDivider: (fit: ShelfDividerPreview | null) => void;
  onCommitDivider: (fit: ShelfDividerPreview) => void;
  focus?: boolean;
}) {
  const plan = project.shelfSagPlans?.find((item) => item.pieceId === pieceId);
  const geometry = row && shelfSagGeometry(row);
  const result = row && plan && reviewShelfSag(row, plan);
  return (
    <details className="connection-settings shelf-sag-options" open={focus || undefined}>
      <summary>Shelf sag estimate</summary>
      <div className="field-section">
        {result && !divider && (
          <p
            role="status"
            className={
              "reason" in result || !result.withinTarget
                ? "small-note"
                : undefined
            }
          >
            {shelfSagSummary(result, plan!.target)}
          </p>
        )}
        {row && result && "geometry" in result && !result.withinTarget && (
          <ShelfDividerPanel
            key={row.piece.id}
            project={project}
            shelfId={pieceId}
            material={row.piece.material}
            geometry={result.geometry}
            preview={divider}
            onPreview={onPreviewDivider}
            onCommit={onCommitDivider}
          />
        )}
        {geometry ? (
          <SagInputForm
            key={JSON.stringify(plan ?? pieceId)}
            geometry={geometry}
            plan={plan}
            onSave={(next) =>
              onChange(saveShelfSagPlan(project, pieceId, next))
            }
          />
        ) : (
          !result && (
            <p>
              Model a level rectangular shelf without holes or bevels. Use
              parallel wood supports that run its full depth and meet both end
              edges.
            </p>
          )
        )}
        <p className="small-note">{shelfSagScope}</p>
        <p className="small-note">
          <a href={stiffnessSource} target="_blank" rel="noreferrer">
            Panel stiffness reference
          </a>
          {" · "}
          <a href={beamSource} target="_blank" rel="noreferrer">
            Bending formula
          </a>
        </p>
        {plan && (
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(saveShelfSagPlan(project, pieceId, null))}
          >
            Remove saved sag estimate
          </button>
        )}
      </div>
    </details>
  );
}
