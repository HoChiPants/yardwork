import { z } from "zod";

export const sunliteTapeProductId = "sunlite-92763";
export const sunliteTapeRollLength = 32 * 12;
export const sunliteTapeStripInputLimit = 2 * sunliteTapeRollLength;
export const sunliteTapeSide = z.enum(["upper", "lower"]);
export type SunliteTapeSide = z.infer<typeof sunliteTapeSide>;

const evidence = {
  basis: z.string().trim().min(1).max(400),
  measuredAt: z.iso.datetime(),
};

export const sunliteTapeLengthInput = z.strictObject({
  length: z.number().positive().max(sunliteTapeStripInputLimit),
  ...evidence,
});

export const sunliteTapeAllowanceInput = z.strictObject({
  upper: z.number().min(0).max(sunliteTapeRollLength),
  lower: z.number().min(0).max(sunliteTapeRollLength),
  ...evidence,
});

const tapeCut = sunliteTapeLengthInput.extend({
  runId: z.string().min(1).max(160),
  fingerprint: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  side: sunliteTapeSide,
  source: z.enum(["entered-length", "layout-allowance"]),
});

export const sunliteTapeCutsSchema = z
  .array(tapeCut)
  .min(1)
  .max(1500)
  .refine(
    (cuts) => new Set(cuts.map(({ runId }) => runId)).size === cuts.length,
    "Record one tape strip per panel edge.",
  );
export type SunliteTapeCut = z.infer<typeof tapeCut>;
