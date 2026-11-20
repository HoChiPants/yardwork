import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";
import { formatPreciseInches as inch } from "./measurement";
import type { Project } from "./model";
import type { RodSupport } from "./rodFitSchema";
import type { reviewRodFit } from "./rodFits";
import { RodBracketMountPanel } from "./RodBracketMountPanel";
import {
  removeRodSupport,
  reviewRodSupports,
  rodIntermediateReference,
  rodSupportStateLabel,
  saveRodSupport,
} from "./rodSupports";

function SupportForm({
  support,
  suggestedOffset,
  offerEverbilt,
  onSave,
  onCancel,
}: {
  support?: RodSupport;
  suggestedOffset: number | null;
  offerEverbilt: boolean;
  onSave: (input: unknown) => void;
  onCancel: () => void;
}) {
  const [offset, setOffset] = useState(
    support?.fromStart ?? suggestedOffset ?? NaN,
  );
  const [wallToRod, setWallToRod] = useState(support?.wallToRod ?? NaN);
  const [bracketReach, setBracketReach] = useState(
    support?.bracketReach ?? NaN,
  );
  const [backing, setBacking] = useState(support?.backing ?? "");
  const [useEverbilt, setUseEverbilt] = useState(
    support?.bracketProductId === everbiltRodBracket.productId,
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      fromStart: offset,
      wallToRod: Number.isFinite(wallToRod) ? wallToRod : null,
      bracketReach: Number.isFinite(bracketReach) ? bracketReach : null,
      backing,
      ...(useEverbilt
        ? { bracketProductId: everbiltRodBracket.productId }
        : {}),
    });
  }
  return (
    <form onSubmit={submit}>
      <LengthInput
        label="Support distance from start face"
        min={0.001}
        max={240}
        value={offset}
        onChange={setOffset}
      />
      <label className="field">
        Backing notes
        <textarea
          rows={2}
          value={backing}
          maxLength={300}
          onChange={(event) => setBacking(event.target.value)}
          placeholder="Record the planned mounting location and how you checked the backing."
        />
      </label>
      {offerEverbilt && (
        <label className="field">
          Bracket model
          <select
            value={useEverbilt ? everbiltRodBracket.model : ""}
            onChange={(event) => {
              setUseEverbilt(event.target.value === everbiltRodBracket.model);
              setBracketReach(NaN);
            }}
          >
            <option value="">Unspecified bracket</option>
            <option value={everbiltRodBracket.model}>Everbilt 14317</option>
          </select>
        </label>
      )}
      {useEverbilt && (
        <p className="small-note">
          Apply the measured rod fit and enter readings from this bracket to
          include it in the shopping list review. {everbiltRodBracket.scope}
        </p>
      )}
      <p className="small-note">
        Reach measurements are optional while planning. Measure from the
        mounting surface to the rod center, then from the delivered bracket’s
        mounting face to the center of its rod seat.
      </p>
      <LengthInput
        label="Wall to rod center"
        value={wallToRod}
        onChange={setWallToRod}
        max={120}
      />
      <LengthInput
        label="Delivered bracket reach"
        value={bracketReach}
        onChange={setBracketReach}
        max={120}
      />
      <button
        className="button secondary full"
        disabled={!Number.isFinite(offset) || !backing.trim()}
      >
        Save support position
      </button>
      <button
        className="button secondary full"
        type="button"
        onClick={onCancel}
      >
        Cancel support edit
      </button>
    </form>
  );
}

export function RodSupportsPanel({
  project,
  fit,
  shown,
  onToggle,
  onChange,
}: {
  project: Project;
  fit: ReturnType<typeof reviewRodFit>;
  shown: boolean;
  onToggle: () => void;
  onChange: (project: Project) => void;
}) {
  const layout = reviewRodSupports(fit);
  const offerEverbilt =
    fit.bay?.rod.material === everbiltClosetRod.materialId &&
    (project.retailer === "home-depot" ||
      layout.rows.some(({ support }) => support.bracketProductId));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editedSupport = layout.rows.find(
    ({ support }) => support.id === editing,
  )?.support;
  if (
    !layout.exceedsReference &&
    !layout.rows.length &&
    !layout.readyToLayOut &&
    !(fit.bay && layout.spacingReference === null)
  )
    return null;

  function changeEditor(id: string | null) {
    setError("");
    setEditing(id);
  }
  return (
    <details className="field-section">
      <summary>Intermediate rod supports · {layout.rows.length}</summary>
      {layout.longest !== null && (
        <p className="small-note">
          Longest planned gap <strong>{inch(layout.longest)}</strong>.{" "}
          {layout.spacingReference === null
            ? "Confirm the Everbilt bracket fit and spacing for this opening."
            : `This ${layout.exceedsReference ? "exceeds" : "is within"} the ${layout.spacingReference} in spacing reference.`}
        </p>
      )}
      {layout.intervals.length > 1 && (
        <p className="small-note">
          Gaps from the start face{" "}
          {layout.intervals.map((gap) => inch(gap.length)).join(" · ")}
        </p>
      )}
      {!layout.readyToLayOut && (
        <p className="small-note">
          Save current field measurements that match the modeled opening to lay
          out supports.
        </p>
      )}
      {layout.rows.length > 0 && (
        <>
          <button
            className="button secondary full"
            type="button"
            onClick={onToggle}
            aria-pressed={shown}
          >
            {shown
              ? "Hide support positions in 3D"
              : "Show support positions in 3D"}
          </button>
          <ul className="small-note">
            {[...layout.rows]
              .sort((a, b) => a.support.fromStart - b.support.fromStart)
              .map(({ support, state }) => (
                <li key={support.id}>
                  <strong>{inch(support.fromStart)} from start</strong> ·{" "}
                  {rodSupportStateLabel[state]}
                  {support.bracketProductId && " · Everbilt 14317"}
                  <br />
                  {support.backing}{" "}
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!layout.readyToLayOut}
                    onClick={() => changeEditor(support.id)}
                  >
                    Edit
                  </button>{" "}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      if (fit.plan)
                        onChange(
                          removeRodSupport(project, fit.plan, support.id),
                        );
                      if (editing === support.id) changeEditor(null);
                    }}
                  >
                    Remove
                  </button>
                  {(support.bracketProductId === everbiltRodBracket.productId || support.mounting) && (
                    <RodBracketMountPanel project={project} fit={fit} support={support} onChange={onChange} />
                  )}
                </li>
              ))}
          </ul>
        </>
      )}
      {layout.readyToLayOut && editing === null && (
        <button
          className="button secondary full"
          type="button"
          onClick={() => changeEditor("new")}
        >
          {layout.suggestion === null
            ? "Add support position"
            : `Plan support at ${inch(layout.suggestion)}`}
        </button>
      )}
      {layout.readyToLayOut && editing !== null && (
        <SupportForm
          key={editing}
          support={editedSupport}
          suggestedOffset={layout.suggestion}
          offerEverbilt={offerEverbilt}
          onCancel={() => changeEditor(null)}
          onSave={(input) => {
            try {
              onChange(saveRodSupport(project, fit, input, editedSupport?.id));
              changeEditor(null);
            } catch (problem) {
              setError(
                problem instanceof Error
                  ? problem.message
                  : "The support could not be saved.",
              );
            }
          }}
        />
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p className="small-note">
        Check the actual backing, fastener requirements and load for each
        position.{" "}
        {layout.spacingReference !== null && (
          <a href={rodIntermediateReference} target="_blank" rel="noreferrer">
            Project Source 27587PHLLG bracket
          </a>
        )}
        {offerEverbilt && (
          <a href={everbiltRodBracket.listing} target="_blank" rel="noreferrer">
            Everbilt 14317 bracket listing
          </a>
        )}
      </p>
    </details>
  );
}
