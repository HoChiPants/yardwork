import { drywallStock } from "./drywallReference";
import { normalizeIdeaText } from "./ideaEdits";
import type { Project, Section } from "./model";

export type DrywallFace = "front" | "back" | "both";
export type WallDrywallRequest = {
  task: "layout" | "screws" | "tape";
  wall?: string;
  side?: DrywallFace;
  sheetLength?: 96 | 144;
  floorGap?: number;
  reuse?: boolean;
  backing?: boolean;
  issue?: string;
};
export type WallDrywallStart = Omit<WallDrywallRequest, "wall" | "issue"> & { wallId: string };

const finish = "(?:drywall|sheetrock|gypsum board)";
const amount = "(\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d*\\.\\d+|\\d+)";
const inchUnit = "(?:inches|inch|in\\b|[″\"])";
const footUnit = "(?:foot|feet|ft\\b|[′'])";
const wallRef = /(?:\bof|\bon|\bfor)\s+(.+?)(?=\s+(?:with|using|leave|leaving|keep|from|without|and|front|back)\b|[,;]|$)/i;
const cleanWall = (value: string) => value.trim().toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ");
const layoutPrompt = new RegExp(`^(?:${finish}\\b|(?:(?:plan|preview|add|hang|install|lay out|cover|line|finish|put)\\b).*\\b${finish}\\b)`, "i");
const reviewPrompt = new RegExp(`\\b(?:screws?|fasteners?|backing)\\b.*\\b${finish}\\b|\\b${finish}\\b.*\\b(?:screws?|fasteners?|backing)\\b`, "i");
const tapeReviewPrompt = /\b(?:drywall|sheetrock|gypsum board)\s+(?:joint\s+)?(?:tape|joints?)\b|\b(?:joint tape|tape)\s+(?:for|on)\s+(?:the\s+)?(?:drywall|sheetrock|gypsum board)\b/;

function measure(value: string) {
  const [first, denominator] = value.split("/").map((term) => term.trim());
  if (denominator === undefined) return Number(first);
  const terms = first.split(/\s+/).map(Number);
  return (terms.length > 1 ? terms[0] : 0) + terms.at(-1)! / Number(denominator);
}

export function wallDrywallRequest(prompt: string): WallDrywallRequest | null {
  const original = prompt.trim().replace(/^please\s+/i, "").replace(/^(?:can|could|would) you\s+/i, "")
    .replace(/[.!?]+$/, "").replace(/[“”]/g, '"');
  const quotedWall = /(?:^|\s)"([^"]+)"/g;
  const names = [...original.matchAll(quotedWall)].map(([, name]) => name.trim());
  const text = normalizeIdeaText(original.replace(quotedWall, " this wall ")
    .replace(/(\d)(?=[½¼¾])/g, "$1 ")
    .replace(/½/g, "1/2").replace(/¼/g, "1/4").replace(/¾/g, "3/4")
    .replace(/\bhalf[- ](?:an? )?(?=inch\b)/gi, "1/2 ")
    .replace(/\bquarter[- ](?:of an? |an? )?(?=inch\b)/gi, "1/4 ")
    .replace(/(\d)-(?=inch|inches)\b/g, "$1 ")
    .replace(/\s+/g, " "));
  const asksReview = /^(?:how|what|where|why|which|show|check|review|estimate|count|do i|can i|does)\b/.test(text);
  const task = asksReview && tapeReviewPrompt.test(text) ? "tape"
    : asksReview && reviewPrompt.test(text) ? "screws" : "layout";
  if (task === "layout" && !layoutPrompt.test(text)) return null;
  const request: WallDrywallRequest = { task, wall: names[0] };
  if (names.length > 1) return { ...request, issue: "Plan one framed wall at a time. Use its section name in quotes." };
  if (/\b(?:ceiling|fire[- ]rated|wet area|mold[- ]resistant|shower|exterior drywall|double[- ]layer|2 layers)\b/.test(text))
    return { ...request, issue: "This planner lays out one layer of ½ in drywall on a framed wall in a dry interior. Choose the specified assembly for this project." };

  const facePhrase = text
    .replace(/\b(?:not|without|skip|except)\s+(?:on\s+)?(?:the\s+)?(?:front|back|rear)(?:\s+(?:face|side))?\b/g, "")
    .replace(/\b(?:front|back|rear) wall\b/g, "wall");
  const front = /\bfront(?:[- ](?:face|side))?\b/.test(facePhrase);
  const back = /\b(?:back|rear)(?:[- ](?:face|side))?\b/.test(facePhrase);
  request.side = /\b(?:both|2)\s+(?:sides|faces)\b/.test(text) || (front && back)
    ? "both" : front ? "front" : back ? "back" : undefined;
  if (!request.wall) {
    const faceOf = /\b(?:sides?|faces?)\s+(of\s+.+)/.exec(text);
    const reference = wallRef.exec(faceOf?.[1] ?? text)?.[1]?.trim() ??
      new RegExp(`^${finish}\\s+(.+? wall)(?=\\s+(?:with|using|leave|leaving)\\b|[,;]|$)`).exec(text)?.[1];
    if (reference && /\b(?:this|selected|current|that|the) wall\b/.test(reference)) {
      request.wall = undefined;
    } else if (reference && /\bwall\b/.test(reference)) {
      request.wall = reference.replace(/\s+(?:needs?|uses?|should|will|do i)\b.*$/, "");
    } else {
      request.wall = /\bwall\s+\d+\b/.exec(text)?.[0];
    }
  }
  if (task !== "layout") return request;
  const gap = [new RegExp(`(?:gap|clearance) (?:of )?([+-]?)${amount}\\s*${inchUnit}`),
    new RegExp(`([+-]?)${amount}\\s*${inchUnit}\\s*(?:(?:bottom|floor) )?(?:gap|clearance)\\b`)]
    .map((rule) => rule.exec(text)).find(Boolean);
  if (gap) request.floorGap = (gap[1] === "-" ? -1 : 1) * measure(gap[2]);
  if ((!gap && /\b(?:gap|clearance)\b/.test(text)) ||
    (request.floorGap !== undefined && (!Number.isFinite(request.floorGap) || request.floorGap < 0 || request.floorGap > 2)))
    return { ...request, issue: "Give the gap above the wall base in inches, from 0 to 2 in." };
  const stock = new RegExp(`(?:\\b4(?:\\s*${footUnit})?\\s*(?:x|×|by)\\s*)?${amount}\\s*(?:${footUnit}\\s*(?:(?:long|wide)\\s*)?|(?=\\s*(?:sheets?|panels?)\\b))\\s*(?:sheets?|panels?)\\b`).exec(text);
  if (stock) {
    const feet = measure(stock[1]);
    if (feet !== 8 && feet !== 12) return { ...request, issue: "Choose 4 × 8 ft or 4 × 12 ft drywall sheets." };
    request.sheetLength = feet === 8 ? 96 : 144;
  }
  const thick = new RegExp(`${amount}\\s*${inchUnit}\\s*(?:thick\\s+)?${finish}\\b`).exec(text);
  if (thick && measure(thick[1]) !== 0.5) return { ...request, issue: "The fitted drywall planner uses ½ in stock. Use the thickness specified for your actual assembly." };
  request.reuse = /\b(?:reuse|use|using|with|from|matching)\b[^,;]*\b(?:scraps|offcuts|leftovers|cut pool)\b/.test(text) &&
    !/\b(?:without|no|skip|do not use|don’t use|don't use)\b[^,;]*\b(?:scraps|offcuts|leftovers|cut pool)\b/.test(text);
  request.backing = /\b(?:add|include|fit|with)\b[^,;]*\bbacking(?: studs?)? (?:above|over) (?:the )?window\b/.test(text) &&
    !/\b(?:without|no|skip|do not add|don't add)\b[^,;]*\bbacking\b/.test(text);
  return request;
}

export function resolveDrywallWalls(project: Project, request: WallDrywallRequest, selectedSectionId?: string | null) {
  const walls = project.sections.filter(({ generator }) => generator?.type === "wall");
  if (request.wall) {
    const target = cleanWall(normalizeIdeaText(request.wall));
    const named = walls.filter(({ name }) => cleanWall(normalizeIdeaText(name)) === target);
    if (named.length) return { walls: named, named: true };
    if (target === "window wall") return { walls: walls.filter(({ generator }) => generator?.windowOpening), named: true };
    if (target === "doorway wall" || target === "door wall")
      return { walls: walls.filter(({ generator }) => generator?.doorOpening), named: true };
    return { walls: [], named: true };
  }
  const selected = project.sections.find(({ id }) => id === selectedSectionId);
  const source = selected?.wallDrywall?.wallId ?? selected?.id;
  const wall = walls.find(({ id }) => id === source);
  return { walls: wall ? [wall] : walls, named: false };
}

export function drywallStartFace(project: Project, wall: Section, request?: WallDrywallRequest): DrywallFace {
  if (request?.side) return request.side;
  const lined = project.sections.flatMap(({ wallDrywall }) => wallDrywall?.wallId === wall.id ? [wallDrywall.side] : []);
  if (lined.length === 2) return "both";
  if (request && request.task !== "layout" && lined.length) return lined[0];
  return lined.includes("front") ? "back" : "front";
}

export function drywallSheetChoice(wall?: Section, length?: WallDrywallRequest["sheetLength"]) {
  return drywallStock.find((stock) => stock.length === length) ??
    drywallStock[(wall?.generator?.width ?? 0) > drywallStock[0].length ? 1 : 0];
}
