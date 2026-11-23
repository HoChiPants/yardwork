import { doorWallPrompt, doorwayTemplate, type DoorOpening, type DoorUnit } from "./doorWall";
import type { Command } from "./model";
import { windowWallPrompt, windowWallTemplate, type WindowOpening } from "./windowWall";

const studThickness = 1.5;
const endSpace = 3 * studThickness;
const betweenOpenings = 4 * studThickness;
const tolerance = 1e-7;

export const doorAndWindowExample = "Build a nonbearing wall 10 ft wide and 8 ft tall with a 32 by 82 in rough doorway and a 36 by 48 in rough window opening, sill 32 in above the wall base";
export const doorAndWindowGuideNote = "Frame the two rough openings in one nonbearing wall with a continuous top plate and bottom plates ending at the doorway. Check the measured rough openings, finished floor rise and window sill. Review wall function, backing, fastening and the installation instructions for both units.";

export function doorAndWindowTemplate(
  wall: Pick<Command, "width" | "height" | "spacing">,
  door: DoorOpening,
  window: WindowOpening,
  depth: number,
  unit?: DoorUnit | null,
): ReturnType<typeof doorwayTemplate> {
  const [left, right] = [door, window].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
  const gap = (right.offset ?? 0) - right.width / 2 - ((left.offset ?? 0) + left.width / 2);
  if (gap < betweenOpenings - tolerance) {
    throw Error("Leave at least 6 in between rough openings for their jack and king studs.");
  }
  const windowLeft = (window.offset ?? 0) - window.width / 2 - 2 * studThickness;
  const windowRight = (window.offset ?? 0) + window.width / 2 + 2 * studThickness;
  const doorParts = doorwayTemplate(wall, door, depth, unit).filter(({ role, position, size }) =>
    !role.startsWith("wall-stud-") ||
    position[0] + size[0] / 2 <= windowLeft + tolerance || position[0] - size[0] / 2 >= windowRight - tolerance);
  const windowParts = windowWallTemplate(wall, window, depth)
    .filter(({ role }) => !role.startsWith("window-wall-"));
  return [...doorParts, ...windowParts];
}

const hasDoor = (value: string) => /\b(?:doorways?|doors?)\b/.test(value);
const hasWindow = (value: string) => /\bwindows?\b/.test(value);

export function doorAndWindowPrompt(text: string) {
  if (!/\bwall\b/.test(text) || !hasDoor(text) || !hasWindow(text)) return null;
  if (/\b(?:load[- ]bearing|bearing wall)\b/.test(text.replace(/\bnon[- ]?(?:load[- ]?)?bearing\b/g, ""))) {
    throw Error("The combined rough-opening template is for nonbearing walls. A bearing wall needs a header and support design for its actual loads.");
  }
  const wall = /\bwall\b.*?\b(with|including|featuring)\b/.exec(text);
  const rule = "Give the wall dimensions, one rough doorway and one rough window opening. Include the sill height and give both offsets if you want exact positions.";
  if (!wall || /\b(?:without|omit|remove|delete|doors|doorways|windows)\b/.test(text)) throw Error(rule);
  const end = wall.index + wall[0].length;
  const openings = text.slice(end).trim();
  const separator = [...openings.matchAll(/(?:,\s*|\s+)(?:and|plus)\s+/g)].find((match) => {
    const before = openings.slice(0, match.index);
    const after = openings.slice(match.index + match[0].length);
    return (hasDoor(before) && !hasWindow(before) && hasWindow(after) && !hasDoor(after)) ||
      (hasWindow(before) && !hasDoor(before) && hasDoor(after) && !hasWindow(after));
  });
  if (!separator) throw Error(rule);
  const clauses = [openings.slice(0, separator.index), openings.slice(separator.index + separator[0].length)];
  const firstIsDoor = hasDoor(clauses[0]);
  const doorText = clauses[firstIsDoor ? 0 : 1].replace(/\bdoor\b(?!\s+opening)/, "doorway");
  const door = doorWallPrompt(doorText).opening;
  const window = windowWallPrompt(clauses[firstIsDoor ? 1 : 0]).opening;
  if (!door || !window) throw Error(rule);
  if ((door.offset === undefined) !== (window.offset === undefined)) {
    throw Error("Give a wall-center offset for both openings, or leave both positions for the preview to space them.");
  }
  return { wallText: text.slice(0, end - wall[1].length), door, window, firstIsDoor };
}

export function placeWallOpenings(width: number, door: DoorOpening, window: WindowOpening, firstIsDoor: boolean) {
  if (door.offset !== undefined && window.offset !== undefined) return { door, window };
  const slack = width - door.width - window.width - 2 * endSpace - betweenOpenings;
  if (slack < -tolerance) throw Error("The wall is too narrow for both rough openings and their studs.");
  const extra = Math.max(0, slack) / 3;
  const first = firstIsDoor ? door : window, second = firstIsDoor ? window : door;
  const firstCenter = -width / 2 + endSpace + extra + first.width / 2;
  const secondCenter = firstCenter + first.width / 2 + betweenOpenings + extra + second.width / 2;
  return {
    door: { ...door, offset: firstIsDoor ? firstCenter : secondCenter },
    window: { ...window, offset: firstIsDoor ? secondCenter : firstCenter },
  };
}
