import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { bom } from "../../src/engine";
import { projectSchema, uid } from "../../src/model";

test("fit two greenhouse eave blocks from one board and review their separate attachments", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("greenhouse");
  await dialog
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Study greenhouse glazing" })
    .selectOption("sunlite-8mm");
  await dialog
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  const name = `Eave block study ${uid().slice(0, 8)}`;
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const draft = async () => {
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key),
      CURRENT_DRAFT_KEY,
    );
    return saved ? projectSchema.parse(JSON.parse(saved).project) : null;
  };
  const boards = (project: NonNullable<Awaited<ReturnType<typeof draft>>>) =>
    bom(project).find(({ id }) => id === "stud")?.physicalStockUnits;
  await expect.poll(async () => (await draft())?.name).toBe(name);
  const before = (await draft())!;
  expect(before.pieces.some(({ material }) => material === "sunlite-8mm")).toBe(
    true,
  );
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  await checks.click();
  await page.getByText("Fit an eave block", { exact: true }).click();
  const open = page.getByRole("button", {
    name: "Preview eave block",
    exact: true,
  });
  const add = page.getByRole("button", { name: "Add eave block", exact: true });
  const marker = page.getByTestId("eave-block-preview-marker");
  const details = page.getByTestId("eave-block-details");
  await open.click();
  await expect(marker).toBeVisible();
  expect((await draft())?.pieces).toEqual(before.pieces);
  await page
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  await expect(marker).toHaveCount(0);
  expect((await draft())?.pieces).toEqual(before.pieces);
  await open.click();
  await expect(details).toContainText("Uses one board");
  await expect(details).toContainText("94.375 in long offcut");
  await page
    .getByRole("button", { name: "Return to eave block", exact: true })
    .click();
  await expect(add).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("eave-block-preview.png"),
    animations: "disabled",
  });
  await add.click();
  await expect(marker).toHaveCount(0);
  const review = page.getByRole("button", {
    name: /^Greenhouse rafters · Eave bearing/,
  });
  await expect(review).toContainText(
    "1 of 10 eave ends show wood face contact",
  );

  await open.click();
  await expect(details).toContainText("from the cut pool");
  await add.click();
  await expect(review).toContainText(
    "2 of 10 eave ends show wood face contact",
  );
  await expect
    .poll(
      async () =>
        (await draft())?.pieces.filter(
          ({ name, offcut }) => name === "Beveled eave block" && !offcut,
        ).length,
    )
    .toBe(2);
  const after = (await draft())!;
  const blocks = after.pieces.filter(
    ({ name, offcut }) => name === "Beveled eave block" && !offcut,
  );
  expect(blocks.every(({ cutPlanes }) => cutPlanes.length === 1)).toBe(true);
  expect(blocks[0].cutStock?.id).toEqual(blocks[1].cutStock?.id);
  expect(boards(after)).toBe((boards(before) ?? 0) + 1);
  expect(after.supplies).toEqual(before.supplies);

  const attachments = page.getByRole("button", {
    name: /^Review greenhouse roof attachments/,
  });
  await attachments.click();
  const roof = page.locator(".greenhouse-connections");
  await expect(roof).toHaveAttribute("open", "");
  await expect(roof.getByTestId("roof-attachment-summary")).toContainText(
    "4 joints · 4 without a plan",
  );
  await roof.getByRole("button", { name: "Ridge (10)", exact: true }).click();
  await expect(roof.locator("[data-roof-joint='rafter-ridge']")).toHaveCount(
    10,
  );
  await roof.getByRole("button", { name: "Eaves (4)", exact: true }).click();
  const upper = roof.locator("[data-roof-joint='rafter-block']").first();
  await upper
    .getByRole("button", { name: "Plan screw path", exact: true })
    .click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  const receiver = fasteners.getByRole("combobox", {
    name: "Fastener receiving member",
    exact: true,
  });
  await expect
    .poll(async () => {
      const selectedId = await receiver.inputValue();
      return blocks.some(({ id }) => id === selectedId);
    })
    .toBe(true);
  await fasteners
    .getByRole("button", { name: "Create fastener plan", exact: true })
    .click();
  await expect.poll(async () => (await draft())?.fastenerPlans.length).toBe(1);
  const planned = (await draft())!;
  expect(planned.pieces).toEqual(after.pieces);
  expect(planned.supplies).toEqual(before.supplies);
  await fasteners
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  await expect(upper).toContainText("plan started");
  await expect(
    roof.locator("[data-roof-joint='block-plate'][data-have-plan='false']"),
  ).toHaveCount(2);
  await expect(roof.getByTestId("roof-attachment-summary")).toContainText(
    "4 joints · 3 without a plan",
  );
  await upper.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("eave-attachment-checklist.png"),
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guide).path())!, "utf8");
  expect(markdown).toContain("Side profile face");
  expect(markdown).toContain("2 of 10 eave ends show wood face contact");
  expect(markdown).toMatch(
    /## Greenhouse roof attachments[\s\S]+Rafter to eave block[^\n]+plan started/,
  );
  expect(markdown).toMatch(
    /Eave block to wall plate[^\n]+Attachment plan needed/,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(async () => {
      const result = await page.request.get(`/api/projects/${after.id}`);
      if (!result.ok()) return false;
      const { project } = await result.json();
      return (
        JSON.stringify(project.pieces) === JSON.stringify(after.pieces) &&
        JSON.stringify(project.fastenerPlans) ===
          JSON.stringify(planned.fastenerPlans)
      );
    })
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: after.name })
    .click();
  await checks.click();
  await expect(review).toContainText(
    "2 of 10 eave ends show wood face contact",
  );
  await attachments.click();
  await expect(roof.getByTestId("roof-attachment-summary")).toContainText(
    "4 joints · 3 without a plan",
  );
  await upper
    .getByRole("button", {
      name: `Review ${planned.fastenerPlans[0].label}`,
      exact: true,
    })
    .click();
  await expect(
    fasteners.locator(
      `[data-fastener-plan-id="${planned.fastenerPlans[0].id}"] .attachment-plan-select`,
    ),
  ).toHaveAttribute("aria-expanded", "true");
});

test("fit a whole sourced greenhouse roof, undo in one step, and save the exact cut lineage", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  const study = page.getByRole("dialog");
  await study
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("greenhouse");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await study
    .getByRole("button", { name: "Use Home Depot stock", exact: true })
    .click();
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect(study).toHaveCount(0);

  const draft = () =>
    page.evaluate((key) => {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item).project : null;
    }, CURRENT_DRAFT_KEY);
  const timber = "hd-kdht-2x4-8";
  await expect
    .poll(async () =>
      (await draft())?.pieces.some(
        ({ material }: { material: string }) => material === timber,
      ),
    )
    .toBe(true);
  const before = projectSchema.parse(await draft());
  const sourceUnits = (project: ReturnType<typeof projectSchema.parse>) =>
    bom(project).find(({ id }) => id === timber)?.physicalStockUnits;
  const panel = page.locator(".eave-fit");
  const open = panel.getByText("Fit an eave block", { exact: true });
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  await open.click();
  await expect(
    panel.getByRole("combobox", { name: "Block stock" }),
  ).toHaveValue(timber);

  const preview = panel.getByRole("button", {
    name: "Preview all eave blocks",
    exact: true,
  });
  const report = panel.getByTestId("eave-roof-details");
  const marker = page.getByTestId("eave-block-preview-marker");
  const review = page.getByRole("button", {
    name: /^Greenhouse rafters · Eave bearing/,
  });
  await preview.click();
  await expect(report.getByRole("status")).toContainText(
    "10 of 10 eligible eave joints fit",
  );
  await expect(report.getByRole("status")).toContainText("1 new board");
  await expect(marker).toContainText("10 fitted");
  expect((await draft()).pieces).toEqual(before.pieces);
  await page.getByRole("button", { name: "Return to eave block" }).click();
  await report.getByText("Block cuts and locations", { exact: true }).click();
  await expect(report.getByRole("listitem")).toHaveCount(10);
  await page.screenshot({
    path: info.outputPath("eave-roof-preview.png"),
    animations: "disabled",
  });
  await report.getByRole("button", { name: "Cancel preview" }).click();
  await expect(marker).toHaveCount(0);
  expect((await draft()).pieces).toEqual(before.pieces);

  const add = report.getByRole("button", {
    name: "Add 10 eave blocks",
    exact: true,
  });
  await preview.click();
  await add.click();
  await expect(marker).toHaveCount(0);
  await expect(
    page.getByText("10 eave blocks added.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft()).pieces).toEqual(before.pieces);
  await expect(review).toContainText(
    "0 of 10 eave ends show wood face contact",
  );
  if ((await panel.getAttribute("open")) === null) await open.click();
  await preview.click();
  await add.click();
  await expect
    .poll(
      async () =>
        (await draft()).pieces.filter(
          ({ designRole }: { designRole?: string }) =>
            designRole === "greenhouse-eave-block",
        ).length,
    )
    .toBe(10);

  await page
    .getByRole("button", { name: /^Review greenhouse roof attachments/ })
    .click();
  const roof = page.locator(".greenhouse-connections");
  await expect(roof.getByTestId("roof-attachment-summary")).toContainText(
    "20 joints · 20 without a plan",
  );
  await expect(roof.locator('[data-roof-joint="rafter-block"]')).toHaveCount(
    10,
  );
  await expect(roof.locator('[data-roof-joint="block-plate"]')).toHaveCount(10);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("10 of 10 eave ends show wood face contact");
  expect(guide).toContain("Side profile face");
  expect(guide).toContain("Internet #312528776");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const savedRequest = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${before.id}` &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await savedRequest).ok()).toBe(true);
  await expect(
    page.getByText("Saved to your self-hosted project library", {
      exact: true,
    }),
  ).toBeVisible();
  const response = await page.request.get(`/api/projects/${before.id}`);
  expect(response.ok()).toBe(true);
  const saved = projectSchema.parse((await response.json()).project);
  const blocks = saved.pieces.filter(
    ({ designRole }) => designRole === "greenhouse-eave-block",
  );
  expect(
    blocks.every(
      ({ material, cutPlanes }) =>
        material === timber && cutPlanes.length === 1,
    ),
  ).toBe(true);
  const sources = new Set(blocks.map(({ cutStock }) => cutStock?.id));
  expect(sources.size).toBe(1);
  const [sourceId] = sources;
  expect(sourceId).toBeTruthy();
  expect(
    saved.pieces.filter(
      ({ offcut, cutStock }) => offcut && cutStock?.id === sourceId,
    ),
  ).toHaveLength(1);
  expect(sourceUnits(saved)).toBe(sourceUnits(before)! + 1);
  expect(saved.fastenerPlans).toEqual(before.fastenerPlans);
});
