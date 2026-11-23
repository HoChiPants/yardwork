import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import {
  addMissingDripEdge,
  addMissingRoofBundles,
  addMissingRoofEdgeBundles,
  canReviewRoofPanel,
  describeRoofEdge,
  describeRoofEdgeEstimate,
  reviewShingleRoof,
  roofAreaText,
  roofPitchText,
} from "./shingleRoof";
import { gafRoofShingle } from "./shingleRoofReference";
import { roofDeckSpacingLimits, roofDeckSpacingReference } from "./roofDeckSpacing";
import { ShingleRoofEdgeFields } from "./ShingleRoofEdgeFields";
import { DripEdgeEstimate, DripEdgeFields } from "./DripEdgeFields";
import {
  roofUnderlaymentChoices,
  type ShingleRoof,
  type ShingleRoofPlane,
} from "./shingleRoofSchema";

const fieldBasis = {
  kind: "field",
  run: null,
  rise: null,
  width: null,
} as const;
const panelBasis = { kind: "panel", pieceId: null } as const;
const newArea = (number: number): ShingleRoofPlane => ({
  id: uid(),
  label: `Roof area ${number}`,
  basis: panelBasis,
  underlayment: "unknown",
});

function RoofAreaFields({
  project,
  plane,
  index,
  onChange,
  onRemove,
}: {
  project: Project;
  plane: ShingleRoofPlane;
  index: number;
  onChange: (next: ShingleRoofPlane) => void;
  onRemove?: () => void;
}) {
  const prefix = `Area ${index + 1}`;
  const basis = plane.basis;
  const available = project.pieces.filter(canReviewRoofPanel);
  return (
    <div className="section-description">
      <label className="field">
        {prefix} name
        <input
          value={plane.label}
          required
          maxLength={80}
          onChange={(event) =>
            onChange({ ...plane, label: event.target.value })
          }
        />
      </label>
      <label className="field">
        {prefix} measurement source
        <select
          value={basis.kind}
          onChange={(event) =>
            onChange({
              ...plane,
              basis: event.target.value === "panel" ? panelBasis : fieldBasis,
            })
          }
        >
          <option value="panel">Modeled deck panel</option>
          <option value="field">
            Field measurements of a rectangular area
          </option>
        </select>
      </label>
      {basis.kind === "panel" ? (
        <label className="field">
          {prefix} deck panel
          <select
            value={basis.pieceId ?? ""}
            onChange={(event) =>
              onChange({
                ...plane,
                basis: { kind: "panel", pieceId: event.target.value || null },
              })
            }
          >
            <option value="">Choose a wood sheet</option>
            {basis.pieceId &&
              !available.some(({ id }) => id === basis.pieceId) && (
                <option disabled value={basis.pieceId}>
                  Saved panel unavailable
                </option>
              )}
            {available.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {partLabel(project, piece.id)} · {piece.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          {(
            [
              ["run", "horizontal run"],
              ["rise", "vertical rise"],
              ["width", "eave width"],
            ] as const
          ).map(([key, label]) => (
            <LengthInput
              key={key}
              label={`${prefix} ${label}`}
              value={basis[key] ?? NaN}
              min={key === "rise" ? 0 : 0.001}
              max={12000}
              onChange={(value) =>
                onChange({
                  ...plane,
                  basis: {
                    ...basis,
                    [key]: Number.isFinite(value) ? value : null,
                  },
                })
              }
            />
          ))}
        </>
      )}
      <label className="field">
        {prefix} underlayment
        <select
          value={plane.underlayment}
          onChange={(event) =>
            onChange({
              ...plane,
              underlayment: event.target
                .value as ShingleRoofPlane["underlayment"],
            })
          }
        >
          {Object.entries(roofUnderlaymentChoices).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {onRemove && (
        <button type="button" className="text-button" onClick={onRemove}>
          Remove area {index + 1}
        </button>
      )}
    </div>
  );
}

export function ShingleRoofFields({
  plan,
  project,
  measuredDistance,
  onChange,
}: {
  plan?: ShingleRoof;
  project: Project;
  measuredDistance: number | null;
  onChange: (value: ShingleRoof | undefined) => void;
}) {
  return (
    <fieldset className="field">
      <legend>Asphalt shingle roof</legend>
      <label className="code-trade-choice">
        <input
          type="checkbox"
          checked={!!plan}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? {
                    productId: null,
                    planes: [newArea(1)],
                    coveragePerBundle: null,
                    wastePercent: null,
                    coverageBasis: "",
                  }
                : undefined,
            )
          }
        />
        Review asphalt shingles
      </label>
      {plan && (
        <>
          {plan.planes.map((plane, index) => (
            <RoofAreaFields
              key={plane.id}
              plane={plane}
              index={index}
              project={project}
              onChange={(next) =>
                onChange({
                  ...plan,
                  planes: plan.planes.map((item) =>
                    item.id === plane.id ? next : item,
                  ),
                })
              }
              onRemove={
                plan.planes.length > 1
                  ? () =>
                      onChange({
                        ...plan,
                        planes: plan.planes.filter(
                          (item) => item.id !== plane.id,
                        ),
                      })
                  : undefined
              }
            />
          ))}
          <button
            type="button"
            className="text-button"
            disabled={plan.planes.length >= 24}
            onClick={() =>
              onChange({
                ...plan,
                planes: [...plan.planes, newArea(plan.planes.length + 1)],
              })
            }
          >
            Add roof area
          </button>
          <label className="field">
            Field shingle product
            <select
              value={plan.productId ?? ""}
              onChange={(event) =>
                onChange({
                  ...plan,
                  productId: event.target.value ? gafRoofShingle.id : null,
                })
              }
            >
              <option value="">Generic asphalt shingles</option>
              <option value={gafRoofShingle.id}>{gafRoofShingle.label}</option>
            </select>
          </label>
          {plan.productId && (
            <>
              <p className="small-note">{gafRoofShingle.coverageNote}</p>
              <label className="field">
                Verified coverage per bundle (sq ft)
                <input
                  type="number"
                  step="any"
                  min={0.1}
                  max={500}
                  value={plan.coveragePerBundle ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      coveragePerBundle:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                Cut and waste allowance (%)
                <input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={plan.wastePercent ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      wastePercent:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                Bundle coverage notes
                <textarea
                  rows={2}
                  maxLength={300}
                  value={plan.coverageBasis}
                  onChange={(event) =>
                    onChange({ ...plan, coverageBasis: event.target.value })
                  }
                />
              </label>
            </>
          )}
          <ShingleRoofEdgeFields
            edges={plan.edges ?? []}
            measuredDistance={measuredDistance}
            onChange={(edges) => onChange({ ...plan, edges })}
          />
          <DripEdgeFields roof={plan} onChange={onChange} />
        </>
      )}
    </fieldset>
  );
}

export function ShingleRoofEstimate({
  project,
  plan,
  onChange,
}: {
  project: Project;
  plan: ShingleRoof;
  onChange: (value: Project) => void;
}) {
  const [error, setError] = useState("");
  const review = reviewShingleRoof(project, plan);
  function addBundles(add: (project: Project) => Project) {
    try {
      onChange(add(project));
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Review the roof material quantities.",
      );
    }
  }
  return (
    <section
      className="section-description"
      aria-label="Asphalt shingle estimate"
    >
      {review.planes.map(({ plane, pitch, area, reason }) => (
        <p key={plane.id} className="small-note">
          {plane.label} · {pitch !== null && `${roofPitchText(pitch)} · `}
          {area === null ? reason : roofAreaText(area)}
        </p>
      ))}
      {review.overlaps && (
        <p className="small-note">
          Selected deck faces overlap. Review the areas before estimating
          shingles.
        </p>
      )}
      {review.deckSpacing.modeled > 0 && (
        <section className="section-description" aria-label="Roof deck joint spacing">
          <strong>Roof deck joint spacing</strong>
          {!!review.deckSpacing.joints.length && <p className="small-note">
            {review.deckSpacing.joints.length} {review.deckSpacing.joints.length === 1 ? "joint measured" : "joints measured"}. Select a joint in Checks to see the gap in 3D. Orange segments mark fastener lines that lack modeled framing.
          </p>}
          {roofDeckSpacingLimits(review.deckSpacing).map((line) => <p key={line} className="small-note">{line}</p>)}
          <p className="small-note">{roofDeckSpacingReference.scope}</p>
          {review.deckSpacing.joints.some(({ backing }) => backing) && <p className="small-note">{roofDeckSpacingReference.backingScope}</p>}
          <p className="small-note"><a href={roofDeckSpacingReference.url} target="_blank" rel="noreferrer">{roofDeckSpacingReference.title}</a></p>
        </section>
      )}
      {plan.productId && (
        <>
          <p className="small-note">
            <a href={gafRoofShingle.listing} target="_blank" rel="noreferrer">
              Home Depot · {gafRoofShingle.label}
            </a>
          </p>
          <p className="small-note" data-testid="shingles-bundle-estimate">
            {review.bundles === null
              ? "Review the measured areas and pitch, then enter verified bundle coverage, its source and the allowance."
              : `${review.bundles} field-shingle ${review.bundles === 1 ? "bundle" : "bundles"} estimated · ${review.selected} on the shopping list. Count each roof area once.`}
          </p>
          {review.missing > 0 && project.retailer === "home-depot" && (
            <button
              type="button"
              className="button secondary full"
              onClick={() => addBundles(addMissingRoofBundles)}
            >
              Add {review.missing} shingle{" "}
              {review.missing === 1 ? "bundle" : "bundles"} to list
            </button>
          )}
        </>
      )}
      {review.edges.map((edge) => (
        <section
          key={edge.kind}
          className="section-description"
          aria-label={edge.product.label}
        >
          <strong>{edge.product.label}</strong>
          <ul className="small-note">
            {edge.runs.map((run) => (
              <li key={run.id}>{describeRoofEdge(run)}</li>
            ))}
          </ul>
          <p className="small-note">{describeRoofEdgeEstimate(edge)}</p>
          <p className="small-note">
            {edge.product.coverageNote} {edge.product.cutNote}
          </p>
          <p className="small-note">
            <a href={edge.product.listing} target="_blank" rel="noreferrer">
              Home Depot product
            </a>
            {" · "}
            <a
              href={edge.product.instructions}
              target="_blank"
              rel="noreferrer"
            >
              GAF installation instructions
            </a>
          </p>
          {edge.missing > 0 && project.retailer === "home-depot" && (
            <button
              type="button"
              className="button secondary full"
              onClick={() =>
                addBundles((current) =>
                  addMissingRoofEdgeBundles(current, edge.kind),
                )
              }
            >
              Add {edge.missing} {edge.product.purchaseUnit}
              {edge.missing === 1 ? "" : "s"} to list
            </button>
          )}
        </section>
      ))}
      {plan.dripEdge?.productId && review.dripEdge && (
        <DripEdgeEstimate
          review={review.dripEdge}
          onAdd={
            project.retailer === "home-depot"
              ? () => addBundles(addMissingDripEdge)
              : undefined
          }
        />
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
