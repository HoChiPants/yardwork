import { useState, type FormEvent } from "react";
import {
  addMissingLidStays,
  lidStayFitGuideRows,
  lidStayFitScope,
  lidStayPurchases,
  removeLidStayFit,
  saveLidStayFit,
} from "./lidStayFit";
import {
  foldingLidStays,
  type FoldingLidStayProductId,
} from "./lidStayReference";
import { lidWeightPose } from "./lidMotion";
import { material, type Project, type Section, type V3 } from "./model";
import { partLabel } from "./partLabels";
import type { LidStayFit } from "./lidStayFitSchema";

const axes = ["X", "Y", "Z"];
function PinFields({ kind, values }: { kind: "Cabinet" | "Lid"; values?: V3 }) {
  return (
    <div className="field">
      <strong>{kind} pin from its blank center (in)</strong>
      <div className="lid-stay-coordinates">
        {axes.map((axis, i) => (
          <label className="field" key={axis}>
            {axis}
            <input
              type="number"
              step="any"
              required
              name={`${kind}-${axis}`}
              aria-label={`${kind} pin local ${axis}`}
              defaultValue={values?.[i]}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function LidStayFitEditor({
  project,
  section,
  onChange,
}: {
  project: Project;
  section: Section;
  onChange: (project: Project) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const fits = (project.lidStayFits ?? []).filter(
    (fit) => fit.sectionId === section.id,
  );
  const selected = fits.find(({ id }) => id === selectedId);
  const guide = selected
    ? lidStayFitGuideRows({ ...project, lidStayFits: [selected] })[0]
    : null;
  const product = selected?.productId;
  const purchase = product ? lidStayPurchases(project, product) : null;
  let closedId: string | undefined;
  try {
    closedId = lidWeightPose(project, section.id).piece.id;
  } catch {
    // Missing or stale hinge setup is reported when saving, with its own reason.
  }
  const members = project.pieces.filter(
    (piece) =>
      section.pieceIds.includes(piece.id) &&
      piece.id !== closedId &&
      !piece.offcut &&
      material(piece.material).wood,
  );
  const savedMemberMissing =
    selected && !members.some(({ id }) => id === selected.fixedPieceId);

  function save(
    event: FormEvent<HTMLFormElement>,
    fit: LidStayFit | undefined,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const number = (key: string) => Number(data.get(key));
    const pin = (key: string) =>
      axes.map((axis) => number(`${key}-${axis}`)) as V3;
    try {
      const arms = ["Cabinet", "Lid"] as const;
      const envelopes = arms.map((arm) => ({
        width: data.get(`${arm}-width`),
        thickness: data.get(`${arm}-thickness`),
      }));
      const measured = envelopes.some(
        ({ width, thickness }) => width || thickness,
      );
      if (
        measured &&
        envelopes.some(({ width, thickness }) => !width || !thickness)
      )
        throw Error(
          "Enter the width and thickness of both arms, or leave all four fields blank.",
        );
      const envelope = (index: number) => ({
        width: Number(envelopes[index].width),
        thickness: Number(envelopes[index].thickness),
      });
      const next = saveLidStayFit(
        project,
        section.id,
        {
          fixedPieceId: String(data.get("fixed")),
          productId: (data.get("product") ||
            null) as FoldingLidStayProductId | null,
          fixedPin: pin("Cabinet"),
          lidPin: pin("Lid"),
          fixedArm: number("fixed-arm"),
          lidArm: number("lid-arm"),
          ...(measured ? { armEnvelopes: [envelope(0), envelope(1)] } : {}),
          foldSign: number("fold") === 1 ? 1 : -1,
          testAngle: number("angle"),
        },
        fit?.id,
      );
      setSelectedId(fit?.id ?? next.lidStayFits!.at(-1)!.id);
      setError("");
      onChange(next);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Check the folding stay measurements.",
      );
    }
  }

  return (
    <details className="field-section">
      <summary>
        Fit a folding lid stay{fits.length ? ` · ${fits.length} saved` : ""}
      </summary>
      <p className="small-note">
        Measure the pivot centers across each arm. Enter each mounting pin in
        its part's local axes with the lid closed. Use one plane perpendicular
        to the lid hinge.
      </p>
      {!!fits.length && (
        <label className="field">
          Folding stay plan
          <select
            value={selected?.id ?? ""}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setError("");
            }}
          >
            <option value="">New folding stay</option>
            {fits.map(({ id, fixedPieceId, productId }, i) => (
              <option key={id} value={id}>
                {i + 1}. {partLabel(project, fixedPieceId)} ·{" "}
                {productId ? foldingLidStays[productId].model : "Measured stay"}
              </option>
            ))}
          </select>
        </label>
      )}
      {guide && (
        <div className="section-description">
          <p className="small-note" data-testid="lid-stay-fit-result">
            {guide.result}
          </p>
          {guide.sourceNote && <p className="small-note">{guide.sourceNote}</p>}
          {guide.source && (
            <p className="small-note">
              <a href={guide.source.listing} target="_blank" rel="noreferrer">
                Home Depot reference
              </a>
              {" · "}
              <a href={guide.source.manual} target="_blank" rel="noreferrer">
                Installation drawing
              </a>
            </p>
          )}
          {purchase && product && (
            <>
              <p className="small-note">
                {purchase.needed} planned · {purchase.already} on shopping list
              </p>
              {!!purchase.missing && (
                <button
                  type="button"
                  className="button secondary full"
                  onClick={() => onChange(addMissingLidStays(project, product))}
                >
                  Add {foldingLidStays[product].model} to shopping list
                </button>
              )}
            </>
          )}
        </div>
      )}
      <form
        key={JSON.stringify([project.id, section.id, selected])}
        onSubmit={(event) => save(event, selected)}
      >
        <label className="field">
          Stationary mounting member
          <select
            name="fixed"
            required
            defaultValue={selected?.fixedPieceId ?? ""}
          >
            <option value="" disabled>
              Choose a member in this section
            </option>
            {savedMemberMissing && (
              <option value={selected.fixedPieceId} disabled>
                Saved member is missing
              </option>
            )}
            {members.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {partLabel(project, piece.id)} · {piece.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Folding stay reference
          <select name="product" defaultValue={product ?? ""}>
            <option value="">Measured stay without a product reference</option>
            {Object.entries(foldingLidStays).map(([id, value]) => (
              <option key={id} value={id}>
                Everbilt {value.model} · {value.hand}
              </option>
            ))}
          </select>
        </label>
        <PinFields kind="Cabinet" values={selected?.fixedPin} />
        <PinFields kind="Lid" values={selected?.lidPin} />
        <div className="two-col">
          <label className="field">
            Cabinet arm (in)
            <input
              type="number"
              step="any"
              min={0.125}
              max={120}
              name="fixed-arm"
              required
              defaultValue={selected?.fixedArm}
            />
          </label>
          <label className="field">
            Lid arm (in)
            <input
              type="number"
              step="any"
              min={0.125}
              max={120}
              name="lid-arm"
              required
              defaultValue={selected?.lidArm}
            />
          </label>
        </div>
        <div className="two-col">
          <label className="field">
            Elbow position
            <select name="fold" defaultValue={selected?.foldSign ?? 1}>
              <option value={1}>A</option>
              <option value={-1}>B</option>
            </select>
          </label>
          <label className="field">
            Test through (degrees)
            <input
              type="number"
              min={1}
              max={90}
              name="angle"
              required
              defaultValue={selected?.testAngle ?? 90}
            />
          </label>
        </div>
        <details
          open={selected?.armEnvelopes ? true : undefined}
          className="field-section"
        >
          <summary>Arm dimensions for collision preview</summary>
          <p className="small-note">
            Enter the width in the folding plane and the thickness across it for
            both arms.
          </p>
          {["Cabinet", "Lid"].map((arm, index) => (
            <div className="two-col" key={arm}>
              {(["width", "thickness"] as const).map((dimension) => (
                <label className="field" key={dimension}>
                  {arm} arm {dimension} (in)
                  <input
                    name={`${arm}-${dimension}`}
                    type="number"
                    min={0.001}
                    max={12}
                    step="any"
                    defaultValue={selected?.armEnvelopes?.[index][dimension]}
                  />
                </label>
              ))}
            </div>
          ))}
        </details>
        <button type="submit" className="button secondary full">
          Save folding stay
        </button>
        {selected && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange(removeLidStayFit(project, selected.id));
              setSelectedId("");
              setError("");
            }}
          >
            Remove folding stay
          </button>
        )}
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="small-note">
        {lidStayFitScope} Switch A/B if the elbow folds the other way.
      </p>
    </details>
  );
}
