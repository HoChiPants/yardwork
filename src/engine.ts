import {
  catalog,
  format,
  inventorySchema,
  material,
  part,
  uid,
  wallParts,
  type Inventory,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { packRectangles, type StockPlan } from "./packing";
export const KERF = 0.125;
export { rotate } from "./spatial";
import { rotate } from "./spatial";
export function bounds(p: Piece) {
  const points: V3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        points.push(
          rotate(
            [(p.size[0] * x) / 2, (p.size[1] * y) / 2, (p.size[2] * z) / 2],
            p.rotation,
          ),
        );
  return {
    min: p.position.map(
      (v, i) => v + Math.min(...points.map((q) => q[i])),
    ) as V3,
    max: p.position.map(
      (v, i) => v + Math.max(...points.map((q) => q[i])),
    ) as V3,
  };
}
export function distance(a: Piece, b: Piece) {
  const aa = bounds(a),
    bb = bounds(b);
  return Math.hypot(
    ...[0, 1, 2].map((i) =>
      Math.max(0, aa.min[i] - bb.max[i], bb.min[i] - aa.max[i]),
    ),
  );
}
export function cutPiece(p: Project, id: string, length: number): Project {
  const source = p.pieces.find((x) => x.id === id);
  if (!source) throw Error("Choose a part to cut.");
  if (!["stud", "treated", "post", "plywood"].includes(source.material))
    throw Error("Cuts currently support lumber and plywood.");
  const axis = source.size.indexOf(Math.max(...source.size)),
    original = source.size[axis];
  if (!Number.isFinite(length) || length <= 0 || length + KERF >= original)
    throw Error(
      `Cut must be greater than zero and below ${format(original - KERF)} to leave an offcut.`,
    );
  const next = structuredClone(p),
    a = next.pieces.find((x) => x.id === id)!;
  a.size[axis] = length;
  const direction = [0, 0, 0] as V3;
  direction[axis] = 1;
  const world = rotate(direction, a.rotation);
  a.position = a.position.map(
    (v, i) => v + (world[i] * (length - original)) / 2,
  ) as V3;
  const spare = structuredClone(source);
  spare.id = uid();
  spare.name = `Offcut · ${source.name}`;
  spare.offcut = true;
  spare.size[axis] = original - length - KERF;
  spare.position = spare.position.map(
    (v, i) => v + (world[i] * (length + KERF)) / 2,
  ) as V3;
  next.pieces.push(spare);
  return next;
}
export function addMaterial(
  p: Project,
  id: MaterialId,
  position: V3,
  stepId: string,
): Project {
  const m = material(id);
  return {
    ...p,
    pieces: [
      ...p.pieces,
      part(
        m.name,
        id,
        [...m.size],
        [position[0], position[1] + m.size[1] / 2, position[2]],
        stepId,
        "Loose parts",
      ),
    ],
  };
}
export type CutBin = {
  remaining: number;
  cuts: { name: string; length: number; id: string }[];
};
export type BomRow = {
  id: MaterialId;
  quantity: number;
  pieces: number;
  price: number;
  total: number;
  bins: CutBin[];
  oversize: number;
  oversizedParts: Piece[];
  rolls: StockPlan[];
  inventory?: Inventory;
  verified: boolean;
};
export function usableInventory(p: Project, id: MaterialId, now = Date.now()) {
  return p.inventory
    .filter(
      (i) =>
        i.material === id &&
        i.zip === p.zip &&
        !!p.store &&
        i.store === p.store &&
        Date.parse(i.checkedAt) <= now &&
        now - Date.parse(i.checkedAt) < 86400000,
    )
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
}
export function bom(p: Project): BomRow[] {
  return catalog
    .map((m) => {
      const parts = p.pieces.filter((x) => x.material === m.id),
        bins: CutBin[] = [],
        oversizedParts: Piece[] = [];
      let rolls: StockPlan[] = [];
      let quantity = 0,
        oversize = 0;
      if (["stud", "treated", "post"].includes(m.id)) {
        const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b),
          length = stock[2];
        for (const piece of [...parts].sort(
          (a, b) => Math.max(...b.size) - Math.max(...a.size),
        )) {
          const s = [...piece.size].sort((a, b) => a - b);
          if (
            s[0] > stock[0] + 0.001 ||
            s[1] > stock[1] + 0.001 ||
            s[2] > length + 0.001
          ) {
            oversize++;
            oversizedParts.push(piece);
            continue;
          }
          let bin = bins.find((b) => b.remaining >= s[2] - 0.001);
          if (!bin) {
            bin = { remaining: length, cuts: [] };
            bins.push(bin);
          }
          bin.cuts.push({ id: piece.id, name: piece.name, length: s[2] });
          bin.remaining = Math.max(0, bin.remaining - s[2] - KERF);
        }
        quantity = bins.length;
      } else if (m.id === "screw")
        quantity = Math.ceil(
          (parts.length + p.joints.reduce((sum, j) => sum + j.quantity, 0)) /
            100,
        );
      else if (m.id === "mesh") {
        const [thickness, width, length] = [...(m.stockSize ?? m.size)].sort(
          (a, b) => a - b,
        );
        const rectangles = [];
        for (const piece of parts) {
          const sizes = [...piece.size].sort((a, b) => a - b);
          if (sizes[0] > thickness + 1e-8) oversizedParts.push(piece);
          else
            rectangles.push({
              id: piece.id,
              name: piece.name,
              width: sizes[1],
              length: sizes[2],
            });
        }
        const packed = packRectangles(rectangles, width, length);
        rolls = packed.plans;
        const rejected = new Set(packed.rejected.map((p) => p.id));
        oversizedParts.push(...parts.filter((p) => rejected.has(p.id)));
        oversize = oversizedParts.length;
        quantity = rolls.length;
      } else {
        const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b);
        for (const x of parts) {
          const s = [...x.size].sort((a, b) => a - b);
          if (s.some((v, i) => v > stock[i] + 0.001)) {
            oversize++;
            oversizedParts.push(x);
          } else quantity++;
        }
      }
      const inventory = usableInventory(p, m.id),
        price = inventory?.price ?? m.price;
      return {
        id: m.id,
        quantity,
        pieces: parts.length,
        price,
        total: price * quantity,
        bins,
        oversize,
        oversizedParts,
        rolls,
        inventory,
        verified: !!inventory,
      };
    })
    .filter((r) => r.pieces > 0 || r.quantity > 0);
}
export type Finding = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  pieceId?: string;
};
export function validate(p: Project): Finding[] {
  const findings: Finding[] = [];
  const active = p.pieces.filter((x) => !x.offcut);
  const rows = bom(p);
  if (!p.pieces.length)
    findings.push({
      id: "empty",
      severity: "info",
      title: "Your blank canvas is ready",
      detail:
        "Add a part or generate a framed wall to start checking the design.",
    });
  for (const row of rows) {
    if (row.oversize)
      findings.push({
        id: `stock-${row.id}`,
        severity: "error",
        title: `${row.oversize} ${material(row.id).name} part(s) exceed stock`,
        detail:
          "Resize these parts or specify a larger stock product. They are excluded from the cost estimate.",
      });
    if (!row.verified)
      findings.push({
        id: `inventory-${row.id}`,
        severity: "info",
        title: `Availability unverified · ${material(row.id).name}`,
        detail:
          "Choose an exact store and import a snapshot checked in the last 24 hours. Example prices are estimates.",
      });
    else if (row.inventory!.available < row.quantity)
      findings.push({
        id: `short-${row.id}`,
        severity: "warning",
        title: `Store stock is short by ${row.quantity - row.inventory!.available}`,
        detail: `${material(row.id).name}: ${row.quantity} needed, ${row.inventory!.available} reported.`,
      });
  }
  // Cache geometry once and traverse the support graph. This stays quadratic in part count.
  const boxes = new Map(active.map((a) => [a.id, bounds(a)]));
  const grounded = new Set(
    active.filter((a) => boxes.get(a.id)!.min[1] <= 0.25).map((a) => a.id),
  );
  const supports = new Map<string, string[]>();
  for (const base of active) {
    const b = boxes.get(base.id)!;
    const children: string[] = [];
    for (const top of active) {
      if (base.id === top.id) continue;
      const a = boxes.get(top.id)!;
      if (
        Math.abs(a.min[1] - b.max[1]) <= 0.3 &&
        [0, 2].every(
          (i) =>
            Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > 0,
        )
      )
        children.push(top.id);
    }
    supports.set(base.id, children);
  }
  const queue = [...grounded];
  for (let i = 0; i < queue.length; i++)
    for (const child of supports.get(queue[i]) ?? [])
      if (!grounded.has(child)) {
        grounded.add(child);
        queue.push(child);
      }
  const floating = active.filter((a) => !grounded.has(a.id));
  if (floating.length)
    findings.push({
      id: "floating",
      severity: "warning",
      title: `${floating.length} part(s) need support review`,
      detail:
        "No vertical contact path to the ground was found. This is a bounding-box check; angled members and cantilevers need manual review.",
      pieceId: floating[0].id,
    });
  const buried = active.find((a) => boxes.get(a.id)!.min[1] < -0.25);
  if (buried)
    findings.push({
      id: "buried",
      severity: "warning",
      title: "A part extends below the ground plane",
      detail:
        "Confirm whether this is intentional embedment. Footing depth and soil conditions are not validated.",
      pieceId: buried.id,
    });
  let collisions = 0,
    firstCollision = "";
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i],
        b = active[j];
      if (a.rotation.some((v) => v !== 0) || b.rotation.some((v) => v !== 0))
        continue;
      const aa = boxes.get(a.id)!,
        bb = boxes.get(b.id)!,
        over = [0, 1, 2].map(
          (k) =>
            Math.min(aa.max[k], bb.max[k]) - Math.max(aa.min[k], bb.min[k]),
        );
      if (over.every((v) => v > 0.2)) {
        collisions++;
        firstCollision ||= a.id;
      }
    }
  if (collisions)
    findings.push({
      id: "collision",
      severity: "warning",
      title: `${collisions} overlapping part pair(s)`,
      detail:
        "Axis-aligned solid parts occupy the same space. Check placement or detail the intended joinery.",
      pieceId: firstCollision,
    });
  if (active.length > 1 && !p.joints.length)
    findings.push({
      id: "connections",
      severity: "warning",
      title: "Connections have not been specified",
      detail:
        "Use the screw tool to connect touching parts. Quantities are a planning record, not a fastener schedule approved for loads.",
    });
  for (const j of p.joints) {
    const a = p.pieces.find((x) => x.id === j.a)!,
      b = p.pieces.find((x) => x.id === j.b)!;
    if (distance(a, b) > 0.5)
      findings.push({
        id: j.id,
        severity: "error",
        title: "A connection no longer touches both parts",
        detail: `${a.name} → ${b.name}. Move the parts together or remove this connection.`,
        pieceId: a.id,
      });
    if (j.length <= Math.min(...a.size))
      findings.push({
        id: `grip-${j.id}`,
        severity: "warning",
        title: "Check screw penetration",
        detail: `The ${j.length} in screw may not pass through ${a.name}. Direction, edge distances, shear, and pullout are not modeled.`,
        pieceId: a.id,
      });
  }
  for (const section of p.sections) {
    const command = section.generator;
    if (command?.type !== "wall") continue;
    const count = section.pieceIds.filter((id) =>
      active.some((p) => p.id === id && p.material === "stud"),
    ).length;
    const expected = wallParts(
      command.width,
      command.height,
      command.spacing,
      p.steps[0].id,
    ).length;
    if (count > expected)
      findings.push({
        id: `extra-frame-${section.id}`,
        severity: "info",
        title: `${section.name} has ${count - expected} extra framing part(s)`,
        detail: `Its saved ${command.spacing} in layout uses ${expected} framing parts; this section contains ${count}. Review manually added or duplicated boards before purchasing.`,
        pieceId: section.pieceIds[0],
      });
    if (command.spacing === 12) {
      const alternate = wallParts(
        command.width,
        command.height,
        16,
        p.steps[0].id,
      ).length;
      const extra = expected - alternate;
      if (extra > 0)
        findings.push({
          id: `spacing-quantity-${section.id}`,
          severity: "info",
          title: `${section.name}: closer spacing uses ${extra} extra stud(s)`,
          detail: `A 12 in layout uses ${expected - 2} studs; a 16 in layout of the same width uses ${alternate - 2}. This compares quantities only. Loads, sheathing, and the design specification determine appropriate spacing.`,
        });
    }
  }
  const dense = p.pieces.filter(
    (x) => x.assembly.includes("Wall") && x.name.includes("stud"),
  ).length;
  if (dense > 80)
    findings.push({
      id: "dense",
      severity: "info",
      title: "Review the framing quantity",
      detail:
        "This plan has more than 80 generated wall studs. Check for duplicate assemblies before buying materials.",
    });
  if (p.kind === "coop")
    findings.push({
      id: "coop-review",
      severity: "warning",
      title: "Coop concept needs enclosure detailing",
      detail:
        "Add roof framing, gable closures, ventilation, a secure door, predator protection, and anchors. This template is not ready to build.",
    });
  findings.push({
    id: "engineering",
    severity: "info",
    title: "Geometric checks, not structural approval",
    detail:
      "Loads, spans, soil, wind/snow, local code, fastener capacity, and animal welfare are not certified. No “safe to build” score is issued.",
  });
  const priority = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => priority[a.severity] - priority[b.severity]);
}
export function connect(
  p: Project,
  a: string,
  b: string,
  stepId: string,
  quantity = 2,
  length = 3,
): Project {
  const aa = p.pieces.find((x) => x.id === a),
    bb = p.pieces.find((x) => x.id === b);
  if (!aa || !bb || a === b) throw Error("Choose two different parts.");
  if (aa.offcut || bb.offcut)
    throw Error("Place the offcut back into the build before connecting it.");
  if (distance(aa, bb) > 0.5)
    throw Error("Move the parts within ½ inch before recording a connection.");
  return {
    ...p,
    joints: [
      ...p.joints,
      { id: uid(), a, b, stepId, quantity, length, kind: "screw" },
    ],
  };
}
const csvCell = (v: unknown) => {
  const text = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
};
export function shoppingCsv(p: Project) {
  const rows = [
    [
      "Material",
      "Internet number",
      "Stock units to buy",
      "Unit",
      "Unit price USD",
      "Estimated total USD",
      "ZIP",
      "Store",
      "Availability",
      "Checked at",
      "Product/search URL",
      "Oversize parts excluded",
    ],
  ];
  for (const r of bom(p)) {
    const m = material(r.id);
    rows.push([
      m.name,
      r.inventory?.internetNumber ?? "",
      String(r.quantity),
      m.unit,
      r.price.toFixed(2),
      r.total.toFixed(2),
      p.zip,
      p.store,
      r.inventory ? String(r.inventory.available) : "UNVERIFIED",
      r.inventory?.checkedAt ?? "",
      r.inventory?.url ??
        `https://www.homedepot.com/s/${encodeURIComponent(m.search)}`,
      String(r.oversize),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function guideMarkdown(p: Project) {
  return (
    `# ${p.name}\n\nConcept plan · ${p.zip}${p.store ? ` · Store ${p.store}` : ""}\n\n${p.notes}\n\nGeometric planning only. Verify engineering, code, connections, and site conditions before construction.\n\n` +
    p.steps
      .map(
        (s, i) =>
          `## ${i + 1}. ${s.title}${s.complete ? " [complete]" : ""}\n\n${s.notes}\n\n` +
          p.pieces
            .filter((x) => x.stepId === s.id && !x.offcut)
            .map(
              (x) =>
                `- ${x.name}: ${x.size.map(format).join(" × ")} (${material(x.material).name})`,
            )
            .join("\n") +
          `\n\n${p.joints.filter((j) => j.stepId === s.id).reduce((n, j) => n + j.quantity, 0)} screws specified.\n` +
          p.history
            .filter((h) => h.stepId === s.id)
            .map((h) => `- Operation: ${h.message}`)
            .join("\n"),
      )
      .join("\n") +
    rollGuideMarkdown(p)
  );
}
export function rollGuideMarkdown(project: Project) {
  const rolls = bom(project).flatMap((row) =>
    row.rolls.map((roll, i) => ({
      material: material(row.id).name,
      roll,
      number: i + 1,
    })),
  );
  if (!rolls.length) return "";
  return (
    "\n\n## Roll cutting layouts\n\nDimensions are inches. X is across the roll width; Y is along its length from the starting edge. Snip cuts use zero kerf. This is a feasible layout, not a guarantee of minimum waste.\n\n" +
    rolls
      .map(
        ({ material, roll, number }) =>
          `### ${material} — roll ${number} (${roll.width} × ${roll.length} in)\n` +
          roll.placements
            .map(
              (c) =>
                `- ${c.name}: ${c.width} × ${c.length} in; start X ${c.x} in, Y ${c.y} in.`,
            )
            .join("\n"),
      )
      .join("\n\n")
  );
}
export function parseInventory(text: string): Inventory[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(
      "Inventory must be a JSON array; download the example for the expected format.",
    );
  }
  return inventorySchema.array().max(100).parse(data);
}
export function parseDxf(
  text: string,
  inchesPerUnit: number,
): Project["planLines"] {
  if (
    !Number.isFinite(inchesPerUnit) ||
    inchesPerUnit <= 0 ||
    inchesPerUnit > 100
  )
    throw Error("Choose a valid DXF scale.");
  const lines = text.replaceAll("\r", "").split("\n");
  const pairs: { code: number; value: string }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2)
    pairs.push({ code: Number(lines[i].trim()), value: lines[i + 1].trim() });
  const result: Project["planLines"] = [];
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code !== 0 || pairs[i].value !== "LINE") continue;
    const values = new Map<number, string>();
    for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j++)
      values.set(pairs[j].code, pairs[j].value);
    const vals = [10, 20, 11, 21].map((k) => Number(values.get(k)));
    if (vals.some((v) => !Number.isFinite(v)))
      throw Error("A DXF LINE has missing or invalid coordinates.");
    const [x, z, xx, zz] = vals.map((v) => v * inchesPerUnit);
    if ([x, z, xx, zz].some((v) => Math.abs(v) > 12000))
      throw Error(
        "DXF coordinates exceed the workspace. Check scale or move the drawing near its origin.",
      );
    result.push({ a: [x, 0.1, z], b: [xx, 0.1, zz] });
    if (result.length > 3000)
      throw Error("Limit drawings to 3,000 LINE entities.");
  }
  if (!result.length)
    throw Error(
      "No supported LINE entities found. Export an ASCII DXF using exploded LINE segments.",
    );
  return result;
}

/** Record edits as human-readable operations for the guide, independently of undo state. */
export function recordChanges(before: Project, after: Project): Project {
  const messages: { stepId: string; message: string }[] = [];
  const oldPieces = new Map(before.pieces.map((p) => [p.id, p]));
  const added = after.pieces.filter((p) => !oldPieces.has(p.id));
  const offcuts = added.filter((p) => p.offcut);
  const addedByStep = new Map<string, number>();
  for (const p of added.filter((p) => !p.offcut))
    addedByStep.set(p.stepId, (addedByStep.get(p.stepId) ?? 0) + 1);
  for (const [stepId, count] of addedByStep)
    messages.push({
      stepId,
      message: `Added ${count} part${count === 1 ? "" : "s"} to the layout.`,
    });
  for (const p of after.pieces) {
    const old = oldPieces.get(p.id);
    if (!old) continue;
    if (p.size.some((v, i) => v !== old.size[i]))
      messages.push({
        stepId: p.stepId,
        message: `${offcuts.length ? "Cut" : "Resized"} ${p.name} to ${p.size.map(format).join(" × ")}.${offcuts.length ? " Kept the offcut; ⅛ in saw kerf removed." : ""}`,
      });
    if (p.position.some((v, i) => v !== old.position[i]) && !offcuts.length)
      messages.push({
        stepId: p.stepId,
        message: `Positioned ${p.name} at ${p.position.map((v) => `${Math.round(v * 100) / 100} in`).join(", ")} (X, Y, Z).`,
      });
    if (p.rotation.some((v, i) => v !== old.rotation[i]))
      messages.push({
        stepId: p.stepId,
        message: `Rotated ${p.name} to ${p.rotation.map((v) => `${Math.round((v * 180) / Math.PI)}°`).join(", ")} (pitch, yaw, roll).`,
      });
  }
  const ids = new Set(after.pieces.map((p) => p.id));
  for (const p of before.pieces)
    if (!ids.has(p.id))
      messages.push({
        stepId: p.stepId,
        message: `Removed ${p.name} from the layout.`,
      });
  const oldJoints = new Set(before.joints.map((j) => j.id));
  for (const j of after.joints)
    if (!oldJoints.has(j.id)) {
      const a = after.pieces.find((p) => p.id === j.a),
        b = after.pieces.find((p) => p.id === j.b);
      messages.push({
        stepId: j.stepId,
        message: `Specified ${j.quantity} × ${j.length} in screws: ${a?.name} → ${b?.name}. Verify fastener schedule before construction.`,
      });
    }
  const afterJoints = new Set(after.joints.map((j) => j.id));
  for (const j of before.joints)
    if (!afterJoints.has(j.id))
      messages.push({
        stepId: j.stepId,
        message: "Removed a screw connection from the plan.",
      });
  return {
    ...after,
    history: [
      ...after.history,
      ...messages
        .slice(0, 100)
        .map((m) => ({ ...m, id: uid(), at: new Date().toISOString() })),
    ].slice(-5000),
  };
}
