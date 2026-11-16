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
import { projectSchema, type Project } from "../src/model";
export class ConflictError extends Error {}
export class ProjectStore {
  private queue = new Map<string, Promise<unknown>>();
  constructor(private directory: string) {}
  private filename(id: string) {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw Error("Invalid project identifier");
    return path.join(this.directory, `${id}.json`);
  }
  async get(
    id: string,
  ): Promise<{ project: Project; revision: number } | null> {
    try {
      return JSON.parse(await readFile(this.filename(id), "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const result = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f\d-]{36}\.json$/i.test(name)) continue;
      const row = await this.get(name.slice(0, -5));
      if (row)
        result.push({
          id: row.project.id,
          name: row.project.name,
          updatedAt: row.project.updatedAt,
          pieces: row.project.pieces.length,
          revision: row.revision,
        });
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(project: Project, baseRevision: number) {
    const id = project.id;
    const previous = this.queue.get(id) ?? Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        const valid = projectSchema.parse(project);
        const current = await this.get(id);
        if ((current?.revision ?? 0) !== baseRevision)
          throw new ConflictError(
            "This project changed in another tab. Export your local copy, then reload the saved version.",
          );
        const record = {
          project: { ...valid, updatedAt: new Date().toISOString() },
          revision: baseRevision + 1,
        };
        await mkdir(this.directory, { recursive: true });
        const tmp = this.filename(id) + `.${randomUUID()}.tmp`;
        try {
          await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
          await rename(tmp, this.filename(id));
        } finally {
          await unlink(tmp).catch(() => {});
        }
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
