import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part, uid } from "../../src/model";
import { rotate } from "../../src/spatial";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { blankProjectCode } from "../../src/projectCodeSchema";
import {
  gafRoofShingle,
  shingleEdgeProducts,
} from "../../src/shingleRoofReference";

test("preview multiple roof deck bays from the planner and carry scrap cuts into the guide", async ({ page }) => {
  const base = blank("Roof backing bay");
  const step = base.steps[0].id;
  const rotation: [number, number, number] = [Math.atan(3 / 12), 0, 0];
  const make = (name: string, stock: "plywood" | "stud", size: [number, number, number], position: [number, number, number]) => {
    const [x, y, z] = rotate(position, rotation);
    return { ...part(name, stock, size, [x, 48 + y, z], step, "Roof"), rotation };
  };
  const decks = [make("Lower roof deck", "plywood", [96, 0.75, 48], [0, 0, 0]),
    make("Upper roof deck", "plywood", [96, 0.75, 48], [0, 0, 48.125])];
  base.pieces.push(...decks, ...[-24, 0, 24].map((x) => make(`Rafter ${x}`, "stud", [1.5, 3.5, 96], [x, -2.125, 24])));
  base.projectCode = { ...blankProjectCode(), trades: ["roofing"], shingleRoof: {
    productId: null, coveragePerBundle: null, wastePercent: null, coverageBasis: "",
    planes: decks.map(({ id, name }) => ({ id: uid(), label: name, basis: { kind: "panel", pieceId: id }, underlayment: "unknown" })),
  } };
  const project = addMeasuredOffcut(base, step, "stud", [60, 3.5, 1.5], "On-hand framing scrap");
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "roof-blocking.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const prompt = dialog.getByRole("textbox", { name: "Describe your idea" });
  const explore = dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ });
  await prompt.fill("Fit roof deck blocking between P001 and P009.");
  await explore.click();
  const answer = dialog.getByRole("region", { name: "Fit roof deck blocking", exact: true });
  const startPreview = answer.getByRole("button", { name: "Preview blocking for all bays", exact: true });
  await expect(answer).toContainText("No modeled roof deck joint matches those panel labels.");
  await expect(startPreview).toHaveCount(0);
  await prompt.fill("Fit roof deck blocking for P1 from new stock.");
  await explore.click();
  await expect(answer).toContainText("2 candidate framing bays.");
  await startPreview.click();
  const fit = page.getByRole("region", { name: "Fit roof deck blocking", exact: true });
  const preview = fit.getByRole("region", { name: "Roof blocking preview", exact: true });
  await expect(fit.getByLabel("Framing bay")).toHaveValue("all-bays");
  await expect(fit.getByLabel("Use matching on-hand offcuts")).not.toBeChecked();
  await expect(preview).toContainText("2 of 2 bays ready · 1 new board · 0 on-hand offcuts");

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await prompt.fill("Fit roof deck blocking between P001 and P002 using scraps.");
  await explore.click();
  await startPreview.click();
  await expect(fit.getByLabel("Use matching on-hand offcuts")).toBeChecked();
  await expect(page.getByTestId("support-block-preview-marker")).toContainText("Roof deck blocking preview · 2 bays");
  await expect(preview).toContainText("2 of 2 bays ready · 0 new boards · 1 on-hand offcut");
  await expect(preview).toContainText("Use O001 from the Cut pool. Crosscut to 22.5 in");
  await expect(preview).toContainText("Use O002 from the preceding cuts. Crosscut to 22.5 in");
  await expect(preview).toContainText("Keep O003 · 14.75 in");
  await expect(preview).toContainText("22.5 in and 22.5 in of contact");
  await preview.getByRole("button", { name: "Add roof blocking", exact: true }).click();
  await expect(page.getByText("2 roof blocks added. The cuts are in the build guide.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  const cutOrder = guide.split("## Recorded offcut cut order")[1]?.split("\n## ")[0] ?? "";
  expect(cutOrder).toContain("O001 → P006 · Roof deck blocking");
  expect(cutOrder).toContain("O002 → P007 · Roof deck blocking");
  expect(cutOrder).toContain("remnant from cut 1");
  expect(cutOrder.match(/Crosscut to 22\.5 in/g)).toHaveLength(2);
  expect(cutOrder).toContain("Keep O003 · 14.75 in");
});

test("show the modeled roof deck joint requested in the planner and export its reference", async ({ page }) => {
  const project = blank("Roof deck joint spacing");
  const stepId = project.steps[0].id;
  const west = part("West deck sheet", "plywood", [96, 0.75, 48], [0, 48, 0], stepId, "Roof");
  const east = part("East deck sheet", "plywood", [96, 0.75, 48], [96.0625, 48, 0], stepId, "Roof");
  west.rotation = east.rotation = [Math.atan(3 / 12), 0, 0];
  const [x, y, z] = rotate([48.03125, -2.125, -9], west.rotation);
  const backing = part("Partial joint support", "stud", [1.5, 3.5, 30], [x, 48 + y, z], stepId, "Roof");
  backing.rotation = [...west.rotation];
  project.pieces.push(west, east, backing);
  project.projectCode = {
    ...blankProjectCode(), trades: ["roofing"],
    shingleRoof: {
      productId: null, coveragePerBundle: null, wastePercent: null, coverageBasis: "",
      planes: [west, east].map(({ id, name }) => ({
        id: uid(), label: name, basis: { kind: "panel", pieceId: id }, underlayment: "unknown",
      })),
    },
  };
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "roof-joint.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Check roof deck backing.");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  const result = dialog.getByRole("region", { name: "Roof deck joint spacing" });
  await expect(result).toContainText("0.0625 in gap along 4 ft");
  await expect(result).toContainText("0.0625 in below the APA ⅛ in installation reference");
  await expect(result).toContainText("P002 has 18 in of 4 ft without modeled framing under its fastener line");
  await result.getByRole("button", { name: "Show joint in 3D", exact: true }).click();
  await expect(page.getByTestId("roof-deck-joint-marker")).toHaveText("Roof deck joint · P001 and P002 · 0.0625 in gap");
  await page.getByRole("button", { name: "Hide highlighted area", exact: true }).click();

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Check roof deck end bearing.");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  const ends = dialog.getByRole("region", { name: "Roof deck end bearing" });
  await expect(ends).toContainText("Checked 4 panel ends against the modeled framing.");
  await expect(ends).toContainText("4 ft of 4 ft at the end edge lacks modeled bearing.");
  await ends.getByRole("button", { name: "Show end in 3D", exact: true }).first().click();
  await expect(page.getByTestId("roof-deck-end-marker")).toHaveText("Roof deck end · P001 · end 1");
  await page.getByRole("button", { name: "Hide highlighted area", exact: true }).click();

  const inspector = page.locator(".inspector-scroll");
  await inspector.getByText("Project code references", { exact: true }).click();
  await expect(inspector.getByRole("link", { name: "APA Rated Sheathing roof installation · N335" })).toBeVisible();
  await expect(page.locator(".print-guide")).toContainText("Roof deck joint · P001 and P002");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Roof deck joint · P001 and P002 · 0.0625 in gap along 4 ft");
  expect(guide).toContain("P001 has 18 in of 4 ft without modeled framing under its fastener line");
  expect(guide).toContain("Roof deck end · P001 · end 1 · 4 ft of 4 ft at the end edge lacks modeled bearing.");
  expect(guide).toContain("APA Rated Sheathing roof installation · N335");
});

test("roof pitch follows the model and field, starter and cap bundles reach the Home Depot list", async ({
  page,
}, info) => {
  const project = blank("Synthetic shingle roof");
  const deck = part(
    "South deck",
    "plywood",
    [96, 0.75, 48],
    [0, 48, 0],
    project.steps[0].id,
    "Roof",
  );
  deck.rotation = [Math.atan(1.5 / 12), 0, 0];
  project.pieces.push(deck);
  project.projectCode = {
    ...blankProjectCode(),
    region: "utah",
    codePath: "irc",
    work: "new",
    projectDate: "2026-11-20",
    trades: ["roofing"],
    buildingAuthority: "Synthetic authority",
    authorityBasis: "Synthetic residential project for verification",
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
      name: "shingle-deck.yardwork.json",
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
  await inspector
    .getByRole("checkbox", { name: "Review asphalt shingles", exact: true })
    .check();
  await inspector
    .getByRole("combobox", { name: "Area 1 deck panel", exact: true })
    .selectOption(deck.id);
  await inspector
    .getByRole("combobox", { name: "Area 1 underlayment", exact: true })
    .selectOption("single");
  await inspector
    .getByRole("combobox", { name: "Field shingle product", exact: true })
    .selectOption(gafRoofShingle.id);
  await inspector
    .getByRole("spinbutton", {
      name: "Verified coverage per bundle (sq ft)",
      exact: true,
    })
    .fill("20");
  await inspector
    .getByRole("spinbutton", {
      name: "Cut and waste allowance (%)",
      exact: true,
    })
    .fill("10");
  await inspector
    .getByRole("textbox", { name: "Bundle coverage notes", exact: true })
    .fill("Synthetic supplier-confirmed bundle coverage");
  const save = inspector.getByRole("button", {
    name: "Save code review inputs",
    exact: true,
  });
  await save.click();
  const pitchWarning = inspector.getByRole("button", {
    name: /^Roof area 1 · Shingle pitch/,
  });
  await expect(pitchWarning).toContainText("Measured 1.5:12");
  const estimate = inspector.getByTestId("shingles-bundle-estimate");
  await expect(estimate).toContainText("Review the measured areas and pitch");
  const area = inspector.getByRole("button", {
    name: /^Roof area · Roof area 1/,
  });
  await area.click();
  const marker = page.getByTestId("roof-plane-marker");
  await expect(marker).toContainText("1.5:12");
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${deck.id}"]`).click();
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  await pitch.fill(String((Math.atan(3 / 12) * 180) / Math.PI));
  await pitch.press("Tab");
  await checks.click();
  const underlayment = inspector.getByRole("button", {
    name: /^Roof area 1 · Low-slope underlayment/,
  });
  await expect(underlayment).toContainText(
    "A single ordinary layer is recorded",
  );
  await expect(pitchWarning).toHaveCount(0);
  await code.click();
  await expect(estimate).toContainText("2 field-shingle bundles estimated");
  await editor.click();
  await inspector
    .getByRole("combobox", { name: "Area 1 underlayment", exact: true })
    .selectOption("double");
  await save.click();
  await expect(underlayment).toHaveCount(0);
  await inspector
    .getByRole("button", { name: "Add 2 shingle bundles to list", exact: true })
    .click();
  await expect(estimate).toContainText("2 on the shopping list");
  await expect(
    inspector.getByRole("button", { name: /Add [0-9]+ shingle/ }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  const canvas = (await page.locator("canvas").boundingBox())!;
  for (const [end, x, offset] of [
    ["A", 0, 0.42],
    ["B", 96, 0.58],
  ] as const) {
    await page.mouse.click(
      canvas.x + canvas.width * offset,
      canvas.y + canvas.height * 0.6,
    );
    await page
      .getByText(`Point ${end} · exact coordinates`, { exact: true })
      .click();
    for (const [axis, value] of [
      ["X", x],
      ["Y", 0],
      ["Z", 0],
    ] as const) {
      const input = page.getByRole("spinbutton", {
        name: `Point ${end} ${axis}`,
        exact: true,
      });
      await input.fill(String(value));
      await input.press("Tab");
    }
  }
  await expect(page.getByLabel("Measured distance")).toContainText("96.000 in");
  await page
    .getByRole("button", { name: "Done measuring", exact: true })
    .click();
  if (
    !(await editor.evaluate(
      (summary) => (summary.parentElement as HTMLDetailsElement).open,
    ))
  )
    await editor.click();
  await inspector
    .getByText("Starter strips and ridge caps", { exact: true })
    .click();
  const addEdge = inspector.getByRole("button", {
    name: "Add roof edge",
    exact: true,
  });
  await addEdge.click();
  await inspector
    .getByRole("textbox", { name: "Edge 1 name", exact: true })
    .fill("South eave");
  await inspector
    .getByRole("button", {
      name: "Copy tape length to edge 1 · 8 ft",
      exact: true,
    })
    .click();
  await expect(
    inspector.getByRole("spinbutton", { name: "Edge 1 length", exact: true }),
  ).toHaveValue("96");
  await inspector
    .getByRole("spinbutton", { name: "Edge 1 cut allowance", exact: true })
    .fill("6");
  await addEdge.click();
  await inspector
    .getByRole("textbox", { name: "Edge 2 name", exact: true })
    .fill("Main ridge");
  await inspector
    .getByRole("combobox", { name: "Edge 2 type", exact: true })
    .selectOption("ridge");
  await inspector
    .getByRole("combobox", { name: "Edge 2 length units", exact: true })
    .selectOption("ft");
  await inspector
    .getByRole("spinbutton", { name: "Edge 2 length", exact: true })
    .fill("25");
  await inspector
    .getByRole("spinbutton", { name: "Edge 2 cut allowance", exact: true })
    .fill("0");
  await save.click();
  const starter = inspector.getByRole("region", {
    name: shingleEdgeProducts.starter.label,
  });
  const cap = inspector.getByRole("region", {
    name: shingleEdgeProducts.cap.label,
  });
  await expect(starter).toContainText(
    "South eave · Eave · 8 ft · 6 in cut allowance",
  );
  await expect(cap).toContainText(
    "46 cap pieces including one starter per run",
  );
  await starter
    .getByRole("button", { name: "Add 1 starter bundle to list" })
    .click();
  await cap.getByRole("button", { name: "Add 2 cap bundles to list" }).click();
  await expect(starter).toContainText(
    "1 starter bundle estimated · 1 on the shopping list",
  );
  await expect(cap).toContainText(
    "2 cap bundles estimated · 2 on the shopping list",
  );
  await cap.screenshot({
    path: info.outputPath("shingle-roof-cap.png"),
    animations: "disabled",
  });

  await area.click();
  await expect(marker).toContainText("3:12");
  await page.screenshot({
    path: info.outputPath("shingle-roof-pitch.png"),
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id as string,
    CURRENT_DRAFT_KEY,
  );
  const api = await page.request.get(`/api/projects/${id}`);
  expect(api.ok()).toBe(true);
  const saved = (await api.json()).project;
  expect(saved.projectCode.shingleRoof.planes[0]).toMatchObject({
    basis: { kind: "panel", pieceId: deck.id },
    underlayment: "double",
  });
  expect(saved.supplies[0]).toMatchObject({
    productId: gafRoofShingle.id,
    quantity: 2,
  });
  expect(saved.projectCode.shingleRoof.edges).toEqual([
    expect.objectContaining({
      label: "South eave",
      kind: "eave",
      length: 96,
      extra: 6,
    }),
    expect.objectContaining({
      label: "Main ridge",
      kind: "ridge",
      length: 300,
      extra: 0,
    }),
  ]);
  expect(saved.supplies.slice(1)).toEqual([
    expect.objectContaining({
      productId: shingleEdgeProducts.starter.id,
      quantity: 1,
    }),
    expect.objectContaining({
      productId: shingleEdgeProducts.cap.id,
      quantity: 2,
    }),
  ]);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("3:12. 32 sq ft");
  expect(guide).toContain(
    "2 field-shingle bundles estimated · 2 on the shopping list",
  );
  await expect(page.locator(".print-guide")).toContainText(
    "2 field-shingle bundles estimated",
  );
  expect(guide).toContain("Main ridge · Ridge · 25 ft · 0 in cut allowance");
  await expect(page.locator(".print-guide")).toContainText("46 cap pieces");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/2 shingle bundles.*#314168668/);
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/1 starter bundle.*#202052408/);
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/2 cap bundles.*#206593176/);
});
