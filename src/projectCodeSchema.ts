import { z } from "zod";
import { plumbingVentLayoutSchema } from "./plumbingVentSchema";
import { dryerExhaustSchema } from "./dryerExhaustSchema";
import { shingleRoofSchema } from "./shingleRoofSchema";

export const tradeNames = {
  building: "Building / structural",
  roofing: "Roofing",
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  irrigation: "Landscape irrigation",
  sprinklers: "Fire sprinklers",
  pool: "Pool / spa",
} as const;

export const projectCodeTrades = z.enum([
  "building",
  "roofing",
  "plumbing",
  "electrical",
  "hvac",
  "irrigation",
  "sprinklers",
  "pool",
]);
const fact = z.enum(["unknown", "yes", "no"]);
const note = (limit: number) => z.string().trim().max(limit);
export const projectCodeSchema = z.strictObject({
  region: z.enum(["unconfirmed", "utah", "other"]),
  projectDate: z.iso.date().nullable(),
  siteReference: note(180),
  buildingAuthority: note(100),
  fireAuthority: note(100),
  authorityBasis: note(400),
  permitNotes: note(400),
  codePath: z.enum(["unknown", "irc", "ibc"]),
  work: z.enum(["unknown", "new", "existing"]),
  trades: z
    .array(projectCodeTrades)
    .max(projectCodeTrades.options.length)
    .refine(
      (trades) => new Set(trades).size === trades.length,
      "Choose each work area once.",
    ),
  wallVent: z.strictObject({
    inScope: fact,
    projection: z.number().finite().min(0).max(240).nullable(),
    elbow: z.enum(["unknown", "down", "other"]),
    layout: plumbingVentLayoutSchema.optional(),
  }),
  dryerExhaust: dryerExhaustSchema.optional(),
  shingleRoof: shingleRoofSchema.optional(),
  fireSystem: z.enum(["unknown", "nfpa-13", "nfpa-13d", "nfpa-13r"]),
  irrigationSupply: z.enum([
    "unknown",
    "potable",
    "secondary",
    "dual",
    "graywater",
  ]),
});
export type ProjectCodeContext = z.infer<typeof projectCodeSchema>;
export type ProjectCodeTrade = z.infer<typeof projectCodeTrades>;

export function blankProjectCode(): ProjectCodeContext {
  return {
    region: "unconfirmed",
    projectDate: null,
    siteReference: "",
    buildingAuthority: "",
    fireAuthority: "",
    authorityBasis: "",
    permitNotes: "",
    codePath: "unknown",
    work: "unknown",
    trades: [],
    wallVent: { inScope: "unknown", projection: null, elbow: "unknown" },
    fireSystem: "unknown",
    irrigationSupply: "unknown",
  };
}
