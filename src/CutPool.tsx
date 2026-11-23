import { useState } from "react";
import { material, type Project } from "./model";
import { partLabel } from "./partLabels";
import { formatStockLength } from "./measurement";
import { pieceThroughOpenings } from "./throughOpenings";
import { orientedStockSize } from "./stockAxes";
import { workshopAsset } from "./workshopTransport";
import { isDrywall } from "./drywallReference";
import { panelOffcutEligible } from "./panelOffcut";
import { offcutSplitOptions } from "./offcutSplit";
import { FoamOffcutPool } from "./FoamOffcutPool";
import { DuctOffcutPool } from "./DuctOffcutPool";
import { usableOffcutEligible } from "./usableOffcut";
import { BackerRodOffcutPool } from "./BackerRodOffcutPool";
import { availableRoundDuctOffcuts } from "./roundDuct";
import { uncutRimFoamOffcuts, type reviewRimAirSeals } from "./rimAirSeals";
import type { inspectCutStock } from "./cutStock";
import { isAssignableOffcut } from "./offcutAssignment";
import { offcutAvailability } from "./offcutAvailability";
export function CutPool({
  project,
  cutSources,
  onInspect,
  onReuse,
  onCutPanel,
  onSplit,
  onMeasure,
  onAdd,
  onReviewReuse,
  onOpenCutOrder,
  rimReview,
  onStockChange,
  onPlanRim,
}: {
  project: Project;
  cutSources: ReturnType<typeof inspectCutStock>;
  onInspect: (id: string) => void;
  onReuse: (id: string) => void;
  onCutPanel: (id: string) => void;
  onSplit: (id: string) => void;
  onMeasure: (id: string) => void;
  onAdd: () => void;
  onReviewReuse: (offcutId?: string) => void;
  onOpenCutOrder?: () => void;
  rimReview: ReturnType<typeof reviewRimAirSeals>;
  onStockChange: (update: (project: Project) => Project) => void;
  onPlanRim?: () => void;
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
  const reusableCount = scrap.length + uncutRimFoamOffcuts(project).length + availableRoundDuctOffcuts(project).length + (project.backerRodOffcuts?.length ?? 0);
  const planned = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
  const availability = offcutAvailability(project);
  return (
    <section className="cut-pool" aria-label="Cut pool">
      <div className="category-filter">
        <button
          className={view === "scrap" ? "active" : ""}
          onClick={() => setView("scrap")}
        >
          Reusable offcuts ({reusableCount})
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
      {scrap.length > 0 && project.pieces.some((piece) =>
        !piece.offcut && !piece.cutStock && (material(piece.material).wood || isDrywall(piece.material)),
      ) && (
        <button type="button" className="button secondary full" onClick={() => onReviewReuse()}>
          Review offcut reuse
        </button>
      )}
      {onOpenCutOrder && (
        <button type="button" className="button secondary full" onClick={onOpenCutOrder}>View offcut cut order</button>
      )}
      {!pieces.length && (view === "used" || reusableCount === 0) && (
        <p className="small-note">
          {view === "scrap"
            ? "Measure scrap you already have or collect offcuts as you cut parts."
            : "Parts with recorded cuts appear here."}
        </p>
      )}
      {view === "scrap" && reusableCount === 0 && (
        <div className="button-row">
          <a className="text-button" href={workshopAsset("/examples/cut-pool/crosscut-practice.yardwork.json")} download>
            Download crosscut practice plan
          </a>
          <a className="text-button" href={workshopAsset("/examples/cut-pool/save-a-board.yardwork.json")} download>
            Download board-saving practice plan
          </a>
          <a className="text-button" href={workshopAsset("/examples/cut-pool/closet-cleats.yardwork.json")} download>
            Download closet cleat practice plan
          </a>
        </div>
      )}
      {view === "scrap" && <>
        <FoamOffcutPool project={project} review={rimReview} onChange={onStockChange} onPlan={onPlanRim} />
        <DuctOffcutPool project={project} onChange={onStockChange} />
        <BackerRodOffcutPool key={project.id} project={project} onChange={onStockChange} />
      </>}
      {pieces.map((piece) => {
        const status = availability(piece);
        const expected = status === "expected";
        return (
          <div
            key={piece.id}
            className="cut-pool-row"
            data-pool-part-id={piece.id}
          >
            <strong>
              {partLabel(project, piece.id)} ·{" "}
              {piece.offcut ? expected ? "Expected offcut" : "Reusable offcut"
                : expected ? "Reserved for build" : "Used in build"}
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
                {status === "on-hand" && " · on hand"}
                {expected && project.onHandCutSources?.includes(piece.cutStock.id) && " · source stock on hand"}
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
              {isAssignableOffcut(piece, cutSources) && (
                <button type="button" className="button secondary" onClick={() => onReviewReuse(piece.id)}>
                  Find uses for {partLabel(project, piece.id)}
                </button>
              )}
              {panelOffcutEligible(piece) && <button type="button" className="button secondary" onClick={() => onCutPanel(piece.id)}>
                Cut panel from {partLabel(project, piece.id)}
              </button>}
              {usableOffcutEligible(piece, planned) && <button type="button" className="button secondary" onClick={() => onMeasure(piece.id)}>
                Measure {partLabel(project, piece.id)}
              </button>}
              {offcutSplitOptions(piece).length > 0 && <button type="button" className="button secondary" onClick={() => onSplit(piece.id)}>
                Split {partLabel(project, piece.id)}
              </button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
