/** Opt-in software demo only. Synthetic observations are never used in default studies. */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMeasuredHingeExample } from "../src/hingeExample";
import { guideIsCurrent } from "../src/guide";
import { guideMarkdown, shoppingCsv } from "../src/engine";
import { hingeScheduleCsv } from "../src/hingeCsv";
import { retailerHandoff } from "../src/handoff";
import { toolGuideMarkdown } from "../src/toolGuide";
import { lidHingeReviews } from "../src/hinges";
const destination = resolve(process.argv[2] ?? "public/examples/hinges");
const project = createMeasuredHingeExample();
if (
  !project.name.includes("SYNTHETIC") ||
  !guideIsCurrent(project) ||
  lidHingeReviews(project)[0].state !== "geometry-reviewed"
)
  throw Error(
    "The explicitly synthetic measured-hinge software demo is not current.",
  );
await mkdir(destination, { recursive: true });
const base = "synthetic-measured-banquette";
for (const [name, content] of [
  [`${base}.yardwork.json`, JSON.stringify(project, null, 2) + "\n"],
  [`${base}.md`, guideMarkdown(project) + toolGuideMarkdown(project)],
  [`${base}-hinges.csv`, hingeScheduleCsv(project)],
  [`${base}-shopping.csv`, shoppingCsv(project)],
  [`${base}-shopping.txt`, retailerHandoff(project)],
] as const)
  await writeFile(join(destination, name), content);
await writeFile(
  join(destination, "README.md"),
  `# Synthetic measured-hinge software demo\n\n[Importable project](${base}.yardwork.json) · [guide](${base}.md) · [hinge datums and metal cuts](${base}-hinges.csv) · [shopping list](${base}-shopping.txt).\n\nThis optional demo contains invented measurement inputs for testing the software. It is not a manufacturer hole pattern, measurements of purchased hardware, a reviewed installation, a complete banquette, or proof of strength. Only the first of three lids has a selected entered axis; the other lids and the carcass screw plan retain pending decisions. Default projects and build studies do not receive these numbers.\n`,
);
console.log(
  `${project.name}: ${project.pieces.length} actual editable parts; explicitly synthetic datums; current guide.`,
);
