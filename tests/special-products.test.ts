import test from "node:test";
import assert from "node:assert/strict";
import { material } from "../src/model";
import {
  catalogSourceSchema,
  checkProductBinding,
  findRetailerProduct,
  retailerProductSchema,
  roleQualificationSchema,
} from "../src/retailerCatalog";

test("role evidence has bounded roles, approved product sources and a reviewed identity", () => {
  const panel = findRetailerProduct("sunlite-132506")!;
  const proof = panel.roleQualifications[0];
  assert.equal(proof.role, "greenhouseGlazing");
  assert.ok(proof.scope.length > 0);
  assert.ok(proof.requirements.length > 0);
  assert.ok(
    proof.sourceRefs.every((url) => panel.sources.some((s) => s.url === url)),
  );
  for (const change of [
    { role: "arbitrary-approved-material" },
    { sourceRefs: [] },
    { sourceRefs: ["https://unreviewed.example/approval"] },
    { requirements: [] },
    { verified: true },
  ])
    assert.equal(
      roleQualificationSchema.safeParse({ ...proof, ...change }).success,
      false,
    );
  assert.equal(
    retailerProductSchema.safeParse({ ...panel, status: "candidate" }).success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...panel,
      roleQualifications: [
        { ...proof, sourceRefs: ["https://www.homedepot.com/p/100375047"] },
      ],
    }).success,
    false,
    "An approved host alone is not reviewed source evidence for this product",
  );
});

test("legacy product records receive empty role evidence and no family by default", () => {
  const source = structuredClone(findRetailerProduct("simpson-sd9112r100")!);
  const { roleQualifications: _proof, ...legacy } = source;
  const { materialFamily: _family, ...legacyProfile } = legacy.profile;
  const parsed = retailerProductSchema.parse({
    ...legacy,
    profile: legacyProfile,
  });
  assert.deepEqual(parsed.roleQualifications, []);
  assert.equal(parsed.profile.materialFamily, null);
  assert.equal(
    retailerProductSchema.safeParse({
      ...parsed,
      verifiedRole: "saunaInterior",
    }).success,
    false,
  );
});

test("SUNLITE retains exact 8 mm stock and a single real retailer offer", () => {
  const panel = findRetailerProduct("sunlite-132506")!;
  assert.equal(panel.manufacturerPartNumber, "132506");
  assert.deepEqual(panel.profile.stockSize, [24, 8 / 25.4, 96]);
  assert.equal(panel.profile.packCount, 1);
  assert.equal(panel.profile.materialFamily, "sunlite-8mm-multiwall");
  assert.deepEqual(
    panel.offers.map((o) => [o.retailer, o.productId]),
    [["home-depot", "202091947"]],
  );
  const matching = {
    ...material("plywood"),
    wood: false,
    size: [24, 8 / 25.4, 96] as [number, number, number],
    stockSize: [24, 8 / 25.4, 96] as [number, number, number],
    packCount: 1,
  };
  assert.equal(checkProductBinding(matching, panel).compatible, true);
  assert.equal(
    checkProductBinding({ ...matching, packCount: 2 }, panel).compatible,
    false,
  );
  assert.equal(
    checkProductBinding(
      { ...matching, size: [24, 0.313, 96], stockSize: [24, 0.313, 96] },
      panel,
    ).compatible,
    false,
  );
  assert.equal(checkProductBinding(material("roof"), panel).compatible, false);
});

test("SUNLITE accessories keep system roles without fabricated placement geometry", () => {
  const expected = [
    ["sunlite-96714", "96714", "202091948", "greenhousePanelConnector", 1],
    ["sunlite-96715", "96715", "202091949", "greenhousePanelEdge", 1],
    ["sunlite-92763", "92763", "205713443", "greenhousePanelSeal", 2],
  ] as const;
  for (const [id, mpn, productId, role, pack] of expected) {
    const accessory = findRetailerProduct(id)!;
    assert.equal(accessory.manufacturerPartNumber, mpn);
    assert.equal(accessory.offers[0].productId, productId);
    assert.equal(accessory.profile.stockSize, null);
    assert.equal(accessory.profile.dimensionMeaning, "unverified");
    assert.equal(accessory.profile.packCount, pack);
    assert.equal(accessory.profile.materialFamily, "sunlite-8mm-multiwall");
    assert.equal(accessory.roleQualifications[0].role, role);
    assert.equal(
      checkProductBinding(material("bracket"), accessory).compatible,
      false,
    );
  }
  const tape = findRetailerProduct("sunlite-92763")!;
  assert.match(
    tape.sources.map((s) => s.note).join(" "),
    /two different rolls/,
  );
  assert.match(
    tape.roleQualifications[0].requirements.join(" "),
    /32 feet of each role/,
  );
});

test("TUFTEX remains a separate candidate system until physical profile and sell unit are verified", () => {
  const corrugated = findRetailerProduct("tuftex-1418a")!;
  const multiwall = findRetailerProduct("sunlite-132506")!;
  assert.equal(corrugated.manufacturerPartNumber, "1418A");
  assert.equal(corrugated.status, "candidate");
  assert.equal(corrugated.profile.stockSize, null);
  assert.equal(corrugated.profile.packCount, null);
  assert.equal(corrugated.profile.materialFamily, "tuftex-polycarb-corrugated");
  assert.notEqual(
    corrugated.profile.materialFamily,
    multiwall.profile.materialFamily,
  );
  assert.deepEqual(corrugated.roleQualifications, []);
  assert.deepEqual(
    corrugated.offers.map((o) => [o.retailer, o.productId]),
    [["lowes", "3043439"]],
  );
  assert.equal(
    checkProductBinding(material("roof"), corrugated).compatible,
    false,
  );
});

test("closet families retain separate rod and socket identities and unresolved support requirements", () => {
  const hdRod = findRetailerProduct("everbilt-eh-wsthdus-319")!;
  const lowesRod = findRetailerProduct("project-source-27773pholg")!;
  assert.notEqual(
    hdRod.profile.materialFamily,
    lowesRod.profile.materialFamily,
  );
  assert.equal(hdRod.profile.packCount, null);
  assert.equal(lowesRod.profile.packCount, 1);
  assert.deepEqual(lowesRod.profile.stockSize, [1.3125, 72, 1.3125]);
  assert.equal(lowesRod.profile.wood, false);
  assert.equal(lowesRod.category, "rod");
  assert.match(
    lowesRod.roleQualifications[0].requirements.join(" "),
    /32 inches/,
  );
  for (const [id, family] of [
    ["everbilt-eh-wsthdus-311v", hdRod.profile.materialFamily],
    ["project-source-23723phslg", lowesRod.profile.materialFamily],
  ]) {
    const socket = findRetailerProduct(id!)!;
    assert.equal(socket.profile.materialFamily, family);
    assert.equal(socket.profile.packCount, 2);
    assert.equal(socket.profile.stockSize, null);
    assert.equal(socket.roleQualifications[0].role, "closetRodSupport");
    assert.match(
      socket.roleQualifications[0].scope,
      /not (a center|an intermediate)/,
    );
    assert.equal(socket.offers.length, 1);
  }
  for (const rod of [hdRod, lowesRod]) {
    assert.equal(rod.offers.length, 1);
    assert.match(rod.sources[0].note, /[Ww]all thickness/);
    assert.match(rod.roleQualifications[0].requirements.join(" "), /capacity/);
  }
});

test("generic cedar candidates do not become sauna-qualified through naming or caller flags", () => {
  for (const id of [
    "cedar-pattern-906909-candidate",
    "reliabilt-cd10608tg-candidate",
  ]) {
    const cedar = findRetailerProduct(id)!;
    assert.equal(cedar.status, "candidate");
    assert.deepEqual(cedar.roleQualifications, []);
    assert.equal(
      checkProductBinding(material("stud"), cedar).compatible,
      false,
    );
    assert.equal(
      retailerProductSchema.safeParse({
        ...cedar,
        roleQualifications: [
          {
            role: "saunaInterior",
            scope: "Caller asserted",
            sourceRefs: [cedar.sources[0].url],
            requirements: ["No source qualification"],
          },
        ],
      }).success,
      false,
    );
  }
});

test("new primary source hosts reject misleading URLs and credential-bearing links", () => {
  const source = findRetailerProduct("sunlite-132506")!.sources[0];
  for (const url of [
    "https://www.palram.com/us/product/sunlite/",
    "https://tuftex-ondura.com/wp-content/uploads/2024/04/product-handbook-tuftex-polycarb_0.pdf",
  ])
    assert.equal(
      catalogSourceSchema.safeParse({ ...source, url }).success,
      true,
    );
  for (const url of [
    "https://www.palram.com.evil.example/approval",
    "https://token@www.palram.com/us/product/sunlite/",
    "http://tuftex-ondura.com/spec",
  ])
    assert.equal(
      catalogSourceSchema.safeParse({ ...source, url }).success,
      false,
    );
});
