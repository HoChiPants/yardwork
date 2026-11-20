import {
  concreteAnchor,
  concreteAnchorLayoutReference,
} from "./concreteAnchorReference";
import { retainedWoodFaces } from "./connectionContacts";
import type { greenhouseBaseEntries } from "./greenhouseBaseConnections";
import type { GreenhouseFoundation } from "./greenhouseFoundationSchema";
import { formatPreciseInches as length } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";

import { pieceThroughOpenings } from "./throughOpenings";

const epsilon = 1e-6;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
type Base = ReturnType<typeof greenhouseBaseEntries>[number];
type Layout = NonNullable<GreenhouseFoundation["anchors"]>;

function railAtMark(piece: Piece, point: V3) {
  if (!material(piece.material).wood)
    return { issue: "The selected rail is not modeled as wood." } as const;
  if (pieceThroughOpenings(piece).length)
    return {
      issue: "Review the drill path around the rail’s existing openings.",
    } as const;
  try {
    let top = Infinity,
      bottom = -Infinity;
    let levelTop = false;
    for (const { normal, points } of retainedWoodFaces(piece)) {
      // Tighten each retained face by the radius of the vertical drill cross-section.
      const boundary =
        dot(normal, points[0]) -
        dot(normal, point) -
        (concreteAnchor.bitDiameter / 2) * Math.hypot(normal[0], normal[2]);
      if (normal[1] > epsilon) {
        const limit = boundary / normal[1];
        if (limit < top - epsilon) {
          top = limit;
          levelTop = Math.hypot(normal[0], normal[2]) <= epsilon;
        }
      } else if (normal[1] < -epsilon)
        bottom = Math.max(bottom, boundary / normal[1]);
      else if (boundary < -epsilon)
        return {
          issue: "The drill circle crosses or misses the retained rail.",
        } as const;
    }
    if (
      !Number.isFinite(top) ||
      !Number.isFinite(bottom) ||
      top <= bottom + epsilon
    )
      return { issue: "The drill circle misses the retained rail." } as const;
    if (Math.abs(bottom) > epsilon)
      return {
        issue: "The selected rail does not seat at this mark on the slab top.",
      } as const;
    if (!levelTop)
      return {
        issue:
          "The drill circle needs a level rail top for this fixture stack check.",
      } as const;
    return { woodDepth: top, issue: null } as const;
  } catch {
    return { issue: "Retained rail geometry is unavailable." } as const;
  }
}

export function reviewGreenhouseAnchors(
  site: GreenhouseFoundation,
  base?: Base,
) {
  const layout = site.anchors;
  if (!layout) return null;
  const rails = new Map(
    [...(base?.rails.values() ?? [])].map((rail) => [rail.id, rail]),
  );
  const bore = layout.embedment + concreteAnchor.overdrill;
  const installation = concreteAnchorLayoutReference.nominalEmbedments.find(
    ({ length }) => Math.abs(layout.embedment - length) < epsilon,
  );
  const rows = layout.locations.map((mark, index) => {
    const edge = Math.min(
      site.width / 2 - Math.abs(mark.x - site.centerX),
      site.depth / 2 - Math.abs(mark.z - site.centerZ),
    );
    const nearest = Math.min(
      ...layout.locations
        .filter((other) => other.id !== mark.id)
        .map((other) => Math.hypot(other.x - mark.x, other.z - mark.z)),
    );
    const point: V3 = [mark.x, site.topY, mark.z];
    const rail = rails.get(mark.railId);
    const seat = rail
      ? railAtMark(rail, point)
      : {
          issue: "The selected base rail is unavailable.",
          woodDepth: undefined,
        };
    const matchesReferenceLayout =
      concreteAnchorLayoutReference.spacingAlternatives.some(
        (requirement) =>
          edge >= requirement.edge - epsilon &&
          nearest >= requirement.spacing - epsilon,
      );
    const reach =
      seat.woodDepth === undefined
        ? null
        : layout.anchorLength - seat.woodDepth - layout.fixtureStack;
    const issues = [
      ...(!installation
        ? [
            "This nominal embedment is outside the reviewed ½ in concrete installation table. Review the specified reference.",
          ]
        : []),
      ...(installation && layout.thickness < installation.minimumSlab - epsilon
        ? [
            `The reviewed installation table calls for at least ${length(installation.minimumSlab)} of concrete for this nominal embedment.`,
          ]
        : []),
      ...(!matchesReferenceLayout
        ? [
            "The measured edge distance and spacing miss both reviewed combinations in the concrete installation table.",
          ]
        : []),
      ...(edge < concreteAnchor.bitDiameter / 2 - epsilon
        ? ["The drill circle crosses or misses the slab."]
        : []),
      ...(edge < layout.edge - epsilon
        ? [`Center-to-edge needs ${length(layout.edge - edge)} more.`]
        : []),
      ...(nearest < layout.spacing - epsilon
        ? [`Anchor spacing needs ${length(layout.spacing - nearest)} more.`]
        : []),
      ...(bore >= layout.thickness - epsilon
        ? ["The target bore reaches or passes the bottom of the measured slab."]
        : []),
      ...(seat.issue ? [seat.issue] : []),
      ...(reach === null || Math.abs(reach - layout.embedment) <= epsilon
        ? []
        : [
            `The measured anchor and modeled stack leave ${length(Math.max(0, reach))} into concrete. Review the ${length(layout.embedment)} specified nominal embedment.`,
          ]),
    ];
    return {
      mark,
      point,
      index,
      bore,
      edge,
      nearest,
      reach,
      issues,
    };
  });
  return { layout, bore, rows };
}

type Row = NonNullable<
  ReturnType<typeof reviewGreenhouseAnchors>
>["rows"][number];

export function anchorMarkText(project: Project, row: Row) {
  const { mark, index, edge, nearest, reach, issues } = row;
  const spacing = Number.isFinite(nearest)
    ? `, nearest center ${length(nearest)}`
    : "";
  return `Anchor ${index + 1} · ${partLabel(project, mark.railId)} · X ${length(mark.x)}, Z ${length(mark.z)} · signed edge distance ${length(edge)}${spacing}${reach === null ? "" : `, projection ${length(Math.max(0, reach))}`}. ${issues.length ? issues.join(" ") : "Measured layout checks passed."}`;
}

export function anchorLayoutText(layout: Layout, bore: number) {
  return `Detail ${layout.detail.replace(/[\r\n]+/g, " ")}. Slab ${length(layout.thickness)}, specified nominal embedment ${length(layout.embedment)}, under-head length ${length(layout.anchorLength)}, fixture and washer stack ${length(layout.fixtureStack)}, minimum center-to-edge ${length(layout.edge)}, minimum center spacing ${length(layout.spacing)}. Concrete bore target ${length(bore)} below slab top, with a ${length(concreteAnchor.bitDiameter)} carbide bit and ${length(concreteAnchor.wrenchSize)} hex wrench.`;
}
