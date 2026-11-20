import { z } from "zod";

// Palram's long-term range in Celsius, converted to Fahrenheit.
const temperature = z.number().finite().min(-103).max(212);
export const sunliteTemperaturesSchema = z
  .strictObject({
    cold: temperature,
    installation: temperature,
    hot: temperature,
  })
  .refine(
    ({ cold, installation, hot }) =>
      cold <= installation && installation <= hot,
    "Installation sheet temperature must be between the low and high.",
  );
const measuredLength = z.number().finite().min(0).max(240);
const retentionAxis = z.strictObject({
  overlap: measuredLength,
  minimum: measuredLength.positive(),
});
export const sunliteTravelSchema = z.strictObject({
  along: measuredLength,
  across: measuredLength,
  retention: z
    .strictObject({
      along: retentionAxis.optional(),
      across: retentionAxis.optional(),
    })
    .optional(),
});
export type SunliteTravel = z.infer<typeof sunliteTravelSchema>;
export const sunliteThermalSchema = z.strictObject({
  temperatures: sunliteTemperaturesSchema,
  panels: z
    .array(
      z.strictObject({
        partId: z.string().uuid(),
        fingerprint: z.string().min(1).max(100),
        travel: sunliteTravelSchema,
      }),
    )
    .max(1500)
    .refine(
      (panels) =>
        new Set(panels.map(({ partId }) => partId)).size === panels.length,
      "Record one travel measurement per panel.",
    ),
});
