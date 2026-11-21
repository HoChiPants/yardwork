import { z } from "zod";
import { commandSchema, parsePrompt, projectSchema } from "./model";
import { localIdeaPlan, localPlacementPlan, plannerRequestSchema } from "./planning";
import { localRelativeResizePlan } from "./relativeIdeaResize";
import { PROJECT_FORMAT_VERSION, projectFormatProblem } from "./projectVersion";

const libraryName = "yardwork-browser-library-v1";
const storeName = "projects";
const recordSchema = z.object({ project: projectSchema, revision: z.number().int().positive() });
const saveSchema = z.object({ project: projectSchema, baseRevision: z.number().int().nonnegative() });
const assistantSchema = z.object({
  prompt: z.string().min(1).max(2000),
  context: z.object({ sectionId: z.uuid(), command: commandSchema }).optional(),
});

type SavedProject = z.infer<typeof recordSchema>;
type LibraryEntry = { id: string; current: SavedProject; earlier: SavedProject[] };

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function library<T>(mode: IDBTransactionMode, access: (store: IDBObjectStore) => Promise<T>) {
  if (typeof indexedDB === "undefined") throw Error("Browser project storage is unavailable. Export an editable copy to keep your work.");
  const opening = indexedDB.open(libraryName, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(storeName, { keyPath: "id" });
  const database = await result(opening);
  try {
    const tx = database.transaction(storeName, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error("The browser could not save this change."));
    });
    try {
      const value = await access(tx.objectStore(storeName));
      await done;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have ended. */ }
      await done.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

async function allEntries(): Promise<LibraryEntry[]> {
  return library("readonly", (store) => result(store.getAll()));
}

async function summary() {
  return (await allEntries()).map(({ id, current, earlier }) => {
    const parsed = recordSchema.safeParse(current);
    const p = parsed.data?.project;
    return {
      id, name: p?.name ?? "Saved project needing recovery",
      updatedAt: p?.updatedAt ?? "", pieces: p?.pieces.length ?? 0,
      revision: current.revision, earlierRevisions: earlier.map(({ revision }) => revision),
      ...(!parsed.success && { loadError: projectFormatProblem(current.project) ?? "The saved project could not be read. Download its original file." }),
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const encoder = new TextEncoder();
async function checksum(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64(text: string) {
  const bytes = encoder.encode(text), chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(""));
}

async function workshopArchive() {
  const entries = await allEntries();
  const lines = await Promise.all(entries.flatMap(({ id, current, earlier }) => [
    { id, revision: null, record: current },
    ...earlier.map((record) => ({ id, revision: record.revision, record })),
  ]).map(async ({ id, revision, record }) => {
    const raw = JSON.stringify(record);
    return JSON.stringify({ id, revision, sha256: await checksum(raw), data: encodeBase64(raw) }) + "\n";
  }));
  const records = lines.join("");
  const archive = new Blob([
    JSON.stringify({ format: "yardwork-workshop", version: 1 }) + "\n",
    records,
    JSON.stringify({ end: true, files: lines.length, sha256: await checksum(records) }) + "\n",
  ]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(archive, { headers: { "content-type": "application/gzip" } });
}

/** The published workshop keeps its saved library on the visitor's device. */
export async function browserWorkshopRequest(url: string, options?: RequestInit) {
  const signal = options?.signal;
  try {
    signal?.throwIfAborted();
    const path = new URL(url, "https://yardwork.invalid").pathname;
    const method = options?.method ?? "GET";
    const body = () => JSON.parse(typeof options?.body === "string" ? options.body : "null");
    if (path === "/api/health") return Response.json({ ok: true, ai: "local-commands", catalog: false, projectFormatVersion: PROJECT_FORMAT_VERSION });
    if (path === "/api/projects" && method === "GET") return Response.json(await summary());
    if (path === "/api/workshop-backup" && method === "GET") return await workshopArchive();
    if (path === "/api/planner" && method === "POST") {
      const request = plannerRequestSchema.parse(body());
      const placement = localPlacementPlan(request);
      const resize = placement ? null : localRelativeResizePlan(request);
      return Response.json({
        plan: placement ?? resize ?? localIdeaPlan(request),
        provider: placement ? "Workspace placement" : resize ? "Workspace dimensions" : "Local planning presets",
        message: placement ? "Review the requested moves before applying." :
          resize ? "Review the resize and resulting fit before applying." :
          "Rule-based starter layouts. Review the dimensions and design details.",
      });
    }
    if (path === "/api/assistant" && method === "POST") {
      const { prompt, context } = assistantSchema.parse(body());
      const command = parsePrompt(prompt, context?.command);
      if (command.type === "coop") throw Error("Start from a blank project and describe your idea in the planner.");
      if (context && command.type !== context.command.type) throw Error("A targeted command must keep the selected section type.");
      return Response.json({ command, targetSectionId: context?.sectionId, provider: "Local command parser", message: "Review the dimensioned template before applying." });
    }
    const match = /^\/api\/projects\/([^/]+)(?:\/(original|revisions\/([1-9]\d*)))?$/.exec(path);
    if (match) {
      const id = z.uuid().parse(match[1]);
      if (method === "PUT" && !match[2]) {
        const { project, baseRevision } = saveSchema.parse(body());
        if (project.id !== id) throw Error("Project ID mismatch.");
        return await library("readwrite", async (store) => {
          const existing: LibraryEntry | undefined = await result(store.get(id));
          if (existing && !recordSchema.safeParse(existing.current).success)
            return Response.json({ error: "This saved project needs recovery. Download the original before saving a separate copy." }, { status: 422 });
          if (baseRevision !== (existing?.current.revision ?? 0))
            return Response.json({ error: "A newer save exists. Reopen it or export this draft as a separate file." }, { status: 409 });
          const current = { project: { ...project, updatedAt: new Date().toISOString() }, revision: baseRevision + 1 };
          const earlier = existing ? [existing.current, ...existing.earlier].slice(0, 3) : [];
          await result(store.put({ id, current, earlier } satisfies LibraryEntry));
          return Response.json(current);
        });
      }
      if (method === "GET") {
        const entry: LibraryEntry | undefined = await library("readonly", (store) => result(store.get(id)));
        signal?.throwIfAborted();
        const record = match[3] ? entry?.earlier.find(({ revision }) => revision === Number(match[3])) : entry?.current;
        if (record) return Response.json(match[2] === "original" ? record : recordSchema.parse(record));
      }
    }
    return Response.json({ error: "This workshop request is unavailable." }, { status: 404 });
  } catch (error) {
    signal?.throwIfAborted();
    return Response.json({ error: error instanceof Error && !(error instanceof z.ZodError)
      ? error.message : "Review the project format or the entered values." }, { status: 400 });
  }
}
