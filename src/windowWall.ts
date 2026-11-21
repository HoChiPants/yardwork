import { z } from "zod";
import type { Command, MaterialId, Project, Section, V3 } from "./model";

export const windowFramingSource = "https://basc.pnnl.gov/resource-guides/advanced-framing-minimal-framing-doors-and-windows";
export const nonbearingHeaderSource = "https://codes.iccsafe.org/content/IRC2024P2/chapter-6-wall-construction";
export const windowWallScope =
  "This layout uses a flat head for a nonbearing wall. Verify wall function, the unit's specified rough opening, bracing and connections before building.";
export const wallFramingStockIds = [
  "stud", "stud-10", "stud-12", "hd-kdht-2x4-8", "hd-spf-2x4-10", "hd-spf-2x4-12",
  "two-six", "hd-spf-2x6-8", "hd-spf-2x6-12",
] as const satisfies readonly MaterialId[];

export const windowOpeningSchema = z.strictObject({
  width: z.number().positive().max(96),
  height: z.number().positive().max(100),
  sill: z.number().min(3).max(116),
  offset: z.number().min(-96).max(96).optional(),
  stock: z.enum(wallFramingStockIds).optional(),
  upperBacking: z.boolean().optional(),
});
export type WindowOpening = z.infer<typeof windowOpeningSchema>;

export const windowWallRoles = {
  sill: "window-rough-sill",
  head: "window-rough-head",
  jambA: "window-left-jack",
  jambB: "window-right-jack",
} as const;

const t = 1.5;
const epsilon = 1e-7;
const inches = (value: string, unit?: string) => Number(value) * (/^(?:f|['′])/.test(unit ?? "") ? 12 : 1);
const amount = "(\\d+(?:\\.\\d+)?)\\s*(feet|foot|ft|inches|inch|in|['′\"″])?";
const pair = `${amount}\\s*(?:x|×|by)\\s*${amount}`;

export function windowWallPrompt(text: string, previous?: WindowOpening | null) {
  if (/\bwindows\b/.test(text) && /\b(?:wall|frame|framed|opening)\b/.test(text))
    throw Error("Plan one rough window opening per wall section.");
  const token = /\bwindow\b/.exec(text);
  if (!token) return { wallText: text, opening: undefined };
  if (/\b(?:door|doors)\b/.test(text))
    throw Error("This wall template supports one window opening. Split the window and door into separate planning sections.");
  if (/\b(?:remove|delete|omit|without)\s+(?:(?:a|the|this|its)\s+)?(?:rough\s+)?window\b/.test(text))
    return { wallText: text.slice(0, token.index), opening: null };
  if (/\b(?:two|three|multiple|[2-9])\s+windows\b/.test(text) || /\bwindow\b.*\bwindow\b/.test(text))
    throw Error("Plan one rough window opening per wall section.");

  const preceding = text.slice(0, token.index);
  const before = new RegExp(`${pair}\\s*(?:rough\\s*)?$`).exec(preceding);
  const prefix = preceding.slice(0, before?.index ?? preceding.length);
  const boundary = [...prefix.matchAll(/\b(?:with|including|include|add|keep|featuring)\b/g)].at(-1);
  const wallText = boundary ? prefix.slice(0, boundary.index) : prefix;
  const openingText = text.slice(token.index);
  const dimensions = [boundary ? prefix.slice(boundary.index! + boundary[0].length) : "", openingText]
    .join(" ").split(/\bsill\b|\boffset\b|\babove (?:the )?floor\b/)[0];
  const sizes = before ?? new RegExp(pair).exec(dimensions);
  const size = (label: string) => {
    const named = new RegExp(`${amount}\\s*(?:${label})\\b`).exec(dimensions);
    return named ? inches(named[1], named[2]) : undefined;
  };
  const sill = new RegExp(`\\bsill(?:\\s+(?:height|at|is|to))?\\s*${amount}`).exec(openingText);
  const offset = new RegExp(`${amount}\\s*(?:to the )?(left|right) of (?:the )?(?:wall )?cent(?:er|re)`).exec(openingText);
  const width = sizes ? inches(sizes[1], sizes[2] ?? sizes[4]) : size("wide|width");
  const height = sizes ? inches(sizes[3], sizes[4] ?? sizes[2]) : size("tall|high|height");
  if (width === undefined && height === undefined && !sill && !offset && !/\bcent(?:er|re)ed\b/.test(openingText))
    throw Error("Include the rough window width, height and sill height. For example, use a 36 by 48 in window opening, sill 32 in above floor.");
  const nextWidth = width ?? previous?.width, nextHeight = height ?? previous?.height;
  const nextSill = sill ? inches(sill[1], sill[2]) : previous?.sill;
  if (nextWidth === undefined || nextHeight === undefined || nextSill === undefined)
    throw Error("Include the rough window width, height and sill height. For example, use a 36 by 48 in window opening, sill 32 in above floor.");
  const shift = offset ? inches(offset[1], offset[2]) * (offset[3] === "left" ? -1 : 1)
    : /\bcent(?:er|re)ed\b/.test(openingText) ? 0 : previous?.offset;
  const stock = /\b2\s*(?:x|×|by)\s*6\s+(?:framing|studs?|lumber)\b/.test(text) ? "two-six"
    : /\b2\s*(?:x|×|by)\s*4\s+(?:framing|studs?|lumber)\b/.test(text) ? "stud" : previous?.stock;
  const opening = windowOpeningSchema.parse({
    ...previous, width: nextWidth, height: nextHeight, sill: nextSill,
    ...(shift !== undefined && { offset: shift }),
    ...(stock !== undefined && { stock }),
  });
  return { wallText, opening };
}

export function windowWallTemplate(wall: Pick<Command, "width" | "height" | "spacing">, opening: WindowOpening, depth: number) {
  const left = (opening.offset ?? 0) - opening.width / 2;
  const right = left + opening.width;
  const head = opening.sill + opening.height;
  const underside = wall.height - t;
  if (left < -wall.width / 2 + 3 * t - epsilon || right > wall.width / 2 - 3 * t + epsilon)
    throw Error("The opening needs room for the jack, king and end stud on both sides.");
  if (head + t > underside + epsilon)
    throw Error("The window head and top plate do not fit above the opening.");
  if (underside - (head + t) > 24 + epsilon)
    throw Error("This nonbearing flat-head layout allows up to 24 in from the head to the top plate. Review a different detail for this position.");

  const parts: { role: string; name: string; size: V3; position: V3 }[] = [];
  const add = (role: string, name: string, width: number, height: number, x: number, y: number) => {
    parts.push({ role, name, size: [width, height, depth], position: [x, y, 0] });
  };
  const upright = (role: string, name: string, x: number, y0: number, y1: number) => {
    if (y1 - y0 > epsilon) add(role, name, t, y1 - y0, x, (y0 + y1) / 2);
  };
  add("window-wall-bottom-plate", "bottom plate", wall.width, t, 0, t / 2);
  add("window-wall-top-plate", "top plate", wall.width, t, 0, wall.height - t / 2);
  upright("window-wall-left-end", "left end stud", -wall.width / 2 + t / 2, t, underside);
  upright("window-wall-right-end", "right end stud", wall.width / 2 - t / 2, t, underside);
  upright("window-left-king", "left king stud", left - 1.5 * t, t, underside);
  upright("window-right-king", "right king stud", right + 1.5 * t, t, underside);
  upright(windowWallRoles.jambA, "left jack stud", left - t / 2, t, head);
  upright(windowWallRoles.jambB, "right jack stud", right + t / 2, t, head);
  add(windowWallRoles.sill, "rough window sill", opening.width, t, (left + right) / 2, opening.sill - t / 2);
  add(windowWallRoles.head, "flat window head", opening.width + 2 * t, t, (left + right) / 2, head + t / 2);

  for (let i = 1; i * wall.spacing <= wall.width - 1.5 * t; i++) {
    const x = -wall.width / 2 + i * wall.spacing;
    if (x - t / 2 >= left - epsilon && x + t / 2 <= right + epsilon) {
      upright(`window-lower-stud-${i}`, "lower cripple stud", x, t, opening.sill - t);
    }
    if (opening.upperBacking && x - t / 2 >= left - t - epsilon && x + t / 2 <= right + t + epsilon) {
      upright(`window-upper-stud-${i}`, "upper backing stud", x, head + t, underside);
    }
    if (x + t / 2 <= left - 2 * t + epsilon || x - t / 2 >= right + 2 * t - epsilon) {
      upright(`window-wall-stud-${i}`, "common stud", x, t, underside);
    }
  }
  return parts;
}

export function generatedWindowMembers(project: Project, section: Section | undefined) {
  if (!section?.generator?.windowOpening) return null;
  const active = project.pieces.filter(({ id, offcut }) => !offcut && section.pieceIds.includes(id));
  const one = (role: string) => {
    const matching = active.filter(({ designRole }) => designRole === role);
    return matching.length === 1 ? matching[0].id : undefined;
  };
  const sill = one(windowWallRoles.sill), head = one(windowWallRoles.head);
  const jambA = one(windowWallRoles.jambA), jambB = one(windowWallRoles.jambB);
  return sill && head && jambA && jambB ? { sill, head, jambA, jambB } : null;
}
