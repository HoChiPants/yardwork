import { solidBounds, clipBox } from "./cutProfiles";
import { bindingHash } from "./ideaBindingState";
import { ensurePartLabels } from "./partLabels";
import { stockAxes } from "./stockAxes";
import { formatPreciseInches } from "./measurement";
import type { Piece, Project } from "./model";
import {
  sunliteTemperaturesSchema,
  sunliteTravelSchema,
} from "./sunliteThermalSchema";

export const sunliteThermalSource =
  "https://www.palram.com/us/product/sunlite-polycarbonate-multi-wall/?lang=en";
export const sunliteThermalScope =
  "Enter travel and edge overlap from the actual mounting arrangement. The cold check applies the full shrinkage on each axis to its least-engaged edge. Use the required overlap for your installed profiles. Review profile fit, fasteners, drainage, weather sealing and loads separately.";
const coefficientPerCelsius = 0.000065;
export const sunliteTemperatureMovement = (size: number, differenceF: number) =>
  size * coefficientPerCelsius * differenceF * (5 / 9);
const glazing = (project: Project) =>
  project.pieces.filter(
    (piece) => piece.material === "sunlite-8mm" && !piece.offcut,
  );
const fingerprint = (piece: Piece, installation: number) =>
  bindingHash([
    piece.size,
    piece.position,
    piece.rotation,
    piece.cutPlanes,
    piece.stockLengthAxis,
    piece.cutStock,
    installation,
  ]);

export function saveSunliteTemperatures(
  project: Project,
  input: unknown,
): Project {
  const temperatures = sunliteTemperaturesSchema.parse(input);
  return {
    ...project,
    sunliteThermal: {
      temperatures,
      panels: project.sunliteThermal?.panels ?? [],
    },
    guideFingerprint: null,
  };
}

export function saveSunliteTravel(
  project: Project,
  partId: string,
  input: unknown,
): Project {
  const plan = project.sunliteThermal;
  const piece = glazing(project).find((item) => item.id === partId);
  if (!plan || !piece || piece.stockLengthAxis == null)
    throw Error(
      "Save a temperature range and select a current panel with a flute direction.",
    );
  const travel = sunliteTravelSchema.parse(input);
  const panels = plan.panels.filter((item) => item.partId !== partId);
  if (panels.length >= 1500)
    throw Error("This study has reached its panel travel record limit.");
  return {
    ...project,
    sunliteThermal: {
      ...plan,
      panels: [
        ...panels,
        {
          partId,
          travel,
          fingerprint: fingerprint(piece, plan.temperatures.installation),
        },
      ],
    },
    guideFingerprint: null,
  };
}

export function sunliteThermalReview(project: Project) {
  const plan = project.sunliteThermal;
  if (!plan) return null;
  const { installation, hot, cold } = plan.temperatures;
  const labels = new Map(
    ensurePartLabels(project).partLabels.map((row) => [row.partId, row.label]),
  );
  const saved = new Map(plan.panels.map((row) => [row.partId, row]));
  const rows = glazing(project).flatMap((piece) => {
    if (piece.stockLengthAxis == null) return [];
    const { length, width } = stockAxes(piece);
    const { min, max } = solidBounds(clipBox(piece.size, piece.cutPlanes));
    const record = saved.get(piece.id);
    const current = record?.fingerprint === fingerprint(piece, installation);
    const compare = (axis: number, direction: "along" | "across") => {
      const span = max[axis] - min[axis];
      const growth = sunliteTemperatureMovement(span, hot - installation);
      const shrinkage = sunliteTemperatureMovement(span, installation - cold);
      const usableGrowth = current ? record.travel[direction] : null;
      const measured = current
        ? record.travel.retention?.[direction]
        : undefined;
      const remaining = measured ? measured.overlap - shrinkage : null;
      return {
        growth,
        shrinkage,
        usableGrowth,
        shortage:
          usableGrowth === null ? null : Math.max(0, growth - usableGrowth),
        retention:
          measured && remaining !== null
            ? {
                ...measured,
                remaining,
                shortage: Math.max(0, measured.minimum - remaining),
              }
            : null,
      };
    };
    return [
      {
        id: piece.id,
        label: labels.get(piece.id)!,
        name: piece.name,
        along: compare(length, "along"),
        across: compare(width, "across"),
        stale: !!record && !current,
      },
    ];
  });
  return {
    temperatures: plan.temperatures,
    rows,
    excluded: glazing(project).length - rows.length,
  };
}

export type SunliteThermalReview = NonNullable<
  ReturnType<typeof sunliteThermalReview>
>;
type ThermalAxis = SunliteThermalReview["rows"][number]["along"];
export function coldRetentionText(axis: ThermalAxis) {
  const review = axis.retention;
  if (!review) return "Cold overlap pending";
  const remaining =
    review.remaining < 0
      ? `projected to lose capture by ${formatPreciseInches(-review.remaining)}`
      : `${formatPreciseInches(review.remaining)} projected cold overlap`;
  const shortage =
    review.shortage > 1e-8
      ? ` · short ${formatPreciseInches(review.shortage)}`
      : "";
  return `${formatPreciseInches(review.overlap)} measured overlap · ${remaining} · ${formatPreciseInches(review.minimum)} required${shortage}`;
}

export function thermalAxisText(axis: ThermalAxis) {
  const estimate = `+${formatPreciseInches(axis.growth)} growth · ${formatPreciseInches(axis.shrinkage)} shrinkage`;
  if (axis.usableGrowth === null) return estimate;
  const room = `${formatPreciseInches(axis.usableGrowth)} measured travel`;
  return axis.shortage! > 1e-8
    ? `${estimate} · ${room} · short ${formatPreciseInches(axis.shortage!)}`
    : `${estimate} · ${room}`;
}

export function sunliteThermalMarkdown(project: Project) {
  const review = sunliteThermalReview(project);
  if (!review?.rows.length && !review?.excluded) return "";
  const { cold, installation, hot } = review.temperatures;
  return [
    "\n\n## SUNLITE temperature movement",
    "",
    `Sheet temperatures · low ${cold} °F · installation ${installation} °F · high ${hot} °F.`,
    sunliteThermalScope,
    `[Palram thermal coefficient · ASTM D-696](${sunliteThermalSource})`,
    "",
    ...review.rows.map(
      (row) =>
        `- ${row.label} · Along flutes ${thermalAxisText(row.along)}. Across flutes ${thermalAxisText(row.across)}.${row.stale ? " Remeasure travel and overlap after the panel or installation temperature changed." : ""}` +
        (row.along.retention || row.across.retention
          ? `\n  - Cold retention along flutes · ${coldRetentionText(row.along)}. Across flutes · ${coldRetentionText(row.across)}.`
          : ""),
    ),
    ...(review.excluded
      ? [
          `- ${review.excluded} panels need a flute direction before comparison.`,
        ]
      : []),
    "",
  ].join("\n");
}
