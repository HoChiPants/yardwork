import type { Page } from "@playwright/test";

export async function confirmMaterialPlacement(page: Page, option?: string) {
  const dialog = page.getByRole("dialog");
  if (option) await dialog.getByRole("radio", { name: option, exact: true }).check();
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
}

export async function addFramingLumber(page: Page, length?: string) {
  await page.getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true }).click();
  await confirmMaterialPlacement(page, length);
}
