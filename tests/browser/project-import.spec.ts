import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank } from "../../src/model";

test("dropping a ZIP imports its projects as separate library copies", async ({ page }) => {
  const first = blank("Breakfast nook bundle fixture");
  const second = blank("Pantry bundle fixture");
  const archive = zipSync({
    "plans/breakfast.yardwork.json": Buffer.from(JSON.stringify(first)),
    "plans/pantry.json": Buffer.from(JSON.stringify(second)),
    "Start here.md": Buffer.from("Build guide"),
  });
  await page.goto("/");
  const shell = page.locator(".app-shell");
  const files = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(bytes)], "yardwork-plans.zip"));
    return transfer;
  }, [...archive]);
  await shell.dispatchEvent("dragover", { dataTransfer: files });
  await expect(page.getByText("Drop Yardwork projects here", { exact: true })).toBeVisible();
  await shell.dispatchEvent("drop", { dataTransfer: files });
  await files.dispose();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("list", { name: "Projects to import" }).getByRole("listitem")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Import 2 projects", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Your workshop." })).toBeVisible();
  const entries = (await (await page.request.get("/api/projects")).json()) as { name: string; id: string }[];
  const copies = entries.filter(({ name }) => [first, second].some((project) => name === `${project.name} · imported`));
  expect(copies).toHaveLength(2);
  expect(copies.every(({ id }) => id !== first.id && id !== second.id)).toBe(true);
  await dialog.locator(".project-list > button").filter({ hasText: first.name }).click();
  await expect(page.locator(".breadcrumb")).toContainText(first.name);
});

test("multi-file import preserves the current draft and retries only unsaved copies", async ({ page }) => {
  const working = blank("Draft still in progress");
  const first = blank("Multi-file rack fixture");
  const second = blank("Multi-file pantry fixture");
  const json = (project: ReturnType<typeof blank>) => ({
    name: `${project.name}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.goto("/");
  const importPlan = page.getByRole("button", { name: "Import a plan", exact: true });
  await importPlan.click();
  await page.locator("input[type=file]").setInputFiles(json(working));
  await expect(page.locator(".breadcrumb")).toContainText(working.name);
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").project, CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.name).toContain(working.name);
  const original = await readDraft();

  let attempts = 0;
  await page.route("**/api/projects/*", async (route) => {
    const request = route.request();
    if (request.method() === "PUT" && request.postDataJSON().project.name.startsWith(second.name) && attempts++ === 0)
      await route.fulfill({ status: 503, json: { error: "Try saving again." } });
    else await route.continue();
  });
  await importPlan.click();
  await page.locator("input[type=file]").setInputFiles([
    json(first), json(second),
    { name: "broken.json", mimeType: "application/json", buffer: Buffer.from("not JSON") },
  ]);
  const dialog = page.getByRole("dialog");
  const skipped = dialog.getByRole("group", { name: "Files that could not be imported" });
  await expect(skipped).toContainText("broken.json");
  await dialog.getByRole("button", { name: "Import 2 projects", exact: true }).click();
  await expect(dialog.getByText("1 project saved to the library.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Retry 1 project", exact: true }).click();
  await expect(dialog.getByText("2 projects saved to the library.", { exact: true })).toBeVisible();
  expect(await readDraft()).toEqual(original);
  const library = (await (await page.request.get("/api/projects")).json()) as { name: string }[];
  for (const { name } of [first, second])
    expect(library.filter((entry) => entry.name === `${name} · imported`)).toHaveLength(1);
});
