import { Euler, Quaternion, Vector3 } from "three";
import type { CodeReviewRow } from "./projectCode";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { DryerDuctLayout } from "./dryerExhaustSchema";
import type { Project, V3 } from "./model";
import {
  prepareCollisionBox,
  prepareCollisionSolid,
  solidOverlap,
} from "./solidCollision";

const axes = [0, 1, 2] as const;
export const dryerDuctLayoutScope =
  "Straight runs use square planning envelopes. Check the duct, fitting space, supports and terminal on site. The modeled lengths stay separate from the entered fixed length used in the code comparison.";

export const dryerDuctRunLength = ({
  start,
  end,
}: DryerDuctLayout["runs"][number]) =>
  Math.hypot(...end.map((value, i) => value - start[i]));

export function reviewDryerDuctLayout(
  project: Pick<Project, "pieces">,
  layout: DryerDuctLayout,
) {
  const obstacles = project.pieces
    .filter((piece) => !piece.offcut)
    .map((piece) => {
      try {
        const shape =
          prepareCollisionSolid(piece) ??
          prepareCollisionBox(piece.size, piece.position, piece.rotation);
        return { piece, shape };
      } catch {
        return { piece, shape: null };
      }
    });
  const unreviewed = obstacles
    .filter(({ shape }) => !shape)
    .map(({ piece }) => piece);
  return layout.runs.map((run) => {
    const length = dryerDuctRunLength(run);
    const start = new Vector3(...run.start),
      end = new Vector3(...run.end);
    const direction = end.clone().sub(start).normalize();
    const q = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction,
    );
    const euler = new Euler().setFromQuaternion(q);
    const rotation: V3 = [euler.x, euler.y, euler.z];
    const center = start.clone().lerp(end, 0.5).toArray();
    const size: V3 = [layout.envelopeWidth, length, layout.envelopeWidth];
    const envelope = prepareCollisionBox(size, center, rotation);
    return {
      ...run,
      length,
      center,
      rotation,
      size,
      bounds: envelope.bounds,
      unreviewed,
      hits: obstacles
        .filter(
          ({ shape }) =>
            shape &&
            axes.every(
              (i) =>
                envelope.bounds.min[i] < shape.bounds.max[i] &&
                shape.bounds.min[i] < envelope.bounds.max[i],
            ) &&
            solidOverlap(envelope, shape),
        )
        .map(({ piece }) => piece),
    };
  });
}

type DuctProject = Pick<Project, "pieces"> &
  Partial<Pick<Project, "partLabels">>;
const formatPoint = (point: V3) => point.map(formatPreciseInches).join(" / ");

export function dryerDuctLayoutRows(
  project: DuctProject,
  layout: DryerDuctLayout,
): CodeReviewRow[] {
  const reviewed = reviewDryerDuctLayout(project, layout);
  const labels = new Map(
    project.partLabels?.map(({ partId, label }) => [partId, label]),
  );
  const describe = ({ id, name }: Project["pieces"][number]) =>
    labels.has(id) ? `${labels.get(id)} · ${name}` : name;
  return [
    {
      id: "dryer-duct-layout",
      label: "Dryer duct layout",
      state: "recorded-condition",
      detail: `${reviewed.length} straight ${reviewed.length === 1 ? "run" : "runs"} · ${formatStockLength(reviewed.reduce((total, { length }) => total + length, 0))} modeled · ${formatPreciseInches(layout.envelopeWidth)} envelope width. ${dryerDuctLayoutScope}`,
    },
    ...reviewed.map((run, index): CodeReviewRow => ({
      id: `dryer-duct-run-${index + 1}`,
      label: `Dryer duct run ${index + 1}`,
      state: run.hits.length
        ? "discrepancy"
        : run.unreviewed.length
          ? "needs-input"
          : "recorded-condition",
      detail: [
        `${formatStockLength(run.length)} · X/Y/Z ${formatPoint(run.start)} to ${formatPoint(run.end)}.`,
        run.hits.length
          ? `Envelope overlap with ${run.hits.map(describe).join(", ")}.`
          : "No modeled envelope overlap found.",
        ...(run.unreviewed.length
          ? [
              `Check unresolved shapes for ${run.unreviewed.map(describe).join(", ")}.`,
            ]
          : []),
      ].join(" "),
    })),
  ];
}
