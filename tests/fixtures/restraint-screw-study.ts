import { createBuildStudy } from "../../src/buildFixtures";
import { cutPiece } from "../../src/engine";
import {
  saveFastenerPlan,
  suggestCenteredFastener,
} from "../../src/fastenings";
import { part, type Project } from "../../src/model";
import {
  addRestraintLocation,
  makeRestraintPlan,
  selectRestraintReceiver,
} from "../../src/restraints";

export function addMeasuredStudyScrew(
  project: Project,
  headId: string,
  receiverId: string,
) {
  const draft = suggestCenteredFastener(project, headId, receiverId, {
    productId: "grk-cabinet-114069",
    name: "Synthetic receiver connection",
  }).plan;
  const screw = {
    ...draft,
    measurements: {
      surfaceToTipDepth: 1.125,
      pilotDiameter: 0.0625,
      pilotDepth: 1,
      basis: "Synthetic geometry fixture for software qualification.",
      measuredAt: "2026-11-19T05:00:00.000Z",
    },
  };
  return { screw, project: saveFastenerPlan(project, screw) };
}

export function restraintScrewStudy(useShelf = false) {
  const base = createBuildStudy("shelves").project;
  const top = base.pieces.find(({ assembly }) =>
    useShelf ? assembly === "Adjustable shelf 1" : assembly === "Top",
  )!;
  const stepId = base.steps[0].id;
  const length = top.size[0];
  const rail = part(
    "Synthetic solid-wood receiver",
    "stud",
    [96, 3.5, 1.5],
    [
      top.position[0] + (96 - length) / 2,
      top.position[1] + top.size[1] / 2 + 1.75,
      top.position[2] - top.size[2] / 2 + 0.75,
    ],
    stepId,
    "Custom receiver",
  );
  rail.stockLengthAxis = 0;
  const fitted = cutPiece(
    { ...base, pieces: [...base.pieces, rail] },
    rail.id,
    length,
    0,
  );
  const { project, screw } = addMeasuredStudyScrew(fitted, top.id, rail.id);
  const entryId = project.ideaBindings[0].entries[0].id;
  const restraint = addRestraintLocation(
    selectRestraintReceiver(
      project,
      makeRestraintPlan(project, entryId),
      rail.id,
    ),
  );
  return { project, screw, restraint, railId: rail.id, targetId: top.id };
}
