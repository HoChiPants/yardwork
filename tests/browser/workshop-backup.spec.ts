import { test, expect } from "@playwright/test";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectStore } from "../../server/storage";
import { restoreWorkshopArchive } from "../../server/workshopArchive";
import { buildFixtureIds, createBuildFixture } from "../../src/buildFixtures";

test("the workshop download restores all five build families and an earlier saved revision", async ({
  page,
  request,
}) => {
  const data = path.resolve(
    process.env.YARDWORK_E2E_DATA_DIR ?? "test-results/server-data",
  );
  const scratch = await mkdtemp(
    path.join(tmpdir(), "yardwork-browser-backup-"),
  );
  const projects = buildFixtureIds.map((id) => createBuildFixture(id).project);
  const stored = [];
  try {
    for (const project of projects) {
      const result = await request.put(`/api/projects/${project.id}`, {
        data: { project, baseRevision: 0 },
      });
      expect(result.ok()).toBeTruthy();
      stored.push(await result.json());
    }
    const first = projects[0];
    const saved = await request.put(`/api/projects/${first.id}`, {
      data: {
        project: { ...first, notes: "Saved after the first build review." },
        baseRevision: 1,
      },
    });
    expect(saved.ok()).toBeTruthy();
    const latest = await saved.json();
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download workshop backup", exact: true })
      .click();
    const backup = await download;
    expect(backup.suggestedFilename()).toMatch(/\.yardwork-backup\.gz$/);
    const restored = path.join(scratch, "restored");
    expect(
      await restoreWorkshopArchive((await backup.path())!, restored),
    ).toBeGreaterThanOrEqual(6);
    const reopened = new ProjectStore(restored);
    expect(await reopened.getRevision(first.id, 1)).toEqual(stored[0]);
    expect(await reopened.get(first.id)).toEqual(latest);
    for (const [index, project] of projects.entries()) {
      if (index > 0)
        expect(await reopened.get(project.id)).toEqual(stored[index]);
    }
  } finally {
    for (const project of projects) {
      await unlink(path.join(data, `${project.id}.json`)).catch(() => {});
      await rm(path.join(data, ".revisions", project.id), {
        recursive: true,
        force: true,
      });
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
