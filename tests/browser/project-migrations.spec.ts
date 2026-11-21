import { addFramingLumber } from "../helpers/materialPlacement";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile, unlink, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { blank, part, uid } from "../../src/model";
import { cutPiece } from "../../src/engine";
import { PREVIOUS_DRAFT_KEY } from "../../src/drafts";
const currentKey = `yardwork-draft-v${PROJECT_FORMAT_VERSION}`;
const futureVersion = PROJECT_FORMAT_VERSION + 1;
async function stableDraft(page: Page) {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw).project.schemaVersion : null;
      }, currentKey),
    )
    .toBe(PROJECT_FORMAT_VERSION);
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project,
    currentKey,
  );
}
for (const sourceVersion of [1, 2, 3, 4, 5, 6, 7, 8, 9])
  test(`legacy browser format ${sourceVersion} opens explicitly, saves in the current format and keeps original bytes`, async ({
    page,
  }) => {
    const project = blank(`Legacy migration ${Date.now()}`);
    project.pieces.push(
      part(
        "Keep my board",
        "stud",
        [1.5, 48, 3.5],
        [0, 24, 0],
        project.steps[0].id,
        "Legacy frame",
      ),
    );
    const raw = JSON.stringify({
      project: { ...project, schemaVersion: sourceVersion },
      revision: 0,
    });
    const sourceKey = `yardwork-draft-v${sourceVersion}`;
    await page.addInitScript(
      ({ raw, key }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
      },
      { raw, key: sourceKey },
    );
    await page.goto("/");
    await expect(page.locator(".statusbar")).toContainText("0 parts");
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Resume previous browser draft/ })
      .click();
    await expect(
      page.getByRole("heading", { name: project.name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to library", { exact: true }),
    ).toBeVisible();
    const current = await stableDraft(page);
    expect(current.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(current.pieces).toEqual(project.pieces);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), sourceKey),
    ).toBe(raw);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Editable project/ }).click();
    const exported = JSON.parse(
      await readFile((await (await pending).path())!, "utf8"),
    );
    expect(exported.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(exported.pieces).toEqual(project.pieces);
  });

test("an unreadable future browser draft remains downloadable after creating a new design", async ({
  page,
}) => {
  const raw =
    `{"project":{"schemaVersion":${futureVersion},"futureData":{"preserve":"every byte"}},"revision":8}\n`;
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key: currentKey, raw },
  );
  await page.goto("/");
  await addFramingLumber(page);
  await stableDraft(page);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByText(/Preserved browser drafts/).click();
  await expect(page.getByRole("dialog")).toContainText(`format ${futureVersion}`);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Download original browser draft",
      exact: true,
    })
    .click();
  expect(await readFile((await (await pending).path())!, "utf8")).toBe(raw);
});

test("unsupported saved projects stay visible, offer original downloads and reject overwrites", async ({
  page,
  request,
}) => {
  const project = blank(`Newer saved file ${Date.now()}`),
    legacy = blank(`Older saved file ${Date.now()}`);
  const directory = path.resolve(process.env.YARDWORK_E2E_DATA_DIR ?? "test-results/server-data"),
    futureFile = path.join(directory, `${project.id}.json`),
    legacyFile = path.join(directory, `${legacy.id}.json`);
  const raw =
    JSON.stringify(
      {
        project: {
          ...project,
          schemaVersion: futureVersion,
          futureConnections: { preserve: [1, 2, 3] },
        },
        revision: 4,
      },
      null,
      2,
    ) + "\n";
  const old = JSON.stringify({
    project: { ...legacy, schemaVersion: 1 },
    revision: 7,
  });
  await mkdir(directory, { recursive: true });
  await writeFile(futureFile, raw);
  await writeFile(legacyFile, old);
  try {
    expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(
      422,
    );
    expect(
      (
        await request.put(`/api/projects/${project.id}`, {
          data: { project, baseRevision: 4 },
        })
      ).status(),
    ).toBe(422);
    const migrated = await (
      await request.get(`/api/projects/${legacy.id}`)
    ).json();
    expect(migrated.project.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(migrated.revision).toBe(7);
    expect(await readFile(legacyFile, "utf8")).toBe(old);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    const recovery = page.getByRole("group", {
      name: `Recover ${project.name}`,
      exact: true,
    });
    await expect(recovery).toContainText(`format ${futureVersion}`);
    const pending = page.waitForEvent("download");
    await recovery
      .getByRole("link", { name: "Download original saved file", exact: true })
      .click();
    expect(await readFile((await (await pending).path())!, "utf8")).toBe(raw);
    await page
      .locator(".project-list > button")
      .filter({ hasText: legacy.name })
      .click();
    await expect(
      page.getByRole("heading", { name: legacy.name, exact: true }),
    ).toBeVisible();
    expect(await readFile(futureFile, "utf8")).toBe(raw);
  } finally {
    await unlink(futureFile).catch(() => {});
    await unlink(legacyFile).catch(() => {});
  }
});

test("an earlier saved revision opens and saves as a copy while both original and browser draft are preserved", async ({
  page, request,
}) => {
  const initial = blank(`Revision recovery ${uid().slice(0, 8)}`);
  initial.pieces.push(part("Timber in earlier save", "stud", [1.5, 96, 3.5], [0, 48, 0], initial.steps[0].id, "Frame"));
  const cut = cutPiece(initial, initial.pieces[0].id, 36);
  const directory = path.resolve(process.env.YARDWORK_E2E_DATA_DIR ?? "test-results/server-data");
  const file = path.join(directory, `${initial.id}.json`);
  const revisionFolder = path.join(directory, ".revisions", initial.id);
  const url = `/api/projects/${initial.id}`;
  const damaged = Buffer.from([0xff, 0xfe, 0x7b]);
  let copyId: string | undefined;
  try {
    expect((await request.put(url, { data: { project: cut, baseRevision: 0 } })).ok()).toBeTruthy();
    expect((await request.put(url, { data: { project: { ...initial, notes: "Second version" }, baseRevision: 1 } })).ok()).toBeTruthy();
    const revision = await request.get(`${url}/revisions/1`);
    expect(revision.ok()).toBeTruthy();
    expect((await revision.json()).project.pieces).toEqual(cut.pieces);
    expect((await request.get(`${url}/revisions/1e0`)).status()).toBe(400);
    await page.goto("/");
    await addFramingLumber(page);
    const unsaved = await stableDraft(page);
    const openLibrary = page.getByRole("button", { name: "Open project", exact: true });
    await openLibrary.click();
    await expect(page.locator(`[data-earlier-saves-for="${initial.id}"] summary`)).toHaveText("Earlier saves · 1");
    await page.getByRole("button", { name: "Close dialog", exact: true }).click();

    await writeFile(file, damaged);
    await openLibrary.click();
    const recovery = page.getByRole("group", { name: `Recover ${initial.name}`, exact: true });
    await expect(recovery.getByRole("link", { name: "Download original saved file" })).toBeVisible();
    await recovery.getByText("Earlier saves · 1", { exact: true }).click();
    await recovery.getByRole("button", { name: `Open revision 1 of ${initial.name} as a copy`, exact: true }).click();
    const name = `${initial.name} · revision 1 copy`;
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect.poll(async () => (await stableDraft(page)).name).toBe(name);
    const copy = await stableDraft(page);
    copyId = copy.id;
    expect(copyId).not.toBe(initial.id);
    expect(copy.pieces).toEqual(cut.pieces);
    const preserved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PREVIOUS_DRAFT_KEY);
    expect(preserved.project.id).toBe(unsaved.id);
    expect(preserved.project.pieces).toEqual(unsaved.pieces);
    expect(await (await request.get(`${url}/original`)).body()).toEqual(damaged);
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
    const saved = await request.get(`/api/projects/${copyId}`);
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).project.pieces).toEqual(cut.pieces);
    expect((await request.get(url)).status()).toBe(422);
    expect(await readFile(file)).toEqual(damaged);
  } finally {
    await unlink(file).catch(() => {});
    if (copyId) await unlink(path.join(directory, `${copyId}.json`)).catch(() => {});
    await rm(revisionFolder, { recursive: true, force: true });
  }
});

test("damaged UTF-8 remains byte-exact in browser recovery and cannot overwrite a project", async ({
  page,
  request,
}) => {
  const project = blank("BYTE_MARKER"),
    directory = path.resolve(process.env.YARDWORK_E2E_DATA_DIR ?? "test-results/server-data"),
    file = path.join(directory, `${project.id}.json`);
  const source = Buffer.from(JSON.stringify({ project, revision: 4 })),
    marker = source.indexOf("BYTE_MARKER");
  const bytes = Buffer.concat([
    source.subarray(0, marker),
    Buffer.from([0xff, 0xfe]),
    source.subarray(marker + "BYTE_MARKER".length),
  ]);
  await mkdir(directory, { recursive: true });
  await writeFile(file, bytes);
  try {
    expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(
      422,
    );
    expect(
      (
        await request.put(`/api/projects/${project.id}`, {
          data: { project, baseRevision: 4 },
        })
      ).status(),
    ).toBe(422);
    expect(
      await (await request.get(`/api/projects/${project.id}/original`)).body(),
    ).toEqual(bytes);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    const link = page.locator(
      `.project-recovery a[href="/api/projects/${project.id}/original"]`,
    );
    await expect(link).toBeVisible();
    const pending = page.waitForEvent("download");
    await link.click();
    expect(await readFile((await (await pending).path())!)).toEqual(bytes);
    expect(await readFile(file)).toEqual(bytes);
  } finally {
    await unlink(file).catch(() => {});
  }
});
