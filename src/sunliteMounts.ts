import { Vector3 } from "three";
import { clipBox, solidBounds } from "./cutProfiles";
import { retainedWoodFaces } from "./connectionContacts";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches as length } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { sunliteFastener } from "./sunliteFastenerReference";
import { sunliteMountsSchema, type SunliteMount } from "./sunliteMountSchema";
import { sunliteTemperatureMovement } from "./sunliteThermal";
import { openingAxes, pieceThroughOpenings } from "./throughOpenings";

type Point = [number, number];
const epsilon = 1e-7;
const meshTolerance = 0.01;
const v = (point: V3) => new Vector3(...point);

export const sunliteMountScope =
  "Compares centered drill holes with thermal movement about the specified stationary datum. Checks retained panel edges, gasket cover and contact with the selected wood. Verify engagement, spacing, weather sealing and loads for the installed detail.";

function sunliteMountFrame(panel: Piece) {
  const { width, length, thickness } = stockAxes(panel);
  const solid = clipBox(panel.size, panel.cutPlanes);
  const { min, max } = solidBounds(solid);
  return { width, length, thickness, solid, min, max };
}

function shapeFingerprint(panel: Piece) {
  return bindingHash([
    panel.size,
    stockAxes(panel),
    panel.cutPlanes,
    panel.cutStock,
  ]);
}

export function saveSunliteMount(
  project: Project,
  panelId: string,
  input: Pick<SunliteMount, "detail" | "holes">,
) {
  const panel = project.pieces.find(
    ({ id, material, offcut }) =>
      id === panelId && material === "sunlite-8mm" && !offcut,
  );
  if (!panel) throw Error("Choose an active SUNLITE panel.");
  const records = project.sunliteMounts ?? [];
  const next = {
    panelId,
    productId: sunliteFastener.productId,
    fingerprint: shapeFingerprint(panel),
    ...input,
  };
  const sunliteMounts = sunliteMountsSchema.parse(
    records.some((plan) => plan.panelId === panelId)
      ? records.map((plan) => (plan.panelId === panelId ? next : plan))
      : [...records, next],
  );
  return { ...project, sunliteMounts };
}

export function removeSunliteMount(project: Project, panelId: string): Project {
  const { sunliteMounts, ...rest } = project;
  const plans = sunliteMounts?.filter((plan) => plan.panelId !== panelId);
  return plans?.length ? { ...rest, sunliteMounts: plans } : rest;
}

function diskInsideWood(
  piece: Piece,
  point: Vector3,
  outward: Vector3,
  radius: number,
) {
  return retainedWoodFaces(piece).some(({ normal, points }) => {
    const n = v(normal);
    if (
      n.dot(outward) < 1 - epsilon ||
      Math.abs(n.dot(point.clone().sub(v(points[0])))) > meshTolerance
    )
      return false;
    return points.every((origin, i) => {
      const a = v(origin);
      const inward = n
        .clone()
        .cross(v(points[(i + 1) % points.length]).sub(a))
        .normalize();
      return inward.dot(point.clone().sub(a)) >= radius - epsilon;
    });
  });
}

export function reviewSunliteMounts(project: Project) {
  if (!project.sunliteMounts?.length) return [];
  const active = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  const moving = [
    ...(project.motionPlans ?? []).map((plan) => new Set(plan.memberIds)),
    ...project.ideaBindings.flatMap(({ entries }) =>
      entries.flatMap((entry) => [
        new Set(
          entry.sections
            .filter(({ role }) => role === "roof-vent-sash")
            .flatMap(
              ({ sectionId }) => sections.get(sectionId)?.pieceIds ?? [],
            ),
        ),
        new Set(
          entry.sections
            .filter(
              ({ role }) =>
                role === "door-leaf" || role === "glazing-door-panels",
            )
            .flatMap(
              ({ sectionId }) => sections.get(sectionId)?.pieceIds ?? [],
            ),
        ),
      ]),
    ),
  ].filter((group) => group.size);
  const temperatures = project.sunliteThermal?.temperatures;
  return project.sunliteMounts.map((plan) => {
    const { panelId, detail, holes } = plan;
    const panel = active.get(panelId);
    const label = partLabel(project, panelId);
    const unresolved = (issue: string) => ({ plan, label, issue, rows: [] });
    if (!panel || panel.material !== "sunlite-8mm")
      return unresolved("The selected SUNLITE panel is missing.");
    if (plan.fingerprint !== shapeFingerprint(panel))
      return unresolved(
        "Panel cuts or dimensions changed. Recheck the hole datums and confirm this layout.",
      );
    const frame = sunliteMountFrame(panel);
    const { width, length: along, thickness, solid } = frame;
    if (Math.abs(panel.size[thickness] - 8 / 25.4) > 0.001)
      return unresolved(
        "Check the modeled thickness and flute axis against 8 mm SUNLITE.",
      );
    const local = ([x, y]: Point, face: number): V3 => {
      const point: V3 = [0, 0, 0];
      point[width] = x;
      point[along] = y;
      point[thickness] = (face * panel.size[thickness]) / 2;
      return point;
    };
    const direction: V3 = [0, 0, 0];
    direction[thickness] = detail.face;
    const outward = v(rotate(direction, panel.rotation));
    const world = (point: V3) =>
      v(rotate(point, panel.rotation)).add(v(panel.position));
    const fitsPanel = (center: Point, face: number, radius: number) => {
      const point = v(local(center, face));
      return solid.faces.every(
        ({ normal, indices }) =>
          v(normal).dot(point.clone().sub(v(solid.vertices[indices[0]]))) +
            radius * Math.hypot(normal[width], normal[along]) <=
          epsilon,
      );
    };
    if (!fitsPanel(detail.neutral, detail.face, 0))
      return unresolved(
        "The stationary datum falls outside the retained panel face.",
      );
    const openings = pieceThroughOpenings(panel);
    const otherAxis = openings.some(({ axis }) => axis !== thickness);
    const axes = openingAxes(thickness);
    const rows = holes.map((hole, index) => {
      const [x, y] = hole.center;
      const distance = Math.hypot(x - detail.neutral[0], y - detail.neutral[1]);
      const movement = temperatures
        ? sunliteTemperatureMovement(
            distance,
            Math.max(
              temperatures.hot - temperatures.installation,
              temperatures.installation - temperatures.cold,
            ),
          )
        : null;
      const bitRange =
        movement === null
          ? null
          : {
              minimum: detail.shank + 2 * movement,
              maximum: detail.washer - 2 * (movement + detail.minimumCoverage),
            };
      const shankRoom = (hole.diameter - detail.shank) / 2;
      const cover = (detail.washer - hole.diameter) / 2 - (movement ?? 0);
      const washerRadius = detail.washer / 2 + (movement ?? 0);
      const radius = hole.diameter / 2;
      const conflictsWithCut = openings.some((opening) => {
        if (opening.axis !== thickness) return false;
        const u = Math.abs(opening.center[0] - (axes[0] === width ? x : y));
        const w = Math.abs(opening.center[1] - (axes[1] === along ? y : x));
        if ("diameter" in opening) {
          if (
            Math.hypot(u, w) <= epsilon &&
            Math.abs(opening.diameter - hole.diameter) <= epsilon
          )
            return false;
          return (
            Math.hypot(u, w) < washerRadius + opening.diameter / 2 - epsilon
          );
        }
        return (
          Math.hypot(
            Math.max(0, u - opening.spans[0] / 2),
            Math.max(0, w - opening.spans[1] / 2),
          ) <
          washerRadius - epsilon
        );
      });
      const touching = holes.some(
        (other) =>
          other.id !== hole.id &&
          Math.hypot(other.center[0] - x, other.center[1] - y) <
            Math.max(
              radius + other.diameter / 2,
              washerRadius + other.diameter / 2,
            ) -
              epsilon,
      );
      const receiver = active.get(hole.backingId);
      const movesTogether = !moving.some(
        (group) => group.has(panelId) !== group.has(hole.backingId),
      );
      let backing = false;
      if (receiver && material(receiver.material).wood) {
        try {
          backing = diskInsideWood(
            receiver,
            world(local(hole.center, -detail.face)),
            outward,
            detail.shank / 2,
          );
        } catch {
          // Unavailable geometry cannot provide contact evidence.
        }
      }
      const issues = [
        ...(bitRange && bitRange.minimum > bitRange.maximum + epsilon
          ? [
              "No round bore meets both the movement and gasket-cover requirements. Review the mounting datum or gasket.",
            ]
          : []),
        ...(movement === null
          ? ["Save the sheet temperature range to check movement."]
          : []),
        ...(shankRoom <= epsilon ||
        (movement !== null && shankRoom < movement - epsilon)
          ? [
              `The bore needs more radial clearance for the shank. Available ${length(shankRoom)}.`,
            ]
          : []),
        ...(cover < detail.minimumCoverage - epsilon
          ? [
              `Gasket cover falls short by ${length(detail.minimumCoverage - cover)}.`,
            ]
          : []),
        ...(!fitsPanel(
          hole.center,
          detail.face,
          Math.max(radius, washerRadius),
        ) || !fitsPanel(hole.center, -detail.face, radius)
          ? ["The bore or moving gasket reaches beyond a retained panel edge."]
          : []),
        ...(conflictsWithCut || otherAxis
          ? ["Review clearance from the existing panel openings."]
          : []),
        ...(touching ? ["Review spacing from an adjacent planned hole."] : []),
        ...(!movesTogether
          ? ["The panel and selected backing do not move together."]
          : []),
        ...(!backing
          ? [
              "The shank footprint lacks confirmed contact with the selected wood face.",
            ]
          : []),
      ];
      return {
        hole,
        index,
        movement,
        bitRange,
        shankRoom,
        cover,
        issues,
        point: world(local(hole.center, detail.face)).toArray(),
        outline: Array.from({ length: 24 }, (_, i) => {
          const angle = (i * Math.PI * 2) / 24;
          return world(
            local(
              [x + radius * Math.cos(angle), y + radius * Math.sin(angle)],
              detail.face,
            ),
          ).toArray();
        }),
      };
    });
    return { plan, label, issue: null, rows };
  });
}
export type SunliteMountReview = ReturnType<typeof reviewSunliteMounts>[number];

export function sunliteMountHoleText(
  project: Project,
  row: SunliteMountReview["rows"][number],
) {
  const { hole, index, movement, cover, bitRange } = row;
  const bitText =
    bitRange && bitRange.minimum <= bitRange.maximum
      ? ` Diameter range for movement and cover ${length(bitRange.minimum)} to ${length(bitRange.maximum)}.`
      : "";
  return `Hole ${index + 1} · across ${length(hole.center[0])}, along ${length(hole.center[1])} from panel center · ${length(hole.diameter)} bit · backing ${partLabel(project, hole.backingId)}. ${movement === null ? "" : `Estimated shift ${length(movement)} · remaining gasket cover ${length(cover)}.${bitText} `}${row.issues.length ? row.issues.join(" ") : "Measured geometry checks passed."}`;
}

export function sunliteMountLines(
  project: Project,
  review: SunliteMountReview,
) {
  const { detail } = review.plan;
  const face = detail.face === 1 ? "+" : "−";
  return [
    `${review.label} · ${detail.basis.replace(/[\r\n]+/g, " ")} · ${face} thickness face. Stationary datum from center ${length(detail.neutral[0])} across × ${length(detail.neutral[1])} along. Measured shank ${length(detail.shank)}, effective gasket ${length(detail.washer)}, required cover ${length(detail.minimumCoverage)}.`,
    ...(review.issue
      ? [review.issue]
      : review.rows.length
        ? review.rows.map((row) => sunliteMountHoleText(project, row))
        : ["Add or record drill marks for this panel."]),
  ];
}

export function sunliteMountPurchase(
  project: Project,
  reviews: readonly SunliteMountReview[],
) {
  const ready = reviews.reduce(
    (sum, review) =>
      sum + review.rows.filter(({ issues }) => !issues.length).length,
    0,
  );
  const selected = project.supplies
    .filter(({ productId }) => productId === sunliteFastener.productId)
    .reduce((sum, { quantity }) => sum + quantity, 0);
  return {
    ready,
    selected,
    missing: Math.max(0, Math.ceil(ready / sunliteFastener.pack) - selected),
  };
}
