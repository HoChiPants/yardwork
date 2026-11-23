import { z } from "zod";
import type { Command, MaterialId, V3 } from "./model";
import { doorHardwareMaterial, doorHardwareRoles, georgianPassage } from "./doorHardwareReference";
import { doorHardwareSchema } from "./doorHardwareSchema";

export const interiorDoor = {
  materialId: "hd-masonite-75777",
  productId: "hd-masonite-interior-door-75777",
  internetNumber: "301300984",
  model: "75777",
  storeSku: "1002347354",
  listing: "https://www.homedepot.com/p/301300984",
  installation: "https://www.masonite.com/discover-and-learn/how-to-install-interior-doors/",
  reviewedAt: "2026-11-21T10:25:00.000Z",
  finishedDepth: [4.25, 4.5],
  leaf: [30, 80, 1.375] as V3,
  rough: [32, 82] as const,
} as const;
export const measuredDoorMaterial = "measured-interior-door" satisfies MaterialId;
export const doorJambMaterial = "interior-door-jamb" satisfies MaterialId;
export const doorwayGuideNote = "Assemble the nonbearing wall with both bottom plate pieces clear of the doorway. Verify the finished floor height, the specified rough opening and the flat head detail.";

export const doorOpeningSchema = z.strictObject({
  width: z.number().finite().positive().max(96),
  height: z.number().finite().min(12).max(115),
  offset: z.number().finite().min(-96).max(96).optional(),
  floor: z.number().finite().min(0).max(12).optional(),
});
export type DoorOpening = z.infer<typeof doorOpeningSchema>;

export const doorUnitSchema = z.strictObject({
  frameWidth: z.number().positive().max(96),
  frameHeight: z.number().positive().max(115),
  jambDepth: z.number().positive().max(18),
  sideJamb: z.number().positive().max(4),
  headJamb: z.number().positive().max(4),
  leafWidth: z.number().positive().max(96),
  leafHeight: z.number().positive().max(115),
  leafThickness: z.number().positive().max(6),
  floorGap: z.number().min(0).max(12),
  frameOffset: z.number().min(-12).max(12),
  leafOffset: z.number().min(-12).max(12),
  leafDepthOffset: z.number().min(-12).max(12),
  hingeSide: z.enum(["left", "right"]),
  swingFace: z.enum(["front", "back"]),
  pinSideOffset: z.number().min(-6).max(6),
  pinFaceOffset: z.number().min(-6).max(6),
  travel: z.number().positive().max(180),
  purchase: z.enum(["measured", interiorDoor.materialId]),
  finishedDepth: z.number().positive().max(18).optional(),
  hardware: doorHardwareSchema.optional(),
});
export type DoorUnit = z.infer<typeof doorUnitSchema>;

export const doorwayLeafRole = "interior-door-leaf";
const thickness = 1.5;
const tolerance = 1e-7;
type DoorPart = { role: string; name: string; size: V3; position: V3; material?: MaterialId };

export function doorwayTemplate(wall: Pick<Command, "width" | "height" | "spacing">, opening: DoorOpening, depth: number, unit?: DoorUnit | null) {
  const center = opening.offset ?? 0, floor = opening.floor ?? 0;
  const left = center - opening.width / 2, right = center + opening.width / 2;
  const edge = wall.width / 2, head = floor + opening.height, underside = wall.height - thickness;
  if (left < -edge + 3 * thickness - tolerance || right > edge - 3 * thickness + tolerance)
    throw Error("Leave 4½ in on both sides of the doorway for the jack, king and end stud.");
  if (head + thickness > underside + tolerance) throw Error("The flat door head and top plate need 3 in above the rough opening.");
  if (underside - head - thickness > 24 + tolerance)
    throw Error("This nonbearing detail allows at most 24 in between the flat head and the top plate.");
  const parts: DoorPart[] = [];
  const add = (role: string, name: string, size: V3, position: V3, material?: MaterialId) => {
    parts.push({ role, name, size, position, material });
  };
  const plate = (role: string, name: string, a: number, b: number, y: number) =>
    add(role, name, [b - a, thickness, depth], [(a + b) / 2, y, 0]);
  const stud = (role: string, name: string, x: number, bottom: number, top: number) => {
    if (top > bottom + tolerance) add(role, name, [thickness, top - bottom, depth], [x, (top + bottom) / 2, 0]);
  };
  plate("door-bottom-left", "left bottom plate", -edge, left, thickness / 2);
  plate("door-bottom-right", "right bottom plate", right, edge, thickness / 2);
  plate("wall-top-plate", "top plate", -edge, edge, underside + thickness / 2);
  plate("door-head", "flat door head", left - thickness, right + thickness, head + thickness / 2);
  stud("door-jack-left", "left jack stud", left - thickness / 2, thickness, head);
  stud("door-jack-right", "right jack stud", right + thickness / 2, thickness, head);
  stud("door-king-left", "left king stud", left - 1.5 * thickness, thickness, underside);
  stud("door-king-right", "right king stud", right + 1.5 * thickness, thickness, underside);

  const occupied = parts.filter(({ role }) => role.startsWith("door-king-")).map(({ position }) => position[0]);
  const existingStuds = wallStudPositions(wall.width, wall.spacing);
  for (const [index, x] of existingStuds.entries()) {
    if ((x + thickness / 2 <= left - 2 * thickness + tolerance || x - thickness / 2 >= right + 2 * thickness - tolerance) &&
      occupied.every((other) => Math.abs(other - x) >= thickness - tolerance))
      stud(`wall-stud-${index + 1}`, `stud ${index + 1}`, x, thickness, underside);
    else if (x - thickness / 2 >= left - thickness - tolerance && x + thickness / 2 <= right + thickness + tolerance)
      stud(`door-upper-${index + 1}`, "stud above door head", x, head + thickness, underside);
  }
  if (!unit) return parts;

  const frameX = center + unit.frameOffset, leafX = frameX + unit.leafOffset;
  const frameLeft = frameX - unit.frameWidth / 2, frameRight = frameX + unit.frameWidth / 2;
  const insideLeft = frameLeft + unit.sideJamb, insideRight = frameRight - unit.sideJamb;
  if (frameLeft <= left + tolerance || frameRight >= right - tolerance || unit.frameHeight >= opening.height - tolerance)
    throw Error("The measured frame needs room inside the rough opening for fitting and shimming.");
  if (leafX - unit.leafWidth / 2 <= insideLeft + tolerance || leafX + unit.leafWidth / 2 >= insideRight - tolerance ||
      unit.floorGap + unit.leafHeight + unit.headJamb >= unit.frameHeight - tolerance)
    throw Error("The measured leaf needs clearance from both side jambs and the head jamb.");
  if (Math.abs(unit.leafDepthOffset) >= (unit.jambDepth + unit.leafThickness) / 2)
    throw Error("The closed leaf must seat at the frame. Check its offset from the wall center.");
  if (unit.purchase === interiorDoor.materialId) {
    const purchaseMatchesHand = unit.hingeSide === (unit.swingFace === "front" ? "left" : "right");
    const measuredLeaf = [unit.leafWidth, unit.leafHeight, unit.leafThickness];
    if (!purchaseMatchesHand || measuredLeaf.some((value, i) => Math.abs(value - interiorDoor.leaf[i]) > 0.125) ||
      opening.width < interiorDoor.rough[0] || opening.height < interiorDoor.rough[1])
      throw Error("Model 75777 requires right-hand handing from the push side, a 30 × 80 in leaf and at least a 32 × 82 in rough opening.");
    if (unit.finishedDepth === undefined || unit.finishedDepth < Math.max(interiorDoor.finishedDepth[0], depth) || unit.finishedDepth > interiorDoor.finishedDepth[1])
      throw Error("Confirm a measured finished wall thickness from 4¼ to 4½ in for the listed split jamb.");
  }
  for (const [side, x] of [["left", frameLeft + unit.sideJamb / 2], ["right", frameRight - unit.sideJamb / 2]] as const)
    add(`door-jamb-${side}`, `${side} jamb`, [unit.sideJamb, unit.frameHeight, unit.jambDepth], [x, floor + unit.frameHeight / 2, 0], doorJambMaterial);
  add("door-jamb-head", "head jamb", [insideRight - insideLeft, unit.headJamb, unit.jambDepth], [frameX, floor + unit.frameHeight - unit.headJamb / 2, 0], doorJambMaterial);
  add(doorwayLeafRole, "door leaf", [unit.leafWidth, unit.leafHeight, unit.leafThickness], [leafX, floor + unit.floorGap + unit.leafHeight / 2, unit.leafDepthOffset], unit.purchase === "measured" ? measuredDoorMaterial : unit.purchase);
  const hardware = unit.hardware;
  if (hardware) {
    const { backset, centerHeight } = hardware;
    if (backset >= unit.leafWidth || centerHeight >= unit.leafHeight)
      throw Error("Place the hardware bore center inside the door leaf.");
    if (hardware.purchase === georgianPassage.id && (hardware.grip !== "knob" ||
      !georgianPassage.backsets.some((value) => Math.abs(value - backset) <= 1 / 32) ||
      unit.leafThickness < georgianPassage.thickness[0] || unit.leafThickness > georgianPassage.thickness[1]))
      throw Error("The Georgian passage set needs a 2⅜ or 2¾ in backset and a 1⅜–1¾ in thick door.");
    const hinge = unit.hingeSide === "left" ? -1 : 1;
    const boreX = leafX - hinge * (unit.leafWidth / 2 - backset);
    for (const [index, face] of (["front", "back"] as const).entries()) {
      const { width, height, projection, towardHinge } = hardware[face];
      if (Math.abs(towardHinge) > width / 2 + tolerance)
        throw Error("The bore center must lie within the measured handle width.");
      if (centerHeight - height / 2 < -tolerance || centerHeight + height / 2 > unit.leafHeight + tolerance)
        throw Error("Check the bore height and the measured height of the complete hardware.");
      const direction = face === "front" ? 1 : -1;
      add(doorHardwareRoles[index], `${face} door ${hardware.grip}`, [width, height, projection], [
        boreX + hinge * towardHinge,
        floor + unit.floorGap + centerHeight,
        unit.leafDepthOffset + direction * (unit.leafThickness + projection) / 2,
      ], doorHardwareMaterial);
    }
  }
  return parts;
}

/** Matches the spacing of stock-aware solid wall frames before a doorway is added. */
export function wallStudPositions(width: number, spacing: number) {
  const end = width - thickness / 2;
  const offsets = [thickness / 2];
  for (let offset = spacing; offset <= end - thickness; offset += spacing) offsets.push(offset);
  const last = offsets.at(-1)!;
  if (end - last > spacing) offsets.push((end + last) / 2);
  offsets.push(end);
  return offsets.map((offset) => offset - width / 2);
}

export function doorwayHinge(unit: DoorUnit) {
  const side = unit.hingeSide === "left" ? -1 : 1;
  const face = unit.swingFace === "front" ? 1 : -1;
  return {
    kind: "hinge" as const,
    pivot: [side * (unit.leafWidth / 2 + unit.pinSideOffset), 0, face * (unit.leafThickness / 2 + unit.pinFaceOffset)] as V3,
    axis: [0, -side * face, 0] as V3,
    travel: unit.travel,
  };
}

export function doorWallPrompt(text: string, previous?: DoorOpening | null) {
  const token = /\b(?:doorway|door opening)\b/.exec(text);
  if (!token) return { wallText: text, opening: undefined };
  if (/\b(?:remove|omit|delete|without)\s+(?:(?:the|a|this)\s+)?(?:rough\s+)?(?:doorway|door opening)\b/.test(text))
    return { wallText: text.slice(0, token.index), opening: null };
  const length = "(\\d+(?:\\.\\d+)?)\\s*(feet|foot|ft|inches|inch|in|['′\"″])?";
  const pair = `${length}\\s*(?:x|×|by)\\s*${length}`;
  const before = text.slice(0, token.index), after = text.slice(token.index + token[0].length);
  const precedingPair = new RegExp(`${pair}\\s*(?:rough\\s*)?$`).exec(before);
  const sizes = precedingPair ?? new RegExp(`^\\s*(?:measuring\\s+|of\\s+)?${pair}`).exec(after);
  const inches = (value: string, unit?: string) => Number(value) * (/^(?:f|['′])/.test(unit ?? "") ? 12 : 1);
  const offset = new RegExp(`${length}\\s*(left|right) of (?:the )?(?:wall )?cent(?:er|re)`).exec(after);
  const floor = new RegExp(`(?:finished floor|floor rise)\\s*(?:is\\s+|at\\s+)?${length}`).exec(after);
  if (!sizes && (!previous || (!offset && !floor && !/\bcent(?:er|re)ed\b/.test(after))))
    throw Error("Include the measured rough doorway width and height, for example ‘add a 32 by 82 in doorway’.");
  const prefix = before.slice(0, precedingPair?.index ?? before.length);
  const boundary = [...prefix.matchAll(/\b(?:with|add|include|keep|including)\b/g)].at(-1);
  return {
    wallText: boundary ? prefix.slice(0, boundary.index) : prefix,
    opening: doorOpeningSchema.parse({
      ...previous,
      ...(sizes && { width: inches(sizes[1], sizes[2] ?? sizes[4]), height: inches(sizes[3], sizes[4] ?? sizes[2]) }),
      ...(offset ? { offset: inches(offset[1], offset[2]) * (offset[3] === "left" ? -1 : 1) }
        : /\bcent(?:er|re)ed\b/.test(after) ? { offset: 0 } : {}),
      ...(floor && { floor: inches(floor[1], floor[2]) }),
    }),
  };
}
