import { catalog, material, type Project } from "./model";

/** Resolve the existing legacy purchase identity without inferring a connection path. */
export function hardwareForJoint(joint: Project["joints"][number]) {
  const candidates = joint.material ? [material(joint.material)] : catalog;
  return candidates.find((m) =>
    joint.kind === "bracket"
      ? m.stockKind === "connector"
      : m.stockKind === "fastener" &&
        (joint.kind === "nail"
          ? m.fastenerType === "nail" || m.id === "nail"
          : m.fastenerType !== "nail" && m.id !== "nail") &&
        Math.abs((m.fastenerLength ?? 0) - joint.length) < 0.001,
  );
}
