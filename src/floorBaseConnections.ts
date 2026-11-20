import { reviewConnectionContact } from "./connectionContacts";
import type { ConnectionIntent } from "./connectionCoverage";
import { floorBaseJoistCenters, floorBaseRoles } from "./homeDepotTreatedLumber";
import { formatStockLength } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";

const sides = ["back", "front"] as const;
const tolerance = 1e-6;
const pairKey = (a: string, b: string) => [a, b].sort().join("/");
export const floorBaseConnectionScope =
  "Check both ends of each joist, connector backing and tool access. Spans, loads and foundation support require separate review.";

function rimEndRoom(joist: Piece, rim: Piece) {
  if (joist.cutPlanes.length || rim.cutPlanes.length || pieceThroughOpenings(joist).length || pieceThroughOpenings(rim).length)
    return null;
  const inverse = inverseRotation(rim.rotation);
  const offset = joist.position.map((value, axis) => value - rim.position[axis]) as V3;
  const center = rotate(offset, inverse)[0];
  const joistWidthDirection = rotate(rotate([1, 0, 0], joist.rotation), inverse);
  const rimCross = rotate(rotate([0, 1, 0], joist.rotation), inverse);
  if (Math.abs(joistWidthDirection[0]) < 1 - tolerance || Math.abs(rimCross[1]) < 1 - tolerance)
    return null;
  return rim.size[0] / 2 - Math.abs(center) - joist.size[0] / 2;
}

export function floorBaseConnections(project: Project, intents: readonly ConnectionIntent[]) {
  const byPair = new Map<string, ConnectionIntent[]>();
  for (const intent of intents) {
    if (intent.purpose !== "assembly" || intent.pieceIds.length !== 2) continue;
    const key = pairKey(intent.pieceIds[0], intent.pieceIds[1]);
    const saved = byPair.get(key);
    if (saved) saved.push(intent);
    else byPair.set(key, [intent]);
  }
  const byId = new Map(project.pieces.filter((part) => !part.offcut).map((part) => [part.id, part]));
  return project.sections.flatMap((section) => {
    if (section.generator?.type !== "foundation") return [];
    const owned = section.pieceIds.flatMap((id) => {
      const member = byId.get(id);
      return member ? [member] : [];
    });
    const legacyRims = owned.filter((part) => !part.designRole && part.name.endsWith(" · rim"));
    const joists = owned.filter((part) =>
      part.designRole === floorBaseRoles.joist || (!part.designRole && part.name.endsWith(" · joist")));
    const expected = floorBaseJoistCenters(section.generator.width, section.generator.spacing).length;
    const rows = sides.flatMap((side, index) => {
      const matches = owned.filter((part) => part.designRole === floorBaseRoles[side]);
      const rim = matches.length === 1 ? matches[0] :
        matches.length === 0 && legacyRims.length === 2 ? legacyRims[index] : undefined;
      const direction = rotate([0, 0, side === "back" ? -1 : 1], section.rotation);
      return joists.map((joist) => {
        const fit = rim ? reviewConnectionContact(joist, rim, 1, direction) : null;
        const fullFace = fit?.state === "face-contact" && fit.area !== null &&
          Math.abs(fit.area - joist.size[0] * joist.size[1]) < tolerance;
        const room = fullFace && rim ? rimEndRoom(joist, rim) : null;
        const plans = rim ? byPair.get(pairKey(joist.id, rim.id)) ?? [] : [];
        return { side, rim, joist, fit, fullFace, room, plans };
      });
    });
    return { id: section.id, name: section.name, memberIds: section.pieceIds, expected, joists: joists.length, rows };
  });
}

type FloorBaseReview = ReturnType<typeof floorBaseConnections>[number];
export type FloorBaseJoint = FloorBaseReview["rows"][number];

export function floorBaseJointFit({ fit, fullFace, room }: FloorBaseJoint) {
  if (!fit) return "Rim could not be identified.";
  if (fit.state === "interference") return "Retained wood overlaps.";
  if (fit.state === "near-face" && fit.gap !== null) return `${formatStockLength(fit.gap)} gap at the joist end.`;
  if (fit.state !== "face-contact") return "Check the joist end and rim alignment.";
  if (!fullFace) return "Partial joist-end contact.";
  if (room !== null && room <= tolerance) return "Full joist-end contact. Check connector backing at this flush rim end.";
  return "Full joist-end contact.";
}

export function floorBaseJointPlan({ plans }: FloorBaseJoint) {
  const live = [...new Set(plans.filter(({ current }) => current).map(({ label }) => label.split("/")[0]))];
  return live.length ? `Saved plan ${live.join(", ")}.` :
    plans.length ? "Review the saved or changed fastening records." : "Fastening still to plan.";
}

export function floorBaseConnectionGuideLines(project: Project, reviews: FloorBaseReview[]) {
  return reviews.flatMap((review) => [
    `${review.name} · ${review.rows.filter(({ fullFace }) => fullFace).length} of ${review.expected * 2} expected ends with full contact.`,
    ...review.rows.map((joint) => {
      const { side, rim, joist } = joint;
      return `${side === "back" ? "Back" : "Front"} rim · ${partLabel(project, joist.id)} to ${rim ? partLabel(project, rim.id) : "unidentified rim"} · ${floorBaseJointFit(joint)} ${floorBaseJointPlan(joint)}`;
    }),
  ]);
}
