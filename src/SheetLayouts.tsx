import type { BomRow } from "./engine";
import { isBatt, material, type Project } from "./model";
import { formatPreciseInches } from "./measurement";
import { ensurePartLabels, partLabel } from "./partLabels";
import { fitLayoutLabel } from "./layoutLabels";

/** Proposed rectangular blank layout; physical cut provenance remains separate. */
export function sheetPlansMarkdown(rows: BomRow[], project: Project) {
  const sheets = rows.filter((row) => row.sheets.length);
  if (!sheets.length) return "";
  const labeled = ensurePartLabels(project);
  const allowance = sheets.some((row) => isBatt(row.id))
    ? "Proposed layouts use zero modeled knife kerf for batts and ⅛ in kerf for other sheet stock."
    : "Proposed rectangular blank layouts with ⅛ in kerf.";
  return (
    `\n\n## Sheet cutting plans\n\n${allowance} Specified stock-length directions are preserved; otherwise the longer blank dimension follows stock length. Verify grain/flute orientation, edge trimming, actual dimensions and cutting method. Existing physical cut sources are reserved separately and are not repacked. This feasible layout is not a minimum-waste guarantee.\n\n` +
    sheets
      .map((row) =>
        row.sheets
          .map(
            (sheet, i) =>
              `### ${material(row.id).name} · planned ${isBatt(row.id) ? "batt" : "sheet"} ${i + 1}\n\nStock ${formatPreciseInches(sheet.width)} × ${formatPreciseInches(sheet.length)}. Coordinates from the stock's lower-left edge: X across width, Y along length.\n\n` +
              sheet.placements
                .map(
                  (cut) =>
                    `- ${partLabel(labeled, cut.id)} · ${cut.name}: ${formatPreciseInches(cut.width)} × ${formatPreciseInches(cut.length)}; X ${formatPreciseInches(cut.x)}, Y ${formatPreciseInches(cut.y)}.`,
                )
                .join("\n"),
          )
          .join("\n\n"),
      )
      .join("\n\n")
  );
}

export function SheetLayouts({
  row,
  project,
  printable = false,
}: {
  row: BomRow;
  project: Project;
  printable?: boolean;
}) {
  if (!row.sheets.length) return null;
  const batt = isBatt(row.id);
  const labeled = ensurePartLabels(project);
  const content = (
    <>
      <p className="small-note">
        {batt ? "Proposed batt layout · zero modeled knife kerf. Check the actual cavity before trimming."
          : "Proposed blank layout · ⅛ in kerf."} Specified stock-length directions are
        preserved; otherwise the longer blank dimension follows stock length.
        Verify grain/flutes, trim allowance, actual dimensions and cutting
        method. Existing cut sources are reserved separately. Feasible estimate;
        waste is not minimized.
      </p>
      {row.sheets.map((sheet, i) => (
        <div className="sheet-plan" key={i}>
          <strong>
            Planned {batt ? "batt" : "sheet"} {i + 1} · {formatPreciseInches(sheet.width)} ×{" "}
            {formatPreciseInches(sheet.length)}
          </strong>
          <svg
            className="sheet-diagram"
            viewBox={`-1 -1 ${sheet.width + 2} ${sheet.length + 2}`}
            role="img"
            aria-label={`Sheet ${i + 1} cutting layout · ${sheet.placements.map((cut) => partLabel(labeled, cut.id)).join(", ")}`}
          >
            <rect
              width={sheet.width}
              height={sheet.length}
              fill="#eee6d7"
              stroke="#8e887c"
              strokeWidth="0.25"
            />
            {sheet.placements.map((cut, j) => {
              const label = partLabel(labeled, cut.id),
                description = `${label} · ${cut.name}: ${formatPreciseInches(cut.width)} × ${formatPreciseInches(cut.length)}; X ${formatPreciseInches(cut.x)}, Y ${formatPreciseInches(cut.y)}`,
                anchor = fitLayoutLabel(
                  [
                    [cut.x, cut.y],
                    [cut.x + cut.width, cut.y],
                    [cut.x + cut.width, cut.y + cut.length],
                    [cut.x, cut.y + cut.length],
                  ],
                  label,
                  Math.max(sheet.width, sheet.length) / 30,
                );
              return (
                <g
                  key={cut.id}
                  data-placement-id={cut.id}
                  data-part-label={label}
                  aria-label={description}
                >
                  <title>{description}</title>
                  <rect
                    x={cut.x}
                    y={cut.y}
                    width={cut.width}
                    height={cut.length}
                    fill={j % 2 ? "#9cc7ae" : "#bdd5b8"}
                    stroke="#3c7658"
                    strokeWidth="0.2"
                  />
                  {anchor && (
                    <text
                      x={anchor.x}
                      y={anchor.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={anchor.fontSize}
                      fill="#264c3b"
                      aria-hidden="true"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <ul
            className="sheet-legend"
            aria-label={`Parts on planned sheet ${i + 1}`}
            style={{
              listStyle: "none",
              paddingLeft: 0,
              fontSize: 11,
              lineHeight: 1.6,
              overflowWrap: "anywhere",
            }}
          >
            {sheet.placements.map((cut) => (
              <li key={cut.id} data-placement-id={cut.id}>
                <strong>{partLabel(labeled, cut.id)}</strong> · {cut.name} ·{" "}
                {formatPreciseInches(cut.width)} ×{" "}
                {formatPreciseInches(cut.length)} · X{" "}
                {formatPreciseInches(cut.x)}, Y {formatPreciseInches(cut.y)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
  return printable ? (
    <section>
      <h3>{material(row.id).name} · {batt ? "batt" : "sheet"} plans</h3>
      {content}
    </section>
  ) : (
    <details className="sheet-layout">
      <summary>{batt ? "Batt" : "Sheet"} layout · {row.sheets.length} planned {batt ? "batts" : "sheets"}</summary>
      {content}
    </details>
  );
}
