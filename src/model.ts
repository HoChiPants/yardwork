import { z } from "zod";
import { composeRotation, rotate } from "./spatial";
export const vec = z.tuple([
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
]);
const id = z.string().uuid();
export const materialIds = [
  "stud",
  "treated",
  "post",
  "plywood",
  "siding",
  "roof",
  "mesh",
  "screw",
] as const;
export const pieceSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  material: z.enum(materialIds),
  size: z.tuple([
    z.number().positive().max(240),
    z.number().positive().max(240),
    z.number().positive().max(240),
  ]),
  position: vec,
  rotation: vec,
  stepId: id,
  assembly: z.string().max(80),
  offcut: z.boolean().default(false),
});
export const stepSchema = z.object({
  id,
  title: z.string().min(1).max(120),
  notes: z.string().max(5000),
  complete: z.boolean(),
});
export const jointSchema = z.object({
  id,
  a: id,
  b: id,
  kind: z.literal("screw"),
  quantity: z.number().int().min(1).max(100),
  length: z.number().positive().max(12),
  stepId: id,
});
export const planLineSchema = z.object({ a: vec, b: vec });
export const inventorySchema = z.object({
  material: z.enum(materialIds),
  internetNumber: z.string().regex(/^\d{6,12}$/),
  name: z.string().min(1).max(240),
  price: z.number().nonnegative().max(100000),
  available: z.number().int().nonnegative(),
  store: z.string().min(1).max(80),
  zip: z.string().regex(/^\d{5}$/),
  checkedAt: z.iso.datetime(),
  url: z.url().refine((s) => {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      (u.hostname === "www.homedepot.com" || u.hostname === "homedepot.com")
    );
  }, "Use a Home Depot HTTPS URL"),
});
export const commandSchema = z.object({
  type: z.enum(["wall", "coop", "foundation"]),
  width: z.number().min(24).max(192),
  height: z.number().min(12).max(120),
  depth: z.number().min(24).max(192),
  spacing: z.union([z.literal(12), z.literal(16), z.literal(24)]),
});
export type Command = z.infer<typeof commandSchema>;
export const sectionSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  pieceIds: z.array(id).min(1).max(2000),
  origin: vec,
  rotation: vec,
  generator: commandSchema.nullable(),
});
export type Section = z.infer<typeof sectionSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    name: z.string().min(1).max(120),
    kind: z.enum(["coop", "wall", "custom", "bathroom", "pool"]),
    zip: z.string().regex(/^\d{5}$/),
    store: z.string().max(80),
    updatedAt: z.iso.datetime(),
    pieces: z.array(pieceSchema).max(2000),
    steps: z.array(stepSchema).min(1).max(500),
    joints: z.array(jointSchema).max(5000),
    inventory: z.array(inventorySchema).max(100),
    planLines: z.array(planLineSchema).max(3000),
    notes: z.string().max(10000),
    sections: z.array(sectionSchema).max(300).default([]),
    history: z
      .array(
        z.object({
          id,
          at: z.iso.datetime(),
          stepId: id,
          message: z.string().max(500),
        }),
      )
      .max(5000)
      .default([]),
  })
  .superRefine((p, ctx) => {
    const pieceIds = new Set(p.pieces.map((x) => x.id)),
      stepIds = new Set(p.steps.map((x) => x.id));
    if (
      pieceIds.size !== p.pieces.length ||
      stepIds.size !== p.steps.length ||
      new Set(p.joints.map((j) => j.id)).size !== p.joints.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate identifiers" });
    const buildPieceIds = new Set(
      p.pieces.filter((p) => !p.offcut).map((p) => p.id),
    );
    const members = new Set<string>(),
      sectionIds = new Set<string>();
    for (const section of p.sections) {
      if (sectionIds.has(section.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate section identifier",
        });
      sectionIds.add(section.id);
      for (const pieceId of section.pieceIds) {
        if (!buildPieceIds.has(pieceId) || members.has(pieceId))
          ctx.addIssue({
            code: "custom",
            message:
              "Section membership must reference existing build parts once",
          });
        members.add(pieceId);
      }
      if (section.generator?.type === "coop")
        ctx.addIssue({
          code: "custom",
          message: "Coop generation cannot replace an individual section",
        });
    }
    for (const x of p.pieces)
      if (!stepIds.has(x.stepId))
        ctx.addIssue({
          code: "custom",
          message: "A piece references a missing step",
        });
    for (const j of p.joints)
      if (
        !pieceIds.has(j.a) ||
        !pieceIds.has(j.b) ||
        j.a === j.b ||
        !stepIds.has(j.stepId)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "A connection references missing or identical parts or a missing step",
        });
  });
export type V3 = z.infer<typeof vec>;
export type Piece = z.infer<typeof pieceSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
export type MaterialId = (typeof materialIds)[number];
export type Material = {
  id: MaterialId;
  name: string;
  subtitle: string;
  category: string;
  size: V3;
  color: string;
  price: number;
  unit: string;
  search: string;
};
export const catalog: Material[] = [
  {
    id: "stud",
    name: "2 × 4 framing lumber",
    subtitle: "1½ × 3½ in actual · 8 ft",
    category: "Lumber",
    size: [1.5, 96, 3.5],
    color: "#c69967",
    price: 4.25,
    unit: "board",
    search: "2x4x8 framing lumber",
  },
  {
    id: "treated",
    name: "Ground-contact 2 × 6",
    subtitle: "1½ × 5½ in actual · 8 ft",
    category: "Lumber",
    size: [1.5, 5.5, 96],
    color: "#89916b",
    price: 9.85,
    unit: "board",
    search: "2x6x8 ground contact pressure treated lumber",
  },
  {
    id: "post",
    name: "4 × 4 treated post",
    subtitle: "3½ × 3½ in actual · 8 ft",
    category: "Lumber",
    size: [3.5, 96, 3.5],
    color: "#aaa07c",
    price: 12.75,
    unit: "post",
    search: "4x4x8 ground contact post",
  },
  {
    id: "plywood",
    name: "¾ in exterior plywood",
    subtitle: "48 × 96 in · exterior grade",
    category: "Panels",
    size: [48, 0.75, 96],
    color: "#d6b889",
    price: 48.5,
    unit: "sheet",
    search: "3/4 exterior plywood 4x8",
  },
  {
    id: "siding",
    name: "Exterior siding panel",
    subtitle: "48 × 96 in · ⅜ in",
    category: "Panels",
    size: [48, 96, 0.375],
    color: "#798a7d",
    price: 38.75,
    unit: "sheet",
    search: "exterior wood siding panel 4x8",
  },
  {
    id: "roof",
    name: "Corrugated roof panel",
    subtitle: "26 × 96 in · metal",
    category: "Roof & wire",
    size: [26, 0.04, 96],
    color: "#48594e",
    price: 29.5,
    unit: "panel",
    search: "26 in 8 ft corrugated metal roof panel",
  },
  {
    id: "mesh",
    name: "½ in hardware cloth",
    subtitle: "24 in × 25 ft roll",
    category: "Roof & wire",
    size: [24, 36, 0.04],
    color: "#a0aaa2",
    price: 39.9,
    unit: "roll",
    search: "1/2 inch hardware cloth 24 inch 25 ft",
  },
  {
    id: "screw",
    name: "Exterior wood screws",
    subtitle: "#9 × 3 in · 100 count",
    category: "Fasteners",
    size: [0.2, 3, 0.2],
    color: "#697268",
    price: 13.5,
    unit: "100 pack",
    search: "exterior wood screws 3 inch 100 pack",
  },
];
export const material = (id: MaterialId) => catalog.find((m) => m.id === id)!;
export const uid = () => crypto.randomUUID();
export function step(title: string, notes = ""): Step {
  return { id: uid(), title, notes, complete: false };
}
export function part(
  name: string,
  material: MaterialId,
  size: V3,
  position: V3,
  stepId: string,
  assembly: string,
  rotation: V3 = [0, 0, 0],
): Piece {
  return {
    id: uid(),
    name,
    material,
    size,
    position,
    stepId,
    assembly,
    rotation,
    offcut: false,
  };
}
export function blank(name = "Untitled project"): Project {
  const s = step(
    "Lay out your project",
    "Establish the site, dimensions, and constraints before placing parts.",
  );
  return {
    schemaVersion: 1,
    id: uid(),
    name,
    kind: "custom",
    zip: "84121",
    store: "",
    updatedAt: new Date().toISOString(),
    pieces: [],
    steps: [s],
    joints: [],
    inventory: [],
    planLines: [],
    notes: "",
    history: [],
    sections: [],
  };
}
export function wallParts(
  width: number,
  height: number,
  spacing: number,
  stepId: string,
  origin: V3 = [0, 0, 0],
  assembly = "Wall",
): Piece[] {
  const [x, y, z] = origin;
  const pieces = [
    part(
      `${assembly} · bottom plate`,
      "stud",
      [width, 1.5, 3.5],
      [x, y + 0.75, z],
      stepId,
      assembly,
    ),
    part(
      `${assembly} · top plate`,
      "stud",
      [width, 1.5, 3.5],
      [x, y + height - 0.75, z],
      stepId,
      assembly,
    ),
  ];
  const locations = [0.75];
  for (let c = spacing; c < width - 1.5; c += spacing) locations.push(c);
  locations.push(width - 0.75);
  locations.forEach((c, i) =>
    pieces.push(
      part(
        `${assembly} · stud ${i + 1}`,
        "stud",
        [1.5, height - 3, 3.5],
        [x - width / 2 + c, y + height / 2, z],
        stepId,
        assembly,
      ),
    ),
  );
  return pieces;
}
export function coop(): Project {
  const p = blank("The backyard coop");
  p.kind = "coop";
  p.steps = [
    step(
      "Set the foundation",
      "Concept layout: confirm site setbacks, soil bearing, frost requirements, and an appropriate anchored foundation.",
    ),
    step(
      "Frame the floor",
      "Check the frame for square. Specify connections and support spacing before construction.",
    ),
    step(
      "Raise the walls",
      "Fit the wall frames to the floor. Door, ventilation, and bracing design still need review.",
    ),
    step(
      "Add siding & roof",
      "The roof and siding are schematic. Confirm pitch, flashing, weather sealing, and snow/wind design.",
    ),
    step(
      "Finish & secure",
      "Plan predator protection, ventilation, roosts, nesting boxes, doors, and hardware before housing birds.",
    ),
  ];
  const [f, fl, w, en, fi] = p.steps.map((s) => s.id);
  for (const x of [-30, 30])
    for (const z of [-22, 22])
      p.pieces.push(
        part(
          "Foundation post",
          "post",
          [3.5, 18, 3.5],
          [x, 9, z],
          f,
          "Foundation",
        ),
      );
  for (const z of [-22.75, 22.75])
    p.pieces.push(
      part(
        "Floor rim joist",
        "treated",
        [72, 5.5, 1.5],
        [0, 20.75, z],
        fl,
        "Floor",
      ),
    );
  for (let x = -35.25; x <= 36; x += 17.625)
    p.pieces.push(
      part(
        "Floor joist",
        "treated",
        [1.5, 5.5, 44],
        [x, 20.75, 0],
        fl,
        "Floor",
      ),
    );
  p.pieces.push(
    part("Floor deck", "plywood", [72, 0.75, 48], [0, 23.875, 0], fl, "Floor"),
  );
  p.pieces.push(...wallParts(72, 48, 16, w, [0, 24.25, -22.25], "Back wall"));
  for (const x of [-34.25, 34.25]) {
    const ps = wallParts(
      41,
      48,
      16,
      w,
      [0, 24.25, 0],
      x < 0 ? "Left wall" : "Right wall",
    );
    for (const a of ps) {
      a.position = [x, a.position[1], -a.position[0] || 0];
      a.rotation = [0, Math.PI / 2, 0];
    }
    p.pieces.push(...ps);
  }
  p.pieces.push(
    part(
      "Front bottom plate",
      "stud",
      [72, 1.5, 3.5],
      [0, 25, 22.25],
      w,
      "Front wall",
    ),
    part(
      "Front top plate",
      "stud",
      [72, 1.5, 3.5],
      [0, 71.5, 22.25],
      w,
      "Front wall",
    ),
  );
  for (const x of [-35.25, -20, 4, 20, 35.25])
    p.pieces.push(
      part(
        "Front wall stud",
        "stud",
        [1.5, 45, 3.5],
        [x, 48.25, 22.25],
        w,
        "Front wall",
      ),
    );
  p.pieces.push(
    part(
      "Back siding",
      "siding",
      [72, 48, 0.375],
      [0, 48.25, -24.2],
      en,
      "Enclosure",
    ),
    part(
      "Left siding",
      "siding",
      [0.375, 48, 48],
      [-36.2, 48.25, 0],
      en,
      "Enclosure",
    ),
    part(
      "Right siding",
      "siding",
      [0.375, 48, 48],
      [36.2, 48.25, 0],
      en,
      "Enclosure",
    ),
  );
  p.pieces.push(
    part(
      "Front siding · left",
      "siding",
      [16, 48, 0.375],
      [-28, 48.25, 24.2],
      en,
      "Enclosure",
    ),
    part(
      "Front siding · right",
      "siding",
      [32, 48, 0.375],
      [20, 48.25, 24.2],
      en,
      "Enclosure",
    ),
    part(
      "Door header siding",
      "siding",
      [24, 12, 0.375],
      [-8, 66.25, 24.2],
      en,
      "Enclosure",
    ),
  );
  // An intentionally open doorway keeps the interior and assembly legible.
  for (const side of [-1, 1]) {
    const angle = -side * 0.42;
    for (const [width, offset] of [
      [26, -8.5],
      [17, 13],
    ])
      p.pieces.push(
        part(
          `${side < 0 ? "Left" : "Right"} roof panel`,
          "roof",
          [width, 0.04, 58],
          [
            side * 19.5 + Math.cos(angle) * offset,
            82.5 + Math.sin(angle) * offset,
            0,
          ],
          en,
          "Roof",
          [0, 0, angle],
        ),
      );
  }
  p.pieces.push(
    part(
      "Access ramp",
      "plywood",
      [18, 0.75, 43],
      [-8, 12, 43],
      fi,
      "Access ramp",
      [0.58, 0, 0],
    ),
  );
  for (let i = 0; i < 6; i++)
    p.pieces.push(
      part(
        "Ramp cleat",
        "stud",
        [18, 0.75, 1.5],
        [-8, 12 - (28 + i * 5 - 43) * Math.tan(0.58) + 0.7, 28 + i * 5],
        fi,
        "Access ramp",
        [0.58, 0, 0],
      ),
    );
  const names = [...new Set(p.pieces.map((a) => a.assembly))];
  p.sections = names.map((name) => {
    const members = p.pieces.filter((a) => a.assembly === name);
    let generator: Command | null = null,
      origin: V3 = [0, 0, 0],
      rotation: V3 = [0, 0, 0];
    if (name === "Back wall") {
      generator = {
        type: "wall",
        width: 72,
        height: 48,
        depth: 48,
        spacing: 16,
      };
      origin = [0, 24.25, -22.25];
    }
    if (name === "Left wall" || name === "Right wall") {
      generator = {
        type: "wall",
        width: 41,
        height: 48,
        depth: 48,
        spacing: 16,
      };
      origin = [name === "Left wall" ? -34.25 : 34.25, 24.25, 0];
      rotation = [0, Math.PI / 2, 0];
    }
    if (!generator)
      origin = [0, 1, 2].map(
        (i) =>
          members.reduce((sum, a) => sum + a.position[i], 0) / members.length,
      ) as V3;
    return {
      id: uid(),
      name,
      pieceIds: members.map((a) => a.id),
      origin,
      rotation,
      generator,
    };
  });
  p.notes =
    "Concept study, not a finished construction plan. Openings, roof framing, gables, anchors, weatherproofing, predator protection, and connections need detailing.";
  return p;
}
/** Generate a local assembly and transform every part into its section frame. */
export function sectionParts(
  command: Command,
  stepId: string,
  name: string,
  origin: V3,
  rotation: V3,
): Piece[] {
  let pieces: Piece[] = [];
  if (command.type === "wall")
    pieces = wallParts(
      command.width,
      command.height,
      command.spacing,
      stepId,
      [0, 0, 0],
      name,
    );
  else if (command.type === "foundation") {
    for (const z of [-command.depth / 2 + 0.75, command.depth / 2 - 0.75])
      pieces.push(
        part(
          `${name} · rim`,
          "treated",
          [command.width, 5.5, 1.5],
          [0, 2.75, z],
          stepId,
          name,
        ),
      );
    const xs = [-command.width / 2 + 0.75];
    for (
      let x = -command.width / 2 + command.spacing;
      x < command.width / 2 - 1.5;
      x += command.spacing
    )
      xs.push(x);
    xs.push(command.width / 2 - 0.75);
    for (const x of xs)
      pieces.push(
        part(
          `${name} · joist`,
          "treated",
          [1.5, 5.5, command.depth - 3],
          [x, 2.75, 0],
          stepId,
          name,
        ),
      );
  } else
    throw Error(
      "Use the coop command for a whole project, not an individual section.",
    );
  return pieces.map((p) => ({
    ...p,
    position: rotate(p.position, rotation).map((v, i) => v + origin[i]) as V3,
    rotation: composeRotation(rotation, p.rotation),
  }));
}
export function commandStepTitle(command: Command) {
  return command.type === "wall"
    ? `Frame a ${format(command.width)} × ${format(command.height)} wall`
    : `Lay a ${format(command.width)} × ${format(command.depth)} base`;
}
export function applyCommand(
  project: Project,
  raw: Command,
  targetSectionId?: string,
): Project {
  const command = commandSchema.parse(raw);
  if (targetSectionId) {
    const section = project.sections.find((s) => s.id === targetSectionId);
    if (!section?.generator)
      throw Error("Choose a generated wall or base section to regenerate.");
    if (command.type !== section.generator.type)
      throw Error(
        "A targeted command must keep the section type. Add a new section to change its type.",
      );
    const oldIds = new Set(section.pieceIds),
      stepId = project.pieces.find((a) => oldIds.has(a.id))!.stepId;
    const pieces = sectionParts(
      command,
      stepId,
      section.name,
      section.origin,
      section.rotation,
    );
    return {
      ...project,
      pieces: [...project.pieces.filter((a) => !oldIds.has(a.id)), ...pieces],
      joints: project.joints.filter(
        (j) => !oldIds.has(j.a) && !oldIds.has(j.b),
      ),
      steps: project.steps.map((step) =>
        step.id === stepId &&
        step.title === commandStepTitle(section.generator!) &&
        project.pieces
          .filter((a) => a.stepId === stepId)
          .every((a) => oldIds.has(a.id))
          ? { ...step, title: commandStepTitle(command) }
          : step,
      ),
      sections: project.sections.map((s) =>
        s.id === section.id
          ? { ...s, generator: command, pieceIds: pieces.map((a) => a.id) }
          : s,
      ),
    };
  }
  if (command.type === "coop") {
    const p = coop();
    p.id = project.id;
    p.zip = project.zip;
    p.store = project.store;
    p.inventory = project.inventory;
    p.history = project.history;
    return p;
  }
  const p = structuredClone(project),
    s = step(
      commandStepTitle(command),
      "Generated concept. Review connections, support, bracing, and stock dimensions.",
    );
  p.steps.push(s);
  // Rotated parts need their world bounds when finding free ground beside the project.
  const maxX = p.pieces.reduce(
    (max, a) =>
      Math.max(
        max,
        ...[-1, 1].flatMap((x) =>
          [-1, 1].flatMap((y) =>
            [-1, 1].map(
              (z) =>
                a.position[0] +
                rotate(
                  [
                    (x * a.size[0]) / 2,
                    (y * a.size[1]) / 2,
                    (z * a.size[2]) / 2,
                  ],
                  a.rotation,
                )[0],
            ),
          ),
        ),
      ),
    -command.width / 2 - 12,
  );
  const origin: V3 = [
    p.pieces.length ? maxX + command.width / 2 + 12 : 0,
    0,
    0,
  ];
  const prefix = command.type === "wall" ? "Wall" : "Base";
  let n = 1;
  while (p.sections.some((s) => s.name === `${prefix} ${n}`)) n++;
  const name = `${prefix} ${n}`,
    pieces = sectionParts(command, s.id, name, origin, [0, 0, 0]);
  p.pieces.push(...pieces);
  p.sections.push({
    id: uid(),
    name,
    pieceIds: pieces.map((a) => a.id),
    generator: command,
    origin,
    rotation: [0, 0, 0],
  });
  return p;
}
export function format(inches: number) {
  const n = Math.round(inches * 100) / 100;
  const ft = Math.floor(n / 12),
    rem = Math.round((n - ft * 12) * 100) / 100;
  return ft ? `${ft}′${rem ? ` ${rem}″` : ""}` : `${rem}″`;
}
export function parsePrompt(prompt: string, context?: Command): Command {
  const text = prompt.toLowerCase();
  let type: Command["type"];
  if (/\b(coop|chicken)\b/.test(text)) type = "coop";
  else if (/\b(wall|frame|framed)\b/.test(text)) type = "wall";
  else if (/\b(base|floor|foundation)\b/.test(text)) type = "foundation";
  else if (context) type = context.type;
  else
    throw new Error(
      "Try “a wall 8 ft wide and 6 ft tall, studs 16 inches on center”, “a 6 by 4 ft base”, or “a chicken coop”.",
    );
  const measurement =
    "(\\d+(?:\\.\\d+)?)\\s*(feet|foot|ft|inches|inch|in|['′\"″])?";
  const named = (label: string) => {
    const m = text.match(new RegExp(measurement + "\\s*(?:" + label + ")"));
    if (!m) return;
    return Number(m[1]) * (/^(?:in|["″])/.test(m[2] || "") ? 1 : 12);
  };
  const pair = text.match(
    /(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?/,
  );
  const pairUnit = pair?.[4] || pair?.[2] || "ft";
  const w =
    named("wide|width") ??
    (pair
      ? Number(pair[1]) * (/^in/.test(pair[2] || pairUnit) ? 1 : 12)
      : undefined);
  const h =
    named("tall|high|height") ??
    (pair && type === "wall"
      ? Number(pair[3]) * (/^in/.test(pairUnit) ? 1 : 12)
      : undefined);
  const d =
    named("deep|depth|long") ??
    (pair && type === "foundation"
      ? Number(pair[3]) * (/^in/.test(pairUnit) ? 1 : 12)
      : undefined);
  if (
    type !== "coop" &&
    !context &&
    (w === undefined || (type === "wall" ? h === undefined : d === undefined))
  )
    throw new Error(
      "Include dimensions, for example “wall 8 ft wide, 6 ft tall” or “base 6 by 4 ft”.",
    );
  if (
    context &&
    w === undefined &&
    h === undefined &&
    d === undefined &&
    !/\b(12|16|24)\s*(?:inches|inch|in|["″])?\s*(?:on[ -]cent(?:er|re)|o\.?c\.?|spacing)/.test(
      text,
    )
  )
    throw Error(
      "Include a new dimension or spacing, for example “make it 10 ft wide” or “24 inches on center”.",
    );
  const spacing = Number(
    text.match(
      /\b(12|16|24)\s*(?:inches|inch|in|["″])?\s*(?:on[ -]cent(?:er|re)|o\.?c\.?|spacing)/,
    )?.[1] ||
      context?.spacing ||
      16,
  );
  return commandSchema.parse({
    type,
    width: w ?? context?.width ?? 72,
    height: h ?? context?.height ?? 48,
    depth: d ?? context?.depth ?? 48,
    spacing,
  });
}
