import { unzipSync } from "fflate";
import { rekeyGuidePlacements } from "./guidePlacement";
import { projectSchema, uid, type Project } from "./model";
import { PROJECT_FORMAT_VERSION } from "./projectVersion";

const mb = 1024 * 1024;
const maxProjectBytes = 4 * mb;
const maxBatchBytes = 32 * mb;
const maxFiles = 32;
const zipName = /\.zip$/i;
const jsonName = /\.json$/i;

export type ImportCandidate = {
  source: string;
  project: Project;
  error?: string;
};
export type ProjectImportReview = {
  candidates: ImportCandidate[];
  issues: { source: string; detail: string }[];
  saved: number;
};

export function isSingleProjectFile(files: readonly File[]) {
  return files.length === 1 && jsonName.test(files[0].name);
}

export async function readProjectImports(files: readonly File[]): Promise<ProjectImportReview> {
  const review: ProjectImportReview = { candidates: [], issues: [], saved: 0 };
  const reject = (source: string, detail: string) => review.issues.push({ source, detail });
  if (files.length > maxFiles || files.reduce((total, file) => total + file.size, 0) > maxBatchBytes) {
    reject("File selection", "Choose up to 32 files within 32 MB at a time.");
    return review;
  }
  let entryCount = 0;
  let expandedBytes = 0;
  const read = (source: string, content: string) => {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      reject(source, "This file could not be read as JSON.");
      return;
    }
    if (typeof data === "object" && data !== null && "schemaVersion" in data &&
      typeof data.schemaVersion === "number" && data.schemaVersion > PROJECT_FORMAT_VERSION) {
      reject(source, "This plan uses a newer Yardwork format.");
      return;
    }
    const parsed = projectSchema.safeParse(data);
    if (!parsed.success) {
      reject(source, "This file is not a supported editable Yardwork project.");
      return;
    }
    const original = parsed.data;
    const project = rekeyGuidePlacements(original, uid());
    review.candidates.push({
      source,
      project: { ...project, name: `${original.name.slice(0, 108)} · imported` },
    });
  };
  for (const file of files) {
    try {
      if (zipName.test(file.name)) {
        const names = new Set<string>();
        let foundJson = false;
        let reportedBatchLimit = false;
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter({ name, originalSize, size, compression }) {
            if (!jsonName.test(name) || name.startsWith("__MACOSX/")) return false;
            foundJson = true;
            const expandedSize = Math.max(originalSize, compression === 0 ? size : 0);
            if (entryCount >= maxFiles || expandedBytes + expandedSize > maxBatchBytes) {
              if (!reportedBatchLimit) {
                reject(file.name, "Split this ZIP into batches of up to 32 projects and 32 MB of extracted files.");
                reportedBatchLimit = true;
              }
              return false;
            }
            entryCount++;
            const source = `${file.name} / ${name}`;
            if (names.has(name)) {
              reject(source, "This ZIP contains another file with the same path.");
              return false;
            }
            names.add(name);
            if (expandedSize > maxProjectBytes) {
              reject(source, "Each project file must be under 4 MB.");
              return false;
            }
            if (compression !== 0 && compression !== 8) {
              reject(source, "This file uses an unsupported ZIP compression method.");
              return false;
            }
            expandedBytes += expandedSize;
            return true;
          },
        });
        if (!foundJson) reject(file.name, "This ZIP contains no JSON project files.");
        for (const [name, bytes] of Object.entries(entries))
          read(`${file.name} / ${name}`, new TextDecoder().decode(bytes));
      } else if (!jsonName.test(file.name)) {
        reject(file.name, "Choose a Yardwork JSON project or a ZIP of projects.");
      } else if (file.size > maxProjectBytes) {
        reject(file.name, "Each project file must be under 4 MB.");
      } else if (entryCount >= maxFiles || expandedBytes + file.size > maxBatchBytes) {
        reject(file.name, "Choose up to 32 projects and 32 MB of extracted files at a time.");
      } else {
        entryCount++;
        expandedBytes += file.size;
        read(file.name, await file.text());
      }
    } catch {
      reject(file.name, zipName.test(file.name)
        ? "Could not open this ZIP. Try extracting its project files and importing the JSON files."
        : "Could not read this file. Try choosing it again.");
    }
  }
  return review;
}
