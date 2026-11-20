import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect } from "@playwright/test";
for (const family of ["greenhouse", "sauna", "closet insert"])
  test(`an idea prompt creates and refines a real ${family} proposal`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Plan an idea", exact: true })
      .first()
      .click();
    const prompt = page.getByRole("textbox", {
      name: "Describe your idea",
      exact: true,
    });
    await prompt.fill(`${family} 6 ft wide, 6 ft deep, 7 ft high`);
    await page
      .getByRole("button", { name: "Explore idea", exact: true })
      .click();
    const proposal = page.locator(".idea-proposal");
    await expect(proposal).toContainText("Local planning presets");
    await expect(page.locator(".planner-module")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Add proposed layout", exact: true }),
    ).toBeEnabled();
    await prompt.fill("make it 8 ft wide");
    await expect(
      page.getByRole("button", { name: "Add proposed layout", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Explore idea", exact: true })
      .click();
    const kind = family.replace(" ", "-"),
      width = family === "sauna" ? "clearWidth" : "width";
    await expect(
      page.getByRole("spinbutton", { name: `${kind} ${width}`, exact: true }),
    ).toHaveValue("96");
    await page
      .getByRole("button", { name: "Add proposed layout", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(
          (draftKey) =>
            JSON.parse(localStorage.getItem(draftKey) ?? "null")?.project.pieces
              .length ?? 0,
          CURRENT_DRAFT_KEY,
        ),
      )
      .toBeGreaterThan(9);
    const project = await page.evaluate(
      (draftKey) => JSON.parse(localStorage.getItem(draftKey)!).project,
      CURRENT_DRAFT_KEY,
    );
    expect(project.notes).toContain("Unresolved:");
    if (family === "closet insert") expect(project.sections).toHaveLength(1);
    else expect(project.sections.length).toBeGreaterThan(1);
    if (family === "greenhouse")
      expect(
        project.pieces.some(
          (piece: { cutPlanes: unknown[] }) => piece.cutPlanes.length === 2,
        ),
      ).toBeTruthy();
    expect(errors).toEqual([]);
  });
