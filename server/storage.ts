import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { projectSchema, type Project } from "../src/model";
import { projectFormatProblem } from "../src/projectVersion";
import { assertFastenerHistoryPrefix } from "../src/fastenerHistory";
import { assertHingeHistoryPrefix } from "../src/hingeHistory";
import { assertHingeStockHistoryPrefix } from "../src/hingeStock";
import { assertConnectorHistoryPrefix } from "../src/connectorSchema";
import { writeWorkshopArchive } from "./workshopArchive";
export class ConflictError extends Error {}
export class SavedRevisionError extends Error {}
export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  pieces: number;
  revision: number;
  loadError?: string;
  originalAvailable?: boolean;
  earlierRevisions?: number[];
};
export class ProjectReadError extends Error {
  constructor(
    message: string,
    public summary: ProjectSummary,
  ) {
    super(message);
  }
}
const storedProjectSchema = z.strictObject({
  project: projectSchema,
  revision: z.number().int().positive(),
});
type StoredProject = z.infer<typeof storedProjectSchema>;
const revisionLimit = 3;

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function decodeRecord(bytes: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

async function writeAtomic(filename: string, contents: string | Buffer) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, {
      mode: 0o600,
      flag: "wx",
      flush: true,
    });
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export class ProjectStore {
  private queue = new Map<string, Promise<unknown>>();
  private backupBarrier: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}

  async writeBackup(filename: string) {
    const pending = [this.backupBarrier, ...this.queue.values()];
    const archive = Promise.allSettled(pending).then(() => writeWorkshopArchive(this.directory, filename));
    this.backupBarrier = archive.catch(() => {});
    return archive;
  }
  private filename(id: string) {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw Error("Invalid project identifier");
    return path.join(this.directory, `${id}.json`);
  }
  private revisionDirectory(id: string) {
    // Reuse the project identifier check for both namespace roots.
    return path.join(
      this.directory,
      ".revisions",
      path.basename(this.filename(id), ".json"),
    );
  }
  private revisionPath(id: string, revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw Error("Invalid saved revision.");
    return path.join(this.revisionDirectory(id), `${revision}.json`);
  }
  private async revisionNumbers(id: string) {
    try {
      return (await readdir(this.revisionDirectory(id)))
        .filter((name) => /^[1-9][0-9]*\.json$/.test(name))
        .map((name) => Number.parseInt(name, 10))
        .filter(Number.isSafeInteger)
        .sort((a, b) => b - a);
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  }
  async getRevision(
    id: string,
    revision: number,
  ): Promise<StoredProject | null> {
    let bytes;
    try {
      bytes = await readFile(this.revisionPath(id, revision));
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    const result = storedProjectSchema.safeParse(decodeRecord(bytes));
    if (
      !result.success ||
      result.data.project.id !== id ||
      result.data.revision !== revision
    )
      throw new SavedRevisionError(
        "This earlier save is damaged or needs another Yardwork version.",
      );
    return result.data;
  }

  private async archive(id: string, revision: number, bytes: Buffer) {
    const filename = this.revisionPath(id, revision);
    try {
      const existing = await readFile(filename);
      if (!existing.equals(bytes))
        throw new ConflictError(
          "The earlier save differs from this project revision. Export a copy before trying again.",
        );
      return;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    await writeAtomic(filename, bytes);
  }

  private async pruneRevisions(id: string) {
    const revisions = await this.revisionNumbers(id);
    await Promise.allSettled(
      revisions
        .slice(revisionLimit)
        .map((revision) => unlink(this.revisionPath(id, revision))),
    );
  }

  private parseProject(id: string, original: Buffer): StoredProject {
    const raw = decodeRecord(original);
    const result = storedProjectSchema.safeParse(raw);
    if (result.success && result.data.project.id === id) return result.data;
    const row =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const p =
      row?.project && typeof row.project === "object"
        ? (row.project as Record<string, unknown>)
        : null;
    const message =
      (p ? projectFormatProblem(p) : null) ??
      "This saved project is damaged or invalid. Download its original file for recovery; it has not been changed.";
    throw new ProjectReadError(message, {
      id,
      name:
        typeof p?.name === "string"
          ? p.name.slice(0, 120)
          : "Unreadable saved project",
      updatedAt:
        typeof p?.updatedAt === "string" &&
        Number.isFinite(Date.parse(p.updatedAt))
          ? p.updatedAt
          : "1970-01-01T00:00:00.000Z",
      pieces: Array.isArray(p?.pieces) ? p.pieces.length : 0,
      revision:
        typeof row?.revision === "number" &&
        Number.isInteger(row.revision) &&
        row.revision >= 0
          ? row.revision
          : 0,
      loadError: message,
    });
  }

  async get(id: string): Promise<StoredProject | null> {
    const original = await this.getOriginal(id);
    return original && this.parseProject(id, original);
  }
  async getOriginal(id: string): Promise<Buffer | null> {
    try {
      return await readFile(this.filename(id));
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const result: ProjectSummary[] = [];
    const ids = new Set(
      (await readdir(this.directory))
        .filter((name) => /^[a-f\d-]{36}\.json$/i.test(name))
        .map((name) => name.slice(0, -5)),
    );
    try {
      for (const id of await readdir(path.join(this.directory, ".revisions")))
        if (/^[a-f\d-]{36}$/i.test(id)) ids.add(id);
    } catch (error) {
      if (!missing(error)) throw error;
    }
    for (const id of ids) {
      const earlierRevisions = await this.revisionNumbers(id);
      let row: StoredProject | null = null;
      let unreadable: ProjectSummary | undefined;
      try {
        row = await this.get(id);
      } catch (e) {
        if (!(e instanceof ProjectReadError)) throw e;
        unreadable = e.summary;
      }
      if (row) {
        const previous = earlierRevisions
          .filter((revision) => revision < row.revision)
          .slice(0, revisionLimit);
        result.push({
          id: row.project.id,
          name: row.project.name,
          updatedAt: row.project.updatedAt,
          pieces: row.project.pieces.length,
          revision: row.revision,
          ...(previous.length ? { earlierRevisions: previous } : {}),
        });
        continue;
      }
      const available: StoredProject[] = [];
      for (const revision of earlierRevisions) {
        if (available.length === revisionLimit) break;
        try {
          const archived = await this.getRevision(id, revision);
          if (archived) available.push(archived);
        } catch (e) {
          if (!(e instanceof SavedRevisionError)) throw e;
        }
      }
      const newest = available[0];
      const summary =
        unreadable ??
        (newest && {
          id,
          name: newest.project.name,
          updatedAt: newest.project.updatedAt,
          pieces: newest.project.pieces.length,
          revision: newest.revision,
          loadError:
            "The latest saved file is missing. Open an earlier save as a copy.",
          originalAvailable: false,
        });
      if (summary)
        result.push({
          ...summary,
          ...(newest && summary.name === "Unreadable saved project"
            ? { name: newest.project.name }
            : {}),
          ...(available.length
            ? { earlierRevisions: available.map((entry) => entry.revision) }
            : {}),
        });
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(project: Project, baseRevision: number) {
    const id = project.id;
    const previous = this.queue.get(id) ?? Promise.resolve();
    const task = Promise.allSettled([previous, this.backupBarrier])
      .then(async () => {
        const valid = projectSchema.parse(project);
        const original = await this.getOriginal(id);
        const current = original && this.parseProject(id, original);
        if (!current && (await this.revisionNumbers(id)).length)
          throw new ConflictError(
            "The latest save is missing. Open an earlier revision as a copy before saving.",
          );
        if ((current?.revision ?? 0) !== baseRevision)
          throw new ConflictError(
            "This project changed in another tab. Export your local copy, then reload the saved version.",
          );
        if (current) {
          try {
            assertFastenerHistoryPrefix(
              current.project.fastenerPlans,
              valid.fastenerPlans,
            );
            assertHingeHistoryPrefix(
              current.project.lidHingePlans,
              valid.lidHingePlans,
            );
            assertHingeStockHistoryPrefix(
              current.project.hingeStockSources,
              valid.hingeStockSources,
            );
            assertConnectorHistoryPrefix(
              current.project.connectorPlans,
              valid.connectorPlans,
            );
          } catch (error) {
            throw new ConflictError(
              `${error instanceof Error ? error.message : "Saved reference history changed."} Export your local copy, then reload the saved version.`,
            );
          }
        }
        const record = {
          project: { ...valid, updatedAt: new Date().toISOString() },
          revision: baseRevision + 1,
        };
        if (current && original)
          await this.archive(id, current.revision, original);
        await writeAtomic(this.filename(id), JSON.stringify(record));
        if (current) await this.pruneRevisions(id).catch(() => {});
        return record;
      });
    this.queue.set(id, task);
    try {
      return await task;
    } finally {
      if (this.queue.get(id) === task) this.queue.delete(id);
    }
  }
}
