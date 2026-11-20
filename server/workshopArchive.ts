import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { z } from "zod";

const header = { format: "yardwork-workshop", version: 1 };
const digest = () => createHash("sha256");
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-f\d-]{36}$/i;
const currentPattern = /^[a-f\d-]{36}\.json$/i;
const revisionPattern = /^[1-9]\d*\.json$/;
const backupEntry = z.strictObject({
  id: z.string().regex(idPattern),
  revision: z.number().int().positive().nullable(),
  sha256: z.string().regex(hashPattern),
  data: z.string(),
});
const footer = z.strictObject({
  end: z.literal(true),
  files: z.number().int().nonnegative(),
  sha256: z.string().regex(hashPattern),
});

async function directoryEntries(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Archive project records and earlier saves as bytes, including unreadable records. */
export async function writeWorkshopArchive(directory: string, archive: string) {
  async function* records() {
    const index = digest();
    let files = 0;
    yield JSON.stringify(header) + "\n";
    const entry = async (
      id: string,
      revision: number | null,
      filename: string,
    ) => {
      const bytes = await readFile(filename);
      const line =
        JSON.stringify({
          id,
          revision,
          sha256: digest().update(bytes).digest("hex"),
          data: bytes.toString("base64"),
        }) + "\n";
      index.update(line);
      files++;
      return line;
    };
    for (const file of await directoryEntries(directory)) {
      if (file.isFile() && currentPattern.test(file.name))
        yield await entry(
          file.name.slice(0, -5),
          null,
          path.join(directory, file.name),
        );
    }
    const revisionRoot = path.join(directory, ".revisions");
    for (const project of await directoryEntries(revisionRoot)) {
      if (!project.isDirectory() || !idPattern.test(project.name)) continue;
      const saved = path.join(revisionRoot, project.name);
      for (const file of await directoryEntries(saved)) {
        if (!file.isFile() || !revisionPattern.test(file.name)) continue;
        const revision = Number(file.name.slice(0, -5));
        if (Number.isSafeInteger(revision))
          yield await entry(
            project.name,
            revision,
            path.join(saved, file.name),
          );
      }
    }
    yield (
      JSON.stringify({ end: true, files, sha256: index.digest("hex") }) + "\n"
    );
  }
  await pipeline(
    records(),
    createGzip(),
    createWriteStream(archive, { flags: "wx", mode: 0o600 }),
  );
}

async function requireNewDirectory(destination: string) {
  try {
    await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw Error(
    "Choose a new restore directory. The destination already exists.",
  );
}

/** Validate the whole archive in a staging folder before publishing the restored library. */
export async function restoreWorkshopArchive(
  archive: string,
  destination: string,
) {
  const target = path.resolve(destination);
  await requireNewDirectory(target);
  const staging = await mkdtemp(
    path.join(path.dirname(target), ".yardwork-restore-"),
  );
  let files = 0;
  let opened = false;
  let ended = false;
  const index = digest();
  const seen = new Set<string>();
  async function restoreLine(line: string) {
    if (ended) throw Error("Unexpected data after the backup checksum.");
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw Error("The workshop backup contains an unreadable record.");
    }
    if (!opened) {
      const result = z
        .strictObject({
          format: z.literal(header.format),
          version: z.literal(header.version),
        })
        .safeParse(raw);
      if (!result.success) throw Error("Unsupported workshop backup format.");
      opened = true;
      return;
    }
    const end = footer.safeParse(raw);
    if (end.success) {
      if (end.data.files !== files || end.data.sha256 !== index.digest("hex"))
        throw Error("The workshop backup index checksum did not match.");
      ended = true;
      return;
    }
    const result = backupEntry.safeParse(raw);
    if (!result.success)
      throw Error("Invalid project or revision in the workshop backup.");
    const { id, revision, sha256, data } = result.data;
    const filename =
      revision === null
        ? path.join(staging, `${id}.json`)
        : path.join(staging, ".revisions", id, `${revision}.json`);
    const key = filename.toLowerCase();
    if (seen.has(key))
      throw Error("The workshop backup contains a duplicate project record.");
    seen.add(key);
    const bytes = Buffer.from(data, "base64");
    if (
      bytes.toString("base64") !== data ||
      sha256 !== digest().update(bytes).digest("hex")
    )
      throw Error(
        "The workshop backup contains a record with a mismatched checksum.",
      );
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes, { flag: "wx", mode: 0o600, flush: true });
    index.update(line + "\n");
    files++;
  }
  try {
    await pipeline(
      createReadStream(archive),
      createGunzip(),
      async (chunks) => {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let pending = "";
        for await (const chunk of chunks) {
          pending += decoder.decode(chunk, { stream: true });
          let cut = pending.indexOf("\n");
          while (cut !== -1) {
            await restoreLine(pending.slice(0, cut));
            pending = pending.slice(cut + 1);
            cut = pending.indexOf("\n");
          }
        }
        if (pending + decoder.decode() || !ended)
          throw Error("The workshop backup ended early.");
      },
    );
    await requireNewDirectory(target);
    await rename(staging, target);
    return files;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
