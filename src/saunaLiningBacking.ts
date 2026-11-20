import { Vector3 } from "three";
import {
  prepareGlazingBacking,
  projectedBackingIntervals,
} from "./glazingBacking";
import { formatPreciseInches } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { paslodeFinishNailer, paslodeFinishNails } from "./paslodeFinishReference";
import { cedarbrookLining } from "./saunaLiningReference";
import { rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";

const surfaces = [
  { role: "wall-lining", label: "Walls" },
  { role: "ceiling-lining", label: "Ceiling" },
] as const;
const epsilon = 1e-7;
const searchDepth = 1.25;

export const saunaLiningSources = [
  [
    "Cedarbrook lining instructions",
    "https://cedarbrooksauna.com/how-should-i-add-my-cedar-paneling-to-the-sauna-ceiling-and-walls/",
  ],
  [
    "Cedarbrook finish nail guidance",
    "https://cedarbrooksauna.com/what-nails-should-i-use-for-tongue-and-groove-panel-boards/",
  ],
  [
    "Paslode 650282 galvanized finish nails at Home Depot",
    paslodeFinishNails.listing,
  ],
  [
    "Paslode 515500 pneumatic finish nailer at Home Depot",
    paslodeFinishNailer.listing,
  ],
  [
    "Paslode fastener and nailer compatibility",
    paslodeFinishNails.specification,
  ],
] as const;
export const saunaLiningScope =
  "This checks modeled wood behind the centerline and ends of each cedar course, within 1¼ in of its back face. Verify the actual tongue, nail angle and embedment, end-joint backing, clearance from services and any layers between cedar and framing before fastening.";
export const saunaLiningTools =
  "Cedarbrook lists 1¼ in galvanized finish nails for its tongue-and-groove lining. Paslode lists the 16-ga straight 650282 nails (2,000 per box) for its 515500 nailer, which requires a compressor and hose. Confirm the chosen fastener for the actual layer stack and check store availability before buying.";

function boardLine(piece: Piece, roomOrigin: V3, up: V3, ceiling: boolean) {
  if (piece.cutPlanes?.length || pieceThroughOpenings(piece).length)
    return null;
  const towardBacking = ceiling
    ? new Vector3(...up)
    : new Vector3(...piece.position)
        .sub(new Vector3(...roomOrigin))
        .projectOnPlane(new Vector3(...up));
  const direction = new Vector3(...rotate([0, 0, 1], piece.rotation));
  const alignment = direction.dot(towardBacking);
  if (Math.abs(alignment) <= epsilon) return null;
  direction.multiplyScalar(Math.sign(alignment));
  const center = new Vector3(...piece.position).addScaledVector(
    direction,
    piece.size[2] / 2,
  );
  const half = new Vector3(
    ...rotate([piece.size[0] / 2, 0, 0], piece.rotation),
  );
  return {
    direction: direction.toArray(),
    segment: [
      center.clone().sub(half).toArray(),
      center.add(half).toArray(),
    ] as [V3, V3],
  };
}

export function saunaLiningBacking(project: Project) {
  const rooms = project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) =>
      entry.spec.type === "structure" &&
      entry.spec.structure.kind === "sauna" &&
      entry.spec.structure.selections.saunaInterior?.materialId ===
        cedarbrookLining.materialId
        ? [{ title: binding.title, entry }]
        : [],
    ),
  );
  if (!rooms.length) return [];
  const active = project.pieces.filter((piece) => !piece.offcut);
  const pieces = new Map(active.map((piece) => [piece.id, piece]));
  const sections = new Map(
    project.sections.map((section) => [section.id, section.pieceIds]),
  );
  const backing = prepareGlazingBacking(
    active.filter(
      (piece) =>
        piece.material !== cedarbrookLining.materialId &&
        material(piece.material)?.wood,
    ),
  );
  return rooms.flatMap(({ title, entry }) =>
    surfaces.flatMap(({ role, label }) => {
      const ids = new Set(
        entry.sections
          .filter((mapping) => mapping.role === role)
          .flatMap(({ sectionId }) => sections.get(sectionId) ?? []),
      );
      const courseIds = [...ids].filter(
        (id) => pieces.get(id)?.material === cedarbrookLining.materialId,
      );
      if (!courseIds.length) return [];
      const up = rotate([0, 1, 0], entry.pose.rotation);
      const missing: string[] = [];
      const separated: string[] = [];
      const ends: string[] = [];
      const shaped: string[] = [];
      let minGap = Infinity;
      for (const id of courseIds) {
        const line = boardLine(
          pieces.get(id)!,
          entry.pose.origin,
          up,
          role === "ceiling-lining",
        );
        if (!line) {
          shaped.push(id);
          continue;
        }
        const hits = projectedBackingIntervals(
          backing,
          line.segment,
          line.direction,
          searchDepth,
        );
        if (!hits.length) {
          missing.push(id);
          continue;
        }
        const closest = Math.min(...hits.map(({ gap }) => gap));
        if (closest > 0) {
          separated.push(id);
          minGap = Math.min(minGap, closest);
        }
        if (
          !hits.some(({ from }) => from <= epsilon) ||
          !hits.some(({ to }) => to >= 1 - epsilon)
        )
          ends.push(id);
      }
      return [
        {
          id: `${entry.id}-${role}`,
          title,
          label,
          count: courseIds.length,
          missing,
          separated,
          minGap,
          ends,
          shaped,
        },
      ];
    }),
  );
}

type LiningReview = ReturnType<typeof saunaLiningBacking>[number];

export function liningBackingText(review: LiningReview) {
  return [
    `${review.count} cedar ${review.count === 1 ? "piece" : "pieces"}`,
    ...(review.missing.length
      ? [`${review.missing.length} with no nearby wood behind the centerline`]
      : []),
    ...(review.separated.length
      ? [
          `${review.separated.length} separated from all nearby backing (closest gap ${formatPreciseInches(review.minGap)})`,
        ]
      : []),
    ...(review.ends.length
      ? [`${review.ends.length} with an end outside nearby backing`]
      : []),
    ...(review.shaped.length
      ? [
          `${review.shaped.length} needing manual review for cut shape or orientation`,
        ]
      : []),
  ].join(" · ");
}

export function saunaLiningGuideLines(project: Project) {
  return saunaLiningBacking(project).flatMap((review) => {
    const affected = [
      ...new Set([
        ...review.missing,
        ...review.separated,
        ...review.ends,
        ...review.shaped,
      ]),
    ];
    const example = affected.length
      ? ` Review ${partLabel(project, affected[0])} in Checks.`
      : "";
    return [
      `${review.title} · ${review.label} · ${liningBackingText(review)}.${example}`,
    ];
  });
}
