import { bom } from "./engine";
import { format, material, type Project } from "./model";
const clean = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
/** Human-reviewed paste handoff. This is text for the retailer's list builder, not a native project file. */
export function homeDepotHandoff(project: Project): string {
  const rows = bom(project),
    oversized = rows.flatMap((r) => r.oversizedParts);
  const lines = [
    `Project: ${clean(project.name)}`,
    `Store: ${clean(project.store) || "not selected"} | ZIP: ${project.zip}`,
    "",
    oversized.length
      ? "INCOMPLETE MATERIAL LIST — resolve the oversized parts below before ordering."
      : "MATERIAL LIST FOR REVIEW",
    "",
    "PURCHASE STOCK UNITS",
    "Use the whole-stock quantities below. Cut pieces and offcuts are already accounted for; do not add them again.",
    "",
  ];
  for (const row of rows) {
    if (!row.quantity) continue;
    const m = material(row.id);
    lines.push(
      `- ${row.quantity} ${m.unit}${row.quantity === 1 ? "" : "s"} — ${m.name} — ${m.subtitle}`,
    );
    if (row.inventory) {
      lines.push(
        `  Product: ${clean(row.inventory.name)} | Internet number: ${row.inventory.internetNumber}`,
        `  ${row.inventory.url}`,
        `  User-recorded snapshot: ${row.inventory.available} available at store ${clean(row.inventory.store)}, ZIP ${row.inventory.zip}; checked ${row.inventory.checkedAt}. Confirm current stock.`,
      );
    } else
      lines.push(
        "  Exact product match and availability are unverified. Match the listed stock dimensions and purchase unit.",
      );
  }
  if (!rows.some((r) => r.quantity))
    lines.push("No fitting stock units have been calculated.");
  if (oversized.length) {
    lines.push(
      "",
      "UNRESOLVED PARTS — excluded from the purchase quantities and cost estimate",
    );
    for (const piece of oversized)
      lines.push(
        `- ${clean(piece.name)}: ${piece.size.map(format).join(" × ")} — ${material(piece.material).name}. Needs a suitable stock product or revised dimensions.`,
      );
  }
  lines.push(
    "",
    "PROJECT PHASES — organize the purchase list without duplicating its quantities",
  );
  project.steps.forEach((s, i) => lines.push(`${i + 1}. ${clean(s.title)}`));
  lines.push(
    "",
    "Review the retailer draft: quantities, units, exact products, substitutions, and store availability. Tax, delivery, waste allowance, roof overlaps, and construction adequacy are not established by this list.",
    "Keep the Yardwork JSON separately for the editable 3D plan, connections, and build guide. This text does not synchronize a Home Depot account.",
  );
  return lines.join("\n");
}
