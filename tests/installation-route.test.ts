import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { guideMarkdown, validate } from "../src/engine";
import { installationRoutePreview, reviewInstallationRoute } from "../src/installationRoute";
import { projectSchema } from "../src/model";

const fixture = new URL("../public/examples/interior/vanity-installation-route.yardwork.json", import.meta.url);
const read = () => projectSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));

test("a parked door and a quarter-turn let the cabinet reach its exact saved location", () => {
  const project = read();
  const before = JSON.stringify(project);
  const plan = project.installationRoutes![0];
  const report = reviewInstallationRoute(project, plan);
  assert.equal(report.state, "clear");
  assert.deepEqual(report.legs.map(({ kind, title }) => [kind, title]), [
    ["hinge", "Open Entry door"], ["slide", "Move to waypoint 1"],
    ["hinge", "Turn at waypoint 1"], ["slide", "Move to final position"],
  ]);
  assert.deepEqual(report.anchor, [24, 0, 56]);
  const section = project.sections.find(({ id }) => id === plan.target.id)!;
  const [doorLeg] = report.legs;
  const start = installationRoutePreview(report, doorLeg, 0);
  assert.equal(start.pieces.find(({ name }) => name === "Left side")?.position[2], -28.3515);
  assert.deepEqual(start.hiddenPieceIds, plan.defer);
  const lastLeg = report.legs.at(-1)!;
  const finish = installationRoutePreview(report, lastLeg, lastLeg.travel);
  for (const id of section.pieceIds.filter((id) => !plan.defer.includes(id))) {
    const actual = finish.pieces.find((piece) => piece.id === id)!;
    const saved = project.pieces.find((piece) => piece.id === id)!;
    assert.ok(actual.position.every((n, axis) => Math.abs(n - saved.position[axis]) < 1e-6));
    assert.ok(actual.rotation.every((n, axis) => Math.abs(n - saved.rotation[axis]) < 1e-6));
  }
  const door = project.motionPlans![0].memberIds[0];
  assert.notDeepEqual(finish.pieces.find(({ id }) => id === door)!.position, project.pieces.find(({ id }) => id === door)!.position);
  assert.equal(JSON.stringify(project), before);
  const guide = guideMarkdown(project);
  assert.match(guide, /Carry and installation routes/);
  assert.match(guide, /Fit these parts after placement: P\d+ · Separate worktop/);
  assert.match(guide, /Turn at waypoint 1 · 90°/);
  const question = buildQuestion("Will the vanity fit through the doorway?")!;
  assert.equal(answerBuildQuestion(project, question, []).rows?.[0].link?.action.kind, "installation-route");
});

test("route blockers stay visible after save and geometry changes", () => {
  const project = read();
  const plan = project.installationRoutes![0];
  const closedDoor = { ...plan, door: undefined };
  const blocked = reviewInstallationRoute(project, closedDoor);
  assert.equal(blocked.state, "blocked");
  assert.match(blocked.detail, /Practice entry door/);
  assert.deepEqual(blocked.doorOption, { ...plan.door, label: "Entry door" });
  assert.ok(blocked.legs[0].limit.travel < blocked.legs[0].travel);
  const contact = installationRoutePreview(blocked, blocked.legs[0], blocked.legs[0].limit.travel, true);
  assert.ok(contact.interferenceIds.includes(project.motionPlans![0].memberIds[0]));
  assert.match(reviewInstallationRoute(project, { ...plan, defer: [] }).detail, /left of opening/);
  assert.match(reviewInstallationRoute(project, { ...plan, ceiling: 34 }).detail, /Measured ceiling/);
  const belowFloor = { ...plan, door: undefined, ceiling: undefined,
    waypoints: [{ ...plan.waypoints[0], y: -0.5 }, plan.waypoints[1]] };
  assert.match(reviewInstallationRoute(project, belowFloor).detail, /Modeled floor/);
  const moved = { ...project, pieces: project.pieces.map((piece) => piece.name.includes("left of opening")
    ? { ...piece, position: [-32, piece.position[1], piece.position[2]] as typeof piece.position } : piece) };
  const finding = validate(moved).find(({ installationRouteId }) => installationRouteId === plan.id);
  assert.equal(finding?.severity, "warning");
  assert.match(finding?.detail ?? "", /left of opening/);
  assert.match(guideMarkdown(moved), /stops at/);
});
