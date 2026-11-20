/** Refresh intentional portable example plans; no store observations or owned-tool claims are seeded. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
  buildFixtureIds,
  addPendingStorageHinges,
  getBuildFixture,
} from "../src/buildFixtures";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { bom, shoppingCsv, guideMarkdown } from "../src/engine";
import { projectSchema } from "../src/model";
import { retailerHandoff } from "../src/handoff";
import { toolGuideMarkdown } from "../src/toolGuide";
import { sheetPlansMarkdown } from "../src/SheetLayouts";
import type { StructureMaterials } from "../src/structures";
import { reconcileIdeaBindings } from "../src/ideaBindingState";
import { migrateLegacyProject } from "../src/projectVersion";
import { everbiltClosetRod } from "../src/closetRodReference";
import { addMissingRodSockets } from "../src/rodFits";

const arguments_ = process.argv.slice(2),
  check = arguments_.includes("--check"),
  preserveExisting = check || arguments_.includes("--preserve-existing"),
  only = arguments_
    .find((argument) => argument.startsWith("--only="))
    ?.slice(7);
if (
  only !== undefined &&
  !(buildFixtureIds as readonly string[]).includes(only)
)
  throw Error(`Choose --only=${buildFixtureIds.join("|")}.`);
const destination = resolve(
  arguments_.find((argument) => !argument.startsWith("--")) ??
    "public/examples/builds",
);
if (!check) await mkdir(destination, { recursive: true });
const stale: string[] = [];
async function artifact(name: string, contents: string) {
  const file = join(destination, name);
  if (check) {
    if (
      (await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      })) !== contents
    )
      stale.push(name);
  } else {
    await writeFile(file, contents);
  }
}
const index: string[] = [
  "# Editable example studies",
  "",
  "Import a .yardwork.json file through Import a plan. These are editable studies, with unresolved installation decisions retained. No current stock, prices, tool ownership, structural approval or code grading is claimed.",
  "",
  "SUNLITE and rod examples use exact external envelopes; glazing allowances and rod socket deductions still need review. Sauna is a framing study with its clear interior reserved; heated systems are not supplied.",
  "",
  "The closet study preserves its selected rod and end sockets. Confirm delivered fit, intermediate supports and backing. Use an observation for your selected Home Depot store and ZIP to check stock and pricing.",
  "",
];
for (const id of buildFixtureIds) {
  if (only && id !== only) continue;
  const parameters = defaultBuildStudyParameters(id),
    selections: StructureMaterials = {};
  if (["storage-banquette", "shelves", "closet-insert"].includes(id))
    selections.caseworkPanels = {
      materialId: "plytanium-703",
      productRegistryRef: "plytanium-bc-201428",
    };
  if (id === "shelves") parameters.width = 47.75; // Leave a full saw kerf on the 47.938 in sheet.
  if (id === "greenhouse")
    selections.greenhouseGlazing = {
      materialId: "sunlite-8mm",
      productRegistryRef: "sunlite-132506",
    };
  if (id === "closet-insert")
    selections.closetRod = {
      materialId: everbiltClosetRod.materialId,
      productRegistryRef: everbiltClosetRod.productId,
    };
  let input = preserveExisting
    ? projectSchema.parse(
        migrateLegacyProject(
          JSON.parse(
            await readFile(join(destination, `${id}.yardwork.json`), "utf8"),
          ),
        ),
      )
    : createBuildStudy(id, parameters, undefined, selections).project;
  if (!preserveExisting && id === "closet-insert")
    input = addMissingRodSockets(input);
  if (preserveExisting && id === "storage-banquette") {
    input = addPendingStorageHinges(input);
    input.notes = input.notes.replace(
      /^ACCEPTANCE BASELINE STUDY[^\n]*/,
      `ACCEPTANCE BASELINE STUDY — ${getBuildFixture(id).baselineScope}`,
    );
  }
  const project = projectSchema.parse(
    reconcileIdeaBindings(generateBuildGuide(input)),
  );
  if (!guideIsCurrent(project)) throw Error(`${id}: stale guide`);
  const rows = bom(project),
    oversize = rows.flatMap((row) => row.oversizedParts);
  if (oversize.length)
    throw Error(
      `${id}: example has ${oversize.length} oversized parts; revise its explicit dimensions.`,
    );
  if (
    project.inventory.length ||
    project.supplyInventory.length ||
    project.toolSelections.length
  )
    throw Error("Example may not claim observations or reviewed tools.");
  if (!project.ideaBindings.length)
    throw Error(`${id}: example must retain its editable saved design`);
  await artifact(
    `${id}.yardwork.json`,
    JSON.stringify(project, null, 2) + "\n",
  );
  await artifact(
    `${id}.md`,
    guideMarkdown(project) +
      toolGuideMarkdown(project) +
      sheetPlansMarkdown(rows, project),
  );
  await artifact(`${id}.csv`, shoppingCsv(project));
  await artifact(`${id}-shopping.txt`, retailerHandoff(project));
  index.push(
    `- [${project.name}](${id}.yardwork.json) · [guide](${id}.md) · [stock CSV](${id}.csv) · [shopping checklist](${id}-shopping.txt). ${project.pieces.length} editable parts; ${rows.reduce((sum, row) => sum + row.quantity, 0)} stock units in the geometric estimate.`,
  );
  console.log(
    `${id}: ${project.pieces.length} parts, ${rows.length} material rows, no oversized parts, current guide.`,
  );
}
// A targeted author refresh leaves the other portable studies and their index untouched.
if (!only) await artifact("README.md", index.join("\n") + "\n");
if (stale.length) {
  console.error(`Example files need a refresh: ${stale.join(", ")}`);
  process.exitCode = 1;
}
