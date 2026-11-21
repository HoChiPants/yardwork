import { plannedCutKerf } from "./cutStock";
import type { BomRow } from "./engine";
import { formatStockLength } from "./measurement";
import {
  isBatt,
  material,
  type MaterialId,
  type Piece,
  type Project,
} from "./model";
import {
  stockSplitState,
  type StockPlacement,
  type StockPlan,
} from "./packing";
import { ensurePartLabels } from "./partLabels";
import { orientedStockSize } from "./stockAxes";
import { everbiltClosetRod } from "./closetRodReference";
import { reviewRodFit } from "./rodFits";
import { isPexPipe, pexInstallation } from "./wallWaterReference";
import { tubeGroupKey, tubeKerfSchema } from "./cutSourceAxes";
import { fieldTreatmentReference, fieldTreatmentScope, isPressureTreated } from "./treatedWood";

const EPSILON = 1e-8;

type StockRectangle = Pick<StockPlacement, "x" | "y" | "width" | "length">;
export type StockCutLayout = {
  materialId: MaterialId;
  kind: "board" | "sheet" | "tube";
  thickness: number;
  width: number;
  length: number;
  tubeKerf?: number;
  woodKerf?: number;
  kept: (StockRectangle & { id: string })[];
  leftovers: StockRectangle[];
};

export type StockCutSequence = {
  title: string;
  source: string;
  partIds: string[];
  steps: string[];
  remnants: string[];
  followUp: string[];
  review?: string;
  tube?: { key: string; fitsMeasured: boolean };
  layout: StockCutLayout;
};

export const stockCutSequenceContext =
  "Use the cut list with the stock layout. Confirm actual stock dimensions and cutting loss before marking. Predicted leftovers become reusable stock when you record the cuts.";

export function stockCutMaterialNotes(id: MaterialId) {
  if (material(id).shape === "glazing-envelope")
    return {
      text: "SUNLITE layouts keep the flutes parallel to the full panel length. Keep the marked UV face identifiable on blanks and offcuts. Review the saw, support and edge cleanup with Palram’s instructions. Check any shaped cut after laying out the rectangular blank.",
      link: {
        label: "Palram SUNLITE cutting guidance",
        url: "https://www.palram.com/product/sunlite-diy-polycarbonate-multi-wall/",
      },
    };
  if (isPexPipe(id)) return {
    text: "Use a PEX cutter. Measure from the square end of the same-size stick. Keep serviceable remnants labeled by pipe size and verify the actual cut and insertion before installing.",
    link: { label: "SharkBite PEX pipe installation", url: pexInstallation },
  };
  if (isPressureTreated(id))
    return { text: fieldTreatmentScope, link: fieldTreatmentReference };
  if (isBatt(id))
    return {
      text: "Batt layouts assume zero cutting loss from a knife and keep the full thickness. Measure the actual cavity and follow the insulation maker’s handling instructions.",
    };
  return null;
}

const blankSize = (width: number, length: number) =>
  [width, length].map(formatStockLength).join(" × ");

type RectangularCutOrder = Pick<StockCutSequence, "steps" | "remnants" | "review"> & {
  layout: Pick<StockCutLayout, "kept" | "leftovers">;
};

function leftover(
  sequence: RectangularCutOrder,
  rectangle: StockRectangle,
  lengthOnly = false,
) {
  if (rectangle.width <= EPSILON || rectangle.length <= EPSILON) return;
  sequence.layout.leftovers.push(rectangle);
  sequence.remnants.push(
    lengthOnly
      ? formatStockLength(rectangle.length)
      : blankSize(rectangle.width, rectangle.length),
  );
}

function splitStock(
  sequence: RectangularCutOrder,
  available: number,
  keep: number,
  kerf: number,
  operation: string,
  useWhole: string,
) {
  const difference = available - keep;
  const state = stockSplitState(available, keep, kerf);
  if (state === "whole") {
    sequence.steps.push(useWhole);
    return 0;
  }
  if (state === "thin-trim" || state === "too-long") {
    sequence.review ??=
      state === "too-long"
        ? `The planned ${formatStockLength(keep)} dimension exceeds the ${formatStockLength(available)} available. Recheck stock size or adjust the layout.`
        : `A ${formatStockLength(keep)} cut leaves only ${formatStockLength(difference)} to the edge with a ${formatStockLength(kerf)} kerf. Check this edge trim or adjust the layout before cutting this stock unit.`;
    return 0;
  }
  sequence.steps.push(operation);
  return Math.max(difference - kerf, 0);
}

function sheetSequence(
  sequence: RectangularCutOrder,
  sheet: StockPlan,
  kerf: number,
  describePart: (id: string) => string,
  kind: "sheet" | "batt" | "glazing" | "foam",
) {
  const batt = kind === "batt";
  const glazing = kind === "glazing";
  const crosscut = batt
    ? "Knife-cut"
    : glazing
      ? "Cut across the flutes to make"
      : "Crosscut";
  const rip = batt ? "Knife-trim" : glazing ? "Cut along the flutes" : "Rip";
  const trim = batt ? "Knife-trim" : glazing ? "Trim" : "Crosscut";
  const strips = new Map<number, StockPlacement[]>();
  for (const placement of sheet.placements) {
    if (placement.rotated && kind !== "foam") {
      sequence.review =
        "Review a turned blank’s grain and face orientation before recording this sheet.";
      return;
    }
    const strip = strips.get(placement.y) ?? [];
    strip.push(placement);
    strips.set(placement.y, strip);
  }
  let remainingLength = sheet.length;
  for (const [index, [offset, placements]] of Array.from(strips)
    .sort(([a], [b]) => a - b)
    .entries()) {
    if (sequence.review) break;
    const strip = `Strip ${index + 1}`;
    const length = Math.max(...placements.map((placement) => placement.length));
    if (Math.abs(sheet.length - remainingLength - offset) > EPSILON) {
      sequence.review =
        "The strip positions need review before cutting this sheet.";
      break;
    }
    remainingLength = splitStock(
      sequence,
      remainingLength,
      length,
      kerf,
      `${crosscut} ${strip} at ${formatStockLength(length)} from the current end of the ${batt ? "batt" : "sheet"}.`,
      `Use the remaining ${batt ? "batt" : "sheet"} length for ${strip} (${formatStockLength(length)}).`,
    );
    let remainingWidth = sheet.width;
    for (const { id, x, width, length: partLength, rotated } of placements.sort(
      (a, b) => a.x - b.x,
    )) {
      if (sequence.review) break;
      if (Math.abs(sheet.width - remainingWidth - x) > EPSILON) {
        sequence.review = `The part positions in ${strip} need review before cutting this sheet.`;
        break;
      }
      const name = describePart(id) + (rotated ? " (turned on the sheet)" : "");
      sequence.layout.kept.push({
        id,
        x,
        y: offset,
        width,
        length: partLength,
      });
      remainingWidth = splitStock(
        sequence,
        remainingWidth,
        width,
        kerf,
        `${rip} ${formatStockLength(width)} from the current edge of ${strip} for ${name}.`,
        `Use the remaining width of ${strip} for ${name} (${formatStockLength(width)}).`,
      );
      if (partLength < length - EPSILON && !sequence.review) {
        const rest = splitStock(
          sequence,
          length,
          partLength,
          kerf,
          `${trim} the ${name} blank to ${formatStockLength(partLength)} from its end${glazing ? ", cutting across the flutes" : ""}.`,
          "",
        );
        leftover(sequence, {
          x,
          y: offset + partLength + kerf,
          width,
          length: rest,
        });
      }
    }
    leftover(sequence, {
      x: sheet.width - remainingWidth,
      y: offset,
      width: remainingWidth,
      length,
    });
  }
  leftover(sequence, {
    x: 0,
    y: sheet.length - remainingLength,
    width: sheet.width,
    length: remainingLength,
  });
}

export function foamSheetCutOrder(sheet: StockPlan, kerf: number, describe: (id: string) => string) {
  const order: RectangularCutOrder = { steps: [], remnants: [], layout: { kept: [], leftovers: [] } };
  sheetSequence(order, sheet, kerf, describe, "foam");
  return order;
}

export function stockCutSequences(
  project: Project,
  rows: readonly BomRow[],
  tubeKerfOverride?: number | null,
) {
  if (tubeKerfOverride != null) tubeKerfSchema.parse(tubeKerfOverride);
  const savedTubeLoss = new Map(
    project.tubeCutPlans?.map((plan) => [tubeGroupKey(plan.rodIds), plan.kerf]),
  );
  const measuredRodIds = new Set(
    project.tubeCutPlans?.flatMap((plan) => plan.rodIds),
  );
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const labels = new Map(
    ensurePartLabels(project).partLabels.map((row) => [row.partId, row.label]),
  );
  const describePart = (id: string) =>
    `${labels.get(id)} · ${pieces.get(id)!.name}`;
  const groups = new Map<MaterialId, StockCutSequence[]>();
  for (const row of rows) {
    const stock = material(row.id);
    const rod = row.id === everbiltClosetRod.materialId;
    const tube = rod || isPexPipe(row.id);
    const batt = isBatt(row.id);
    const glazing = stock.shape === "glazing-envelope";
    if (
      (!stock.wood && !tube && !batt && !glazing) ||
      !stock.cuttable ||
      (!row.bins.length && !row.sheets.length)
    )
      continue;
    const [thickness, width, length] = [
      ...(stock.stockSize ?? stock.size),
    ].sort((a, b) => a - b);
    const woodKerf = project.woodKerfs?.[row.id];
    const defaultKerf = plannedCutKerf(project, row.id);
    const sequences: StockCutSequence[] = [];
    const createSequence = (
      title: string,
      size: string,
      kind: StockCutLayout["kind"],
      sourceWidth: number,
      sourceLength: number,
      partIds: string[],
      tubeKerf?: number,
    ): StockCutSequence => {
      const kerf = tubeKerf ?? defaultKerf;
      return {
        title,
        partIds,
        source: batt
          ? `${size} · zero modeled knife loss`
          : woodKerf !== undefined || (kind === "tube" && tubeKerf !== undefined)
            ? `${size} · ${formatStockLength(kerf)} measured loss per cut`
            : `${size} · ${formatStockLength(kerf)} ${kind === "tube" || glazing ? "modeled " : ""}kerf`,
        steps: [],
        remnants: [],
        followUp: [],
        layout: {
          materialId: row.id,
          kind,
          thickness,
          width: sourceWidth,
          length: sourceLength,
          ...(kind === "tube" && tubeKerf !== undefined ? { tubeKerf } : {}),
          ...(woodKerf !== undefined ? { woodKerf } : {}),
          kept: [],
          leftovers: [],
        },
      };
    };
    const addFollowUp = (
      sequence: StockCutSequence,
      piece: Piece,
      board: boolean,
    ) => {
      const [partThickness, partWidth] = orientedStockSize(piece);
      if (glazing && piece.stockLengthAxis === null) {
        sequence.review ??= `${describePart(piece.id)} needs a stock length axis along the flutes before you can record this panel.`;
        return;
      }
      if ((batt || glazing) && Math.abs(partThickness - thickness) > EPSILON) {
        sequence.review ??= `${describePart(piece.id)} needs the full source thickness. Review its dimensions and stock length axis.`;
        return;
      }
      if (
        partThickness > thickness + EPSILON ||
        (board && partWidth > width + EPSILON)
      ) {
        sequence.review ??= `${describePart(piece.id)} exceeds the modeled stock cross-section. Review the actual stock or adjust the part.`;
        return;
      }
      const work = [];
      if (partThickness < thickness - EPSILON) work.push("thickness reduction");
      if (piece.cutPlanes.length) work.push("profile cuts");
      if (piece.roundOpenings?.length || piece.rectangularOpenings?.length) work.push("through-cuts");
      if (work.length)
        sequence.followUp.push(
          `${describePart(piece.id)} needs ${work.join(", ")}. Review its part detail after laying out the blank.`,
        );
    };
    for (const [index, bin] of row.bins
      .filter((bin) => !bin.sourceId)
      .entries()) {
      const partIds = bin.cuts.map(({ id }) => id);
      const tubeKey = tube ? tubeGroupKey(partIds) : "";
      const savedLoss = savedTubeLoss.get(tubeKey);
      const tubeKerf = tube
        ? tubeKerfOverride === undefined
          ? savedLoss
          : (tubeKerfOverride ?? undefined)
        : undefined;
      const kerf = tubeKerf ?? defaultKerf;
      const sequence = createSequence(
        `${tube ? "Tube" : "Board"} ${index + 1}`,
        tube
          ? `${formatStockLength(width)} outside diameter × ${formatStockLength(length)}`
          : [thickness, width, length].map(formatStockLength).join(" × "),
        tube ? "tube" : "board",
        width,
        length,
        partIds,
        tubeKerf,
      );
      sequences.push(sequence);
      if (tube) {
        sequence.tube = {
          key: tubeKey,
          fitsMeasured: false,
        };
        for (const { id } of rod ? bin.cuts : []) {
          const fit = reviewRodFit(project, id);
          if (!fit.matchesModel) {
            sequence.review = `${describePart(id)}: ${fit.note} Apply the measured fit before using this stock cut order.`;
            break;
          }
        }
        if (sequence.review) continue;
        sequence.tube.fitsMeasured = true;
        if (
          tubeKerf === undefined &&
          savedLoss === undefined &&
          partIds.some((id) => measuredRodIds.has(id))
        )
          sequence.followUp.push(
            "The rods assigned to this tube changed. Review the cutting loss for the new group.",
          );
      }
      let remaining = length;
      for (const cut of bin.cuts) {
        const piece = pieces.get(cut.id)!;
        if (piece.cutStock) {
          sequence.review =
            "Check the saved source before starting a new cut sequence.";
          break;
        }
        const name = describePart(cut.id);
        const y = length - remaining;
        remaining = splitStock(
          sequence,
          remaining,
          cut.length,
          kerf,
          `${isPexPipe(row.id) ? "Square-cut" : "Crosscut"} ${formatStockLength(cut.length)} from the current end for ${name}.`,
          `Use the remaining ${formatStockLength(cut.length)} for ${name}.`,
        );
        if (sequence.review) break;
        addFollowUp(sequence, piece, true);
        if (sequence.review) break;
        const [, partWidth] = orientedStockSize(piece);
        sequence.layout.kept.push({
          id: cut.id,
          x: 0,
          y,
          width: partWidth,
          length: cut.length,
        });
        if (!tube && partWidth < width - EPSILON) {
          const strip = splitStock(
            sequence,
            width,
            partWidth,
            kerf,
            `Rip ${formatStockLength(partWidth)} from the ${name} blank.`,
            "",
          );
          leftover(sequence, {
            x: partWidth + kerf,
            y,
            width: strip,
            length: cut.length,
          });
        }
      }
      leftover(
        sequence,
        { x: 0, y: length - remaining, width, length: remaining },
        true,
      );
    }
    for (const [index, sheet] of row.sheets.entries()) {
      const sequence = createSequence(
        `${batt ? "Batt" : glazing ? "Panel" : "Sheet"} ${index + 1}`,
        blankSize(sheet.width, sheet.length),
        "sheet",
        sheet.width,
        sheet.length,
        sheet.placements.map(({ id }) => id),
      );
      sequences.push(sequence);
      for (const { id } of sheet.placements)
        addFollowUp(sequence, pieces.get(id)!, false);
      if (!sequence.review)
        sheetSequence(sequence, sheet, defaultKerf, describePart, batt ? "batt" : glazing ? "glazing" : "sheet");
    }
    if (sequences.length) groups.set(row.id, sequences);
  }
  return groups;
}

const markdownLine = (value: string) =>
  value.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ");

export function stockCutSequenceMarkdown(
  project: Project,
  rows: readonly BomRow[],
) {
  const groups = stockCutSequences(project, rows);
  if (!groups.size) return "";
  const sections = [...groups].flatMap(([id, sequences]) => {
    const notes = stockCutMaterialNotes(id);
    const materialNotes = notes
      ? [
          notes.text +
            (notes.link ? ` [${notes.link.label}](${notes.link.url})` : "") +
            "\n",
        ]
      : [];
    return [
      ...materialNotes,
      ...sequences.map(
        ({ title, source, steps, followUp, remnants, review }) => {
          const lines = review
            ? [review]
            : [
                ...steps.map(
                  (step, index) => `${index + 1}. ${markdownLine(step)}`,
                ),
                ...followUp.map((line) => `- ${markdownLine(line)}`),
                ...(remnants.length
                  ? [`- Expected leftovers · ${remnants.join(" · ")}`]
                  : []),
              ];
          return `### ${markdownLine(material(id).name)} · ${title}\n\n${source}\n\n${lines.join("\n")}\n`;
        },
      ),
    ];
  });
  return `\n\n## Stock cut order\n\n${stockCutSequenceContext}\n\n${sections.join("\n")}`;
}
