import { expect, test } from "@playwright/test";

test("a manual panel opening flows from preview to the guide and Home Depot tool review", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add ¾ in exterior plywood", exact: true })
    .click();
  const cut = page.getByRole("button", { name: "Cut part", exact: true });
  await cut.click();
  await page
    .getByRole("button", { name: "Round opening", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const z = dialog.getByRole("spinbutton", {
    name: "Center from −Z edge",
    exact: true,
  });
  const x = dialog.getByRole("spinbutton", {
    name: "Center from −X edge",
    exact: true,
  });
  const preview = dialog.getByRole("img", {
    name: "Opening preview through local Y",
  });
  const zUnits = dialog.getByLabel("Center from −Z edge units", {
    exact: true,
  });
  const xUnits = dialog.getByLabel("Center from −X edge units", {
    exact: true,
  });
  await expect(zUnits).toHaveValue("ft");
  await expect(xUnits).toHaveValue("ft");
  const face = preview.locator(":scope > rect");
  await face.click({ position: { x: 30, y: 35 } });
  await expect(z).not.toHaveValue("4");
  await expect(x).not.toHaveValue("2");
  await xUnits.selectOption("in");
  await z.fill("1.5");
  await x.fill("-20");
  const apply = dialog.getByRole("button", {
    name: "Apply round opening",
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "misses the retained blank",
  );
  await expect(apply).toBeDisabled();
  await x.fill("12");
  await dialog
    .getByRole("spinbutton", { name: "Opening diameter", exact: true })
    .fill("4");
  await expect(preview.locator("circle[clip-path]")).toHaveAttribute("r", "2");
  await apply.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Round opening updated.", { exact: true }),
  ).toBeVisible();

  await cut.click();
  await page
    .getByRole("button", { name: "Round opening", exact: true })
    .click();
  const opening = dialog.getByRole("combobox", {
    name: "Opening",
    exact: true,
  });
  await opening.selectOption("0");
  await zUnits.selectOption("in");
  await xUnits.selectOption("in");
  await expect(z).toHaveValue("18");
  await expect(x).toHaveValue("12");
  await dialog
    .getByRole("button", { name: "Preview removal", exact: true })
    .click();
  await expect(preview.locator("circle[clip-path]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const methodName = "Review a jigsaw for wood openings";
  const method = page.locator("details.section-description").filter({
    has: page.getByText(methodName, { exact: true }),
  });
  await method.locator("summary").click();
  const options = method.getByRole("list", {
    name: `Home Depot options for ${methodName}`,
  });
  await expect(options.getByRole("link", { name: /DCS334B/ })).toHaveAttribute(
    "href",
    "https://www.homedepot.com/p/305966991",
  );
  await page
    .getByRole("checkbox", { name: "Reviewed DCS334B", exact: true })
    .check();
  await expect(method).toContainText("documented capability supported");
  await expect(
    page.locator("details.section-description").filter({
      has: page.getByText("Match the cutter to the round opening", {
        exact: true,
      }),
    }),
  ).toContainText("unknown");
  await options
    .getByRole("button", { name: /^Add DCS334B to shopping list for/ })
    .click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Build guide Markdown/ }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const guide = Buffer.concat(chunks).toString();
  expect(guide).toContain("Updated the round-opening layout");
  expect(guide).toContain("4 in diameter through local Y");
  expect(guide).toContain("18 in from local −Z edge, 1 ft from local −X edge");
  expect(guide).toContain("Match the cutter to the round opening");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/1 jigsaw .*#305966991/);
});
