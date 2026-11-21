import { z } from "zod";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { openingFoam, openingSilicone } from "./openingAirSealReference";
import { trimBackerRodLength, trimBackerRodMinRecess, trimBackerRods } from "./trimBackerRodReference";

const gap = z.number().positive().max(6);
const epsilon = 1e-7;
export const openingAirSealSchema = z.strictObject({
  method: z.enum(["foam", "silicone"]),
  left: gap, right: gap, head: gap, sill: gap,
  availableDepth: z.number().positive().max(12),
  sealDepth: z.number().positive().max(6),
  batch: z.string().trim().min(1).max(60).regex(/^[^\r\n]+$/).optional(),
});
export type OpeningAirSeal = z.infer<typeof openingAirSealSchema>;

export function checkOpeningAirSeal(
  frame: { width: number; height: number },
  frameDepth: number,
  measured: OpeningAirSeal,
) {
  const { left, right, head, sill, availableDepth, sealDepth, method } = measured;
  const horizontal = frame.width - (left + right) / 2;
  const vertical = frame.height - (head + sill) / 2;
  const material = method === "foam" ? openingFoam : openingSilicone;
  const issues: string[] = [];
  if (frame.width - left - right <= epsilon || frame.height - sill - head <= epsilon)
    issues.push("The measured interior gaps must leave room for the unit inside the opening.");
  if (sealDepth > availableDepth + epsilon)
    issues.push("The planned air seal is deeper than the smallest measured cavity depth.");
  if (sealDepth >= frameDepth - epsilon)
    issues.push("Keep the interior seal back from the exterior drainage plane.");
  if (method === "foam" && sealDepth > openingFoam.estimateDepth)
    issues.push("This foam estimate covers an interior seal up to 1 in deep. Review the measured detail for deeper seals.");
  if (method === "silicone" && (sealDepth < trimBackerRodMinRecess || sealDepth > openingSilicone.maxDepth))
    issues.push("Plan 1/4 to 1/2 in of sealant above the rod for these products.");
  const edges = [
    { edge: "Left jamb", width: left, length: vertical },
    { edge: "Right jamb", width: right, length: vertical },
    { edge: "Head", width: head, length: horizontal },
    { edge: "Sill", width: sill, length: horizontal },
  ].map((run) => {
    const { edge, width, length } = run;
    const rod = method === "silicone" ? trimBackerRods.find((option) => option.diameter > width + epsilon) : undefined;
    if (width > material.maxWidth + epsilon)
      issues.push(`${edge} is wider than this ${method === "foam" ? "foam" : "silicone"} option covers.`);
    else if (method === "silicone" && !rod)
      issues.push(`${edge} needs a closed-cell rod slightly wider than the gap. Check the delivered fit or choose the foam option.`);
    if (rod && (sealDepth + rod.diameter > availableDepth + epsilon || sealDepth + rod.diameter >= frameDepth - epsilon))
      issues.push(`${edge} needs room for the rod and sealant behind the interior face, clear of exterior drainage.`);
    if (rod && length > trimBackerRodLength + epsilon)
      issues.push(`${edge} exceeds a continuous 20 ft rod cut. Review longer stock.`);
    return { ...run, rod };
  });

  const volume = edges.reduce((sum, run) => sum + run.length * run.width * sealDepth, 0);
  const use = volume / material.coverage;
  return { edges, material, horizontal, vertical, use, length: (horizontal + vertical) * 2, issues };
}

export function openingAirSealSummary(seal: ReturnType<typeof checkOpeningAirSeal>) {
  return `${formatStockLength(seal.length)} of interior air seal · Estimated ${(seal.use * 100).toFixed(1)}% of one ${seal.material.unit} of ${seal.material.name}`;
}

export function openingAirSealEdgeLine({ edge, length, rod }: ReturnType<typeof checkOpeningAirSeal>["edges"][number]) {
  return `${edge} · ${formatStockLength(length)}${rod ? ` · ${formatPreciseInches(rod.diameter)} closed-cell rod` : ""}`;
}
