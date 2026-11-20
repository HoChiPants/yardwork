import type { Project } from "./model";
import { paslodeFinishNails as stock } from "./paslodeFinishReference";
import { purchaseCount } from "./purchaseUnits";
import { addSupply } from "./supplies";
import { supplySelectionSchema } from "./supplySchema";

export function saunaNailBoxPlan(project: Project, nails: number) {
  const boxes = purchaseCount(nails, stock.packCount).quantity;
  const selected = project.supplies.reduce(
    (sum, row) => sum + (row.productId === stock.id ? row.quantity : 0),
    0,
  );
  return { boxes, selected, missing: Math.max(0, boxes - selected) };
}

export function addSaunaNailBoxes(project: Project, nails: number) {
  const { missing } = saunaNailBoxPlan(project, nails);
  if (!missing) return project;
  if (!supplySelectionSchema.shape.quantity.safeParse(missing).success)
    throw Error(
      "This quantity exceeds the shopping list limit. Check the entered nail count.",
    );
  return addSupply(
    project,
    stock.id,
    missing,
    "Sauna cedar lining",
    `User-entered requirement for new boxes: ${nails} nails. Confirm fastener fit and recheck the count if the lining or attachment plan changes.`,
  );
}
