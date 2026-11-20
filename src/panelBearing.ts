import { attachmentReviews, type AttachmentReview } from "./attachments";
import { woodBearingSurfaces } from "./connectionContacts";
import { convexHull, type Point2 } from "./convexHull";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { rotate } from "./spatial";
import {
  reviewShelfPinRows,
  reviewWoodSpans,
  seatSpanSummary,
  shelfSpanSummary,
} from "./panelSpans";
import { stockAxes } from "./stockAxes";

const shelfRole = /^(?:tower-)?shelf-\d+$/;
const epsilon = 1e-7;
export const panelBearingScope =
  "Wood patches show where modeled surfaces meet. Use them to locate bearing and check the panel’s span, load and attachment details. Shelf-pin entries describe a plan for hardware and its fit.";

function roles(project: Project) {
  const result = new Map<string, "seat" | "shelf">();
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  for (const binding of project.ideaBindings)
    for (const entry of binding.entries)
      for (const reference of entry.sections)
        if (shelfRole.test(reference.role))
          for (const id of sections.get(reference.sectionId)?.pieceIds ?? [])
            result.set(id, "shelf");
  for (const piece of project.pieces) {
    if (piece.designRole === "seat" || piece.designRole === "seat-lid")
      result.set(piece.id, "seat");
    if (shelfRole.test(piece.designRole ?? "")) result.set(piece.id, "shelf");
  }
  return result;
}

export function isHorizontalPanel(piece: Piece) {
  const stock = material(piece.material);
  if (piece.offcut || !stock.wood || stock.stockKind !== "sheet") return false;
  const axis: V3 = [0, 0, 0];
  axis[stockAxes(piece, piece.cutStock?.size ?? piece.size).thickness] = 1;
  const normal = rotate(axis, piece.rotation);
  return Math.hypot(normal[0], Math.abs(normal[1]) - 1, normal[2]) <= epsilon;
}

function surroundsCenter(outlines: V3[][], center: V3) {
  const points: Point2[] = outlines.flatMap((outline) =>
    outline.map(([x, , z]) => [x - center[0], z - center[2]] as Point2),
  );
  const hull = convexHull(points);
  return (
    hull.length >= 3 &&
    hull.every(([x, z], index) => {
      const next = hull[(index + 1) % hull.length];
      return x * next[1] - z * next[0] >= -epsilon;
    })
  );
}

export function reviewPanelBearing(
  project: Project,
  supportPlans?: readonly AttachmentReview[],
  proposedShelfId?: string,
) {
  const panelRoles = roles(project);
  for (const id of [
    ...(project.shelfSagPlans ?? []).map(({ pieceId }) => pieceId),
    ...(proposedShelfId ? [proposedShelfId] : []),
  ])
    if (!panelRoles.has(id)) panelRoles.set(id, "shelf");
  const panels = new Set(
    project.pieces
      .filter((piece) => panelRoles.has(piece.id) && isHorizontalPanel(piece))
      .map((piece) => piece.id),
  );
  if (!panels.size) return [];
  const plans = supportPlans ?? attachmentReviews(project);
  return woodBearingSurfaces(project, panels).map((surface) => {
    const panelId = surface.piece.id;
    const role = panelRoles.get(panelId)!;
    const pinSets = plans
      .map((plan) =>
        plan.points.filter(({ point }) => point.shelf.pieceId === panelId),
      )
      .filter((points) => points.length);
    const pins = pinSets.flat();
    const checkedPins = pins.filter(
      ({ state }) => state === "geometry-checked",
    ).length;
    const pinLayouts =
      role === "shelf" && checkedPins ? reviewShelfPinRows(surface, plans) : [];
    const reviewedPinSet = pinLayouts.some(
      ({ rows }) =>
        rows.every((row) => !row.problem) &&
        surroundsCenter(
          rows.flatMap((row) => row.reaches),
          surface.center,
        ),
    );
    const pinRows = pinLayouts.flatMap(({ rows }) => rows);
    const wood =
      role === "shelf" &&
      surface.contacts.length &&
      !pinRows.some((row) => row.reaches.length)
        ? reviewWoodSpans(surface)
        : null;
    return {
      ...surface,
      role,
      seatSpans: role === "seat" ? reviewWoodSpans(surface) : null,
      shelfSpans:
        wood || pinRows.length ? { wood, pinRows, reviewedPinSet } : null,
      pinCount: pins.length,
      checkedPins,
      reviewedPinSet,
      centerBetweenContacts: surroundsCenter(
        surface.contacts.map(({ outline }) => outline),
        surface.center,
      ),
    };
  });
}

export type PanelBearingReview = ReturnType<typeof reviewPanelBearing>[number];

export function panelBearingSummary(project: Project, row: PanelBearingReview) {
  const contacts = [
    ...new Set(row.contacts.map(({ pieceId }) => partLabel(project, pieceId))),
  ];
  return [
    contacts.length
      ? `${contacts.length} wood ${contacts.length === 1 ? "contact" : "contacts"} underneath (${contacts.join(", ")}).`
      : "No wood surface meets the underside.",
    ...(contacts.length && !row.centerBetweenContacts
      ? [
          "The center of the underside lies outside the area between the wood contacts.",
        ]
      : []),
    ...(row.pinCount
      ? [
          `${row.checkedPins} of ${row.pinCount} planned shelf-pin locations passed geometry review.`,
        ]
      : !contacts.length && row.role === "shelf"
        ? ["Check for cleats or plan the shelf hardware."]
        : !contacts.length
          ? ["Check the rails or blocking under the seat."]
          : []),
  ].join(" ");
}

export function panelBearingGuideLines(
  project: Project,
  reviews = reviewPanelBearing(project),
) {
  return reviews.map((review) =>
    [
      `${partLabel(project, review.piece.id)} · ${review.piece.name} · ${panelBearingSummary(project, review)}`,
      ...(review.seatSpans ? [seatSpanSummary(review.seatSpans)] : []),
      ...(review.shelfSpans ? [shelfSpanSummary(review.shelfSpans)] : []),
    ].join(" "),
  );
}
