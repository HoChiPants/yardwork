import { Vector3 } from "three";
import {
  dripEdgeCodeRows,
  dripEdgeGuideLines,
  reviewDripEdge,
} from "./dripEdge";
import { gibraltarDripEdge } from "./dripEdgeReference";
import { faceOverlap, retainedWoodFaces } from "./connectionContacts";
import { formatStockLength } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import type { CodeReviewRow } from "./projectCode";
import { gafRoofShingle, shingleEdgeProducts } from "./shingleRoofReference";
import { reviewRoofDeckSpacing, roofDeckBackingDetail, roofDeckEndDetail, roofDeckEndTitle, roofDeckJointDetail, roofDeckJointName, roofDeckSpacingLimits, roofDeckSpacingReference } from "./roofDeckSpacing";
import {
  roofEdgeKinds,
  roofUnderlaymentChoices,
  type ShingleRoof,
  type ShingleRoofEdge,
  type ShingleRoofPlane,
} from "./shingleRoofSchema";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { addSupply } from "./supplies";
import { utahSources } from "./utahCodeSources";

export const utahShingleReviewDate = "2026-11-20";
const tolerance = 1e-7;
const vec = (point: V3) => new Vector3(...point);
export const roofAreaText = (area: number) =>
  `${Number(area.toFixed(2))} sq ft`;
export const roofPitchText = (pitch: number) =>
  `${Number(pitch.toFixed(4))}:12`;
export const canReviewRoofPanel = (piece: Piece) => {
  const stock = material(piece.material);
  return !piece.offcut && stock.wood && stock.stockKind === "sheet";
};

export function reviewShingleRoofPlane(
  project: Pick<Project, "pieces">,
  plane: ShingleRoofPlane,
) {
  const basis = plane.basis;
  const empty = {
    plane,
    pitch: null,
    area: null,
    pieceId: null,
    faces: [],
    reason: "",
  };
  if (basis.kind === "field") {
    if (basis.run === null || basis.rise === null)
      return {
        ...empty,
        reason: "Enter the rise and horizontal run of this roof area.",
      };
    return {
      ...empty,
      pitch: (12 * basis.rise) / basis.run,
      area:
        basis.width === null
          ? null
          : (basis.width * Math.hypot(basis.run, basis.rise)) / 144,
      reason:
        basis.width === null
          ? "Enter the width to estimate this rectangular area."
          : "",
    };
  }
  const piece = project.pieces.find((item) => item.id === basis.pieceId);
  if (!piece || !canReviewRoofPanel(piece))
    return {
      ...empty,
      reason: "Choose an active wood sheet modeled as roof decking.",
    };
  try {
    const localNormal: V3 = [0, 0, 0];
    localNormal[
      stockAxes(piece, piece.cutStock?.size ?? piece.size).thickness
    ] = 1;
    const normal = vec(rotate(localNormal, piece.rotation));
    if (Math.abs(normal.y) < tolerance)
      return {
        ...empty,
        pieceId: piece.id,
        reason: "This panel is vertical. Choose a roof deck surface.",
      };
    if (normal.y < 0) normal.negate();
    const faces = retainedWoodFaces(piece).filter(
      (face) => vec(face.normal).distanceTo(normal) <= tolerance,
    );
    const area =
      faces.reduce(
        (sum, face) => sum + (faceOverlap(face, face, 0)?.area ?? 0),
        0,
      ) / 144;
    if (area <= tolerance)
      return {
        ...empty,
        pieceId: piece.id,
        reason: "The panel has no retained upper deck face on its stock plane.",
      };
    return {
      ...empty,
      pieceId: piece.id,
      faces,
      pitch: (12 * Math.hypot(normal.x, normal.z)) / normal.y,
      area,
    };
  } catch {
    return {
      ...empty,
      pieceId: piece.id,
      reason: "Review the cuts on this panel before measuring its upper face.",
    };
  }
}

export function reviewShingleRoof(
  project: Pick<Project, "pieces" | "supplies" | "motionPlans">,
  plan: ShingleRoof,
) {
  const planes = plan.planes.map((plane) => reviewShingleRoofPlane(project, plane));
  const overlaps = planes.some((a, index) =>
    planes.slice(index + 1).some((b) =>
      a.faces.some((first) =>
        b.faces.some((second) => {
          const normal = vec(first.normal);
          return (
            normal.distanceTo(vec(second.normal)) <= tolerance &&
            Math.abs(
              vec(first.points[0]).sub(vec(second.points[0])).dot(normal),
            ) <= tolerance &&
            (faceOverlap(first, second, 0)?.area ?? 0) > tolerance
          );
        }),
      ),
    ),
  );
  const area =
    planes.every((plane) => plane.area !== null) && !overlaps
      ? planes.reduce((sum, plane) => sum + plane.area!, 0)
      : null;
  const qualified = planes.every(
    ({ pitch }) => pitch !== null && pitch >= 2 - tolerance,
  );
  const bundles =
    plan.productId &&
    qualified &&
    area !== null &&
    plan.coveragePerBundle !== null &&
    plan.wastePercent !== null &&
    plan.coverageBasis.trim()
      ? Math.max(
          1,
          Math.ceil(
            (area * (1 + plan.wastePercent / 100)) / plan.coveragePerBundle -
              1e-9,
          ),
        )
      : null;
  const selected = project.supplies
    .filter(({ productId }) => productId === gafRoofShingle.id)
    .reduce((sum, item) => sum + item.quantity, 0);
  const edges = (["starter", "cap"] as const).flatMap((kind) => {
    const product = shingleEdgeProducts[kind];
    const runs = (plan.edges ?? []).filter(({ kind: edge }) =>
      kind === "starter"
        ? edge === "eave" || edge === "rake"
        : edge === "hip" || edge === "ridge",
    );
    if (!runs.length) return [];
    const complete = runs.every(
      ({ length, extra }) => length !== null && extra !== null,
    );
    const total = complete
      ? runs.reduce((sum, { length, extra }) => sum + length! + extra!, 0)
      : null;
    const capPieces =
      complete && kind === "cap"
        ? runs.reduce(
            (sum, { length, extra }) =>
              sum +
              1 +
              Math.max(
                1,
                Math.ceil(
                  (length! + extra!) / shingleEdgeProducts.cap.capExposure -
                    1e-9,
                ),
              ),
            0,
          )
        : null;
    const pending = !plan.productId
      ? "Choose the compatible field shingle product."
      : !qualified || overlaps
        ? "Review the measured roof pitches and any overlapping deck faces."
        : total === null
          ? "Enter each run length and its cut allowance. Enter zero if no extra length is needed."
          : "";
    const estimated =
      pending || total === null
        ? null
        : Math.max(
            1,
            Math.ceil(
              capPieces === null
                ? total / (product.coverageFeet * 12) - 1e-9
                : capPieces / shingleEdgeProducts.cap.capsPerBundle,
            ),
          );
    const onList = project.supplies
      .filter(({ productId }) => productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
    return [
      {
        kind,
        product,
        runs,
        total,
        capPieces,
        pending,
        estimated,
        onList,
        missing: estimated === null ? 0 : Math.max(0, estimated - onList),
      },
    ];
  });
  return {
    planes,
    deckSpacing: reviewRoofDeckSpacing(project, planes),
    area,
    overlaps,
    bundles,
    selected,
    missing: bundles === null ? 0 : Math.max(0, bundles - selected),
    edges,
    dripEdge: plan.dripEdge
      ? reviewDripEdge(
          plan,
          plan.dripEdge,
          project.supplies,
          planes.map(({ pitch }) => pitch),
          overlaps,
        )
      : null,
  };
}

export function addMissingDripEdge(project: Project) {
  const roof =
    project.projectCode?.trades.includes("roofing") &&
    project.projectCode.shingleRoof;
  if (!roof || !roof.dripEdge || project.retailer !== "home-depot") return project;
  const review = reviewShingleRoof(project, roof).dripEdge;
  return review?.missing
    ? addSupply(
        project,
        gibraltarDripEdge.id,
        review.missing,
        "Roof eave and rake flashing",
      )
    : project;
}

export function describeRoofEdge(edge: ShingleRoofEdge) {
  const length =
    edge.length === null ? "length pending" : formatStockLength(edge.length);
  const allowance =
    edge.extra === null
      ? "cut allowance pending"
      : `${formatStockLength(edge.extra)} cut allowance`;
  return `${edge.label} · ${roofEdgeKinds[edge.kind]} · ${length} · ${allowance}`;
}

export function describeRoofEdgeEstimate(
  estimate: ReturnType<typeof reviewShingleRoof>["edges"][number],
) {
  const { product, estimated, onList, pending, total, capPieces } = estimate;
  if (estimated === null) return pending;
  return `${estimated} ${product.purchaseUnit}${estimated === 1 ? "" : "s"} estimated · ${onList} on the shopping list. ${formatStockLength(total!)} including cut allowances.${capPieces === null ? "" : ` ${capPieces} cap pieces including one starter per run.`}`;
}

export function addMissingRoofEdgeBundles(
  project: Project,
  kind: keyof typeof shingleEdgeProducts,
) {
  const plan =
    project.projectCode?.trades.includes("roofing") &&
    project.projectCode.shingleRoof;
  if (!plan || project.retailer !== "home-depot") return project;
  const edge = reviewShingleRoof(project, plan).edges.find(
    (item) => item.kind === kind,
  );
  return edge?.missing
    ? addSupply(
        project,
        edge.product.id,
        edge.missing,
        kind === "starter" ? "Roof eaves and rakes" : "Roof hips and ridges",
      )
    : project;
}

export function addMissingRoofBundles(project: Project) {
  const plan =
    project.projectCode?.trades.includes("roofing") &&
    project.projectCode.shingleRoof;
  if (!plan || !plan.productId) return project;
  const { missing } = reviewShingleRoof(project, plan);
  return missing
    ? addSupply(
        project,
        plan.productId,
        missing,
        "Asphalt shingle field coverage",
      )
    : project;
}

export function shingleRoofCodeRows(
  project: Pick<Project, "pieces" | "supplies">,
  plan: ShingleRoof,
  scoped: boolean,
): CodeReviewRow[] {
  const sources = [
    utahSources.ircShingles,
    utahSources.ircMechanicalAmendments,
    utahSources.local,
  ];
  const productSources = plan.productId
    ? [
        {
          title: "GAF Timberline HDZ installation instructions",
          url: gafRoofShingle.instructions,
        },
        {
          title: "UL ER21-01 · evaluated roof assembly details",
          url: gafRoofShingle.evaluation,
        },
      ]
    : [];
  if (!scoped)
    return [
      {
        id: "shingle-roof-scope",
        label: "Asphalt shingle scope",
        state: "authority-review",
        detail: `Confirm the Utah IRC path and local applicability. These comparisons cover project dates from July 1, 2026 through ${utahShingleReviewDate}.`,
        sources,
      },
      ...(plan.dripEdge ? dripEdgeCodeRows(plan, plan.dripEdge, false) : []),
    ];
  const pitchRows = reviewShingleRoof(project, plan).planes.flatMap(
    ({ plane, pitch, reason }): CodeReviewRow[] => {
      const row = (
        suffix: string,
        label: string,
        state: CodeReviewRow["state"],
        detail: string,
      ): CodeReviewRow => ({
        id: `shingle-${plane.id}-${suffix}`,
        label: `${plane.label} · ${label}`,
        state,
        detail,
        sources: [...sources, ...productSources],
      });
      if (pitch === null)
        return [row("pitch", "Shingle pitch", "needs-input", reason)];
      const text = `Measured ${roofPitchText(pitch)}. Asphalt shingle minimum reference 2:12.`;
      if (pitch < 2 - tolerance)
        return [
          row(
            "pitch",
            "Shingle pitch",
            "discrepancy",
            `${text} Review the roof covering for this slope.`,
          ),
        ];
      const geometry = row("pitch", "Shingle pitch", "measured-match", text);
      if (Math.abs(pitch - 4) <= tolerance)
        return [
          geometry,
          row(
            "underlayment",
            "Underlayment",
            "authority-review",
            "Confirm the applicable underlayment detail at the 4:12 boundary with the authority and selected instructions.",
          ),
        ];
      if (pitch > 4) return [geometry];
      const lowSlope =
        "The measured roof is in the low-slope range. Review the double application or a qualifying listed assembly and its specific instructions.";
      const detail =
        plane.underlayment === "single"
          ? "A single ordinary layer is recorded in the low-slope range. Review the underlayment assembly."
          : plane.underlayment === "double"
            ? "Two layers are recorded. Verify eligible materials, overlaps and fastening for this low-slope assembly."
            : plane.underlayment === "membrane"
              ? "Confirm that the specific listed membrane procedure qualifies for this low-slope assembly."
              : lowSlope;
      return [
        geometry,
        row(
          "underlayment",
          "Low-slope underlayment",
          plane.underlayment === "single"
            ? "discrepancy"
            : plane.underlayment === "unknown"
              ? "needs-input"
              : plane.underlayment === "double"
                ? "recorded-condition"
                : "authority-review",
          detail,
        ),
      ];
    },
  );
  return [
    ...pitchRows,
    ...(plan.dripEdge ? dripEdgeCodeRows(plan, plan.dripEdge, true) : []),
  ];
}

export function shingleRoofGuideLines(project: Project) {
  const plan =
    project.projectCode?.trades.includes("roofing") &&
    project.projectCode.shingleRoof;
  if (!plan) return [];
  const { planes, deckSpacing, overlaps, bundles, selected, edges, dripEdge } =
    reviewShingleRoof(project, plan);
  return [
    ...planes.map(({ plane, pieceId, pitch, area, reason }) => {
      const basis =
        plane.basis.kind === "field"
          ? `Field rise ${plane.basis.rise === null ? "—" : formatStockLength(plane.basis.rise)}, run ${plane.basis.run === null ? "—" : formatStockLength(plane.basis.run)}, width ${plane.basis.width === null ? "—" : formatStockLength(plane.basis.width)}.`
          : pieceId
            ? `Modeled deck ${partLabel(project, pieceId)}.`
            : "Modeled deck pending.";
      return `${plane.label} · ${basis} ${pitch === null ? "" : `${roofPitchText(pitch)}. `}${area === null ? reason : `${roofAreaText(area)}.`} ${roofUnderlaymentChoices[plane.underlayment]}.`;
    }),
    ...(overlaps
      ? [
          "Modeled deck faces overlap. Review the selected areas before estimating shingles.",
        ]
      : []),
    ...(deckSpacing.modeled > 0 ? [
      ...deckSpacing.joints.map((joint) => `Roof deck joint · ${roofDeckJointName(project, joint)} · ${roofDeckJointDetail(joint)} ${roofDeckBackingDetail(project, joint)}`),
      ...deckSpacing.ends.map((end) => `${roofDeckEndTitle(project, end)} · ${roofDeckEndDetail(end)}`),
      ...deckSpacing.ambiguousEnds.map((id) => `${partLabel(project, id)} · Set the stock length axis to match the panel stamp so the deck ends can be checked.`),
      ...roofDeckSpacingLimits(deckSpacing),
      roofDeckSpacingReference.scope,
      ...(deckSpacing.joints.some(({ backing }) => backing) ? [roofDeckSpacingReference.backingScope] : []),
      ...((deckSpacing.ends.length || deckSpacing.ambiguousEnds.length) ? [roofDeckSpacingReference.endScope] : []),
      `Reference · ${roofDeckSpacingReference.title} · ${roofDeckSpacingReference.url}`,
    ] : []),
    ...(bundles === null
      ? []
      : [
          `${gafRoofShingle.label} · ${bundles} field-shingle ${bundles === 1 ? "bundle" : "bundles"} estimated · ${selected} on the shopping list. Based on ${roofAreaText(plan.coveragePerBundle!)} per bundle and ${plan.wastePercent}% allowance from the entered areas. Coverage notes · ${plan.coverageBasis}. Review flashing, underlayment and attachment for the full roof.`,
        ]),
    ...edges.flatMap((edge) => [
      ...edge.runs.map((run) => `${describeRoofEdge(run)}.`),
      `${edge.product.label} · ${describeRoofEdgeEstimate(edge)}`,
      edge.product.cutNote,
      edge.product.coverageNote,
    ]),
    ...(dripEdge && plan.dripEdge
      ? dripEdgeGuideLines(plan.dripEdge, dripEdge)
      : []),
  ];
}
