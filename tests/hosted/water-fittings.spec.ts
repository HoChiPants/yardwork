import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { blank } from "../../src/model";
import { emptyWallTrace, reviewWallTrace } from "../../src/wallTrace";
import { previewWaterRun } from "../../src/wallWaterApply";

test("connect framed PEX runs with a measured elbow and save both adjusted cuts", async ({ page }) => {
  test.setTimeout(90_000);
  const first = reviewWallTrace(blank("Open service corner"), { ...emptyWallTrace(), a: [-80, 0], b: [-4, 0] }).candidate;
  const frame = reviewWallTrace(first, { ...emptyWallTrace(), a: [0, 4], b: [0, 80] }).candidate;
  const pipe = { materialId: "hd-pex-u860w10", height: 24, depth: 0, bore: 0.875 };
  const a = previewWaterRun(frame, { ...pipe, name: "Sink feed", sectionId: frame.sections[0].id, start: 3, end: 78 });
  const b = previewWaterRun(a.project, { ...pipe, name: "Return leg", sectionId: frame.sections[1].id, start: -2, end: 73 });

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "open-corner.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(b.project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Connect two PEX runs around a corner");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Connect PEX runs", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Pipe end A", exact: true })).toHaveValue(`${a.run.id}/end`);
  await expect(dialog.getByRole("combobox", { name: "Pipe end B", exact: true })).toHaveValue(`${b.run.id}/start`);
  await expect(dialog.getByRole("link", { name: "Exact fitting", exact: true })).toHaveAttribute("href", "https://www.homedepot.com/p/323676174");
  const reachA = dialog.getByRole("spinbutton", { name: "Center to socket A", exact: true });
  await reachA.fill("0.9");
  await dialog.getByRole("spinbutton", { name: "Center to socket B", exact: true }).fill("1.4");
  const preview = dialog.getByRole("button", { name: "Preview connection", exact: true });
  await preview.click();
  await expect(dialog.getByRole("alert")).toContainText("must allow 1 in of insertion");
  await reachA.fill("1.4");
  await preview.click();
  const proposal = dialog.getByRole("region", { name: "PEX connection proposal" });
  await expect(proposal).toContainText("Sink feed · 75 in → 76.6 in cut");
  await expect(proposal).toContainText("Return leg · 75 in → 76.6 in cut");
  await expect(proposal).toContainText("Planned remnants from new sticks · 43.4 in + 43.4 in");
  await proposal.getByRole("button", { name: "Add connection", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision, { timeout: 15_000 }).toBe(1);
  const saved = (await draft()).project;
  const fitting = saved.waterFittings[0];
  expect(fitting.materialId).toBe("hd-sharkbite-ur248a");
  await expect(page.locator("canvas").first()).toHaveAttribute("data-rendered-part-ids", new RegExp(fitting.pieceId));
  for (const run of saved.waterRuns) expect(run.end - run.start).toBeCloseTo(76.6);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Connect PEX runs", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Connection", exact: true }).selectOption(fitting.id);
  await expect(dialog.getByRole("spinbutton", { name: "Center to socket A", exact: true })).toHaveValue("1.4");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/PEX fittings and insertion marks[\s\S]*Cut pipe to 76\.6 in\. Mark 1 in of insertion/);
  await expect(page.locator(".print-guide .water-fitting-print")).toContainText("SharkBite Max UR248A");
});

test("branch a kitchenette main from the idea planner and reopen the three cuts and retained stock", async ({ page }) => {
  test.setTimeout(90_000);
  const mainWall = reviewWallTrace(blank("Kitchen service tee"), {
    ...emptyWallTrace(), a: [-54, 0], b: [54, 0], stock: "hd-spf-2x4-10",
  }).candidate;
  const framed = reviewWallTrace(mainWall, { ...emptyWallTrace(), a: [0, 4], b: [0, 52] }).candidate;
  const stock = addMeasuredOffcut(framed, framed.steps[0].id, "hd-pex-u870w10", [110, 0.875, 0.875], "Shop supply remnant");
  const main = previewWaterRun(stock, { name: "Kitchen main", sectionId: framed.sections[0].id, materialId: "hd-pex-u870w10",
    start: 3, end: 105, height: 24, depth: 0, bore: 1.125, reuse: true });
  const branch = previewWaterRun(main.project, { name: "Island feed", sectionId: framed.sections[1].id, materialId: "hd-pex-u860w10",
    start: -2, end: 45, height: 24, depth: 0, bore: 0.875 });

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchen-service-tee.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(branch.project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Add a tee to the PEX main for the island");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Branch a PEX main", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Connection type", exact: true })).toHaveValue("split");
  await expect(dialog.getByRole("link", { name: "Exact fitting", exact: true })).toHaveAttribute("href", "https://www.homedepot.com/p/325997410");
  await dialog.getByRole("spinbutton", { name: "Measured inline face-to-face length", exact: true }).fill("3.5");
  const branchReach = dialog.getByRole("spinbutton", { name: "Main centerline to branch socket", exact: true });
  const preview = dialog.getByRole("button", { name: "Preview connection", exact: true });
  await branchReach.fill("0.9");
  await preview.click();
  await expect(dialog.getByRole("alert")).toContainText("the branch must allow 1 in of insertion");
  await branchReach.fill("1.65");
  await preview.click();
  const proposal = dialog.getByRole("region", { name: "PEX connection proposal" });
  await expect(proposal).toContainText("102 in main becomes 50.5 in + 50.5 in");
  await expect(proposal).toContainText("1 in center trim goes to the Cut pool");
  await expect(proposal).toContainText("Island feed · 47 in → 48.35 in cut");
  await proposal.getByRole("button", { name: "Add connection", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision, { timeout: 15_000 }).toBe(1);
  const saved = (await draft()).project;
  const tee = saved.waterFittings[0];
  expect(saved.waterRuns).toHaveLength(3);
  expect(tee.materialId).toBe("hd-sharkbite-ur412a");
  const retained = saved.pieces.filter((piece: { cutStock?: { id: string } }) => piece.cutStock?.id === saved.onHandCutSources[0]);
  expect(retained).toHaveLength(4);
  expect(retained).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Offcut · Tee center trim", offcut: true })]));
  await expect(page.locator("canvas").first()).toHaveAttribute("data-rendered-part-ids", new RegExp(tee.pieceId));

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Connect PEX runs", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Connection", exact: true }).selectOption(tee.id);
  await expect(dialog.getByRole("spinbutton", { name: "Main centerline to branch socket", exact: true })).toHaveValue("1.65");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/UR412A reducing tee[\s\S]*Cut pipe to 50\.5 in\. Mark 1\.25 in[\s\S]*Cut pipe to 48\.35 in\. Mark 1 in/);
  expect(guide).toContain("Mark SharkBite Max insertion depths");
  await expect(page.locator(".print-guide .water-fitting-print")).toContainText("Inline pipe ends · 1 in apart");
});
