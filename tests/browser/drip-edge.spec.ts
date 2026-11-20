import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { gibraltarDripEdge, wissSnips } from "../../src/dripEdgeReference";
import { blank, uid } from "../../src/model";
import { blankProjectCode } from "../../src/projectCodeSchema";

test("drip edge checks, shared stick cuts, tool and Home Depot quantities survive save and export", async ({
  page,
}, info) => {
  const project = blank("Synthetic drip edge roof");
  project.projectCode = {
    ...blankProjectCode(),
    region: "utah",
    codePath: "irc",
    work: "new",
    projectDate: "2026-11-20",
    trades: ["roofing"],
    buildingAuthority: "Synthetic authority",
    authorityBasis: "Synthetic QA project",
    shingleRoof: {
      productId: null,
      coveragePerBundle: null,
      wastePercent: null,
      coverageBasis: "",
      planes: [
        {
          id: uid(),
          label: "Main roof",
          underlayment: "double",
          basis: { kind: "field", run: 48, rise: 10, width: 96 },
        },
      ],
      edges: [
        {
          id: uid(),
          label: "West eave",
          kind: "eave",
          length: 130,
          extra: null,
        },
        {
          id: uid(),
          label: "South rake",
          kind: "rake",
          length: 48,
          extra: null,
        },
      ],
    },
  };
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
      name: "drip-edge.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  const inspector = page.locator(".inspector-scroll");
  const code = inspector.getByText("Project code references", { exact: true });
  const editor = inspector.getByText("Edit project code inputs", {
    exact: true,
  });
  await checks.click();
  await code.click();
  await editor.click();
  await inspector.getByText("Roof drip edge", { exact: true }).click();
  await inspector
    .getByRole("checkbox", { name: "Review roof drip edge", exact: true })
    .check();
  await inspector
    .getByRole("combobox", { name: "Drip edge profile", exact: true })
    .selectOption(gibraltarDripEdge.id);
  const length = (label: string) =>
    inspector.getByRole("spinbutton", { name: label, exact: true });
  const order = (kind: string) =>
    inspector.getByRole("combobox", {
      name: `${kind} underlayment order`,
      exact: true,
    });
  await length("Drip edge splice overlap").fill("2");
  await length("Minimum deck projection").fill("2");
  await length("Minimum drop below sheathing").fill("0.25");
  await length("Maximum drip edge fastener spacing").fill("13");
  await order("Eave").selectOption("over");
  await order("Rake").selectOption("over");
  await length("Drip edge allowance for run 1 · West eave").fill("2");
  await length("Drip edge allowance for run 2 · South rake").fill("0");
  const save = inspector.getByRole("button", {
    name: "Save code review inputs",
    exact: true,
  });
  await save.click();
  const estimate = inspector.getByRole("region", {
    name: "Drip edge estimate",
    exact: true,
  });
  await expect(estimate).toContainText("recommended for 3:12 or steeper");
  const spacing = inspector.getByRole("button", {
    name: /^Drip edge · Fastener spacing/,
  });
  const rake = inspector.getByRole("button", {
    name: /^Drip edge · Rake underlayment order/,
  });
  await expect(spacing).toContainText("Recorded 13 in");
  await expect(rake).toContainText("Recorded over the drip edge");
  await length("Area 1 vertical rise").fill("12");
  await length("Maximum drip edge fastener spacing").fill("12");
  await order("Rake").selectOption("under");
  await save.click();
  await expect(spacing).toHaveCount(0);
  await expect(rake).toHaveCount(0);
  await estimate
    .getByRole("button", {
      name: "Add 2 drip edge sticks to list",
      exact: true,
    })
    .click();
  await expect(estimate).toContainText(
    "2 × 10 ft estimated · 2 on the shopping list",
  );
  await estimate.getByText("Cut list and leftovers", { exact: true }).click();
  await expect(estimate).toContainText(
    "West eave · piece 1 67 in + South rake · piece 1 4 ft · 5 in left",
  );
  await estimate.screenshot({
    path: info.outputPath("drip-edge-cut-list.png"),
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await inspector
    .getByRole("checkbox", { name: "Reviewed M3R", exact: true })
    .check();
  await inspector
    .getByRole("button", { name: "Add M3R to shopping list", exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id as string,
    CURRENT_DRAFT_KEY,
  );
  const saved = await page.request.get(`/api/projects/${id}`);
  expect(saved.ok()).toBe(true);
  const { project: stored } = await saved.json();
  expect(stored.projectCode.shingleRoof.dripEdge).toMatchObject({
    fastenerSpacing: 12,
    lap: 2,
    rakeUnderlayment: "under",
  });
  expect(
    stored.supplies.map(
      ({ productId, quantity }: { productId: string; quantity: number }) => [
        productId,
        quantity,
      ],
    ),
  ).toEqual([
    [gibraltarDripEdge.id, 2],
    [wissSnips.id, 1],
  ]);
  expect(stored.toolSelections[0].productId).toBe(wissSnips.id);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("West eave · 67 in + 67 in before corner shaping.");
  expect(guide).toContain("Cut galvanized drip edge");
  await expect(page.locator(".print-guide")).toContainText(
    "South rake · piece 1 4 ft · 5 in left",
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog
    .locator(".project-list > button")
    .filter({ hasText: stored.name })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: stored.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  const shopping = page.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(shopping).toHaveValue(/2 10 ft drip edge sticks.*#202092840/);
  await expect(shopping).toHaveValue(/1 aviation snip.*#100065942/);
});
