import { useMemo, useState } from "react";
import {
  previewEaveBlock,
  previewEaveRoof,
  type EaveFitPreview,
} from "./eaveStockFit";
import { fittedStockMaterials } from "./fittedStock";
import { reviewGreenhouseRafterBearing } from "./greenhouseRafterBearing";
import { formatPreciseInches } from "./measurement";
import type { MaterialId, Project } from "./model";
import { partLabel } from "./partLabels";

const inches = (size: number) => formatPreciseInches(Number(size.toFixed(3)));

export function EaveBlockPanel({
  project,
  preview,
  onPreview,
  onAdd,
}: {
  project: Project;
  preview: EaveFitPreview | null;
  onPreview: (value: EaveFitPreview | null) => void;
  onAdd: (value: EaveFitPreview) => void;
}) {
  const choices = useMemo(
    () =>
      reviewGreenhouseRafterBearing(project).flatMap((roof) =>
        roof.rows
          .filter(({ eave }) => eave.state === "gap" || eave.state === "edge")
          .map((row) => ({ ...row, title: roof.title, entryId: roof.entryId })),
      ),
    [project],
  );
  const stocks = useMemo(fittedStockMaterials, []);
  const [rafterId, setRafterId] = useState("");
  const [board, setBoard] = useState<MaterialId | "">("");
  const [reuse, setReuse] = useState(true);
  const [error, setError] = useState("");
  const selected = choices.some(({ id }) => id === rafterId)
    ? rafterId
    : (choices[0]?.id ?? "");
  const reset = () => {
    setError("");
    onPreview(null);
  };
  if (!choices.length) return null;
  const roofId = choices.find(({ id }) => id === selected)?.entryId;
  const roofCount = choices.filter(({ entryId }) => entryId === roofId).length;
  const rafterStock = project.pieces.find(
    ({ id }) => id === selected,
  )?.material;
  const stockId =
    board || stocks.find(({ id }) => id === rafterStock)?.id || "stud";
  function showPreview(wholeRoof: boolean) {
    reset();
    try {
      onPreview(
        wholeRoof
          ? previewEaveRoof(project, selected, stockId, reuse)
          : previewEaveBlock(project, selected, stockId, reuse),
      );
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The block preview could not be built.",
      );
    }
  }
  return (
    <details className="field-section eave-fit">
      <summary>Fit an eave block</summary>
      <p className="small-note">
        Fit a beveled wood block between a rafter and its wall plate. Choose one
        rafter or preview every eligible joint on its roof.
      </p>
      <label className="field">
        Rafter to fit
        <select
          aria-label="Rafter to fit"
          value={selected}
          onChange={(event) => {
            reset();
            setRafterId(event.target.value);
          }}
        >
          {choices.map(({ id, title, eave }) => (
            <option key={id} value={id}>
              {partLabel(project, id)} ·{" "}
              {eave.gap === undefined
                ? "Edge contact"
                : `${inches(eave.gap)} plate gap`}{" "}
              · {title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Block stock
        <select
          aria-label="Block stock"
          value={stockId}
          onChange={(event) => {
            reset();
            setBoard(event.target.value as MaterialId);
          }}
        >
          {stocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.name}
            </option>
          ))}
        </select>
      </label>
      <div className="recipe-options">
        <label>
          <input
            type="checkbox"
            checked={reuse}
            onChange={(event) => {
              reset();
              setReuse(event.target.checked);
            }}
          />
          Use a matching offcut first
        </label>
      </div>
      {preview && "fits" in preview ? (
        <div className="field-section" data-testid="eave-roof-details">
          <p className="small-note">
            Review attachment at both faces of each block.
          </p>
          <p className="small-note" role="status">
            {preview.fits.length} of{" "}
            {preview.fits.length + preview.skipped.length} eligible eave joints
            fit.{" "}
            {preview.freshBoards === 0 && preview.fits.length > 0
              ? "All blocks fit stock from the cut pool."
              : preview.freshBoards > 0
                ? `${preview.freshBoards} new ${preview.freshBoards === 1 ? "board" : "boards"} for these blocks.`
                : "Review the joints below."}
          </p>
          <div className="button-row">
            {preview.fits.length > 0 && (
              <button
                type="button"
                className="button primary"
                onClick={() => onAdd(preview)}
              >
                Add {preview.fits.length} eave{" "}
                {preview.fits.length === 1 ? "block" : "blocks"}
              </button>
            )}
            <button type="button" className="text-button" onClick={reset}>
              Cancel preview
            </button>
          </div>
          {preview.fits.length > 0 && (
            <details>
              <summary>Block cuts and locations</summary>
              <ul>
                {preview.fits.map((fit) => (
                  <li key={fit.rafterId} className="small-note">
                    {partLabel(project, fit.rafterId)} on{" "}
                    {partLabel(project, fit.plateId)} · Cut{" "}
                    {inches(fit.block.size[2])} · Bevel {inches(fit.heights[0])}{" "}
                    to {inches(fit.heights[1])}.
                  </li>
                ))}
              </ul>
            </details>
          )}
          {preview.skipped.length > 0 && (
            <details open>
              <summary>{preview.skipped.length} to review</summary>
              <ul>
                {preview.skipped.map(({ rafterId, reason }) => (
                  <li key={rafterId} className="small-note">
                    {partLabel(project, rafterId)} · {reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : preview ? (
        <div className="field-section" data-testid="eave-block-details">
          <p className="small-note">
            Fits {partLabel(project, preview.rafterId)} on{" "}
            {partLabel(project, preview.plateId)}. Cut{" "}
            {inches(preview.block.size[2])} along the board, then bevel from{" "}
            {inches(preview.heights[0])} to {inches(preview.heights[1])} above
            the plate.
          </p>
          <p className="small-note">
            {preview.reusedId
              ? `Uses ${partLabel(project, preview.reusedId)} from the cut pool.`
              : "Uses one board."}{" "}
            {preview.remnantLength > 0 &&
              `Keeps a ${inches(preview.remnantLength)} long offcut. `}
            The bevel waste stays out of the cut pool.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              onClick={() => onAdd(preview)}
            >
              Add eave block
            </button>
            <button type="button" className="text-button" onClick={reset}>
              Cancel preview
            </button>
          </div>
        </div>
      ) : (
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            onClick={() => showPreview(false)}
          >
            Preview eave block
          </button>
          {roofCount > 1 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => showPreview(true)}
            >
              Preview all eave blocks
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
