import { useState } from "react";
import { material, type Project } from "./model";
import { partLabel } from "./partLabels";
import { formatStockLength } from "./measurement";
import { pieceThroughOpenings } from "./throughOpenings";
import { orientedStockSize } from "./stockAxes";
import { workshopAsset } from "./workshopTransport";
export function CutPool({
  project,
  onInspect,
  onReuse,
  onAdd,
  onReviewReuse,
}: {
  project: Project;
  onInspect: (id: string) => void;
  onReuse: (id: string) => void;
  onAdd: () => void;
  onReviewReuse: () => void;
}) {
  const [view, setView] = useState<"scrap" | "used">("scrap");
  const scrap = project.pieces.filter((piece) => piece.offcut),
    used = project.pieces.filter(
      (piece) =>
        !piece.offcut &&
        (piece.cutStock ||
          piece.cutPlanes.length ||
          pieceThroughOpenings(piece).length),
    );
  const pieces = view === "scrap" ? scrap : used;
  const planned = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
  return (
    <section className="cut-pool" aria-label="Cut pool">
      <div className="category-filter">
        <button
          className={view === "scrap" ? "active" : ""}
          onClick={() => setView("scrap")}
        >
          Reusable offcuts ({scrap.length})
        </button>
        <button
          className={view === "used" ? "active" : ""}
          onClick={() => setView("used")}
        >
          Used pieces ({used.length})
        </button>
      </div>
      <button type="button" className="button secondary full" onClick={() => {
        setView("scrap");
        onAdd();
      }}>
        Add measured offcut
      </button>
      {scrap.length > 0 && project.pieces.some((piece) => !piece.offcut && !piece.cutStock && material(piece.material).wood) && (
        <button type="button" className="button secondary full" onClick={onReviewReuse}>
          Review offcut reuse
        </button>
      )}
      {!pieces.length && (
        <p className="small-note">
          {view === "scrap"
            ? "Measure scrap you already have or collect offcuts as you cut parts."
            : "Parts with recorded cuts appear here."}
        </p>
      )}
      {view === "scrap" && scrap.length === 0 && (
        <div className="button-row">
          <a className="text-button" href={workshopAsset("/examples/cut-pool/crosscut-practice.yardwork.json")} download>
            Download crosscut practice plan
          </a>
          <a className="text-button" href={workshopAsset("/examples/cut-pool/save-a-board.yardwork.json")} download>
            Download board-saving practice plan
          </a>
        </div>
      )}
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="cut-pool-row"
          data-pool-part-id={piece.id}
        >
          <strong>
            {partLabel(project, piece.id)} ·{" "}
            {planned.has(piece.cutStock?.id ?? "")
              ? (piece.offcut ? "Expected offcut" : "Reserved for build")
              : (piece.offcut ? "Reusable offcut" : "Used in build")}
          </strong>
          <p>{material(piece.material).name}</p>
          {piece.name !== `Offcut · ${material(piece.material).name}` && piece.name.startsWith("Offcut · ") && (
            <p>{piece.name.slice("Offcut · ".length)}</p>
          )}
          <p>{orientedStockSize(piece).reverse().map(formatStockLength).join(" × ")}</p>
          {!!pieceThroughOpenings(piece).length && (
            <small>Through-cuts recorded</small>
          )}
          {piece.cutStock && (
            <small>
              Source {piece.cutStock.id.slice(0, 8)}
              {project.onHandCutSources?.includes(piece.cutStock.id) ? " · marked on hand" : ""}
              {piece.cutPlanes.length ? " · shaped edges" : ""}
            </small>
          )}
          <div className="button-row">
            <button className="text-button" onClick={() => onInspect(piece.id)}>
              Inspect {partLabel(project, piece.id)}
            </button>
            {piece.offcut && (
              <button
                className="button secondary"
                onClick={() => onReuse(piece.id)}
              >
                Reuse {partLabel(project, piece.id)}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
