import type { Piece, Project, V3 } from "./model";
import type { SaunaCabinParams } from "./recipeSchemas";
import { cedarbrookFoil as foil } from "./saunaFoilReference";
import { composeRotation, rotate } from "./spatial";
import { formatPreciseInches } from "./measurement";

export const saunaWallFoilRole = "sauna-wall-foil";
export const saunaCeilingFoilRole = "sauna-ceiling-foil";
type Folds = NonNullable<Piece["foilReturns"]>;
const flat: Folds = { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 };
const epsilon = 0.000001;
export function foilBlankSize(piece: Pick<Piece, "size" | "foilReturns">): V3 {
  const returns = piece.foilReturns ?? flat;
  return [
    piece.size[0] + returns.xStart + returns.xEnd,
    piece.size[1] + returns.yStart + returns.yEnd,
    piece.size[2],
  ];
}

export function foilReturnText(returns: Piece["foilReturns"]) {
  if (!returns) return "";
  return (
    [
      ["xStart", "X start"],
      ["xEnd", "X end"],
      ["yStart", "Y start"],
      ["yEnd", "Y end"],
    ] as const
  )
    .filter(([edge]) => returns[edge] > 0)
    .map(([edge, label]) => `${label} ${formatPreciseInches(returns[edge])}`)
    .join(", ");
}

/** Plan flat rectangles using the full 54 in roll width with a 4 in seam lap. */
function bands(span: number, edgeReturn = 0) {
  const rows: { low: number; high: number; near: number; far: number }[] = [];
  for (
    let start = -edgeReturn;
    start < span;
    start += foil.rollWidth - foil.seamLap
  ) {
    const end = Math.min(start + foil.rollWidth, span + edgeReturn);
    const low = Math.max(0, start);
    const high = Math.min(span, end);
    rows.push({ low, high, near: low - start, far: end - high });
    if (end >= span + edgeReturn - epsilon) break;
  }
  return rows;
}

type FoilRoom = Required<
  Pick<
    SaunaCabinParams,
    | "clearWidth"
    | "clearDepth"
    | "clearHeight"
    | "interiorLayerAllowance"
    | "doorWidth"
    | "doorHeight"
  >
>;
type Panel = {
  name: string;
  role: typeof saunaWallFoilRole | typeof saunaCeilingFoilRole;
  size: V3;
  position: V3;
  rotation: V3;
  returns: Folds;
};

/** Flat visible planes plus stock reserved for edge folds. */
export function saunaFoilLayout(room: FoilRoom): Panel[] {
  const width = room.clearWidth + 2 * room.interiorLayerAllowance;
  const depth = room.clearDepth + 2 * room.interiorLayerAllowance;
  const height = room.clearHeight + room.interiorLayerAllowance;
  const opening = room.doorWidth / 2;
  if (room.doorWidth >= width - epsilon || room.doorHeight >= height - epsilon)
    throw Error(
      "Leave room for the foil at the sauna opening’s sides and above its header.",
    );
  const t = foil.modelThickness;
  const panels: Panel[] = [];
  for (const [i, row] of bands(depth, foil.ceilingReturn).entries()) {
    panels.push({
      name: `ceiling strip ${i + 1}`,
      role: saunaCeilingFoilRole,
      size: [width, row.high - row.low, t],
      position: [0, height + t / 2, (row.low + row.high - depth) / 2],
      rotation: [Math.PI / 2, 0, 0],
      returns: {
        xStart: foil.ceilingReturn,
        xEnd: foil.ceilingReturn,
        yStart: row.near,
        yEnd: row.far,
      },
    });
  }

  // The side bands reserve folded laps around the four vertical corners.
  const corner = { ...flat, xStart: foil.seamLap, xEnd: foil.seamLap };
  for (const [i, { low, high }] of bands(height).entries()) {
    const band = `band ${i + 1}`;
    const y = (low + high) / 2;
    const cover = high - low;
    for (const side of [-1, 1]) {
      panels.push({
        name: `${side < 0 ? "left" : "right"} ${band}`,
        role: saunaWallFoilRole,
        size: [depth, cover, t],
        position: [(side * (width + t)) / 2, y, 0],
        rotation: [0, Math.PI / 2, 0],
        returns: corner,
      });
    }
    function face(
      name: string,
      a: number,
      b: number,
      bottom: number,
      top: number,
      side: number,
    ) {
      panels.push({
        name: `${name} ${band}`,
        role: saunaWallFoilRole,
        size: [b - a, top - bottom, t],
        position: [(a + b) / 2, (top + bottom) / 2, (side * (depth + t)) / 2],
        rotation: [0, 0, 0],
        returns: flat,
      });
    }
    face("rear", -width / 2, width / 2, low, high, -1);
    if (low >= room.doorHeight)
      face("front", -width / 2, width / 2, low, high, 1);
    else {
      face("front left", -width / 2, -opening, low, high, 1);
      face("front right", opening, width / 2, low, high, 1);
      if (high > room.doorHeight) {
        const lap = Math.min(foil.seamLap, width / 2 - opening);
        face(
          "door header",
          -opening - lap,
          opening + lap,
          room.doorHeight,
          high,
          1,
        );
      }
    }
  }
  return panels;
}

/** Edits still count toward takeoff. They may invalidate coverage of the saved room. */
export function saunaFoilLayoutChanges(project: Project) {
  const close = (a: V3, b: V3) =>
    a.every((n, i) => Math.abs(n - b[i]) <= 0.001);
  const localAxes: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) => {
      if (
        entry.spec.type !== "structure" ||
        entry.spec.structure.kind !== "sauna" ||
        !entry.spec.structure.selections.saunaVaporBarrier
      )
        return [];
      try {
        const layout = saunaFoilLayout(entry.spec.structure.parameters);
        const roles = [saunaWallFoilRole, saunaCeilingFoilRole];
        const same = roles.every((role) => {
          const expected = layout.filter((panel) => panel.role === role);
          const section = entry.sections.find((link) => link.role === role);
          const actualIds =
            project.sections.find((item) => item.id === section?.sectionId)
              ?.pieceIds ?? [];
          return (
            expected.length === actualIds.length &&
            expected.every((panel) => {
              const rotation = composeRotation(
                entry.pose.rotation,
                panel.rotation,
              );
              const position = rotate(panel.position, entry.pose.rotation).map(
                (n, i) => n + entry.pose.origin[i],
              ) as V3;
              return actualIds.some((id) => {
                const piece = project.pieces.find((row) => row.id === id);
                return (
                  piece?.material === foil.materialId &&
                  close(piece.size, panel.size) &&
                  close(piece.position, position) &&
                  localAxes.every((axis) =>
                    close(rotate(axis, piece.rotation), rotate(axis, rotation)),
                  ) &&
                  Object.entries(panel.returns).every(
                    ([key, value]) =>
                      (piece.foilReturns?.[key as keyof Folds] ?? 0) === value,
                  )
                );
              });
            })
          );
        });
        if (same) return [];
      } catch {
        // The current room parameters no longer yield a complete footprint.
      }
      return [{ id: entry.id, label: binding.title }];
    }),
  );
}
