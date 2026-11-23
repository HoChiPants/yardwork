import { isDrywall } from "./drywallReference";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches } from "./measurement";
import { material, projectSchema, type Project, type V3 } from "./model";
import { openingSilicone } from "./openingAirSealReference";
import { partLabel } from "./partLabels";
import { pipeAirSealInput } from "./pipeAirSealSchema";
import { rotate } from "./spatial";
import { openingAxes, pieceThroughOpenings } from "./throughOpenings";
import { roundOpeningMarks } from "./throughOpeningCuts";
import { trimBackerRodMinRecess, trimBackerRods } from "./trimBackerRodReference";
import type { RoundOpening } from "./throughOpeningSchema";
import type { BackerRodRun } from "./trimBackerRodOffcuts";
import type { TrimSeamMarker } from "./trimSeamGeometry";

export const pipeAirSealReference = "https://basc.pnnl.gov/resource-guides/air-sealing-plumbing-and-piping";
export const pipeAirSealScope = "For accessible, non-rated air-barrier faces around round PVC or ABS plumbing pipes. Verify the pipe support, materials, joint depth and access on site. Fire-rated assemblies, flues and exterior drainage planes need their own details.";

const epsilon = 1e-7;
const keyForOpening = ({ axis, center }: RoundOpening) => JSON.stringify([axis, center]);
export function pipeAirSealOptions(project: Project) {
  return project.pieces.flatMap((part) => part.offcut || (!material(part.material).wood && !isDrywall(part.material))
    ? [] : (part.roundOpenings ?? [])
    .filter(({ source }) => !source)
    .map((opening) => {
      const { fromEdges } = roundOpeningMarks(part, opening);
      const axes = openingAxes(opening.axis).map((axis) => "XYZ"[axis]);
      const label = `${partLabel(project, part.id)} · ${part.name} · Ø ${formatPreciseInches(opening.diameter)} at ${axes[0]} ${formatPreciseInches(fromEdges[0])}, ${axes[1]} ${formatPreciseInches(fromEdges[1])}`;
      return { part, opening, key: keyForOpening(opening), label, axes };
    }));
}

export function previewPipeAirSeal(project: Project, input: unknown) {
  const plan = pipeAirSealInput.parse(input);
  const target = pipeAirSealOptions(project).find(({ part, key }) => part.id === plan.partId && key === plan.openingKey);
  if (!target) throw Error("The round cut moved or was removed. Select the current opening and measure it again.");
  const { opening, part, label } = target;
  const { cavityDepth, rodRecess, pipeDiameter, offset, side } = plan;
  const holeRadius = opening.diameter / 2, pipeRadius = pipeDiameter / 2;
  const displacement = Math.hypot(...offset);
  const narrow = holeRadius - pipeRadius - displacement;
  const wide = holeRadius - pipeRadius + displacement;
  const issues: string[] = [];
  const [u, v] = openingAxes(opening.axis);
  const [centerU, centerV] = opening.center;
  if (Math.abs(centerU) + holeRadius >= part.size[u] / 2 - epsilon ||
      Math.abs(centerV) + holeRadius >= part.size[v] / 2 - epsilon)
    issues.push("The cut reaches a part edge. Choose a fully surrounded opening for this seal.");
  if (pieceThroughOpenings(part).some((other) => {
    if (other === opening || other.axis !== opening.axis) return false;
    const du = Math.abs(other.center[0] - centerU);
    const dv = Math.abs(other.center[1] - centerV);
    return "spans" in other
      ? Math.hypot(Math.max(0, du - other.spans[0] / 2), Math.max(0, dv - other.spans[1] / 2)) <= holeRadius + epsilon
      : Math.hypot(du, dv) <= holeRadius + other.diameter / 2 + epsilon;
  })) issues.push("Another cut reaches the opening. This seal needs a continuous edge.");

  if (narrow <= epsilon) issues.push("The pipe touches or crosses the cut edge. A continuous seal needs a gap all the way around.");
  if (wide > openingSilicone.maxWidth + epsilon)
    issues.push("The widest gap exceeds 1/2 in. Review fitted blocking or a gasket before choosing sealant.");
  if (cavityDepth > part.size[opening.axis] + epsilon)
    issues.push("The measured cavity is deeper than this part. Review the assembly behind the opening separately.");
  const backed = cavityDepth > openingSilicone.maxDepth + epsilon || rodRecess !== undefined;
  const rod = backed && narrow > epsilon && wide <= openingSilicone.maxWidth + epsilon
    ? trimBackerRods.find(({ diameter }) => diameter > wide + epsilon) : undefined;
  if (backed) {
    if (rodRecess === undefined || rodRecess < trimBackerRodMinRecess - epsilon || rodRecess > openingSilicone.maxDepth + epsilon)
      issues.push("Enter a backer rod recess of 1/4 to 1/2 in for this backing and sealant combination.");
    if (rod && rodRecess !== undefined && rodRecess + rod.diameter > cavityDepth + epsilon)
      issues.push("The rod and its recess need more cavity depth. Check the fit or choose a different detail.");
    if (rod && !plan.dryFit) issues.push("Dry-fit the suggested rod around the entire pipe and confirm the recess.");
  }
  if ((project.pipeAirSeals ?? []).some((record) => record.id !== plan.id && record.partId === plan.partId &&
      record.openingKey === plan.openingKey))
    issues.push("This opening already has a seal plan. Open the saved plan to make changes.");

  const depth = rodRecess ?? cavityDepth;
  const volume = Math.PI * (holeRadius ** 2 - pipeRadius ** 2) * depth;
  const use = issues.length ? 0 : volume / openingSilicone.coverage;
  // Start from the outside circumference so there is room to trim the actual ring.
  const rodLength = Math.PI * opening.diameter;
  const signature = bindingHash([part.material, part.size[opening.axis], opening, part.cutPlanes]);
  const ring = (radius: number, delta: [number, number], open: boolean) => {
    const points = Array.from({ length: 64 }, (_, i) => {
      const theta = i * Math.PI / 32;
      const local: V3 = [0, 0, 0];
      local[opening.axis] = (part.size[opening.axis] / 2 + 0.02) * (side === "negative" ? -1 : 1);
      local[u] = opening.center[0] + delta[0] + radius * Math.cos(theta);
      local[v] = opening.center[1] + delta[1] + radius * Math.sin(theta);
      return rotate(local, part.rotation).map((n, i) => n + part.position[i]) as V3;
    });
    return { points: [...points, points[0]], open };
  };
  return { plan, label, narrow, wide, rod, rodLength, depth, use, signature, issues,
    get marker(): TrimSeamMarker {
      const hole = ring(holeRadius, [0, 0], false);
      return {
        label: "Pipe air seal", closed: true, points: [hole.points[0], hole.points[32]],
        segments: [{ ...hole, ...(issues.length ? { cover: "blocked" } : {}) }, ring(pipeRadius, offset, true)],
      };
    },
  };
}

export function savePipeAirSeal(project: Project, input: unknown) {
  const { plan, signature, issues } = previewPipeAirSeal(project, input);
  if (issues.length) throw Error(issues[0]);
  return projectSchema.parse({ ...project, guideFingerprint: null, pipeAirSeals: [
    ...(project.pipeAirSeals ?? []).filter(({ id }) => id !== plan.id), { ...plan, signature },
  ] });
}

export function reviewPipeAirSeals(project: Project) {
  return (project.pipeAirSeals ?? []).map(({ signature, ...plan }) => {
    try {
      const preview = previewPipeAirSeal(project, plan);
      const issue = signature !== preview.signature ? "The cut or its backing changed. Measure and review the seal again." : preview.issues[0];
      return { plan, preview: issue ? null : preview, issue };
    } catch (cause) {
      return { plan, preview: null, issue: cause instanceof Error ? cause.message : "Review the saved pipe seal." };
    }
  });
}

export function pipeAirSealCoveringSections(project: Project, partId: string) {
  const section = project.sections.find(({ pieceIds }) => pieceIds.includes(partId));
  const lining = section?.wallDrywall;
  const wallId = lining?.wallId ?? (section?.generator?.type === "wall" ? section.id : undefined);
  if (!wallId) return [];
  return project.sections.filter(({ wallDrywall, doorCasing }) =>
    (!lining && wallDrywall?.wallId === wallId) ||
    (doorCasing?.wallId === wallId && (!lining || doorCasing.side === lining.side)));
}

export function pipeAirSealApplication(preview: ReturnType<typeof previewPipeAirSeal>) {
  const { rod, rodLength, depth } = preview;
  const backing = rod ? `Dry-fit ${rod.name}. Start with a ${formatPreciseInches(rodLength)} ring and trim to fit at a ${formatPreciseInches(depth)} recess. ` : "";
  return `${backing}Clean and dry the contact surfaces, then apply and tool a continuous ${formatPreciseInches(depth)} deep bead. Follow the sealant cure instructions before covering.`;
}

export function pipeAirSealBatches(rows: ReturnType<typeof reviewPipeAirSeals>) {
  const batches = new Map<string, { session: string; use: number }>();
  for (const { plan, preview } of rows) {
    if (!preview) continue;
    const key = plan.session.toLowerCase();
    const batch = batches.get(key) ?? { session: plan.session, use: 0 };
    batch.use += preview.use;
    batches.set(key, batch);
  }
  return [...batches.values()].map(({ session, use }) => ({ session, count: Math.max(1, Math.ceil(use - epsilon)) }));
}

export function pipeAirSealRodRuns(project: Project) {
  return reviewPipeAirSeals(project).flatMap(({ plan, preview }) => {
    if (!preview?.rod) return [];
    const { rod, rodLength } = preview;
    const run: BackerRodRun = {
      kind: "pipe-seal", title: `Pipe seal · ${partLabel(project, plan.partId)} · ${plan.side} face`,
      start: 0, end: rodLength, length: rodLength,
      key: JSON.stringify(["pipe-seal", plan.id, preview.signature, plan.pipeDiameter, plan.offset, plan.rodRecess, rod.id]),
    };
    return [{ ...run, productId: rod.id }];
  });
}

export function pipeAirSealGuideLines(project: Project) {
  const rows = reviewPipeAirSeals(project);
  return [
    ...rows.map(({ plan, preview, issue }) => {
      if (!preview) return `${partLabel(project, plan.partId)} · ${plan.side} face · ${plan.session}. ${issue}`;
      const { label, narrow, wide } = preview;
      return `${label} · ${plan.side} face · ${plan.session}. Gap ${formatPreciseInches(narrow)} to ${formatPreciseInches(wide)}. ${pipeAirSealApplication(preview)}`;
    }),
    ...pipeAirSealBatches(rows).map(({ session, count }) =>
      `${session} · ${count} ${count === 1 ? "cartridge" : "cartridges"} of ${openingSilicone.name} for these pipe seals.`),
  ];
}
