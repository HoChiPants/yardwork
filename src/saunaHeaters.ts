import { formatStockLength } from "./measurement";
import { material, part, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import {
  harviaKit, saunaHeaterProducts, steel6, type SaunaHeaterProductId,
} from "./saunaHeaterReference";
import {
  harviaKitInputSchema,
  saunaHeaterInputSchema,
  type SaunaHeaterPlan,
} from "./saunaHeaterSchema";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { composeRotation, rotate } from "./spatial";
import { addSupply } from "./supplies";
import { saunaBenchReview } from "./saunaBenches";

type Check = {
  label: string;
  state: "within" | "short" | "needs-review";
  detail: string;
};
const inches = (value: number) => formatStockLength(Number(value.toFixed(3)));
const ft3 = (value: number) => `${Number(value.toFixed(2))} ft³`;
const epsilon = 1e-7;
type Box = { size: V3; center: V3 };
type HeaterLayout = { rotation: V3; body: Box; clearance: Box | null };
type HeaterReview = {
  plan: SaunaHeaterPlan;
  room: ReturnType<typeof saunaRooms>[number] | undefined;
  layout: HeaterLayout | null;
  checks: Check[];
  ready: boolean;
};

export function saunaRooms(project: Project) {
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) =>
      entry.spec.type === "structure" && entry.spec.structure.kind === "sauna"
        ? [
            {
              entry,
              title: binding.title,
              parameters: entry.spec.structure.parameters,
            },
          ]
        : [],
    ),
  );
}

export function saveSaunaHeater(
  project: Project,
  roomId: string,
  input: unknown,
) {
  if (!saunaRooms(project).some((room) => room.entry.id === roomId))
    throw Error("Choose a saved sauna room.");
  const plan: SaunaHeaterPlan = input && typeof input === "object" &&
    "productId" in input
    ? { ...harviaKitInputSchema.parse(input), roomId, reference: harviaKit.revision }
    : { ...saunaHeaterInputSchema.parse(input), roomId, productId: steel6.productId, reference: steel6.manualRevision };
  const others = (project.saunaHeaterPlans ?? []).filter(
    (row) => row.roomId !== roomId,
  );
  if (others.length >= 50)
    throw Error("This project can store up to 50 sauna heater plans.");
  return { ...project, saunaHeaterPlans: [...others, plan] };
}

export function removeSaunaHeater(project: Project, roomId: string) {
  return {
    ...project,
    saunaHeaterPlans: (project.saunaHeaterPlans ?? []).filter(
      (row) => row.roomId !== roomId,
    ),
  };
}

export function saunaHeaterReview(project: Project, roomId: string): HeaterReview | null {
  const plan = project.saunaHeaterPlans?.find((row) => row.roomId === roomId);
  const room = saunaRooms(project).find((row) => row.entry.id === roomId);
  if (!plan) return null;
  const reference = plan.productId === harviaKit.productId ? harviaKit.revision : steel6.manualRevision;
  if (!room || plan.reference !== reference) {
    return {
      plan,
      room,
      layout: null,
      ready: false,
      checks: [
        {
          label: "Saved sauna review",
          state: "needs-review",
          detail: room
            ? "Review the current product reference and resave the heater layout."
            : "The original sauna is missing. Open the original room or remove this review.",
        },
      ] satisfies Check[],
    };
  }
  if (plan.productId === harviaKit.productId)
    return reviewHarviaKit(project, plan, room);
  const {
    parameters: p,
    entry: { pose },
  } = room;
  const wh = steel6.width / 2,
    dh = steel6.depth / 2;
  const center = (x: number, y: number, z: number) =>
    rotate([x, y, z], pose.rotation).map((v, i) => v + pose.origin[i]) as V3;
  const keepHeight = steel6.height + steel6.overhead;
  const layout = {
    rotation: pose.rotation,
    body: {
      size: [steel6.width, steel6.height, steel6.depth] as V3,
      center: center(plan.x, steel6.height / 2, plan.z),
    },
    clearance: {
      size: [
        steel6.width + 2 * steel6.lateral,
        keepHeight,
        steel6.depth + 2 * steel6.lateral,
      ] as V3,
      center: center(plan.x, keepHeight / 2, plan.z),
    },
  };
  const compare = (label: string, actual: number, minimum: number): Check => ({
    label,
    state: actual + epsilon >= minimum ? "within" : "short",
    detail: `Modeled ${inches(actual)} · Reference minimum ${inches(minimum)}${actual + epsilon < minimum ? ` · Short by ${inches(minimum - actual)}` : ""}.`,
  });
  const checks: Check[] = [
    compare("Left wall", p.clearWidth / 2 + plan.x - wh, steel6.lateral),
    compare("Right wall", p.clearWidth / 2 - plan.x - wh, steel6.lateral),
    compare("Back wall", p.clearDepth / 2 + plan.z - dh, steel6.lateral),
    compare("Front wall", p.clearDepth / 2 - plan.z - dh, steel6.lateral),
    compare("Above the heater", p.clearHeight - steel6.height, steel6.overhead),
    compare("Finished room height", p.clearHeight, steel6.minimumRoomHeight),
  ];
  const volume = (p.clearWidth * p.clearDepth * p.clearHeight) / 1728;
  const wallArea = ((p.clearWidth + p.clearDepth) * 2 * p.clearHeight) / 144;
  const area = plan.uninsulatedWallArea;
  if (plan.supply === "unknown" || area === null || area > wallArea + epsilon) {
    checks.push({
      label: "Adjusted room volume",
      state: "needs-review",
      detail: `${ft3(volume)} modeled. ${area !== null && area > wallArea + epsilon ? "The entered area is larger than the modeled walls." : "Confirm the supply and enter the area of uninsulated brick, tile and glass."}`,
    });
  } else {
    const adjusted = volume + area * steel6.addedVolumePerSquareFoot;
    const [minimum, maximum] = steel6.range[plan.supply];
    checks.push({
      label: "Adjusted room volume",
      state:
        adjusted >= minimum - epsilon && adjusted <= maximum + epsilon
          ? "within"
          : "short",
      detail: `${ft3(adjusted)} adjusted from ${ft3(volume)} modeled · ${plan.supply} V reference range ${minimum}–${maximum} ft³.`,
    });
  }
  const up = rotate([0, 1, 0], pose.rotation);
  if (up[1] < 1 - epsilon)
    checks.push({
      label: "Floor orientation",
      state: "needs-review",
      detail: "The modeled floor is tilted. Confirm a level mounting location.",
    });
  const benchMin: V3 = [-p.benchWidth / 2, 0, -p.clearDepth / 2];
  const benchMax: V3 = [
    p.benchWidth / 2,
    p.benchHeight,
    -p.clearDepth / 2 + p.benchDepth,
  ];
  const clearanceMin: V3 = [
    plan.x - wh - steel6.lateral,
    0,
    plan.z - dh - steel6.lateral,
  ];
  const clearanceMax: V3 = [
    plan.x + wh + steel6.lateral,
    keepHeight,
    plan.z + dh + steel6.lateral,
  ];
  const selectedBench = saunaBenchReview(project, room.entry);
  const benchFit = selectedBench?.findings.find((finding) => finding.kind === "fit");
  if (benchFit)
    checks.push({ label: "Sauna bench placement", state: "needs-review", detail: benchFit.detail });
  if (!selectedBench &&
    benchMin.every(
      (v, i) =>
        clearanceMax[i] - v > epsilon &&
        benchMax[i] - clearanceMin[i] > epsilon,
    )
  )
    checks.push({
      label: "Reserved bench",
      state: "short",
      detail:
        "The modeled heater clearance overlaps the reserved seating area.",
    });

  const obstruction = obstructionCheck(project, layout.clearance, layout.rotation, "review envelope");
  if (obstruction) checks.push(obstruction);
  return {
    plan,
    room,
    layout,
    checks,
    ready: checks.every((check) => check.state === "within"),
  };
}

function obstructionCheck(
  project: Project,
  box: Box,
  rotation: V3,
  description: string,
): Check | null {
  const probe = part(
    "Heater clearance",
    "plywood",
    box.size,
    box.center,
    project.steps[0].id,
    "Sauna",
  );
  const solid = prepareCollisionSolid({ ...probe, rotation })!;
  const blocked: string[] = [];
  for (const piece of project.pieces) {
    if (piece.offcut) continue;
    const prepared = prepareCollisionSolid(piece);
    // Use a conservative envelope for unmodeled fittings and nonwood solids.
    const possible =
      prepared ??
      prepareCollisionSolid({ ...piece, material: "plywood", cutPlanes: [] });
    if (possible && solidOverlap(solid, possible))
      blocked.push(
        `${partLabel(project, piece.id)} · ${piece.name}${prepared?.kind === "solid" && material(piece.material).wood ? "" : " (envelope)"}`,
      );
  }
  return blocked.length
    ? {
      label: "Other modeled parts",
      state: "short",
      detail: `The modeled ${description} overlaps ${blocked.slice(0, 5).join(", ")}${blocked.length > 5 ? ` and ${blocked.length - 5} more` : ""}.`,
    }
    : null;
}

function reviewHarviaKit(
  project: Project,
  plan: Extract<SaunaHeaterPlan, { productId: typeof harviaKit.productId }>,
  room: NonNullable<HeaterReview["room"]>,
): HeaterReview {
  const { clearWidth, clearDepth, clearHeight, doorWidth, doorHeight, benchWidth, benchDepth, benchHeight } = room.parameters;
  const { origin, rotation } = room.entry.pose;
  const { width, depth, height, volume: [minimum, maximum] } = harviaKit;
  const { wall, offset, bottom, supply, uninsulatedWallArea: area } = plan;
  const sideWall = wall === "left" || wall === "right";
  const wallPosition = (sideWall ? clearWidth : clearDepth) / 2 - depth / 2;
  const wallCenter = wall === "left" || wall === "back" ? -wallPosition : wallPosition;
  const center: V3 = sideWall ? [wallCenter, bottom + height / 2, offset] : [offset, bottom + height / 2, wallCenter];
  const footprint: V3 = sideWall ? [depth, height, width] : [width, height, depth];
  const body: Box = {
    size: [width, height, depth],
    center: rotate(center, rotation).map((value, i) => value + origin[i]) as V3,
  };
  const layout: HeaterLayout = {
    body,
    clearance: null,
    rotation: sideWall ? composeRotation(rotation, [0, Math.PI / 2, 0]) : rotation,
  };
  const wallSpan = sideWall ? clearDepth : clearWidth;
  const perpendicularSpan = sideWall ? clearWidth : clearDepth;
  const endGap = (wallSpan - width) / 2 - Math.abs(offset);
  const topGap = clearHeight - bottom - height;
  const bodyFits = Math.min(endGap, topGap, perpendicularSpan - depth) >= -epsilon;
  const modeledVolume = (clearWidth * clearDepth * clearHeight) / 1728;
  const totalWallArea = ((clearWidth + clearDepth) * 2 * clearHeight) / 144;
  const roomSizeState = modeledVolume > maximum + epsilon ? "short"
    : area !== 0 ? "needs-review"
    : modeledVolume < minimum - epsilon ? "short" : "within";
  const checks: Check[] = [
    {
      label: "Listed heater body",
      state: bodyFits ? "within" : "short",
      detail: `${wall[0].toUpperCase() + wall.slice(1)} wall · ${inches(bottom)} above the floor · ${inches(endGap)} to the nearest side edge · ${inches(topGap)} above the body.${bodyFits ? "" : " The body extends outside the finished room."}`,
    },
    {
      label: "Room size screening",
      state: roomSizeState,
      detail: `${ft3(modeledVolume)} finished room · ALEKO published bundle range ${minimum}–${maximum} ft³.${area === null ? " Enter 0 when the finished surfaces need no adjustment." : area > totalWallArea + epsilon ? " The entered area is larger than the modeled walls." : area > 0 ? " Ask the installer for the adjusted volume for these surfaces." : ""}`,
    },
    {
      label: "Supply screening",
      state: supply === "240" ? "within" : supply === "208" ? "short" : "needs-review",
      detail: "ALEKO publishes 220–240 V for its 6 kW bundle. Verify the exact nameplate, controls and circuit with the installer.",
    },
  ];
  const overlaps = (min: V3, max: V3) => min.every((low, i) =>
    center[i] + footprint[i] / 2 > low + epsilon &&
    center[i] - footprint[i] / 2 < max[i] - epsilon);
  if (overlaps([-doorWidth / 2, 0, clearDepth / 2 - Math.min(doorWidth, clearDepth)], [doorWidth / 2, Math.min(doorHeight, clearHeight), clearDepth / 2]))
    checks.push({ label: "Doorway approach", state: "short", detail: "The listed body overlaps the immediate interior doorway approach." });
  if (!saunaBenchReview(project, room.entry) &&
      overlaps([-benchWidth / 2, 0, -clearDepth / 2], [benchWidth / 2, benchHeight, -clearDepth / 2 + benchDepth]))
    checks.push({ label: "Reserved bench", state: "short", detail: "The listed body overlaps the reserved bench footprint." });
  const obstruction = obstructionCheck(project, body, layout.rotation, "listed body");
  if (obstruction) checks.push(obstruction);
  checks.push({
    label: "Installation review",
    state: "needs-review",
    detail: harviaKit.installationReview,
  });
  return {
    plan,
    room,
    layout,
    checks,
    ready: false,
  };
}
export type SaunaHeaterReview = NonNullable<
  ReturnType<typeof saunaHeaterReview>
>;

export const saunaHeaterScope =
  "This is a modeled equipment review. Verify the finished room, delivered nameplate and hardware, stone load, guard and egress, ventilation, mounting and electrical installation with the appropriate trades.";

export function saunaHeaterPurchases(project: Project, productId: SaunaHeaterProductId = steel6.productId) {
  const needed = (project.saunaHeaterPlans ?? []).filter((plan) => {
    if (plan.productId !== productId) return false;
    const review = saunaHeaterReview(project, plan.roomId);
    return productId === harviaKit.productId
      ? !!review?.layout && !review.checks.some((check) => check.state === "short")
      : review?.ready;
  }).length;
  const selected = project.supplies.reduce(
    (sum, supply) =>
      sum + (supply.productId === productId ? supply.quantity : 0),
    0,
  );
  return { needed, selected, missing: Math.max(0, needed - selected) };
}

export function addMissingSaunaHeaters(project: Project, productId: SaunaHeaterProductId = steel6.productId) {
  const { missing } = saunaHeaterPurchases(project, productId);
  return missing
    ? addSupply(
        project,
        productId,
        missing,
        productId === harviaKit.productId ? "Sauna heater candidate" : "Sauna heater layout review",
        productId === harviaKit.productId ? harviaKit.installationReview : saunaHeaterScope,
      )
    : project;
}

export function saunaHeaterGuideLines(project: Project) {
  return (project.saunaHeaterPlans ?? []).flatMap((plan) => {
    const review = saunaHeaterReview(project, plan.roomId)!;
    const product = saunaHeaterProducts.find((item) => item.productId === plan.productId)!;
    return [
      `${review.room?.title ?? "Saved sauna"} · ${product.title} · ${product.packageModel}.`,
      ...review.checks.map(
        (check) =>
          `${check.label} · ${check.state === "within" ? "Modeled range" : "Review"} · ${check.detail}`,
      ),
      ...(plan.notes
        ? [`Project notes · ${plan.notes.replace(/[\r\n]/g, " ")}`]
        : []),
    ];
  });
}
export function saunaHeaterGuideSources(project: Project) {
  const ids = new Set(project.saunaHeaterPlans?.map((plan) => plan.productId));
  return [
    ...(ids.has(harviaKit.productId) ? [
      { label: "Home Depot Harvia package listing", url: harviaKit.listing },
      { label: "ALEKO bundle specifications", url: harviaKit.supplier },
    ] : []),
    ...(ids.has(steel6.productId) ? [
      { label: "HUUM U.S. manual, pages 4–6 and 9", url: steel6.manual },
      { label: "Marketplace package reference", url: steel6.listing },
    ] : []),
  ];
}
export function saunaHeaterMarkdown(project: Project) {
  const lines = saunaHeaterGuideLines(project);
  if (!lines.length) return "";
  return [
    "",
    "",
    "## Sauna heater layout review",
    "",
    saunaHeaterScope,
    "",
    ...lines.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&")),
    "",
    saunaHeaterGuideSources(project).map(({ label, url }) => `[${label}](${url})`).join(" · "),
  ].join("\n");
}
