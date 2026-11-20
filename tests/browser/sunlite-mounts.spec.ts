import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part, projectSchema, uid } from "../../src/model";
import { sunliteFastener } from "../../src/sunliteFastenerReference";

test("a SUNLITE drill plan checks measured thermal fit and saves its tool and shopping handoff", async ({
  page,
}, info) => {
  const source = blank(`SUNLITE mounting ${uid().slice(0, 8)}`);
  const step = source.steps[0].id;
  const piece = part(
    "Glazed panel",
    "sunlite-8mm",
    [24, 48, 8 / 25.4],
    [0, 24, 0],
    step,
    "Glazing",
  );
  piece.stockLengthAxis = 1;
  const wood = part(
    "Actual receiving stud",
    "stud",
    [1.5, 48, 3.5],
    [6, 24, -(8 / 25.4 + 3.5) / 2],
    step,
    "Glazing",
  );
  source.pieces = [piece, wood];
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "sunlite-mount-test.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(source)),
    });
  await expect(dialog).toHaveCount(0);
  const readDraft = async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      CURRENT_DRAFT_KEY,
    );
    return raw ? projectSchema.parse(JSON.parse(raw).project) : null;
  };
  await expect.poll(async () => (await readDraft())?.pieces.length).toBe(2);
  const imported = (await readDraft())!;
  const showList = async () => {
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.locator(".sunlite-mount-panel summary").click();
  };
  await page.getByRole("button", { name: "List", exact: true }).click();
  const thermal = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: /^SUNLITE temperature movement$/ }),
  });
  await thermal.locator("summary").click();
  for (const [name, value] of [
    ["Lowest sheet temperature (°F)", "32"],
    ["Installation sheet temperature (°F)", "68"],
    ["Highest sheet temperature (°F)", "120"],
  ]) {
    await thermal.getByRole("spinbutton", { name, exact: true }).fill(value);
  }
  await thermal
    .getByRole("button", { name: "Save temperature range", exact: true })
    .click();

  const mounts = page.locator(".sunlite-mount-panel");
  await mounts.locator("summary").click();
  await mounts.getByRole("button", { name: "Enter mounting detail" }).click();
  await mounts
    .getByRole("textbox", { name: "Mounting detail reference" })
    .fill("Test glazing detail A1");
  for (const [name, value] of [
    ["Stationary datum across flutes", "0"],
    ["Stationary datum along flutes", "0"],
    ["Measured shank diameter", "0.24"],
    ["Effective gasket contact diameter", "0.65"],
    ["Required radial gasket cover", "0.06"],
  ]) {
    await mounts.getByRole("spinbutton", { name, exact: true }).fill(value);
  }
  await mounts.getByRole("button", { name: "Save mounting detail" }).click();
  await mounts.getByRole("button", { name: "Add drill mark" }).click();
  await mounts
    .getByRole("combobox", { name: "Wood backing for this hole", exact: true })
    .selectOption(wood.id);
  await mounts
    .getByRole("spinbutton", { name: "Hole center across flutes", exact: true })
    .fill("6");
  await mounts
    .getByRole("spinbutton", { name: "Hole center along flutes", exact: true })
    .fill("10");
  const bit = mounts.getByRole("spinbutton", {
    name: "Proposed drill diameter",
    exact: true,
  });
  await bit.fill("0.25");
  await mounts.getByRole("button", { name: "Save drill mark" }).click();
  await expect(
    mounts.locator("[data-glazing-hole-state=review]"),
  ).toContainText("more radial clearance");
  await expect(
    mounts.getByRole("button", { name: "Add 1 to Home Depot list" }),
  ).toHaveCount(0);
  await mounts.getByRole("button", { name: "Show holes in 3D" }).click();
  const marker = page.getByTestId("glazing-hole-layout-marker");
  await expect(marker).toHaveText("1 glazing hole to review");
  await page.screenshot({ path: info.outputPath("glazing-hole-review.png") });
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();

  await showList();
  await mounts
    .getByRole("button", { name: "Edit hole 1", exact: true })
    .click();
  await bit.fill("0.3125");
  await mounts.getByRole("button", { name: "Save drill mark" }).click();
  await expect(mounts.locator("[data-glazing-hole-state=fits]")).toContainText(
    "remaining gasket cover",
  );
  await mounts
    .getByRole("button", { name: "Add 1 to Home Depot list" })
    .click();
  await expect(
    mounts.getByRole("button", { name: "Add 1 to Home Depot list" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await readDraft())?.supplies[0]?.productId)
    .toBe(sunliteFastener.productId);
  const saved = (await readDraft())!;
  expect(saved.pieces).toEqual(imported.pieces);
  expect(saved.sunliteMounts?.[0].holes[0].diameter).toBe(0.3125);

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page
      .getByText("Review the polycarbonate drill and bit sizes", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/projects/${saved.id}`);
      return response.ok()
        ? (await response.json()).project.sunliteMounts
        : null;
    })
    .toEqual(saved.sunliteMounts);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  for (const [name, proof] of [
    [/^Build guide/, /SUNLITE fastener hole layout[\s\S]*0\.3125 in bit/],
    [/^Shopping list/, new RegExp(sunliteFastener.internetNumber)],
  ] as const) {
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name }).click();
    expect(await readFile((await (await download).path())!, "utf8")).toMatch(
      proof,
    );
  }
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: source.name })
    .click();
  await showList();
  await expect(mounts.locator("[data-glazing-hole-state=fits]")).toContainText(
    "0.3125 in bit",
  );
});
