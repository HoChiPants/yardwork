import { z } from "zod";

export const subfloorChecksSchema = z.array(z.uuid()).max(32).refine(
  (ids) => new Set(ids).size === ids.length,
  "Keep one subfloor check per panel.",
);
