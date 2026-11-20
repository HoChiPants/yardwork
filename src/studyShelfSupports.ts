import type { Project } from "./model";
import {
  attachmentReviews,
  makeShelfPinPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
} from "./attachments";
import type { ShelfPinLayout } from "./attachmentSchema";
import { attachmentPurchaseSummaries } from "./attachmentPurchases";
import { everbiltShelfPin, type HomeDepotShelfPinId } from "./shelfPinReference";

export type StudyShelfInsets = Pick<ShelfPinLayout, "frontInset" | "rearInset">;
export const defaultStudyShelfInsets: StudyShelfInsets = {
  frontInset: 2,
  rearInset: 2,
};

/** Draft the selected study's four bearing targets per shelf, with measurements pending. */
export function previewStudyShelfSupports(
  project: Project,
  insets: StudyShelfInsets,
  productId: HomeDepotShelfPinId = everbiltShelfPin.productId,
) {
  const [entry, ...others] = shelfSupportEntries(project);
  if (!entry || others.length || entry.requiresRoleMapping)
    throw Error(
      "Assign the study's actual shelf and side-panel roles before planning supports.",
    );

  const plan = makeShelfPinPlan(project, entry.entryId, {
    name:
      entry.kind === "closet-insert"
        ? "Closet tower shelf supports"
        : "Bookcase shelf supports",
    productId,
    shelfRoles: entry.shelves.map(({ role }) => role),
    layout: { ...insets, system: "custom", datumHeight: null },
  });
  const candidate = saveShelfPinPlan(project, plan);
  const reviews = attachmentReviews(candidate);
  const review = reviews.find((item) => item.plan.id === plan.id)!;
  const purchases = attachmentPurchaseSummaries(candidate, reviews).find(
    (item) => item.productId === plan.productId,
  )!;
  return { project: candidate, review, purchases };
}
