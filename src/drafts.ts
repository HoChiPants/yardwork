import { projectSchema, type Project } from "./model";
import { PROJECT_FORMAT_VERSION, projectFormatProblem } from "./projectVersion";
export const CURRENT_DRAFT_KEY = `yardwork-draft-v${PROJECT_FORMAT_VERSION}`;
export const PREVIOUS_DRAFT_KEY = `yardwork-previous-draft-v${PROJECT_FORMAT_VERSION}`;
const legacyVersions = Array.from({ length: PROJECT_FORMAT_VERSION - 1 }, (_, index) => PROJECT_FORMAT_VERSION - index - 1);
const legacyCurrent = legacyVersions.map((version) => `yardwork-draft-v${version}`),
  legacyPrevious = legacyVersions.map(
    (version) => `yardwork-previous-draft-v${version}`,
  );
const recoveryPrefix = "yardwork-recovery-";
export type BrowserDraft = { project: Project; revision: number };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;
function parseDraft(raw: string | null): BrowserDraft | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw),
      result = projectSchema.safeParse(data?.project);
    if (
      !result.success ||
      !Number.isInteger(data.revision) ||
      data.revision < 0
    )
      return null;
    return { project: result.data, revision: data.revision };
  } catch {
    return null;
  }
}
export function readBrowserDraft(
  storage: DraftStorage,
  key = CURRENT_DRAFT_KEY,
) {
  try {
    return parseDraft(storage.getItem(key));
  } catch {
    return null;
  }
}
export function readInitialBrowserDrafts(storage: DraftStorage): {
  resume: BrowserDraft | null;
  previous: BrowserDraft | null;
} {
  const firstReadable = (keys: string[]): BrowserDraft | null => {
    for (const key of keys) {
      const draft = readBrowserDraft(storage, key);
      if (draft) return draft;
    }
    return null;
  };
  return {
    resume:
      readBrowserDraft(storage) ??
      readBrowserDraft(storage, PREVIOUS_DRAFT_KEY) ??
      firstReadable(
        legacyCurrent.flatMap((key, index) => [key, legacyPrevious[index]]),
      ),
    previous:
      readBrowserDraft(storage, PREVIOUS_DRAFT_KEY) ??
      firstReadable(legacyPrevious),
  };
}
function recoveryProblem(raw: string) {
  try {
    const data = JSON.parse(raw);
    return (
      projectFormatProblem(data?.project) ??
      "This browser draft contains unsupported or invalid data. Its original copy is preserved."
    );
  } catch {
    return "This browser draft could not be read. Its original copy is preserved.";
  }
}
export function browserDraftRecoveries(storage: DraftStorage) {
  const keys = new Set([
    CURRENT_DRAFT_KEY,
    PREVIOUS_DRAFT_KEY,
    ...legacyCurrent,
    ...legacyPrevious,
  ]);
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(recoveryPrefix)) keys.add(key);
    }
    return [...keys].flatMap((key) => {
      const raw = storage.getItem(key);
      return raw !== null &&
        (key.startsWith(recoveryPrefix) || !parseDraft(raw))
        ? [{ key, raw, problem: recoveryProblem(raw) }]
        : [];
    });
  } catch {
    return [];
  }
}
function preserveUnreadable(storage: DraftStorage, key: string, raw: string) {
  let hash = 2166136261;
  for (const c of raw) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const base = `${recoveryPrefix}${key}-${(hash >>> 0).toString(16)}`;
  let recoveryKey = base,
    suffix = 0;
  while (
    storage.getItem(recoveryKey) !== null &&
    storage.getItem(recoveryKey) !== raw
  )
    recoveryKey = `${base}-${++suffix}`;
  if (storage.getItem(recoveryKey) !== raw) storage.setItem(recoveryKey, raw);
  if (storage.getItem(recoveryKey) !== raw)
    throw Error(
      "The original browser draft could not be preserved. Export your current project before changing drafts.",
    );
}
export function writeBrowserDraft(
  storage: DraftStorage,
  key: string,
  draft: BrowserDraft,
) {
  const valid = {
    project: projectSchema.parse(draft.project),
    revision: draft.revision,
  };
  if (!Number.isInteger(valid.revision) || valid.revision < 0)
    throw Error("Invalid draft revision");
  const previous = storage.getItem(key);
  if (previous !== null && !parseDraft(previous))
    preserveUnreadable(storage, key, previous);
  storage.setItem(key, JSON.stringify(valid));
}
