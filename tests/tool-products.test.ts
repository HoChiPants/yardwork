import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, part, projectSchema } from "../src/model";
import { bom, connect } from "../src/engine";
import {
  checkProductBinding,
  findRetailerProduct,
  retailerProductSchema,
  referenceOffersForProduct,
} from "../src/retailerCatalog";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";
const now = Date.parse("2026-11-17T12:00:00Z"),
  checkedAt = "2026-11-17T10:00:00Z";
const expected = [
  ["dewalt-dwht38125s", "DWHT38125S", "measure"],
  ["swanson-s0101", "S0101", "square"],
  ["swanson-s0101-c", "S0101-C", "square"],
  ["bessey-gscc2-524", "GSCC2.524", "clamp"],
  ["estwing-e3-16s", "E3-16S", "drive-nail"],
  ["3m-90565-4dc-ps", "90565-4DC-PS", "ppe-hearing"],
] as const;
function frame() {
  const p = blank("Tool evidence review");
  p.pieces = [
    part("A", "stud", [1.5, 36, 3.5], [0, 18, 0], p.steps[0].id, "Frame"),
    part("B", "stud", [1.5, 36, 3.5], [1.5, 18, 0], p.steps[0].id, "Frame"),
  ];
  return connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    2,
    3,
    "nail",
  );
}
test("six new exact tool references retain narrow evidence and unknown body geometry", () => {
  for (const [id, mpn, capability] of expected) {
    const product = findRetailerProduct(id)!;
    assert.ok(product, id);
    assert.equal(product.manufacturerPartNumber, mpn);
    assert.equal(product.category, "tool");
    assert.equal(product.status, "reviewed-specs");
    assert.equal(product.profile.stockSize, null);
    assert.equal(product.profile.packCount, 1);
    assert.deepEqual(product.capabilities, [capability]);
    assert.ok(product.toolCapabilityEvidence.length > 0);
    assert.ok(
      product.toolCapabilityEvidence.every(
        (e) =>
          e.capabilities.every((cap) => cap === capability) &&
          e.sourceRefs.every((url) =>
            product.sources.some((s) => s.url === url),
          ) &&
          e.scope &&
          e.requirements.length,
      ),
    );
    assert.equal(
      checkProductBinding(material("stud"), product).compatible,
      false,
    );
    assert.equal("price" in product, false);
    assert.equal("available" in product, false);
  }
});
test("square packages stay separate and retired marketplace tape is not a buying reference", () => {
  const square = findRetailerProduct("swanson-s0101")!,
    clip = findRetailerProduct("swanson-s0101-c")!,
    tape = findRetailerProduct("dewalt-dwht38125s")!;
  assert.deepEqual(
    referenceOffersForProduct(square).map((o) => o.productId),
    ["3048693"],
  );
  assert.deepEqual(
    referenceOffersForProduct(clip).map((o) => o.productId),
    ["312986101"],
  );
  assert.deepEqual(
    referenceOffersForProduct(tape).map((o) => o.productId),
    ["317266301"],
  );
  const retired = tape.offers.find((o) => o.retailer === "lowes")!;
  assert.equal(retired.listingStatus, "marketplace-retired");
  assert.equal(retired.seller, "Hearthshire");
  assert.equal(retired.productId, "5019101837");
});
test("tool schema rejects unscoped, unrelated and non-tool evidence without granting trusted caller flags", () => {
  const tool = findRetailerProduct("estwing-e3-16s")!,
    evidence = tool.toolCapabilityEvidence[0];
  for (const changed of [
    { ...evidence, sourceRefs: ["not a URL"] },
    { ...evidence, sourceRefs: ["https://www.estwing.com/unreviewed-page"] },
    { ...evidence, capabilities: ["wood-rip"] },
    { ...evidence, scope: "" },
    { ...evidence, requirements: [] },
    { ...evidence, verified: true },
  ])
    assert.equal(
      retailerProductSchema.safeParse({
        ...tool,
        toolCapabilityEvidence: [changed],
      }).success,
      false,
    );
  assert.equal(
    retailerProductSchema.safeParse({ ...tool, status: "candidate" }).success,
    false,
  );
  const lumber = findRetailerProduct("hd-common-pine-1x4x96-301993221")!;
  assert.equal(
    retailerProductSchema.safeParse({
      ...lumber,
      toolCapabilityEvidence: [evidence],
    }).success,
    false,
  );
  const legacy = structuredClone(lumber) as Record<string, unknown>;
  delete legacy.toolCapabilityEvidence;
  assert.deepEqual(
    retailerProductSchema.parse(legacy).toolCapabilityEvidence,
    [],
  );
});
test("hand tool reviews support only their documented functions and survive JSON reopening", () => {
  const p = frame();
  p.toolSelections = expected.map(([productId]) => ({ productId, checkedAt }));
  const before = bom(p);
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(p))),
    selected = selectedToolsForProject(restored, now),
    checklist = toolChecklist(restored, selected.tools, now);
  assert.ok(
    selected.selections.every((s) => s.status === "reviewed-capabilities"),
  );
  for (const cap of ["measure", "square", "clamp", "drive-nail", "ppe-hearing"])
    assert.equal(
      checklist.requirements.find((r) => r.capability === cap)?.status,
      "supported",
      cap,
    );
  for (const row of checklist.requirements.filter((r) =>
    [
      "wood-crosscut",
      "wood-rip",
      "profile-cut",
      "ppe-eye",
      "ppe-dust",
      "connector-install",
    ].includes(r.capability),
  ))
    assert.equal(row.status, "unknown", row.capability);
  assert.deepEqual(bom(restored), before);
  const guide = toolGuideMarkdown(restored, now);
  assert.match(guide, /Manufacturer product specification/);
  assert.match(guide, /common nails/i);
  assert.match(guide, /fit/i);
  assert.ok(!guide.includes("safe to build"));
});
test("flat capabilities and URL-shaped manuals alone cannot create documented support", () => {
  const product = findRetailerProduct("dewalt-dwe575sb")!,
    original = structuredClone(product),
    p = frame();
  p.toolSelections = [{ productId: product.id, checkedAt }];
  try {
    product.toolCapabilityEvidence = [];
    let result = selectedToolsForProject(p, now);
    assert.equal(result.selections[0].status, "unknown");
    assert.ok(result.warnings.some((w) => /evidence/i.test(w)));
    Object.assign(product, structuredClone(original));
    product.capabilities.push("drive-nail");
    result = selectedToolsForProject(p, now);
    assert.ok(!result.tools[0].capabilities.includes("drive-nail"));
    assert.ok(
      result.tools[0].evidence?.every(
        (e) => !e.capabilities.includes("drive-nail"),
      ),
    );
  } finally {
    Object.assign(product, original);
  }
});

test("project-authored capability claims never override the reviewed registry", () => {
  const p = frame();
  const raw = JSON.parse(JSON.stringify(p));
  raw.toolSelections = [
    {
      productId: "not-in-registry",
      checkedAt,
      verified: true,
      capabilities: ["measure", "wood-rip"],
      toolCapabilityEvidence: [{ verified: true }],
    },
  ];
  const restored = projectSchema.parse(raw),
    result = selectedToolsForProject(restored, now);
  assert.equal(result.selections[0].status, "unknown");
  assert.deepEqual(result.tools[0].capabilities, []);
  assert.deepEqual(restored.toolSelections, [
    { productId: "not-in-registry", checkedAt },
  ]);
});
test("future product/source dates remain unknown and source scope never expands capabilities", () => {
  const product = findRetailerProduct("estwing-e3-16s")!,
    original = structuredClone(product),
    p = frame();
  p.toolSelections = [{ productId: product.id, checkedAt }];
  try {
    product.verifiedAt = "2026-11-18T00:00:00Z";
    assert.equal(
      selectedToolsForProject(p, now).selections[0].status,
      "unknown",
    );
    Object.assign(product, structuredClone(original));
    for (const source of product.sources)
      source.verifiedAt = "2026-11-18T00:00:00Z";
    assert.equal(
      selectedToolsForProject(p, now).selections[0].status,
      "unknown",
    );
  } finally {
    Object.assign(product, original);
  }
});
