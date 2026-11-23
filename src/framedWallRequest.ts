import { namedMeasurement, normalizeIdeaText } from "./ideaEdits";

export type FramedWallDimensions = {
  width: number;
  height: number;
  spacing: 12 | 16 | 24;
  lumber: "2x4" | "2x6";
};

type FramedWallRequest = { dimensions: FramedWallDimensions } | { issue: string };
const quantity = String.raw`\d+(?:\.\d+)?`;
const unit = String.raw`feet|foot|ft|inches|inch|in|['′"″]`;
const pair = String.raw`(${quantity})\s*(${unit})?\s*(?:x|×|by)\s*(${quantity})\s*(${unit})?`;
const lumber = String.raw`2\s*(?:x|×|by)\s*([46])`;
const bearing = String.raw`load[ -]?bearing|bearing|structural|retaining|exterior|shear|concrete|masonry`;
const wallStart = new RegExp(
  String.raw`^(?:please\s+)?(?:(?:build|frame|design|plan|make|create|add|give me|i need|i want)\s+)?(?:(?:a|an|the|new)\s+)*(?:(?:${pair})\s+)?(?:(?:interior|straight|wood(?:en)?|stud|framed|non[ -]?(?:load[ -]?)?bearing|${bearing}|${lumber})\s+)*(?:wall|partition)\b`,
);

/** This entry point seeds the standard nonbearing wall preview without changing workspace geometry. */
export function framedWallRequest(prompt: string): FramedWallRequest | null {
  const text = normalizeIdeaText(prompt).trim();
  if (!wallStart.test(text)) return null;
  const withoutNegativeScope = text.replace(/\bnon[ -]?(?:load[ -]?)?bearing\b/g, "");
  if (new RegExp(String.raw`\b(?:${bearing})\b`).test(withoutNegativeScope))
    return { issue: "This preview covers interior nonbearing wood partitions. Review the support and framing design for the wall you described." };
  if (/\b(?:doors?|doorways?|windows?|openings?|arches?|curved)\b/.test(
    text.replace(/\b(?:no|without)\s+(?:(?:any|a|an)\s+)?(?:doors?|doorways?|windows?|openings?)(?:\s+or\s+(?:doors?|doorways?|windows?|openings?))?/g, ""),
  )) return null;

  try {
    const sized = [...text.matchAll(new RegExp(pair, "g"))].find((entry) => entry[2] || entry[4]);
    const width = namedMeasurement(text, "wide|width|long|length") ??
      (sized && namedMeasurement(`${sized[1]} ${sized[2] ?? sized[4]} wide`, "wide"));
    const height = namedMeasurement(text, "high|height|tall") ??
      (sized && namedMeasurement(`${sized[3]} ${sized[4] ?? sized[2]} tall`, "tall"));
    if (width?.inches == null || height?.inches == null)
      return { issue: "Give both dimensions in feet or inches, such as an 8 ft wide, 6 ft 6 in tall framed wall." };
    if (width.inches < 24 || height.inches < 12 || height.inches > 120)
      return { issue: "Enter a wall at least 24 in wide and between 12 in and 10 ft tall." };
    const spacing = Number(/\b(\d+(?:\.\d+)?)\s*(?:inches|inch|in|["″])?\s*(?:on[ -]cent(?:er|re)|o\.?c\.?|spacing)\b/.exec(text)?.[1] ?? 16);
    if (spacing !== 12 && spacing !== 16 && spacing !== 24)
      return { issue: "Choose 12, 16, or 24 in on center for the framing preview." };
    const size = new RegExp(lumber).exec(text)?.[1];
    return { dimensions: { width: width.inches, height: height.inches, spacing, lumber: size === "6" ? "2x6" : "2x4" } };
  } catch (error) {
    return { issue: error instanceof Error ? error.message : "Review the wall measurements." };
  }
}
