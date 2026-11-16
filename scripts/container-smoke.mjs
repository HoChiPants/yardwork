import assert from "node:assert/strict";
const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4173";
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${base}/api/health`);
    if (r.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(ready, "Container becomes healthy");
const id = "0a981c25-cd29-46ae-927c-930a42a09397";
if (process.argv[2] === "save") {
  const project = {
    schemaVersion: 1,
    id,
    name: "Container persistence check",
    kind: "custom",
    zip: "84121",
    store: "",
    updatedAt: new Date().toISOString(),
    pieces: [],
    steps: [
      {
        id: "1570ee7e-581a-4413-9935-53f83ec87378",
        title: "First step",
        notes: "Smoke test",
        complete: false,
      },
    ],
    joints: [],
    inventory: [],
    planLines: [],
    notes: "",
    history: [],
  };
  const response = await fetch(`${base}/api/projects/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, baseRevision: 0 }),
  });
  assert.equal(response.status, 200, await response.text());
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Yardwork/);
  console.log("Container serves the production app and saves project data.");
} else {
  const response = await fetch(`${base}/api/projects/${id}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.project.name, "Container persistence check");
  assert.equal(data.revision, 1);
  console.log("Saved project persisted across container restart.");
}
