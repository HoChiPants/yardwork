import { expect, test } from "@playwright/test";

test("an installed-model recheck preserves the description and the built-in planner stays available", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, ai: "ollama", catalog: false } }));
  let installed = false;
  const probeMethods: string[] = [];
  await page.route("**/api/planner/connection", (route) => {
    probeMethods.push(route.request().method());
    return route.fulfill({ json: { state: installed ? "installed" : "missing-model", model: "qwen2.5:3b" } });
  });
  const remotePlans: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/planner") remotePlans.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  const status = dialog.locator(".planner-connection").getByRole("status");
  await expect(status).toHaveText("Install qwen2.5:3b in Ollama, then check again.");
  const prompt = dialog.getByRole("textbox", { name: "Describe your idea" });
  const idea = "A 60 inch wide storage banquette with a lift-up lid";
  await prompt.fill(idea);
  await expect(dialog.getByRole("combobox", { name: "Planner", exact: true })).toHaveValue("server");
  await dialog.getByRole("button", { name: "Explore with built-in layout", exact: true }).click();
  await expect(dialog.getByText(/Local planning presets · Rule-based starter layouts/)).toBeVisible();
  expect(remotePlans).toEqual([]);

  installed = true;
  await dialog.getByRole("button", { name: "Check model again", exact: true }).click();
  await expect(status).toHaveText("Ollama · qwen2.5:3b is installed.");
  await expect(prompt).toHaveValue(idea);
  await expect(dialog.getByRole("combobox", { name: "Planner", exact: true })).toHaveValue("built-in");
  await expect(dialog.getByText(/Local planning presets · Rule-based starter layouts/)).toBeVisible();
  expect(probeMethods).toEqual(["GET", "GET"]);
});

test("wall and floor templates remain available when the local model is unreachable", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, ai: "ollama", catalog: false } }));
  await page.route("**/api/planner/connection", (route) =>
    route.fulfill({ json: { state: "unreachable", model: "qwen2.5:3b" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: /Framed wall.*Configure wall/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".planner-connection").getByRole("status")).toContainText("Couldn’t check Ollama");
  const request = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/assistant" && request.method() === "POST");
  await dialog.getByRole("button", { name: "Use built-in template", exact: true }).click();
  expect((await request).postDataJSON().builtIn).toBe(true);
  await expect(dialog.getByText(/Local command parser · Review the dimensioned template/)).toBeVisible();
});
