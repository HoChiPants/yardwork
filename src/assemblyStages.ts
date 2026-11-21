import type { Piece, Project } from "./model";
import { doorwayGuideNote, doorwayLeafRole, doorJambMaterial } from "./doorWall";
import type { IdeaEntry } from "./ideaBindingSchema";
import { resolveGuidePlacements } from "./guidePlacementResolution";
import { saunaPedestalRole } from "./saunaBenchReference";
import { saunaCeilingFoilRole, saunaWallFoilRole } from "./saunaFoil";
import { saunaCeilingBattRole } from "./saunaCeilingReference";
import { ceilingCoverageText, saunaCeilingCoverage } from "./saunaCeilingCoverage";
import { saunaWallCoverage, saunaWallCoverageText } from "./saunaWallCoverage";

/** Physical ownership only. Missing systems are review text, never invented parts. */
export type AssemblyStage = {
  ownerId: string;
  key: string;
  title: string;
  memberIds: string[];
  notes: string;
  order: number;
  /** Unbuilt family systems, retained when explicit placement empties their original task. */
  ownerReview?: string;
};

type StageDefinition = {
  key: string;
  after?: readonly string[];
  title: string;
  roles: readonly string[] | ((role: string) => boolean);
  notes: string;
};

const connectionReview =
  "Review the recorded connection schedule; unspecified joints still need fastening details.";
const shelfReview =
  "Review support and drilling plans for each shelf before placement. Only explicitly planned holes and supports are documented; other support details remain unresolved.";
const roleMatches = (definition: StageDefinition, role: string) =>
  typeof definition.roles === "function"
    ? definition.roles(role)
    : definition.roles.includes(role);

function furnitureDefinitions(entry: IdeaEntry): StageDefinition[] {
  if (entry.spec.type !== "furniture") return [];
  const recipe = entry.spec.recipe;
  if (recipe.kind === "panel")
    return [
      {
        key: "panel",
        title: "Dry-fit the panel",
        roles: ["panel"],
        notes: `Check the listed panel's orientation, measured opening and access before attachment. ${connectionReview}`,
      },
    ];
  if (recipe.kind === "bench" && recipe.storage)
    return [
      {
        key: "bottom-frame",
        title: "Dry-fit the storage bottom and frame",
        roles: ["storage-bottom", "leg", "top-rail", "top-cross-rail"],
        notes: `Set the storage bottom in its intended orientation, then dry-fit the internal legs and top rails on it. Clamp and check square, contact and access for joining the frame. ${connectionReview}`,
      },
      {
        key: "shell",
        after: ["bottom-frame"],
        title: "Fit the storage shell",
        roles: [
          "storage-front",
          "storage-rear",
          "storage-left",
          "storage-right",
        ],
        notes:
          "Dry-fit the listed front, rear and end panels around the actual bottom and frame. Check outside dimensions and storage access; leave clamp and tool access for the chosen joints before closing the shell.",
      },
      {
        key: "seat-lid-back",
        after: ["bottom-frame", "shell"],
        title: recipe.openingLid ? "Dry-fit the seat lid" : "Fit the seat",
        roles: ["seat-lid", "seat", "back-panel"],
        notes: recipe.openingLid
          ? "Dry-fit the actual lid and any listed back panel. Check opening travel, wall clearance, storage access and pinch points. The preview pivot is provisional: hinge, lid stay/hold-open and attachment details remain to be designed unless explicitly documented."
          : "Dry-fit the actual seat and any listed back panel. Check edge alignment, bearing contact, wall clearance and access to the selected fixing locations before attachment.",
      },
    ];
  return [
    {
      key: "frame",
      title: "Dry-fit the frame",
      roles: ["leg", "top-rail", "top-cross-rail"],
      notes: `Dry-fit the listed legs and rails. Clamp and check square, supporting contacts and access to the selected fixing locations. ${connectionReview}`,
    },
    {
      key: "infill-shelves",
      after: ["frame"],
      title: "Fit infill and interior shelves",
      roles: (role) =>
        ["left-infill", "right-infill", "back-infill"].includes(role) ||
        /^shelf-[1-6]$/.test(role),
      notes: `Dry-fit the listed infill and interior shelves while the frame remains accessible. Check actual shelf levels, fit and tool access. ${shelfReview}`,
    },
    {
      key: "top-seat-back",
      after: ["frame"],
      title: recipe.kind === "bench" ? "Fit the seat and back" : "Fit the top",
      roles: ["top", "seat", "back-panel"],
      notes:
        "Dry-fit the listed top, seat or back panels on their actual supporting frame. Check alignment, contact and clearance; retain access for the recorded joints before final attachment.",
    },
  ];
}

function structureDefinitions(entry: IdeaEntry): StageDefinition[] {
  if (entry.spec.type !== "structure") return [];
  const structure = entry.spec.structure;
  switch (structure.kind) {
    case "casework-shelves":
      return [
        {
          key: "carcass",
          title: "Dry-fit the bookcase carcass",
          roles: ["side-left", "side-right", "back", "top", "bottom"],
          notes: `Orient the listed sides, top, bottom and back by their actual labels. Dry-fit and clamp the body; check outside dimensions, square and back alignment. Keep tool access for the selected carcass and back fixings. ${connectionReview}`,
        },
        {
          key: "shelves",
          after: ["carcass"],
          title: "Set up supports and place shelves",
          roles: (role) => /^shelf-[1-6]$/.test(role),
          notes: `${shelfReview} Dry-fit the actual shelves at their planned levels and front setback. Check access and fit before loading; restraint and load decisions remain separate reviews.`,
        },
      ];
    case "closet-insert":
      return [
        {
          key: "carcass",
          title: "Dry-fit the closet carcass",
          roles: [
            "bottom",
            "top",
            "side-left",
            "tower-left",
            "tower-right",
            "side-right",
          ],
          notes: `Dry-fit and clamp the listed outside panels and tower dividers. Check the measured opening, clear bays, square and access around trim/baseboards. Keep clamp and tool access before closing the body. ${connectionReview}`,
        },
        {
          key: "tower-shelves",
          after: ["carcass"],
          title: "Set up tower supports and shelves",
          roles: (role) => /^tower-shelf-[1-6]$/.test(role),
          notes: `${shelfReview} Dry-fit the actual tower shelves at their recorded levels and verify clearance from the hanging bays.`,
        },
        {
          key: "rods",
          after: ["carcass"],
          title: "Dry-fit hanging rods and review supports",
          roles: ["hanging-rods"],
          notes:
            "Check the actual listed rods against the clear bays. Resolve matched sockets, any required center support, engagement/end deductions and mounting locations before cutting or attachment; geometric rod lengths are provisional without those details.",
        },
      ];
    case "greenhouse":
      return [
        {
          key: "base",
          title: "Lay out the greenhouse base",
          roles: ["base-framing"],
          notes: `Dry-fit the listed base members. Check the measured footprint, level and square, then review the four rail-end joints under Connections. Resolve the foundation, anchoring and tool access. ${connectionReview}`,
        },
        {
          key: "walls",
          after: ["base"],
          title: "Dry-fit and support the wall frames",
          roles: ["wall-framing"],
          notes:
            "Dry-fit the listed wall members on the actual base. Check square, alignment and the intended opening. Plan temporary support and bracing before standing frames; their connections and anchoring still require an explicit detail.",
        },
        {
          key: "opening",
          after: ["base", "walls"],
          title: "Fit the door opening and dry-fit the leaf",
          roles: ["door-opening-framing", "door-leaf"],
          notes:
            "Dry-fit the opening and leaf members. Check bearing below both ends of the header and how it carries down to the base. Verify the clear opening, leaf swing and tool access. Review hinges, latches, weathering and attachment details.",
        },
        {
          key: "roof",
          after: ["base", "walls"],
          title: "Dry-fit the pitched roof and gables",
          roles: ["roof-framing", "gable-framing"],
          notes:
            "Use the listed cut profiles and labeled members to dry-fit the rafters, ridge and gables. Use Checks to locate the contacts and review the separate attachment at each side of a fitted eave block. Resolve the actual bearing, bracing, roof fastening and tool access before building.",
        },
        {
          key: "roof-vent",
          after: ["roof"],
          title: "Dry-fit the roof vent opening and sash",
          roles: ["roof-vent-opening", "roof-vent-sash"],
          notes:
            "Dry-fit the two blocking members between the full-length rafters and check the sash gaps. For glazed sashes, match the flutes to the roof slope and review edge contact with backing that moves with the sash. Review hinge and hold-open hardware, flashing, drainage and operating clearances before installation.",
        },
        {
          key: "glazing",
          after: ["walls", "opening", "roof", "roof-vent"],
          title: "Dry-fit the actual glazing panels",
          roles: [
            "glazing-wall-panels",
            "glazing-gable-panels",
            "glazing-roof-panels",
            "glazing-door-panels",
          ],
          notes:
            "Match the listed panels and actual cut profiles to their wall, gable, roof and door locations. Keep the specified flute orientation. Use Checks to locate gaps beneath shared SUNLITE roof seams. Review closures, seals, fixing locations, thermal allowances and access before installation.",
        },
      ];
    case "sauna":
      return [
        {
          key: "walls",
          title: "Dry-fit the sauna exterior frames",
          roles: ["wall-framing"],
          notes: `Dry-fit the listed dimensional wall framing around the reserved clear room and interior-layer allowance. Check square, actual clearances and access; plan temporary support before standing frames. ${connectionReview}`,
        },
        {
          key: "opening",
          after: ["walls"],
          title: "Check the sauna rough opening",
          roles: ["door-opening-framing"],
          notes:
            "Dry-fit the rough-opening members. Check bearing below both ends of the header and how it carries down to the floor. Verify the opening against the door specification and finished floor and walls, and keep access to the framing joints.",
        },
        {
          key: "ceiling",
          after: ["walls"],
          title: "Dry-fit the ceiling framing",
          roles: ["ceiling-framing"],
          notes:
            "Dry-fit the actual ceiling members and check their contacts, clear room height and temporary support/tool access. Ceiling connections and the complete heated enclosure still require design.",
        },
        {
          key: "wall-batts",
          after: ["walls", "opening"],
          title: "Measure and fit the wall batts",
          roles: ["wall-insulation"],
          notes: "Check each labeled piece against the actual cavity before trimming. Review narrow gaps, joints and services. Follow the selected wall assembly and batt handling instructions before closing the wall.",
        },
        {
          key: "ceiling-batts",
          after: ["ceiling"],
          title: "Measure and fit the ceiling batts",
          roles: [saunaCeilingBattRole],
          notes: "Check the labeled widths and lengths against the actual joist bays. Verify support, end joints, the space above the batt and equipment clearances. Follow the selected assembly and the batt handling instructions. Keep the batt thickness intact.",
        },
        {
          key: "ceiling-foil",
          after: ["ceiling", "ceiling-batts"],
          title: "Cut and fit the ceiling foil",
          roles: [saunaCeilingFoilRole],
          notes: "Use the roll layout for the flat cut dimensions. Measure each boundary first and check the planned 3 in folds down the walls. Confirm the approved ceiling layer sequence and seam support at the actual joists.",
        },
        {
          key: "wall-foil",
          after: ["walls", "opening", "wall-batts", "ceiling-foil"],
          title: "Fit the wall foil and check its laps",
          roles: [saunaWallFoilRole],
          notes: "Dry-fit the labeled wall cuts after fitting the ceiling layer. The layout allows 4 in laps and leaves the rough opening clear. Verify the corner folds, door and floor terminations, penetrations, and actual fastening details against the supplier’s instructions.",
        },
        {
          key: "cedar-lining",
          after: ["walls", "ceiling", "wall-batts", "ceiling-batts", "ceiling-foil", "wall-foil"],
          title: "Dry-fit the cedar lining courses",
          roles: ["wall-lining", "ceiling-lining"],
          notes: "Check the opening, finished room dimensions and attachment surfaces before cutting. The cut schedule uses 3 in installed coverage per course from a 3⅜ in tongue-and-groove board. Rip only the courses or opening strips that show less than 3 in of coverage. Mark the cuts from the intact joint edge and verify the delivered profile, backing at every end joint, edge allowances and hidden fastening with the chosen sauna system.",
        },
        {
          key: "sauna-door",
          after: ["opening"],
          title: "Fit and test the prehung sauna door",
          roles: ["sauna-door-leaf"],
          notes: "Confirm the 24 × 76 in rough opening at the finished floor. Order the jamb for the measured finished wall depth. Check room to fit and fasten the delivered frame, then verify the installed hinge axis, trim, handle and release from inside. Review the full outward swing with Test movement and check the self-closing action on site.",
        },
        {
          key: "sauna-pedestal",
          after: ["cedar-lining"],
          title: "Assemble and place the cedar pedestal bench",
          roles: [saunaPedestalRole],
          notes: "Match the delivered kit and the pedestal instructions. The seat top and leg assemblies are prebuilt. Verify the angle supports and cross-brace before placing the bench on the finished floor. Check stability, heater clearance and the exit path at the saved location.",
        },
      ];
  }
}

export function assemblyOrderRules(entry: IdeaEntry) {
  const stages = entry.spec.type === "furniture"
    ? furnitureDefinitions(entry)
    : structureDefinitions(entry);
  return stages.flatMap(({ key, after }) => after ? [{ key, after }] : []);
}

function familyReview(entry: IdeaEntry, roles: Set<string>): string {
  if (entry.spec.type !== "structure") return "";
  const structure = entry.spec.structure;
  if (structure.kind === "sauna") {
    const p = structure.parameters;
    const lining = roles.has("wall-lining") && roles.has("ceiling-lining");
    const wallInsulation = roles.has("wall-insulation");
    const ceilingInsulation = roles.has(saunaCeilingBattRole);
    const foil = roles.has(saunaCeilingFoilRole) && roles.has(saunaWallFoilRole);
    const insulation = wallInsulation ? "ceiling insulation" : "wall and ceiling insulation";
    const layers = lining
      ? `${insulation}, foil and furring`
      : wallInsulation
        ? "ceiling insulation, foil, furring, lining"
        : "insulation/foil/furring/lining";
    const heatedLayers = ceilingInsulation
      ? [
          ...(wallInsulation ? [] : ["wall insulation"]),
          ...(foil ? [] : ["foil"]),
          "furring",
          ...(lining ? [] : ["lining"]),
        ].join(", ")
      : foil
        ? `${insulation}, furring${lining ? "" : ", lining"}`
        : layers;
    const door = roles.has("sauna-door-leaf") ? "" : "actual door, ";
    if (roles.has(saunaPedestalRole))
      return `Unbuilt systems: foundation, ${door}${heatedLayers}, heater/electrical and ventilation. The clear interior is ${p.clearWidth} × ${p.clearDepth} × ${p.clearHeight} in. Review any additional seating and its supports separately.`;
    return `Unbuilt systems: foundation, ${door}${heatedLayers}, heated benches, heater/electrical and ventilation. The clear interior ${p.clearWidth} × ${p.clearDepth} × ${p.clearHeight} in and bench ${p.benchWidth} × ${p.benchDepth} × ${p.benchHeight} in are reservations, not installed or heat-qualified components.`;
  }
  if (
    structure.kind === "greenhouse" &&
    ![...roles].some((r) => r.startsWith("glazing-"))
  )
    return "Glazing and its fixing/closure system are unbuilt; no cladding installation is included in the listed parts.";
  if (structure.kind === "closet-insert" && !roles.has("hanging-rods"))
    return "Hanging rods and matched sockets/supports are unbuilt; no hanging system is inferred from the clear bays.";
  return "";
}

/** Uses declared ownership and semantic roles only; never infers identity from names or geometry. */
export function baseAssemblyStages(project: Project): AssemblyStage[] {
  const active = project.pieces.filter((piece) => !piece.offcut),
    ceilingReviews = new Map(saunaCeilingCoverage(project).map((review) => [review.roomId, review])),
    wallReviews = new Map(saunaWallCoverage(project).map((review) => [review.roomId, review])),
    activeById = new Map(active.map((piece) => [piece.id, piece])),
    sections = new Map(
      project.sections.map((section) => [section.id, section]),
    ),
    claimed = new Set<string>(),
    stages: AssemblyStage[] = [];
  const append = (
    ownerId: string,
    key: string,
    title: string,
    members: Piece[],
    notes: string,
  ) => {
    const memberIds = [...new Set(members.map((piece) => piece.id))]
      .filter((id) => !claimed.has(id))
      .sort();
    if (!memberIds.length) return;
    memberIds.forEach((id) => claimed.add(id));
    stages.push({
      ownerId,
      key,
      title: title.slice(0, 120),
      memberIds,
      notes,
      order: stages.length,
    });
  };

  for (const binding of project.ideaBindings)
    for (const entry of binding.entries) {
      const members = new Map<string, Piece>(),
        roles = new Map<string, Set<string>>();
      for (const mapping of entry.sections)
        for (const id of sections.get(mapping.sectionId)?.pieceIds ?? []) {
          const piece = activeById.get(id);
          if (!piece || claimed.has(id)) continue;
          members.set(id, piece);
          const pieceRole =
            entry.spec.type === "furniture"
              ? piece.designRole
              : entry.spec.structure.kind === "closet-insert" &&
                  mapping.role === "casework-panels"
                ? piece.designRole
                : mapping.role;
          if (pieceRole) {
            const ids = roles.get(pieceRole) ?? new Set<string>();
            ids.add(id);
            roles.set(pieceRole, ids);
          }
        }
      if (!members.size) continue;
      const name =
          entry.spec.type === "furniture"
            ? entry.spec.recipe.name
            : (
                {
                  "casework-shelves": "Bookcase",
                  "closet-insert": "Closet",
                  greenhouse: "Greenhouse",
                  sauna: "Sauna",
                } as const
              )[entry.spec.structure.kind],
        start = stages.length,
        definitions =
          entry.spec.type === "furniture"
            ? furnitureDefinitions(entry)
            : structureDefinitions(entry);
      for (const definition of definitions) {
        const ids = new Set(
          [...roles]
            .filter(([role]) => roleMatches(definition, role))
            .flatMap(([, ids]) => [...ids]),
        );
        const ceiling = definition.key === "ceiling-batts" ? ceilingReviews.get(entry.id) : undefined;
        const wall = definition.key === "wall-batts" ? wallReviews.get(entry.id) : undefined;
        const coverage = ceiling ? ceilingCoverageText(ceiling) : wall ? saunaWallCoverageText(wall) : "";
        const tipUp = definition.key === "carcass" && project.caseworkTipUpPlans?.some(({ entryId }) => entryId === entry.id)
          ? "Check the saved tip-up and placement route before lifting the carcass."
          : "";
        append(
          entry.id,
          definition.key,
          `${name}: ${definition.title}`,
          [...members.values()].filter((piece) => ids.has(piece.id)),
          [definition.notes, coverage, tipUp].filter(Boolean).join("\n"),
        );
      }
      const remaining = [...members.values()].filter(
        (piece) => !claimed.has(piece.id),
      );
      append(
        entry.id,
        start === stages.length && entry.spec.type === "furniture"
          ? "module"
          : "review-modified-parts",
        `${name}: Review ${start === stages.length ? "the whole module" : "actual modified parts"}`,
        remaining,
        `The listed actual parts have no recognized stage roles. Dry-fit them as the saved module and review their orientation, contacts and access against the current design. No part identity or construction order is inferred from names, array order or a regenerated baseline. ${connectionReview}`,
      );
      const review = familyReview(entry, new Set(roles.keys()));
      if (review && stages.length > start) {
        stages[stages.length - 1].notes += `\n${review}`;
        stages[stages.length - 1].ownerReview = review;
      }
    }

  const orderedSections = [...project.sections].sort((a, b) => {
    const first = a.roomFraming, second = b.roomFraming;
    const firstGroup = first ? `room:${first.id}` : `section:${a.id}`;
    const secondGroup = second ? `room:${second.id}` : `section:${b.id}`;
    if (firstGroup !== secondGroup) return firstGroup.localeCompare(secondGroup);
    if (!first || !second) return 0;
    return second.wall % 2 - first.wall % 2 || first.wall - second.wall || first.panel - second.panel;
  });
  const fittedDoorParts = (section: Project["sections"][number]) => section.pieceIds.flatMap((id) => {
    const part = activeById.get(id);
    return part && (part.designRole === doorwayLeafRole || part.material === doorJambMaterial) ? [part] : [];
  });
  for (const section of orderedSections) {
    const fitted = new Set(fittedDoorParts(section).map(({ id }) => id));
    append(
      section.id,
      "section",
      section.roomFraming ? `Frame ${section.name} · room wall ${section.roomFraming.wall}` : `Assemble ${section.name}`,
      section.pieceIds.flatMap((id) => fitted.has(id) ? [] : activeById.get(id) ?? []),
      section.roomFraming
        ? `Dry-fit panel ${section.roomFraming.panel} of ${section.roomFraming.panels} at the actual measured corner or panel joint. Verify both corner contacts, finish backing and fastening. ${connectionReview}${section.generator?.doorOpening ? ` ${doorwayGuideNote}` : ""}`
        : section.generator?.doorOpening ? `${doorwayGuideNote} ${connectionReview}`
        : `Dry-fit the listed actual parts in this declared section. Check orientation, supporting contacts, square and clamp/tool access. The section has no typed assembly-stage identity, so confirm its construction order. ${connectionReview}`,
    );
  }
  for (const section of orderedSections.filter(({ generator }) => generator?.doorUnit))
    append(section.id, "fit-door", `Fit and swing-test the door in ${section.name}`, fittedDoorParts(section),
      "Measure both diagonals and confirm the frame is plumb. Shim and fasten through actual backing per the selected manufacturer. Check the swing with handles, stops, casing and nearby obstructions in place.");
  const looseGroups = new Map<string, Piece[]>();
  for (const piece of active) {
    if (claimed.has(piece.id)) continue;
    const group = looseGroups.get(piece.assembly) ?? [];
    group.push(piece);
    looseGroups.set(piece.assembly, group);
  }
  for (const [assembly, members] of [...looseGroups].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    append(
      project.id,
      assembly ? `assembly:${assembly}` : "loose-parts",
      assembly ? `Assemble ${assembly}` : "Review loose parts",
      members,
      `Review and dry-fit these listed actual parts. Their assembly label does not establish a build family, joinery or construction sequence. Check supporting contacts and clamp/tool access. ${connectionReview}`,
    );
  return stages;
}

/** Actual construction tasks after explicit user placements; physical ownership is unchanged. */
export function assemblyStages(project: Project): AssemblyStage[] {
  return resolveGuidePlacements(project, baseAssemblyStages(project)).stages;
}
