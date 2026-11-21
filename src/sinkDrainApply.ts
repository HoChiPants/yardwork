import { inspectCutStock } from "./cutStock";
import { motionObstacleWarnings } from "./mechanismMotion";
import { part, projectSchema, step, uid, type Piece, type Project } from "./model";
import { sinkTrap } from "./sinkDrainReference";
import { sinkDrainInput, type SinkDrain } from "./sinkDrainSchema";
import { drainTolerance, removeSinkDrain, sinkDrainLayout, sinkDrainOffcut } from "./sinkDrain";
import { rotate } from "./spatial";

export function previewSinkDrain(project: Project, data: unknown, id?: string, freshKit = false) {
  const input = sinkDrainInput.parse(data);
  const existing = project.sinkDrains?.find((row) => row.id === id);
  if (id && !existing) throw Error("This sink drain is no longer in the project.");
  const layout = sinkDrainLayout(project, input, existing);
  const priorTube = project.pieces.find((piece) => piece.id === existing?.tubeId && !piece.offcut);
  if (existing && !freshKit && (
    !priorTube?.cutStock || !inspectCutStock(project).valid.has(priorTube.cutStock.id) ||
    layout.keep > priorTube.size[1] + drainTolerance ||
    Math.abs(priorTube.cutStock.size[1] - input.blank) > drainTolerance ||
    Math.abs((priorTube.cutStock.tubeKerf ?? 0) - input.kerf) > drainTolerance
  )) throw Error("The retained wall tube or its cut source cannot supply this revision. Select a new measured kit blank.");

  const retained = freshKit ? undefined : priorTube;
  const source = retained?.cutStock ?? {
    id: uid(), size: [sinkTrap.diameter, input.blank, sinkTrap.diameter] as Piece["size"],
    offset: [0, 0, 0] as Piece["position"], tubeKerf: input.kerf,
  };
  const oldBody = project.pieces.find(({ id }) => id === existing?.bodyId);
  const stage = project.steps.find(({ id }) => id === oldBody?.stepId) ?? step(`Fit ${input.name}`);
  const assembly = `Sink drain · ${input.name}`;
  const body: Piece = {
    ...part(input.name, sinkTrap.id, layout.body.size, layout.body.position, stage.id, assembly, layout.body.rotation),
    ...(oldBody && { id: oldBody.id }), designRole: "sink-trap",
  };
  const tube: Piece = {
    ...part(`${input.name} · wall tube`, sinkTrap.tube, layout.tube.size, layout.tube.position, stage.id, assembly, layout.tube.rotation),
    ...(retained && { id: retained.id }), designRole: "sink-trap-wall-tube", cutStock: source,
  };
  const priorLength = retained?.size[1] ?? input.blank;
  const remainder = priorLength - layout.keep - input.kerf;
  let scrap: Piece | undefined;
  if (remainder > drainTolerance) {
    const origin = retained ?? tube;
    const shift = rotate([0, layout.keep + input.kerf + remainder / 2 - origin.size[1] / 2, 0], origin.rotation);
    scrap = sinkDrainOffcut({
      ...tube, id: uid(), size: [sinkTrap.diameter, remainder, sinkTrap.diameter],
      position: [origin.position[0] + shift[0], origin.position[1] + shift[1], origin.position[2] + shift[2]],
      rotation: origin.rotation, cutStock: { ...source, offset: [0, source.offset[1] + layout.keep + input.kerf, 0] },
    }, "Offcut · Sink wall tube");
  }
  const record: SinkDrain = { ...input, id: existing?.id ?? uid(), bodyId: body.id, tubeId: tube.id };
  const candidate = existing ? removeSinkDrain(project, existing, freshKit) : project;
  const saved = projectSchema.parse({
    ...candidate,
    sinkDrains: existing ? project.sinkDrains!.map((row) => row.id === existing.id ? record : row) : [...(project.sinkDrains ?? []), record],
    pieces: [...candidate.pieces, body, tube, ...(scrap ? [scrap] : [])],
    steps: project.steps.some(({ id }) => id === stage.id) ? project.steps : [...project.steps, stage],
    guideFingerprint: null,
  });
  if (!inspectCutStock(saved).valid.has(source.id)) throw Error("The revised wall-tube cut does not match its recorded source.");
  return {
    project: saved, record, layout, scrap,
    movement: motionObstacleWarnings(saved, new Set([record.bodyId, record.tubeId]), "the sink drain"),
  };
}
