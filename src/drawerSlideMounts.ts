import { attachmentGeometryFingerprint } from "./attachments";
import { drawerRailScrew } from "./drawerRailScrewReference";
import {
  drawerSlideFrame,
  drawerSlideKey,
  drawerSlidePurchaseReview,
  rectangularDrawerPanelBounds,
  reviewDrawerSlide,
} from "./drawerSlides";
import { drawerSlideMountInputSchema, drawerSlideMountSchema, type DrawerSlideMount } from "./drawerSlideMountSchema";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches as inches } from "./measurement";
import type { Project, V3 } from "./model";
import { drawerSideLabels, type MotionPlan } from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import { purchaseCount } from "./purchaseUnits";
import { reviewSocketPlateFace, reviewWoodMountHoles, socketFaceAxes, type BackplateExtents } from "./rodMountGeometry";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap, type CollisionSolid } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

const epsilon = 1e-7;
const xyz = ["X", "Y", "Z"] as const;
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const plus = (a: V3, b: V3) => a.map((n, i) => n + b[i]) as V3;
const minus = (a: V3, b: V3) => a.map((n, i) => n - b[i]) as V3;
export const drawerRailRoles = { cabinet: "Cabinet rail", drawer: "Drawer rail" } as const;
export type DrawerRailRole = keyof typeof drawerRailRoles;
const railTypes = ["cabinet", "drawer"] as const;
const roles = [
  { key: "cabinetLeft", type: "cabinet", normalSign: 1, right: false },
  { key: "cabinetRight", type: "cabinet", normalSign: -1, right: true },
  { key: "drawerLeft", type: "drawer", normalSign: -1, right: false },
  { key: "drawerRight", type: "drawer", normalSign: 1, right: true },
] as const;
export const drawerMountScope =
  "Check the delivered rails, slot and final round-hole choices, screw engagement and tool access before drilling. This review checks the measured layout with the drawer closed.";

function mountingLayout(project: Project, plan: MotionPlan | undefined) {
  const fit = plan && reviewDrawerSlide(project, plan, true);
  if (!plan || plan.mechanism.kind !== "slide" || !fit?.ready)
    throw Error(fit?.rows.find((row) => !row.matches)?.detail ?? "Choose a saved side-mount drawer slide setup.");
  const active = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const anchor = active.get(plan.memberIds[0])!;
  const axis = rotate(plan.mechanism.axis, anchor.rotation);
  const frame = drawerSlideFrame(axis);
  const mounts = roles.map((role) => {
    const piece = active.get(fit.setup[role.key])!;
    const limits = rectangularDrawerPanelBounds(piece, frame, true)!;
    return { ...role, piece, limits };
  });
  const inverse = inverseRotation(anchor.rotation);
  const direction = (point: V3) => rotate(point, inverse);
  const layoutKey = bindingHash({
    product: fit.reference.productId,
    direction: plan.mechanism.axis,
    panels: mounts.map(({ piece }) => ({
      id: piece.id,
      shape: attachmentGeometryFingerprint(piece),
      position: direction(minus(piece.position, anchor.position)),
      orientation: ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as V3[]).map((basis) =>
        direction(rotate(basis, piece.rotation))),
    })),
  });
  const datum = {
    front: Math.min(...mounts.map(({ limits }) => limits[2].max)),
    bottom: Math.max(...mounts.map(({ limits }) => limits[1].min)),
  };
  return { axes: frame, mounts, datum, reference: fit.reference, layoutKey };
}

function reviewLayout(project: Project, mount: DrawerSlideMount, layout: ReturnType<typeof mountingLayout>) {
  const [rightAxis, up, frontAxis] = layout.axes;
  const rotation: V3 = [0, Math.atan2(frontAxis[0], frontAxis[2]), 0];
  const point = (x: number, y: number, z: number) => [
    x * rightAxis[0] + z * frontAxis[0],
    y,
    x * rightAxis[2] + z * frontAxis[2],
  ] as V3;
  const cabinetSpan = [mount.cabinet.centerOffset - mount.cabinet.height / 2, mount.cabinet.centerOffset + mount.cabinet.height / 2];
  const drawerSpan = [mount.drawer.centerOffset - mount.drawer.height / 2, mount.drawer.centerOffset + mount.drawer.height / 2];
  const alignmentIssues = [
    ...(mount.drawer.setback < mount.cabinet.setback - epsilon
      ? ["The drawer rails lead the cabinet rails in the closed setup. Check the measured front positions."] : []),
    ...(Math.min(cabinetSpan[1], drawerSpan[1]) - Math.max(cabinetSpan[0], drawerSpan[0]) <= epsilon
      ? ["The cabinet and drawer rail heights do not overlap in the closed setup."] : []),
  ];
  const fixedCenter = layout.datum.bottom + mount.centerHeight;
  const solids = new Map<string, CollisionSolid>();
  const rails = layout.mounts.map(({ key, type, piece, normalSign, limits, right }) => {
    const measured = mount[type];
    const x = normalSign > 0 ? limits[0].max : limits[0].min;
    const y = fixedCenter + measured.centerOffset;
    const front = layout.datum.front - measured.setback;
    const center = point(x, y, front - measured.length / 2);
    const inv = inverseRotation(piece.rotation);
    const pointLocal = rotate(minus(center, piece.position), inv);
    const normalLocal = rotate(rightAxis.map((n) => n * normalSign) as V3, inv);
    const frontLocal = rotate(frontAxis, inv);
    const upLocal = rotate(up, inv);
    const face = socketFaceAxes(normalLocal);
    if (!face) throw Error("The selected rail requires a flat mounting face.");
    const [u, v] = face.across;
    const extents = [u, u, v, v].map((i) =>
      (Math.abs(frontLocal[i]) > 0.5 ? measured.length : measured.height) / 2) as BackplateExtents;
    const footprint = reviewSocketPlateFace(piece, pointLocal, normalLocal, extents)!;
    const railSize: V3 = [layout.reference.minSideGap, measured.height, measured.length];
    const railCenter = point(x + normalSign * layout.reference.minSideGap / 2, y, front - measured.length / 2);
    const railSpace = prepareCollisionBox(railSize, railCenter, rotation);
    const railRadius = Math.hypot(...railSize) / 2;
    const blockers = project.pieces.flatMap((other) => {
      if (other.id === piece.id || other.offcut ||
          Math.hypot(...minus(other.position, railCenter)) > railRadius + Math.hypot(...other.size) / 2)
        return [];
      const solid = solids.get(other.id) ?? prepareCollisionSolid(other) ??
        prepareCollisionBox(other.size, other.position, other.rotation);
      solids.set(other.id, solid);
      return solidOverlap(railSpace, solid, epsilon) ? [partLabel(project, other.id)] : [];
    });
    const catalogFastener = measured.fasteners?.source === drawerRailScrew.id ? measured.fasteners : undefined;
    const nominalPenetration = catalogFastener ? drawerRailScrew.nominalLength - catalogFastener.seatToWood : 0;
    const issues = [
      ...alignmentIssues,
      ...(catalogFastener && nominalPenetration <= epsilon
        ? ["The listed ½ in screw does not reach wood through the entered thickness under its head."] : []),
      ...(footprint.crossesEdge ? ["Rail footprint extends past retained wood."] : []),
      ...(footprint.crossesVoid ? ["Rail footprint crosses a through-cut."] : []),
      ...(blockers.length ? [`Closed rail space meets ${blockers.join(", ")}.`] : []),
    ];
    const holes = reviewWoodMountHoles(piece, { pointLocal, normalLocal }, extents, {
      ...measured,
      screwDepth: Math.max(measured.screwDepth, nominalPenetration),
      basis: "Transferred from the delivered Accuride rail",
      centers: (right ? measured.rightCenters ?? measured.centers : measured.centers).map(([back, rise]) => [
        (measured.length / 2 - back) * frontLocal[u] + rise * upLocal[u],
        (measured.length / 2 - back) * frontLocal[v] + rise * upLocal[v],
      ]),
    }, !issues.length);
    return {
      key, type, piece, issues, holes, center,
      face: `${normalLocal[face.axis] < 0 ? "−" : "+"}${xyz[face.axis]}`,
      frontEdge: limits[2].max,
      bottomEdge: limits[1].min,
      frontAxis,
      outline: footprint.corners.map((corner) => plus(rotate(corner, piece.rotation), piece.position)),
    };
  });
  return {
    state: rails.every(({ holes }) => holes.state === "checked") ? "checked" as const : "conflict" as const,
    rails,
  };
}

export function reviewDrawerSlideMount(project: Project, mount: DrawerSlideMount) {
  try {
    const layout = mountingLayout(project, project.motionPlans?.find(({ id }) => id === mount.motionId));
    if (mount.layoutKey !== layout.layoutKey)
      throw Error("The closed drawer setup or mounting wood changed. Transfer the measurements again.");
    const result = reviewLayout(project, mount, layout);
    return {
      ...result,
      detail: result.state === "checked"
        ? "All four rails and the measured mounting paths fit the model."
        : "Resolve flagged rail footprints and screw paths before transferring marks.",
    };
  } catch (issue) {
    return {
      state: "stale" as const,
      rails: [],
      detail: issue instanceof Error ? issue.message : "Review the closed mounting layout.",
    };
  }
}

export function saveDrawerSlideMount(project: Project, motionId: string, raw: unknown) {
  const draft = drawerSlideMountInputSchema.parse(raw);
  const layout = mountingLayout(project, project.motionPlans?.find(({ id }) => id === motionId));
  const stored = drawerSlideMountSchema.parse({ ...draft, motionId, layoutKey: layout.layoutKey });
  const others = (project.drawerSlideMounts ?? []).filter((row) => row.motionId !== motionId);
  if (others.length >= 50) throw Error("This project has 50 saved drawer mounting layouts.");
  return { ...project, drawerSlideMounts: [...others, stored] };
}

export function clearDrawerSlideMount(project: Project, motionId: string): Project {
  if (!project.drawerSlideMounts?.some((row) => row.motionId === motionId)) return project;
  return { ...project, drawerSlideMounts: project.drawerSlideMounts.filter((row) => row.motionId !== motionId) };
}

type MountReview = ReturnType<typeof reviewDrawerSlideMount>;

export function drawerRailFastenerRows(mount: DrawerSlideMount, review: MountReview) {
  return railTypes.flatMap((role) => {
    const fasteners = mount[role].fasteners;
    if (!fasteners) return [];
    const label = `${drawerRailRoles[role]} screws`;
    const count = review.state === "checked"
      ? review.rails.filter((rail) => rail.type === role).reduce((total, rail) => total + rail.holes.marks.length, 0)
      : null;
    const buying = fasteners.source === drawerRailScrew.id;
    const source = fasteners.source === "included" ? "from the delivered slide package" : "already on hand";
    const detail = count === null ? "Check mounting geometry before counting screws."
      : buying ? `${count} for both sides · Everbilt model ${drawerRailScrew.model} · nominal ½ in, with ${inches(fasteners.seatToWood)} under the head before wood. Confirm seating, engagement and clearance on the delivered rail.`
      : `${count} for both sides · ${fasteners.available} compatible screws ${source} allocated${fasteners.available < count ? ` · ${count - fasteners.available} still needed` : ""}.`;
    return [{ role, label, fasteners, count, detail }];
  });
}

export function drawerRailScrewPurchase(project: Project) {
  const conflictingSlides = new Set(drawerSlidePurchaseReview(project).conflicts.map(({ key }) => key));
  const groups = new Map<string, Array<{ signature: string; count: number | null; buying: boolean }>>();
  for (const mount of project.drawerSlideMounts ?? []) {
    const mechanism = project.motionPlans?.find(({ id }) => id === mount.motionId)?.mechanism;
    if (mechanism?.kind !== "slide" || !mechanism.drawerSlide) continue;
    const key = drawerSlideKey(mechanism.drawerSlide);
    const review = reviewDrawerSlideMount(project, mount);
    for (const { role, fasteners, count } of drawerRailFastenerRows(mount, review)) {
      const groupKey = `${key}/${role}`;
      const entries = groups.get(groupKey) ?? [];
      const buying = fasteners.source === drawerRailScrew.id;
      entries.push({
        signature: JSON.stringify([mechanism.drawerSlide.productId, fasteners, count]),
        count: conflictingSlides.has(key) ? null : count,
        buying,
      });
      groups.set(groupKey, entries);
    }
  }
  let count = 0;
  for (const entries of groups.values()) {
    if (!entries.some((entry) => entry.buying)) continue;
    const [first] = entries;
    if (first.count === null || entries.some((entry) => entry.count === null || entry.signature !== first.signature))
      return { required: null, screws: null, issue: "Resolve unchecked or competing drawer rail screw choices before adding the pack." };
    count += first.count;
  }
  return { required: purchaseCount(count, drawerRailScrew.count).quantity, screws: count };
}

export function drawerSlideMountGuideLines(project: Project, motionId: string) {
  const mount = project.drawerSlideMounts?.find((row) => row.motionId === motionId);
  if (!mount) return [];
  const review = reviewDrawerSlideMount(project, mount);
  return [
    `Drawer rail mounting · ${review.detail}`,
    ...review.rails.flatMap(({ key, piece, issues, holes, face, frontEdge, bottomEdge, frontAxis }) => {
      const title = `${drawerSideLabels[key]} · ${partLabel(project, piece.id)}`;
      if (review.state !== "checked") {
        const concerns = [...new Set([...issues, ...holes.marks.flatMap((mark) => mark.issues)])];
        return concerns.length ? [`${title} · ${concerns.join(" ")}`] : [];
      }
      const dimensions = key.startsWith("cabinet") ? mount.cabinet : mount.drawer;
      return [
        `${title} · ${face} face · pilot Ø ${inches(dimensions.pilotDiameter)}, ${inches(dimensions.pilotDepth)} to tip · seated screw Ø ${inches(dimensions.screwDiameter)}, ${inches(dimensions.screwDepth)} into wood.`,
        ...holes.marks.map(({ index, line: [entry] }) =>
          `${title} hole ${index} · ${inches(frontEdge - dot(entry, frontAxis))} back from the panel blank's front · ${inches(entry[1] - bottomEdge)} up from the blank's bottom.`),
      ];
    }),
    ...drawerRailFastenerRows(mount, review).map(({ label, detail }) => `${label} · ${detail}`),
    drawerMountScope,
  ];
}
