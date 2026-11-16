import { test, expect, type Page } from "@playwright/test";
import { blank, part } from "../../src/model";
async function meshStudy(page: Page, sizes: [number, number][]) {
  const p = blank("Mesh purchase study");
  p.pieces = sizes.map(([w, l], i) =>
    part(
      `Mesh ${i + 1}`,
      "mesh",
      [w, l, 0.04],
      [i * 30, l / 2, 0],
      p.steps[0].id,
      "Wire",
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "mesh.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  return p;
}
test("roll quantities show feasible layouts and the Home Depot handoff copies and downloads stock units", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await meshStudy(page, [
    [13, 200],
    [13, 200],
  ]);
  await expect(page.locator(".bom-row")).toContainText("2 rolls · 2 parts");
  await page.getByText("Roll layout · 2 rolls", { exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Roll \d cutting layout/ }),
  ).toHaveCount(2);
  await page.screenshot({
    path: "test-results/roll-layout.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  const text = await page
    .getByRole("textbox", { name: "Home Depot material list", exact: true })
    .inputValue();
  expect(text).toContain("- 2 rolls — ½ in hardware cloth");
  expect(text).toContain("availability are unverified");
  expect(text).toContain("does not synchronize");
  await page
    .getByRole("button", { name: "Copy material list", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "List copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download text", exact: true })
    .click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/-home-depot\.txt$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toBe(text);
  expect(errors).toEqual([]);
});
test("oversized mesh is flagged and remains excluded from quote and handoff purchase count", async ({
  page,
}) => {
  await meshStudy(page, [
    [25, 200],
    [12, 100],
  ]);
  await expect(page.locator(".bom-row")).toContainText("1 roll · 2 parts");
  await expect(page.locator(".bom-row")).toContainText(
    "1 oversized · excluded from estimate",
  );
  await expect(page.locator(".bom-row")).toContainText("$39.90");
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(page.locator(".stock-incomplete")).toContainText(
    "1 part(s) exceed",
  );
  const text = await page
    .getByRole("textbox", { name: "Home Depot material list", exact: true })
    .inputValue();
  expect(text).toContain("INCOMPLETE MATERIAL LIST");
  expect(text).toContain("- 1 roll — ½ in hardware cloth");
  expect(text).toContain("UNRESOLVED PARTS");
  expect(text).toContain("Mesh 1:");
});
test("blocked clipboard access provides a selected-text fallback instead of claiming a copy succeeded", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
  });
  await meshStudy(page, [[12, 100]]);
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copy material list", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access was blocked",
  );
  await expect(
    page.getByRole("button", { name: "List copied", exact: true }),
  ).toHaveCount(0);
  const selection = await page
    .getByRole("textbox", { name: "Home Depot material list", exact: true })
    .evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }));
  expect(selection).toEqual({
    start: 0,
    end: selection.length,
    length: selection.length,
  });
});
test("the export menu offers the Home Depot handoff without leaving the project", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Prepare Home Depot list Copy/paste handoff",
      exact: false,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Take your list to Home Depot.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Open Home Depot’s list instructions",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://www.homedepot.com/c/create-a-list");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("the printable guide retains roll cutting coordinates and purchase quantities", async ({
  page,
}) => {
  await meshStudy(page, [
    [12, 200],
    [12, 200],
  ]);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-guide")).toBeVisible();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".roll-print-table")).toContainText("Mesh 2");
  await expect(page.locator(".roll-print-table")).toContainText("12 in");
  await expect(page.locator(".print-guide")).toContainText(
    "1 roll × ½ in hardware cloth",
  );
});
