import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema } from "../src/model";
import { connect } from "../src/engine";
import { findRetailerProduct, retailerCatalog } from "../src/retailerCatalog";
import {
  selectedToolsForProject,
  toolGuideMarkdown,
  type ToolProject,
} from "../src/toolGuide";
import { toolChecklist } from "../src/tools";
const now = Date.parse("2026-11-17T12:00:00Z"),
  checkedAt = "2026-11-17T10:00:00Z";
function screws() {
  let p = blank("Seat frame");
  p.pieces = [
    part("A", "stud", [1.5, 36, 3.5], [0, 18, 0], p.steps[0].id, "Frame"),
    part("B", "stud", [1.5, 36, 3.5], [1.5, 18, 0], p.steps[0].id, "Frame"),
  ];
  return connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id);
}

test("real selected registry models support only documented capabilities and retain manufacturer evidence scope", () => {
  const p: ToolProject = screws();
  p.toolSelections = [
    { productId: "dewalt-dwe575sb", checkedAt },
    { productId: "dewalt-dcd771c2", checkedAt },
  ];
  const selected = selectedToolsForProject(p, now);
  assert.equal(selected.selections.length, 2);
  assert.ok(
    selected.selections.every((s) => s.status === "reviewed-capabilities"),
  );
  assert.ok(
    selected.tools.every((t) =>
      t.evidence?.every(
        (e) => e.url.includes("/Instruction_Manual/") && e.reviewedAt,
      ),
    ),
  );
  assert.ok(
    selected.selections.every((s) =>
      s.manualNotes.some((n) => /Type 1/.test(n)),
    ),
  );
  const checklist = toolChecklist(p, selected.tools, now);
  assert.equal(
    checklist.requirements.find((r) => r.capability === "drive-screw")?.status,
    "supported",
  );
  assert.equal(
    checklist.requirements.find((r) => r.capability === "measure")?.status,
    "unknown",
  );
  assert.equal(
    checklist.requirements.find((r) => r.capability === "clamp")?.status,
    "unknown",
  );
});

test("unknown IDs, consumables, candidate tools and future reviews are retained as visible unknown selections", () => {
  const p: ToolProject = screws();
  p.toolSelections = [
    { productId: "unknown-tool", checkedAt },
    { productId: "dewalt-dwe575sb", checkedAt: "2026-11-18T10:00:00Z" },
  ];
  let selected = selectedToolsForProject(p, now);
  assert.equal(selected.selections.length, 2);
  assert.ok(selected.selections.every((s) => s.status === "unknown"));
  assert.ok(selected.warnings.some((w) => w.includes("unknown-tool")));
  assert.ok(selected.warnings.some((w) => /future/.test(w)));
  assert.ok(selected.tools.every((t) => !t.checked));
  const consumable = retailerCatalog.find(
    (product) => product.category !== "tool",
  )!;
  p.toolSelections = [{ productId: consumable.id, checkedAt }];
  const consumableResult = selectedToolsForProject(p, now);
  assert.equal(consumableResult.selections[0].status, "unknown");
  assert.ok(
    consumableResult.warnings.some((warning) =>
      /not registered as a reusable tool/.test(warning),
    ),
  );
  const product = findRetailerProduct("dewalt-dcd771c2")!,
    status = product.status;
  try {
    product.status = "candidate";
    p.toolSelections = [{ productId: product.id, checkedAt }];
    selected = selectedToolsForProject(p, now);
    assert.equal(selected.selections[0].status, "unknown");
    assert.ok(selected.warnings.some((w) => /candidate/.test(w)));
  } finally {
    product.status = status;
  }
});

test("tool review selections and documented statuses survive project JSON serialization", () => {
  const p: ToolProject = screws();
  p.toolSelections = [{ productId: "dewalt-dcd771c2", checkedAt }];
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(
    selectedToolsForProject(restored, now),
    selectedToolsForProject(p, now),
  );
  assert.equal(toolGuideMarkdown(restored, now), toolGuideMarkdown(p, now));
});

test("tool guide exports process reasons, selected identities, references and unresolved status without procurement claims", () => {
  const p: ToolProject = screws();
  p.toolSelections = [
    { productId: "dewalt-dcd771c2", checkedAt },
    { productId: "missing-review", checkedAt },
  ];
  const text = toolGuideMarkdown(p, now);
  assert.match(text, /## Tools and operation review/);
  assert.match(text, /DEWALT DCD771C2 drill\/driver kit/);
  assert.match(text, /Manufacturer instructions: https:\/\/www.dewalt.com/);
  assert.match(text, /Evidence scope: Manufacturer Type 1 manual/);
  assert.match(
    text,
    /Drive the specified screws — REQUIRED — documented capability supported/,
  );
  assert.match(text, /Measure and mark dimensions — REQUIRED — UNKNOWN/);
  assert.match(text, /Install 2 screw item\(s\) at A → B/);
  assert.match(text, /Only where the exact fastener/);
  assert.match(text, /missing-review.*UNKNOWN/);
  assert.match(text, /### Unresolved tool questions/);
  assert.match(text, /do not establish ownership/);
  assert.match(text, /no prices here/);
  assert.ok(!text.includes("safe to build"));
});

test("duplicate selected identities cannot create multiple supported tool records", () => {
  const p: ToolProject = screws();
  p.toolSelections = [
    { productId: "dewalt-dcd771c2", checkedAt },
    { productId: "dewalt-dcd771c2", checkedAt },
  ];
  const selected = selectedToolsForProject(p, now);
  assert.equal(selected.tools.filter((t) => t.checked).length, 1);
  assert.ok(selected.warnings.some((w) => /Duplicate/.test(w)));
});

test("an empty project exports a truthful empty checklist and no assumed selected models", () => {
  const text = toolGuideMarkdown(blank(), now);
  assert.match(text, /No tool models have been reviewed/);
  assert.match(text, /No build operations have been derived/);
});
