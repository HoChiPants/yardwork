import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { guideMarkdown, validate } from "../src/engine";
import { greenhouseBaseEntries } from "../src/greenhouseBaseConnections";
import {
  foundationFromBase,
  greenhouseFoundationReviews,
} from "../src/greenhouseFoundation";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { projectSchema } from "../src/model";

const fixture = () => {
  const { project } = createBuildStudy("greenhouse");
  const [base] = greenhouseBaseEntries(project);
  const site = foundationFromBase(base);
  assert.ok(site);
  return { project, base, site };
};

test("a measured footprint feeds checks and guides as rails move or are removed", () => {
  const { project, base, site } = fixture();
  const before = generateBuildGuide(project);
  project.greenhouseFoundations = [site];
  assert.equal(greenhouseFoundationReviews(project)[0].fitCount, 4);
  assert.doesNotMatch(guideMarkdown(project), /overhang/);
  const guided = generateBuildGuide(project);
  assert.match(guideMarkdown(guided), /4 of 4 rails fit the footprint/);
  assert.match(guided.steps[0].notes, /Confirm the greenhouse foundation/);
  assert.equal(
    guideIsCurrent({ ...before, greenhouseFoundations: [site] }),
    false,
  );
  assert.equal(guideIsCurrent(guided), true);

  const rail = base.rails.get("left")!;
  rail.position = [
    rail.position[0] - 2.5,
    rail.position[1] + 0.75,
    rail.position[2],
  ];
  const moved = greenhouseFoundationReviews(project)[0];
  assert.equal(moved.fitCount, 3);
  assert.match(
    guideMarkdown(project),
    /left overhang 2\.5 in · 0\.75 in above top/,
  );
  const finding = validate(project).find(
    ({ id }) => id === `greenhouse-foundation-${site.entryId}`,
  );
  assert.equal(finding?.pieceId, rail.id);

  project.pieces = project.pieces.filter(({ id }) => id !== rail.id);
  assert.match(
    guideMarkdown(project),
    /Left rail · Retained rail geometry unavailable/,
  );
});

test("footprint fit follows a retained trim and cannot pass a tilted underside", () => {
  const { project, base, site } = fixture();
  project.greenhouseFoundations = [{ ...site, width: site.width - 2 }];
  const [initial] = greenhouseFoundationReviews(project);
  const rail = base.rails.get("left")!;
  const left = initial.rails.find(({ label }) => label === "Left rail");
  assert.ok(left?.geometry && left.overhang.some(([side]) => side === "left"));

  // For the generated side rail, X is its cross-section width in local space.
  rail.cutPlanes = [{ normal: [-1, 0, 0], constant: rail.size[0] / 2 - 1 }];
  const cut = greenhouseFoundationReviews(project)[0].rails.find(
    ({ label }) => label === "Left rail",
  );
  assert.ok(cut?.geometry && cut.fits);

  rail.rotation = [0, 0, 0.1];
  const tilt = greenhouseFoundationReviews(project)[0].rails.find(
    ({ label }) => label === "Left rail",
  );
  assert.ok(tilt?.geometry && !tilt.geometry.level && !tilt.fits);
});

test("one foundation per greenhouse round-trips without adding measurements to older projects", () => {
  const { project, site } = fixture();
  const saved = {
    ...project,
    greenhouseFoundations: [{ ...site, centerX: -2, topY: -3 }],
  };
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(saved)))
      .greenhouseFoundations,
    saved.greenhouseFoundations,
  );
  assert.equal(
    projectSchema.safeParse({ ...project, greenhouseFoundations: [site, site] })
      .success,
    false,
  );
  assert.equal(
    projectSchema.safeParse({
      ...project,
      greenhouseFoundations: [{ ...site, width: 0 }],
    }).success,
    false,
  );
  assert.equal(
    projectSchema.parse({ ...project, schemaVersion: 46 })
      .greenhouseFoundations,
    undefined,
  );

  const detached = { ...saved, ideaBindings: [] };
  assert.match(
    guideMarkdown(detached),
    /Missing greenhouse design.*0 of 4 rails/,
  );
});
