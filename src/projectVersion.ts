/** Change the file version whenever persisted feature data changes incompatibly. */
export const PROJECT_FORMAT_VERSION = 84 as const;

function projectObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function supportedVersion(version: unknown): version is number {
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= 1 &&
    version <= PROJECT_FORMAT_VERSION
  );
}

export function projectFormatProblem(value: unknown): string | null {
  if (!projectObject(value)) return "This is not a Yardwork project object.";
  const version = value.schemaVersion;
  if (supportedVersion(version)) return null;
  if (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > PROJECT_FORMAT_VERSION
  )
    return `This project uses newer Yardwork format ${version}. Upgrade Yardwork to open it; its original data has not been changed.`;
  return `Unsupported Yardwork project format. Import a version 1–${PROJECT_FORMAT_VERSION} project.`;
}

/** Reads upgrade in memory. The source file is replaced only by an explicit save. */
export function migrateLegacyProject(value: unknown): unknown {
  if (
    projectObject(value) &&
    supportedVersion(value.schemaVersion) &&
    value.schemaVersion !== PROJECT_FORMAT_VERSION
  )
    return { ...value, schemaVersion: PROJECT_FORMAT_VERSION };
  return value;
}
