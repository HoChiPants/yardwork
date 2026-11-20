import { test, expect } from "@playwright/test";
test("eye and hearing protection can be added directly from the operation checklist", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("4");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const eyeName = "Eye protection appropriate to the operation";
  const eye = page
    .locator("details.section-description")
    .filter({ has: page.getByText(eyeName, { exact: true }) });
  await eye.locator("summary").click();
  const options = eye.getByRole("list", {
    name: `Home Depot options for ${eyeName}`,
  });
  await expect(
    options.getByRole("link", { name: /DPG82-11C/ }),
  ).toHaveAttribute("href", "https://www.homedepot.com/p/202220499");
  await options
    .getByRole("button", { name: /^Add DPG82-11C to shopping list for/ })
    .click();
  await expect(
    options.getByText("On shopping list", { exact: true }),
  ).toBeVisible();
  await expect(eye).toContainText("unknown");
  await page
    .getByRole("checkbox", { name: "Reviewed DPG82-11C", exact: true })
    .check();
  await expect(eye).toContainText("documented capability supported");
  await expect(eye).toContainText(
    "Review face protection and respiratory protection separately",
  );
  const hearing = page
    .locator("details.section-description")
    .filter({
      has: page.getByText("Hearing protection for powered operations", {
        exact: true,
      }),
    });
  await hearing.locator("summary").click();
  await hearing
    .getByRole("button", { name: /^Add 90565-4DC-PS to shopping list for/ })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  const paste = await page
    .getByRole("textbox", { name: "Home Depot paste list" })
    .inputValue();
  expect(paste).toMatch(/^1 pair .*#202220499$/m);
  expect(paste).toMatch(/^1 earmuff .*#301277013$/m);
});
test("Home Depot tool purchases have a separate subtotal and follow the selected store into the handoff", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const reviewed = page.getByRole("checkbox", {
    name: "Reviewed DCD771C2",
    exact: true,
  });
  await expect(reviewed).not.toBeChecked();
  await page
    .getByRole("button", { name: "Add DCD771C2 to shopping list", exact: true })
    .click();
  await expect(
    page.getByText("On shopping list", { exact: true }),
  ).toBeVisible();
  await expect(reviewed).not.toBeChecked();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByText("Tools to buy · 1 selected product", { exact: true })
    .click();
  const tools = page.locator('[data-purchase-kind="tools"]');
  await expect(tools).toContainText("2 × 20V MAX 1.3 Ah battery");
  await tools
    .getByRole("button", { name: /Record supply snapshot for DEWALT DCD771C2/ })
    .click();
  await tools
    .getByLabel("Supply snapshot price per pack", { exact: true })
    .fill("123.45");
  await tools
    .getByLabel("Supply snapshot available packs", { exact: true })
    .fill("0");
  await tools.getByLabel("Supply snapshot store", { exact: true }).fill("4409");
  await tools
    .getByRole("button", { name: "Record tool snapshot", exact: true })
    .click();
  await expect(tools.getByTestId("tool-pricing-coverage")).toContainText(
    "$123.45 observed tool subtotal",
  );
  await expect(tools).toContainText("Snapshot quantity short");
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true }),
  ).toHaveValue(/1 drill kit .*#204279858/);
  await expect(dialog).toContainText("#204279858 · Tool purchase");
  await expect(dialog).toContainText("Short by 1 in snapshot");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  const print = page.locator(".print-guide");
  await expect(
    print.getByRole("heading", { name: "Tools to buy", exact: true }),
  ).toBeVisible();
  await expect(
    print.getByRole("heading", { name: /1 × drill kit · DEWALT DCD771C2/ }),
  ).toBeVisible();
});
test("cut operations produce a tool checklist and reviewed models persist into the project and guide", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(
    page.getByLabel("Retained length units", { exact: true }),
  ).toHaveValue("ft");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("4");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page
      .locator("details.section-description")
      .getByText("Cut stock to length", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Reviewed DWE575SB", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed DWE575SB", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("link", { name: /Lowe's/ }).first(),
  ).toHaveAttribute("href", /lowes.com/);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Build guide Markdown/ }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const guide = Buffer.concat(chunks).toString();
  expect(guide).toContain("DWE575SB");
  expect(guide).toContain("Tools");
  expect(guide).toContain("Cut stock to length");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("button", { name: /Resume previous browser draft/ })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed DWE575SB", exact: true }),
  ).toBeChecked();
});

test("real sourced fasteners show exact pack sizes without inventing a zero price", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Fasteners", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Add Simpson 1½ in connector nails",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row")).toContainText("120 pack");
  await expect(page.locator(".bom-row")).toContainText("Unpriced");
  await page
    .getByRole("button", { name: "Review product references", exact: true })
    .click();
  await page
    .getByLabel("Compare modeled material", { exact: true })
    .selectOption("n10dhdg-r");
  await expect(
    page.locator(".reference-card").filter({ hasText: "N10DHDG-R" }),
  ).toContainText("Dimensions/pack compatible");
});

test("reviewed hand tools cover narrow functions with real sources and retired offers stay labeled", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(
    page.getByLabel("Retained length units", { exact: true }),
  ).toHaveValue("ft");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("4");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  for (const name of [
    "DWHT38125S",
    "S0101",
    "S0101-C",
    "GSCC2.524",
    "E3-16S",
    "90565-4DC-PS",
  ])
    await page
      .getByRole("checkbox", { name: `Reviewed ${name}`, exact: true })
      .check();
  const tape = page.locator(".section-description").filter({
    has: page.getByRole("checkbox", {
      name: "Reviewed DWHT38125S",
      exact: true,
    }),
  });
  await expect(
    tape.getByRole("link", { name: "Home Depot", exact: true }),
  ).toHaveAttribute("href", /317266301/);
  await expect(
    tape.getByRole("link", { name: "Lowe's", exact: true }),
  ).toHaveCount(0);
  await expect(
    tape.getByRole("link", { name: "Retired Lowe's listing", exact: true }),
  ).toBeHidden();
  await tape
    .getByText("Historical retailer references · no longer sold", {
      exact: true,
    })
    .click();
  await expect(
    tape.getByRole("link", { name: "Retired Lowe's listing", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Measure and mark dimensions",
    "Secure workpieces with clamps or a suitable fixture",
    "Hearing protection for powered operations",
  ])
    await expect(
      page
        .locator("details.section-description")
        .filter({ has: page.getByText(name, { exact: true }) }),
    ).toContainText("documented capability supported");
  await expect(
    page
      .locator("details.section-description")
      .filter({ has: page.getByText("Cut stock to length", { exact: true }) }),
  ).toContainText("unknown");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Build guide Markdown/ }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const guide = Buffer.concat(chunks).toString();
  expect(guide).toContain("Manufacturer product specification");
  expect(guide).toContain("GSCC2.524");
  expect(guide).toContain("common nails");
  expect(guide).toContain("Review requirement");
  expect(guide).not.toContain("safe to build");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("button", { name: /Resume previous browser draft/ })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed E3-16S", exact: true }),
  ).toBeChecked();
});
