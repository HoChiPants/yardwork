import { subfloorReviews } from "./subfloor";
import { subfloorAdhesiveReviews } from "./subfloorAdhesive";
import { subfloorFasteningReviews } from "./subfloorFastening";
import { subfloorAdhesive } from "./subfloorReference";
import { bottomPlateSealReviews } from "./bottomPlateSeal";
import { topPlateSealReviews } from "./topPlateSeal";
import { bottomPlateSealant, quartCartridgeGun } from "./bottomPlateSealReference";
import { openingSilicone } from "./openingAirSealReference";
import { reviewOpeningFlashings } from "./openingFlashing";
import { isPexPipe, pexCutter, pexInstallation } from "./wallWaterReference";
import { reviewWaterFitting } from "./waterFittings";
import { reviewWaterStop } from "./waterStops";
import { waterStop } from "./waterStopReference";
import { sinkTrap } from "./sinkDrainReference";
import { reviewSinkDrain } from "./sinkDrain";
import { waterTestManufacturer } from "./waterPressure";
import { maxFittingInstructions, waterDepthGauge } from "./waterFittingReference";
import { reviewWaterRun } from "./wallWater";
import { flashingKnife, flexWrap } from "./openingFlashingReference";
import { drywallInstallation, isDrywall } from "./drywallReference";
import { sunliteFastener } from "./sunliteFastenerReference";
import { concreteAnchor } from "./concreteAnchorReference";
import { isBatt, isHardware, material, type Project } from "./model";
import { hardwareForJoint, inspectCutStock } from "./engine";
import { toolCapabilities, type ToolCapability } from "./toolCapabilities";
import { attachmentReviews } from "./attachments";
import { restraintReviews } from "./restraints";
import { fastenerReviews } from "./fastenings";
import { getWoodFastenerProduct } from "./fastenerProducts";
import { lidHingeReviews } from "./hinges";
import { reviewHingeStock } from "./hingeStock";
import { getHingeProduct } from "./hingeProducts";
import { connectorReviews } from "./connectors";
import { getConnectorProduct, getConnectorSchedule } from "./connectorProducts";
import { cutInstructions } from "./cutInstructions";
import { ensurePartLabels, partLabel } from "./partLabels";
import { orientedStockSize, stockAxes } from "./stockAxes";
import { reviewRodFit, rodFlangeInstructions } from "./rodFits";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";
import { reviewRodBracketMount } from "./rodBracketMounts";
import { profileNames, reviewSunliteProfiles } from "./sunliteProfiles";
import { sunliteInstructions } from "./sunliteTakeoff";
import { reviewEdgeBanding } from "./edgeBanding";
import { edgeBandingProducts, edgeTrimmer } from "./edgeBandingReference";
import { reviewRodSupports, rodIntermediateReference } from "./rodSupports";
import { cedarbrookFoil } from "./saunaFoilReference";
import { cedarbrookLining } from "./saunaLiningReference";
import { paslodeFinishNailer, paslodeFinishNails } from "./paslodeFinishReference";
import { saunaCeilingBatt } from "./saunaCeilingReference";
import { formatStockLength } from "./measurement";
import { dewaltJigsaw } from "./jigsawReference";
import { everbiltLatch, reviewGreenhouseLatch } from "./greenhouseLatch";
import { gibraltarDripEdge, wissSnips } from "./dripEdgeReference";
import { reviewShingleRoof } from "./shingleRoof";
import { floorHangerPlanReviews } from "./floorHangerPlans";
import { floorHangerReport, floorHangerScope, floorHangers } from "./floorHangerReference";
export { toolCapabilities, type ToolCapability } from "./toolCapabilities";
export type ToolProcessSource = {
  kind:
    | "piece"
    | "joint"
    | "history"
    | "work-zone"
    | "idea-entry"
    | "attachment-plan"
    | "restraint-plan"
    | "fastener-plan"
    | "connector-plan"
    | "floor-hanger-plan"
    | "hinge-plan"
    | "glazing-profile"
    | "edge-banding"
    | "sauna-lining"
    | "rod-fit"
    | "hinge-stock"
    | "foundation-anchor"
    | "sunlite-mount"
    | "roof-drip-edge"
    | "opening-flashing"
    | "greenhouse-latch";
  id: string;
  reason: string;
};
export type ToolCapabilityEvidence = {
  url: string;
  reviewedAt: string;
  note: string;
  capabilities: ToolCapability[];
};
/** A checked selection is user-reported; documented capability is separate from ownership or working condition. */
export type SelectedTool = {
  id: string;
  name: string;
  checked: boolean;
  capabilities: ToolCapability[];
  evidence?: ToolCapabilityEvidence[];
};
export type ToolRequirement = {
  capability: ToolCapability;
  name: string;
  necessity: "required" | "conditional";
  condition: string | null;
  sources: ToolProcessSource[];
  status: "unknown" | "supported";
  supportedBy: { toolId: string; toolName: string; evidenceUrls: string[] }[];
  referenceUrls: string[];
  review: string;
};
const sawManual =
  "https://www.dewalt.com/GLOBALBOM/QU/DCS565P1/1/Instruction_Manual/EN/N862094_DCS565.pdf";
const connectorInstructions =
  "https://www.strongtie.com/products/connectors/wood-construction-connectors/technical-notes/connector-holes-fastener-types";
const shelfPinManual =
  "https://www.kregtool.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dw31eb0d3c/manuals/KMA3232_Global.pdf";
const definitions: Record<
  ToolCapability,
  { name: string; review: string; referenceUrls: string[] }
> = {
  "apply-edge-banding": {
    name: "Match an iron and pressing block or roller to the banding",
    review: "Follow the delivered hot-melt instructions and test the finish and bond on matching scrap.",
    referenceUrls: [],
  },
  "trim-edge-banding": {
    name: "Review a flush trimmer for cooled veneer",
    review: "Check access and test the knife or trimmer on scrap from the same panel.",
    referenceUrls: [edgeTrimmer.instructions],
  },
  "drive-16ga-straight-finish-nail": {
    name: "Match the tool to straight 16-ga finish nails",
    review: `${paslodeFinishNails.requirement} ${paslodeFinishNailer.requirement}`,
    referenceUrls: [paslodeFinishNails.specification, paslodeFinishNailer.manual],
  },
  "drill-polycarbonate": {
    name: "Review the polycarbonate drill and bit sizes",
    review: "Use the diameters in the selected panel detail. Check the drill and bit instructions, panel support, chip clearing and access.",
    referenceUrls: [sunliteFastener.installation],
  },
  "drive-five-sixteenths-hex": {
    name: "Review a 5/16 in hex driver for the glazing screws",
    review: "Match the actual fastener and select a driver setup that controls washer compression.",
    referenceUrls: [sunliteFastener.listing],
  },
  "concrete-anchor-bore": {
    name: "Review a ½ in carbide concrete drill setup",
    review: "Match the bit and drill to the substrate and planned hole depth. Confirm tool access, dust controls, and reinforcement locations on site.",
    referenceUrls: [concreteAnchor.instructions],
  },
  "drive-three-quarter-hex": {
    name: "Review a ¾ in hex wrench for anchor seating",
    review: "Check the delivered anchor and fixture stack against the current manufacturer instructions and site detail.",
    referenceUrls: [concreteAnchor.instructions],
  },
  "rectangular-cut-setup": {
    name: "Plan the rectangular through-cut",
    review: "Check the cutter, material, workholding and entry access. Confirm corner fit and the remaining stock before fastening.",
    referenceUrls: [],
  },
  "round-opening-setup": {
    name: "Match the cutter to the round opening",
    review: "Confirm the cutter and bit or blade for the material, diameter, through depth and access. Check backing and fit at any seam. Use the actual tool and accessory instructions.",
    referenceUrls: [],
  },
  "wood-pocket-cut": {
    name: "Review a jigsaw for wood openings",
    review: "Match the actual T-shank blade to the cut radius, material and depth. Confirm entry access, support and blade clearance. The reviewed model uses a separate battery and charger.",
    referenceUrls: [dewaltJigsaw.manual],
  },
  "shelf-pin-layout": {
    name: "Review a 5 mm shelf-pin layout jig",
    review:
      "Review the saved attachment plan's panel datums, matching row heights, exclusions and the actual jig/fence reference. Nominal 32 mm spacing and 37 mm jig-side offsets do not establish installed pin geometry. A tool review alone does not create a hole schedule or confirm that drilling has occurred.",
    referenceUrls: [shelfPinManual],
  },
  "shelf-pin-bit": {
    name: "Review the matched 5 mm bit and depth collar",
    review:
      "The complete jig includes its 5 mm bit/collar; a replacement is optional. Check actual contents, collar setup, panel thickness and deepest brad-point clearance. Resolve pending insertion/bearing measurements in the attachment plan. A tool review alone creates no holes, pin quantities or joints, and a bit/jig does not supply a powered drill.",
    referenceUrls: [shelfPinManual],
  },
  "profile-cut": {
    name: "Review the remaining profile cuts",
    review:
      "Review every geometric face, retained side and access path against the tool's actual angle/capacity limits and the manufacturer's instructions. A generic wood crosscut capability does not establish a miter, bevel or compound setup.",
    referenceUrls: [],
  },
  "cut-insulation": {
    name: "Trim fiberglass batts",
    review: "Use the insulation maker's cutting and handling instructions. Verify the actual cavity width, length, services and appropriate protective equipment.",
    referenceUrls: ["https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/installation-guide/energy-star-installation-instructions-jm-batts-rolls-fg.pdf"],
  },
  "cut-foil": {
    name: "Trim foil and mark folds",
    review: "Use the flat roll layout to measure cuts and folds. Check the delivered foil and choose an appropriate sheet cutting tool.",
    referenceUrls: [cedarbrookFoil.url],
  },
  "staple-foil": {
    name: "Match the foil fastening setup",
    review: "The supplier describes stapling the foil. Confirm the stapler, fasteners, backing and penetration treatment for the chosen sauna assembly.",
    referenceUrls: [cedarbrookFoil.instructions],
  },
  "plastic-cut": {
    name: "Cut the selected plastic panel system",
    review:
      "Use this panel manufacturer's cutting instructions, supported setup and specified blade. A wood saw selection does not establish compatibility with polycarbonate. The modeled kerf is an estimate to verify.",
    referenceUrls: [],
  },
  "pex-cut": {
    name: "Square-cut PEX tubing",
    review: "Use a cutter documented for the selected PEX size. Check the cut is clean and square, and verify end preparation and fitting insertion.",
    referenceUrls: [pexCutter.listing, pexInstallation],
  },
  "pex-insertion-mark": {
    name: "Mark SharkBite Max insertion depths",
    review: "Match the depth gauge to the Max side and the size of each socket. Use a permanent marker and check the seating mark against the fitting instructions.",
    referenceUrls: [waterDepthGauge.listing, maxFittingInstructions],
  },
  "water-pressure-gauge": {
    name: "Water test gauge and isolation equipment",
    review: "Record the gauge’s working limit separately from its scale. Confirm increments, the actual gauge condition and the ratings of equipment included in the isolated section with the installer.",
    referenceUrls: [waterTestManufacturer.url],
  },
  "fixture-hose-wrench": {
    name: "Check wrench access at the fixture hose",
    review: "Use the connector maker’s wrench and tightening instructions for the delivered supply hose. Verify access without straining the push joint.",
    referenceUrls: [waterStop.instructions],
  },
  "sink-tube-cut": {
    name: "Square-cut the sink wall tube",
    review: "Use a suitable plastic pipe cutter or hacksaw and support the wall tube. Verify the mark from the actual dry fit and clean the cut.",
    referenceUrls: [sinkTrap.installation],
  },
  "sink-slip-nut": {
    name: "Check slip-joint access and wrench fit",
    review: "Confirm the delivered nuts and washers, and room for the selected pliers or wrench if needed. Follow the manufacturer’s tightening and leak-check guidance.",
    referenceUrls: [sinkTrap.installation],
  },
  "metal-cut": {
    name: "Shorten the selected metal rod",
    review:
      "Select a tool and blade documented for the actual metal, secure the hollow tube and finish the cut edges as specified. Wood-cutting capability does not cover this operation. Verify the actual kerf.",
    referenceUrls: [],
  },
  "metal-deburr": {
    name: "Deburr the actual metal cut edges",
    review: "Select a method documented for the actual metal and finish; verify the retained cut edges and operating clearance. Wood cutting or metal cutting alone does not document a deburring capability. No tool model is automatically selected.",
    referenceUrls: [],
  },
  "cut-flashing": {
    name: "Cut galvanized drip edge",
    review: "Review aviation snip capacity for the delivered steel and access across the formed profile. Check edge protection, the corner setup and any finish requirements.",
    referenceUrls: [gibraltarDripEdge.instructions, wissSnips.specification],
  },
  "trim-flashing-tape": {
    name: "Cut flexible flashing tape and trim the wall-wrap flap",
    review: "Measure and cut strips on a suitable backing. When trimming the flap, protect the flashing below. Press the membrane evenly onto the prepared wall face with firm hand pressure or a smooth roller.",
    referenceUrls: [flexWrap.instructions, flashingKnife.specification],
  },
  "score-drywall": {
    name: "Score and snap gypsum panels",
    review: "Use a utility knife and a long straightedge or drywall T-square. Check the face orientation and support the sheet before marking and snapping.",
    referenceUrls: [drywallInstallation, flashingKnife.specification],
  },
  "apply-quart-sealant": {
    name: "Apply a bead with a 28 fl oz cartridge gun",
    review: "Check that the gun fits the delivered cartridge. Use a nozzle cutter and seal punch. Test the bead on matching scrap.",
    referenceUrls: [bottomPlateSealant.specification, subfloorAdhesive.specification, quartCartridgeGun],
  },
  "apply-window-sealant": {
    name: "Apply window sealant with a cartridge gun",
    review: "Check that the gun seats the delivered cartridge. Use a blunt tool for the backing rod and check access at the shims and corners.",
    referenceUrls: [openingSilicone.specification],
  },
  "pilot-bit-1-16": {
    name: "Review a 1/16 in pilot bit",
    review:
      "Documented 1/16 in bit capability covers the accessory only; it supplies no powered drill. Confirm the entered user diameter against the actual screws and wood, then review chuck fit, usable flute length, deepest drill-tip depth, clamps and access. A checked bit does not establish a complete drilling setting or installation.",
    referenceUrls: [],
  },
  measure: {
    name: "Measure and mark dimensions",
    review: "Confirm real clearances, stock measurements, and tool accuracy.",
    referenceUrls: [],
  },
  square: {
    name: "Check square and layout angles",
    review:
      "Check actual frame angles during dry fitting; a rectangle in the model is not proof the build is square.",
    referenceUrls: [],
  },
  clamp: {
    name: "Secure workpieces with clamps or a suitable fixture",
    review:
      "Support the work and keep the cut path clear; choose a setup appropriate to the actual tool and stock.",
    referenceUrls: [sawManual],
  },
  "wood-crosscut": {
    name: "Cut stock to length",
    review:
      "Check blade, stock size, supported cutting setup, and the selected saw's documented capacity. No saw model or blade is automatically selected.",
    referenceUrls: [sawManual],
  },
  "wood-angle-crosscut": {
    name: "Crosscut angled ends on lumber",
    review:
      "These saved end faces span the lumber cross-section. Compare the actual blank and workholding orientation to the saw manual's miter, bevel and combined limits. The guide's geometric angles describe the part; machine settings and operation fit still need review.",
    referenceUrls: [],
  },
  "wood-rip": {
    name: "Cut stock or panels to width",
    review:
      "Check the cutting guide, blade, stock thickness, and supported setup. Grain direction and resaw suitability are not inferred from a box model.",
    referenceUrls: [sawManual],
  },
  "drill-pilot": {
    name: "Drill specified pilot or clearance holes",
    review:
      "Pilot drilling is conditional on the exact fastener, wood and installation instructions. Generic drill capability does not establish the required bit diameter, deepest drill-tip depth or actual drilling setup.",
    referenceUrls: [connectorInstructions],
  },
  "drive-t25": {
    name: "Review a T25 screw-driving bit",
    review:
      "A documented T25 accessory covers the drive tip only, not a powered or manual driver function. Confirm the delivered recess and bit, exposed reach after chuck/holder insertion, head seating and actual access; no fit, torque or connection capacity is approved.",
    referenceUrls: ["https://www.grkfasteners.com/grk-products/specialty-fasteners-and-accessories/star-drive-bits"],
  },
  "drive-t15": {
    name: "Review a T15 screw-driving bit",
    review:
      "A documented T15 accessory covers the drive tip only, not a powered or manual driver function. Confirm the delivered recess and bit, exposed reach after chuck/holder insertion, head seating and actual access; no fit, torque or connection capacity is approved.",
    referenceUrls: ["https://www.grkfasteners.com/grk-products/specialty-fasteners-and-accessories/star-drive-bits"],
  },
  "drive-quarter-hex": {
    name: "Review a ¼ in hex connector-screw driver accessory",
    review:
      "The SD9112 reference specifies a ¼ in hex head. Review the actual matching socket/driver accessory, head seating, exposed reach and access separately from the powered or manual screw-driving function. A listed included driver is not ownership or a checked tool selection; no fit, torque or connector capacity is approved.",
    referenceUrls: ["https://www.strongtie.com/strongdrive_exteriorwoodscrews/sd_screw/p/strong-drive-sd-connector-screw"],
  },
  "drive-screw": {
    name: "Drive the specified screws",
    review:
      "Match the bit and driver to the exact fastener. Torque, countersinking and attachment capacity are not inferred.",
    referenceUrls: [],
  },
  "drive-nail": {
    name: "Install the specified nails",
    review:
      "Use a suitable hammer or compatible nailer. Nail-gun collation and connector approval require separate verification.",
    referenceUrls: [connectorInstructions],
  },
  "connector-install": {
    name: "Follow the exact connector installation procedure",
    review:
      "Check the connector's specified holes, fasteners and installation tools. A generic wood screw is not automatically a connector fastener.",
    referenceUrls: [connectorInstructions],
  },
  "ppe-eye": {
    name: "Eye protection appropriate to the operation",
    review:
      "Review the hazards in the tool and material instructions. Check the actual eye protection markings, fit and compatibility with any other protection. Review face protection and respiratory protection separately.",
    referenceUrls: [sawManual],
  },
  "ppe-hearing": {
    name: "Hearing protection for powered operations",
    review:
      "Review the tool instructions, actual exposure and hearing protector fit. A published product rating does not measure the protection received by the wearer.",
    referenceUrls: [sawManual],
  },
  "ppe-dust": {
    name: "Dust control and appropriate respiratory protection",
    review:
      "Check material hazards, tool extraction instructions and exposure conditions; no respirator model is selected here.",
    referenceUrls: [sawManual],
  },
};
function usableEvidence(
  evidence: ToolCapabilityEvidence,
  capability: ToolCapability,
  now: number,
) {
  try {
    const url = new URL(evidence.url),
      reviewed = Date.parse(evidence.reviewedAt);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !!evidence.note.trim() &&
      Number.isFinite(reviewed) &&
      reviewed <= now &&
      evidence.capabilities.includes(capability)
    );
  } catch {
    return false;
  }
}

function hasCurrentOneSixteenthPilot(
  measurement: {
    pilotDiameter: number | null;
    basis: string;
    measuredAt: string | null;
  },
  now: number,
) {
  const measured = Date.parse(measurement.measuredAt ?? "");
  return (
    measurement.pilotDiameter === 1 / 16 &&
    !!measurement.basis.trim() &&
    Number.isFinite(measured) &&
    measured <= now
  );
}

/** Tool/process checklist only: no tools enter material geometry, BOM quantities, pricing, or structural support. */
export function toolChecklist(
  project: Project,
  selectedTools: SelectedTool[] = [],
  now = Date.now(),
) {
  const requirements = new Map<ToolCapability, ToolRequirement>();
  const warnings: string[] = [];
  const add = (
    capability: ToolCapability,
    source: ToolProcessSource,
    necessity: "required" | "conditional" = "required",
    condition: string | null = null,
  ) => {
    let row = requirements.get(capability);
    if (!row) {
      row = {
        capability,
        ...definitions[capability],
        necessity,
        condition,
        sources: [],
        status: "unknown",
        supportedBy: [],
      };
      requirements.set(capability, row);
    }
    if (necessity === "required") {
      row.necessity = "required";
      row.condition = null;
    }
    if (
      !row.sources.some(
        (s) =>
          s.kind === source.kind &&
          s.id === source.id &&
          s.reason === source.reason,
      )
    )
      row.sources.push(source);
  };
  const pieces = project.pieces.filter((piece) => !piece.offcut);
  const construction = pieces.filter((piece) => !isHardware(piece.material));
  const lining = construction.find((piece) => piece.material === cedarbrookLining.materialId);
  if (lining)
    add("drive-16ga-straight-finish-nail", {
      kind: "sauna-lining",
      id: lining.id,
      reason: "Fasten the cedar lining after confirming the actual layer stack and nail locations.",
    }, "conditional", "Applies if you select straight 16-ga collated finish nails.");
  const roof = project.projectCode?.trades.includes("roofing") && project.projectCode.shingleRoof;
  if (roof && roof.dripEdge?.productId) {
    const drip = reviewShingleRoof(project, roof).dripEdge;
    if (drip?.sticks != null && drip.cutToolNeeded)
      add("cut-flashing", {
        kind: "roof-drip-edge", id: gibraltarDripEdge.id,
        reason: "The saved drip edge layout includes partial cuts or corner trim allowances.",
      });
  }
  const subfloorHandNails = new Set(subfloorFasteningReviews(project)
    .filter(({ current, schedule }) => current && schedule === "common-8d").map(({ panelId }) => panelId));
  for (const { panelId, layout } of subfloorReviews(project)) {
    if (layout?.nails.length && !subfloorHandNails.has(panelId)) add("drive-nail", {
      kind: "piece", id: panelId, reason: "Fasten the checked subfloor sheet after confirming the actual attachment schedule.",
    }, "conditional", "Applies if you select a compatible hand-drive nail. Check the actual fastener, access and adhesive instructions.");
  }
  for (const id of subfloorHandNails)
    add("drive-nail", { kind: "piece", id, reason: "Hand-drive the reviewed 8C1 common nails during sheet installation." });
  for (const { record, problem, title } of [...bottomPlateSealReviews(project), ...topPlateSealReviews(project)]) {
    if (!problem) add("apply-quart-sealant", { kind: "piece", id: record.plateId, reason: title });
  }
  for (const { panelId, planCurrent } of subfloorAdhesiveReviews(project)) {
    if (planCurrent) add("apply-quart-sealant", { kind: "piece", id: panelId,
      reason: "Apply subfloor adhesive to the marked support strips before seating and fastening this sheet." });
  }
  if (project.openingFlashings?.some(({ measurements }) => measurements.jambHead || measurements.airSeal)) {
    for (const { plan, title, result, issues } of reviewOpeningFlashings(project).rows) {
      if (!result || issues.length) continue;
      if (result.jambHead)
        add("trim-flashing-tape", { kind: "opening-flashing", id: plan.members.sill,
          reason: `${title} · three jamb and head cuts and a wall-wrap head flap.` });
      if (result.airSeal?.material.id === openingSilicone.id)
        add("apply-window-sealant", { kind: "opening-flashing", id: plan.members.sill,
          reason: `${title} · interior silicone over dry-fitted closed-cell backing.` });
    }
  }
  for (const mount of project.sunliteMounts ?? []) {
    if (!mount.holes.length) continue;
    const source: ToolProcessSource = {
      kind: "sunlite-mount", id: mount.panelId,
      reason: `${partLabel(project, mount.panelId)} · recorded drill diameters ${[...new Set(mount.holes.map(({ diameter }) => formatStockLength(diameter)))].join(", ")}.`,
    };
    add("measure", source);
    add("drill-polycarbonate", source, "conditional", "Resolve review findings before drilling the glazing.");
    add("drive-five-sixteenths-hex", source, "conditional", "Confirm the delivered hardware and washer seating detail.");
  }
  for (const site of project.greenhouseFoundations ?? []) {
    if (!site.anchors?.locations.length) continue;
    const source: ToolProcessSource = {
      kind: "foundation-anchor",
      id: site.entryId,
      reason: "Review drilling and seating for the planned concrete anchor marks.",
    };
    add("measure", source);
    add("concrete-anchor-bore", source, "conditional", "Use the specified anchor method after resolving the slab and fixture details.");
    add("drive-three-quarter-hex", source, "conditional", "Confirm the delivered anchor head and installation method.");
  }
  if (project.sunliteProfilePlan) {
    for (const group of reviewSunliteProfiles(project)?.groups ?? []) {
      if (!group.sticks.some((stock) => stock.cuts.some((cut) => cut.kerf > 0))) continue;
      const source: ToolProcessSource = {
        kind: "glazing-profile",
        id: group.id,
        reason: `Cut the measured ${profileNames[group.id]} lengths with the recorded saw kerf.`,
      };
      add("measure", source);
      add("plastic-cut", source);
      const row = requirements.get("plastic-cut")!;
      row.referenceUrls = [...new Set([...row.referenceUrls, sunliteInstructions])];
    }
  }
  for (const group of reviewEdgeBanding(project)) {
    if (!group.rolls.length) continue;
    const stock = edgeBandingProducts[group.productId];
    const source: ToolProcessSource = {
      kind: "edge-banding",
      id: group.productId,
      reason: `Prepare, apply and trim the ${stock.brand} veneer for the labeled panel edges.`,
    };
    add("measure", source);
    add("apply-edge-banding", source);
    add("trim-edge-banding", source);
    const row = requirements.get("apply-edge-banding")!;
    row.referenceUrls = [...new Set([...row.referenceUrls, stock.listing])];
  }
  for (const plan of project.rodFitPlans ?? []) {
    const fit = reviewRodFit(project, plan.rodId, now);
    if (fit.state !== "measured") continue;
    const everbilt = fit.bay?.rod.material === everbiltClosetRod.materialId;
    const source: ToolProcessSource = {
      kind: "rod-fit",
      id: plan.rodId,
      reason: `Review both flange mounts for ${partLabel(project, plan.rodId)}.`,
    };
    add("measure", source);
    for (const capability of ["drill-pilot", "drive-screw"] as const) {
      add(capability, source, "conditional", "Review the delivered flange hardware, backing, screw depth and actual tool access before mounting.");
      const row = requirements.get(capability)!;
      row.referenceUrls = [...new Set([...row.referenceUrls, everbilt ? everbiltClosetRod.socketListing : rodFlangeInstructions])];
    }
    const { rows } = reviewRodSupports(fit);
    for (const { support, state } of rows) {
      if (state === "stale") continue;
      const bracketSource: ToolProcessSource = {
        kind: "rod-fit",
        id: support.id,
        reason: `Review intermediate bracket position for ${partLabel(project, plan.rodId)}.`,
      };
      add("measure", bracketSource);
      if (state !== "reach-reviewed") continue;
      const mounting = reviewRodBracketMount(project, fit, support);
      const layout = support.mounting;
      const mountedSource = mounting?.state === "checked" && layout ? {
        ...bracketSource,
        reason: `${mounting.holes.marks.length} transferred bracket holes on ${partLabel(project, layout.pieceId)} · entered pilot ${formatStockLength(layout.pilotDiameter)} diameter and ${formatStockLength(layout.pilotDepth)} tip depth.`,
      } : mounting ? {
        ...bracketSource,
        reason: `${bracketSource.reason} Resolve the mounting findings before using the marks.`,
      } : bracketSource;
      const condition = mounting?.state === "checked" && layout
        ? `Verify the delivered bracket and screws. The entered pilot is ${formatStockLength(layout.pilotDiameter)} across and ${formatStockLength(layout.pilotDepth)} to its tip past the wood face. Confirm bit reach and tool access.`
        : mounting
          ? "Resolve the saved bracket mounting conflict before transferring the marks."
          : "Verify the delivered bracket, actual backing, separate fasteners and current mounting instructions for this position.";
      for (const capability of ["drill-pilot", "drive-screw"] as const) {
        add(capability, mountedSource, "conditional", condition);
        const row = requirements.get(capability)!;
        if (!everbilt) row.referenceUrls = [...new Set([...row.referenceUrls, rodIntermediateReference])];
        else if (support.bracketProductId === everbiltRodBracket.productId)
          row.referenceUrls = [...new Set([...row.referenceUrls, everbiltRodBracket.listing])];
      }
      if (mounting?.state === "checked" && layout && Math.abs(layout.pilotDiameter - 1 / 16) < 1e-8)
        add("pilot-bit-1-16", mountedSource, "conditional", condition);
    }
  }
  for (const plan of project.greenhouseLatchPlans ?? []) {
    const review = reviewGreenhouseLatch(project, plan);
    const source: ToolProcessSource = {
      kind: "greenhouse-latch", id: plan.motionId,
      reason: review.state === "checked"
        ? "Everbilt 24417 jamb latch and keeper · 3/16 in wood pilot bit. Transfer the checked hole centers after dry fitting."
        : "Everbilt 24417 jamb latch and keeper · Resolve the closed fit before transferring marks.",
    };
    add("measure", source);
    for (const capability of ["drill-pilot", "drive-screw"] as const) {
      add(capability, source, "conditional", "Verify the delivered screws, bit reach, driver and access on the closed door.");
      const row = requirements.get(capability)!;
      row.referenceUrls = [...new Set([...row.referenceUrls, everbiltLatch.instructions])];
    }
  }
  for (const review of lidHingeReviews(project)) {
    const source: ToolProcessSource = { kind: "hinge-plan", id: review.plan.id,
      reason: `${review.plan.label}: review paired axis and actual transferred mounting holes at moving/fixed members.` };
    add("measure", source);
    add("clamp", source, "conditional", "Dry-fit and secure the actual lid, receiver and hinge while transferring its axis/holes.");
    add("connector-install", source, "conditional", "Review the exact delivered hinge, actual supplied screws/drive, mounting orientation and instructions; a generic wood-screw product does not identify the supplied hinge screws.");
    if (review.state === "stale" || review.state === "conflict") {
      warnings.push(`${review.plan.label}: hinge drilling/drive setup is excluded until stale references or geometric conflicts are resolved; no former drill coordinates are active.`);
      continue;
    }
    if (review.plan.locations.length) {
      const condition = "Only after reviewing the actual supplied screws and drive, transferred wood-entry datums, seated surface-to-tip and deepest pilot-tip measurements, substrate, leaf/head fit, clamps and access. The linked 1/16 in pilot is a reference, not a complete drilling setting.";
      for (const capability of ["drill-pilot", "drive-screw", "ppe-eye"] as const) add(capability, source, "conditional", condition);
      const pilot = requirements.get("drill-pilot")!;
      pilot.referenceUrls = [...new Set([...pilot.referenceUrls, ...getHingeProduct(review.plan.productId)!.sources.filter((s) => s.url.endsWith(".pdf")).map((s) => s.url)])];
      const measuredPilots = review.locations.filter((location) =>
        location.state !== "stale" && location.state !== "conflict" &&
        hasCurrentOneSixteenthPilot(location.location.measurements, now),
      );
      if (measuredPilots.length)
        add("pilot-bit-1-16", {
          ...source,
          reason: `${review.plan.label}: current user-entered 1/16 in pilot diameter at ${measuredPilots.map((location) => location.location.label).join(", ")}; deepest-tip depth and actual screw/bit fit remain separate reviews.`,
        }, "conditional", condition);
    }
  }
  project.hingeStockSources.forEach((stock, index) => {
    if (!stock.cuts.length) return;
    const review = reviewHingeStock(stock), source: ToolProcessSource = { kind: "hinge-stock", id: stock.id,
      reason: `Hinge source ${index + 1}: ${stock.cuts.length} explicit metal-cut interval(s); actual usable length/kerf and retained ends require review.` },
      necessity = review.state === "geometry-reviewed" ? "required" as const : "conditional" as const,
      condition = necessity === "conditional" ? "Resolve the physical source/cut measurements and conflicts before cutting; no wood-cut kerf is assumed." : null;
    add("metal-cut", source, necessity, condition);
    const metalCut = requirements.get("metal-cut")!;
    metalCut.name = "Cut the selected metal hinge or rod stock";
    metalCut.review = "Match the actual metal, finish, blade/tool and supported clamping setup; verify the entered metal-cut kerf. Wood-cutting capability does not cover this operation, and cutting capability alone does not cover deburring.";
    add("metal-deburr", source, necessity, condition);
    add("measure", source); add("clamp", source); add("ppe-eye", source);
    add("ppe-hearing", source, "conditional", "When using powered metal-cutting tools according to their actual instructions and exposure conditions.");
  });
  for (const review of fastenerReviews(project)) {
    if (!review.activePointCount) continue;
    const product = getWoodFastenerProduct(review.plan.productId),
      source: ToolProcessSource = {
        kind: "fastener-plan",
        id: review.plan.id,
        reason: `${review.plan.name}: ${review.activePointCount} explicit provisional locations; ${product?.drive ?? "unresolved"} drive.`,
      },
      condition = `Resolve the actual ${product?.drive ?? "chosen"} bit/driver fit, head seating, material/grain, pilot requirements, deepest drill-tip clearance, clamps and driver access. Generic capability review does not establish exact bit fit, a pilot size, installation or capacity.`;
    add("measure", source);
    for (const capability of ["drive-screw", "drill-pilot", "clamp", "ppe-eye"] as const)
      add(capability, source, "conditional", condition);
    if (
      product && review.state !== "stale" &&
      review.locations.some((location) => location.includedInDemand &&
        location.state !== "stale" && location.state !== "conflict")
    )
      add(product.drive === "T25" ? "drive-t25" : "drive-t15", {
        ...source,
        reason: `${review.plan.label}: current selected ${product.name} specifies ${product.drive}; review the matching drive accessory separately from the driver and pilot setup. No drive is inferred from historical or stale measurements.`,
      }, "conditional", condition);
    if (
      review.state !== "stale" &&
      hasCurrentOneSixteenthPilot(review.plan.measurements, now) &&
      review.locations.some((location) => location.includedInDemand &&
        location.state !== "stale" && location.state !== "conflict")
    )
      add("pilot-bit-1-16", {
        ...source,
        reason: `${review.plan.label}: current user-entered 1/16 in pilot diameter for active included locations; no diameter is inferred from nominal screw length or historical measurements.`,
      }, "conditional", condition);
  }
  for (const { section, plan, rows } of floorHangerPlanReviews(project)) {
    const count = rows.filter(({ issue }) => !issue).length;
    if (!count) continue;
    const hanger = floorHangers[plan.productId];
    const source: ToolProcessSource = {
      kind: "floor-hanger-plan",
      id: section.id,
      reason: `${section.name}: ${count} ${hanger.model} ends with modeled clearance. The reference rim and joist screws use a ¼ in hex head.`,
    };
    add("measure", source);
    add("connector-install", source, "conditional", floorHangerScope);
    add("drive-screw", source, "conditional", floorHangerScope);
    add("drive-quarter-hex", source, "conditional", "Confirm access for the ¼ in hex accessory at the rim and angled joist entries.");
    const installation = requirements.get("connector-install")!;
    installation.referenceUrls = [...new Set([...installation.referenceUrls, hanger.url, floorHangerReport])];
  }
  for (const review of connectorReviews(project, now)) {
    const schedule = getConnectorSchedule(review.plan.scheduleId);
    if (!review.activeConnectorCount || !review.sourceCurrent || !schedule ||
        review.state === "stale" || review.state === "conflict") {
      warnings.push(`${review.plan.label}: the whole connector schedule's driving/drilling setup is excluded while ${review.state}; former entry coordinates or measurements supply no current tool requirements.`);
      continue;
    }
    const source: ToolProcessSource = {
      kind: "connector-plan",
      id: review.plan.id,
      reason: `${review.plan.label}: one explicit A21Z with ${schedule.name}; four wood-entry slots are a reference quantity, not manufactured hole positions or installed fasteners.`,
    }, condition = "Review the delivered exact A21Z and the complete chosen fastener schedule, actual metal-hole/head fit, measured wood entries, seating/depth, member/grain/edge constraints, corrosion exposure, clamps and access. A reviewed tool function does not approve this connector or create an installation.";
    add("measure", source);
    add("square", source);
    add("clamp", source, "conditional", condition);
    add("connector-install", source, "conditional", condition);
    add("ppe-eye", source, "conditional", condition);
    const installation = requirements.get("connector-install")!;
    installation.referenceUrls = [...new Set([
      ...installation.referenceUrls,
      ...getConnectorProduct(review.plan.productId)!.sources.map((proof) => proof.url),
      ...schedule.sources.map((proof) => proof.url),
    ])];
    if (schedule.drive === "quarter-hex") {
      add("drive-screw", source, "conditional", condition);
      add("drive-quarter-hex", source, "conditional", condition + " Review the ¼ in hex accessory separately from the driver function; a listed included driver is not ownership or automatic capability credit.");
    } else {
      add("drive-nail", source, "conditional", condition + " Generic hammer support covers nail-driving function only; it does not establish Simpson connector fit, correct seating, pneumatic collation or nailer approval.");
    }
    const enteredPilots = review.entries.filter((row) =>
      row.state !== "stale" && row.state !== "conflict" &&
      (row.entry.measurements.pilotDiameter !== null || row.entry.measurements.pilotDepth !== null));
    if (schedule.drive === "quarter-hex" || enteredPilots.length)
      add("drill-pilot", source, "conditional", "Only if the exact delivered fastener/member instructions or an explicit pilot proposal call for drilling. Review actual diameter/deepest-tip depth and tool setup; this schedule supplies no universal pilot rule. " + condition);
    const measuredPilots = enteredPilots.filter((row) =>
      hasCurrentOneSixteenthPilot(row.entry.measurements, now));
    if (measuredPilots.length)
      add("pilot-bit-1-16", {
        ...source,
        reason: `${review.plan.label}: current user-entered 1/16 in pilot diameter at ${measuredPilots.map((row) => row.entry.label).join(", ")}; no size is inferred from A21Z or fastener nominal length.`,
      }, "conditional", condition);
    add("ppe-hearing", source, "conditional", "When using powered drivers, drills or nailers, according to their actual instructions and exposure conditions. No powered-tool, nailer or protection rating is selected.");
  }
  for (const review of attachmentReviews(project)) {
    if (!review.activePinCount) {
      warnings.push(
        `${review.plan.name}: attachment plan ${review.plan.id} is ${review.state}; its pin-drilling setup is excluded until the stale references or geometric conflicts are resolved.`,
      );
      continue;
    }
    const source: ToolProcessSource = {
      kind: "attachment-plan",
      id: review.plan.id,
      reason: `Review the saved 5 mm shelf-pin intent ${review.plan.name} (${review.activePinCount} points; ${review.state}). Planned points do not prove drilled holes or installed supports.`,
    };
    const condition =
      "Before executing the chosen shelf-pin plan, resolve its pending measurements/conflicts and verify the actual drill, jig, bit/collar and work setup. This review does not record installation.";
    add("shelf-pin-layout", source, "conditional", condition);
    add("shelf-pin-bit", source, "conditional", condition);
    add("measure", source);
    add("clamp", source, "conditional", condition);
    add(
      "drill-pilot",
      source,
      "conditional",
      condition +
        " Review a separately documented powered drill; generic pilot-drilling support does not establish a 5 mm blind-hole depth or bit/collar fit. The jig and replacement bit cannot satisfy this drill requirement.",
    );
    add("ppe-eye", source, "conditional", condition);
    add(
      "ppe-hearing",
      source,
      "conditional",
      condition +
        " Follow actual powered-tool instructions and exposure conditions.",
    );
    add(
      "ppe-dust",
      source,
      "conditional",
      condition +
        " Review the panel material, dust control and actual drilling exposure.",
    );
  }
  for (const review of restraintReviews(project)) {
    if (!review.activeKitCount) {
      if (review.plan.locations.length)
        warnings.push(
          `${review.plan.name}: the restraint setup is excluded while ${review.state}.`,
        );
      continue;
    }
    const source: ToolProcessSource = {
      kind: "restraint-plan",
      id: review.plan.id,
      reason: `Review the explicit furniture restraint intent ${review.plan.name}. A tool selection does not resolve the receiver, actual wall stud or installation schedule.`,
    };
    const condition =
      "Only after reviewing the delivered exact kit instructions, actual fasteners/drive, required pilot sizes, wood-stud location, service hazards and access. These dimensions and the installation method remain unresolved; no tool fit is inferred.";
    add("measure", source);
    for (const capability of [
      "drill-pilot",
      "drive-screw",
      "connector-install",
      "ppe-eye",
    ] as const)
      add(capability, source, "conditional", condition);
    warnings.push(
      `${review.plan.name}: stud locating, concealed-service checks, exact driver/pilot fit and the receiver-to-wall connection chain require separate evidence; ordinary measuring and drill capabilities do not qualify them.`,
    );
  }
  if (project.workZone)
    add("measure", {
      kind: "work-zone",
      id: project.id,
      reason: "Confirm the configured work-zone dimensions on site.",
    });
  for (const piece of construction) {
    const source: ToolProcessSource = {
      kind: "piece",
      id: piece.id,
      reason: `Lay out and dry-fit ${piece.name}.`,
    };
    add("measure", source);
    add("square", source);
    add(
      "clamp",
      source,
      "conditional",
      "When securing parts for cutting or assembly; use a fixture suited to the operation.",
    );
  }
  const lineage = inspectCutStock(project);
  if (lineage.invalid.length)
    warnings.push(
      "Some cut-source records are inconsistent. Verify their cutting operations before selecting tools.",
    );
  const labels = new Map(
    ensurePartLabels(project).partLabels.map(({ partId, label }) => [
      partId,
      label,
    ]),
  );
  const currentWaterRuns = new Set((project.waterRuns ?? []).filter((run) => reviewWaterRun(project, run).measured).map(({ id }) => id));
  for (const run of project.waterRuns ?? []) {
    if (currentWaterRuns.has(run.id)) add("water-pressure-gauge", {
      kind: "piece", id: run.pipeId,
      reason: `Record the installed section containing ${run.name} before concealing this line.`,
    }, "conditional", "Confirm the tested section, installer procedure and local inspection requirements.");
  }
  for (const drain of project.sinkDrains ?? []) {
    if (!reviewSinkDrain(project, drain).layout) continue;
    add("sink-slip-nut", { kind: "piece", id: drain.bodyId, reason: drain.name },
      "conditional", "When the installed slip nuts need a tool to seat them.");
  }
  for (const fitting of project.waterFittings ?? []) {
    const { layout } = reviewWaterFitting(project, fitting);
    if (layout) add("pex-insertion-mark", {
      kind: "piece", id: fitting.pieceId,
      reason: `${layout.product.model} · ${layout.positions.length} pipe ends to seat and check.`,
    });
  }
  for (const stop of project.waterStops ?? []) {
    if (!reviewWaterStop(project, stop).layout) continue;
    add("pex-insertion-mark", {
      kind: "piece", id: stop.pieceId, reason: `${stop.name} · Mark the valve insertion depth.`,
    });
    add("fixture-hose-wrench", { kind: "piece", id: stop.pieceId, reason: stop.name },
      "conditional", "When the selected supply-hose instructions call for wrench tightening.");
  }
  for (const piece of project.pieces) {
    const m = material(piece.material);
    for (const opening of piece.offcut ? [] : (piece.roundOpenings ?? [])) {
      const waterBore = opening.source && "waterRunId" in opening.source;
      if (opening.source && "waterRunId" in opening.source && !currentWaterRuns.has(opening.source.waterRunId)) continue;
      const source: ToolProcessSource = {
        kind: "piece",
        id: piece.id,
        reason: `${labels.get(piece.id)} · ${m.name} · ${formatStockLength(opening.diameter)} opening through ${formatStockLength(piece.size[opening.axis])} of stock.`,
      };
      add("round-opening-setup", source);
      if (m.wood && !waterBore)
        add(
          "wood-pocket-cut",
          source,
          "conditional",
          "If the chosen method uses a jigsaw for the wood opening.",
        );
    }
    for (const opening of piece.offcut ? [] : (piece.rectangularOpenings ?? [])) {
      add("rectangular-cut-setup", {
        kind: "piece",
        id: piece.id,
        reason: `${labels.get(piece.id)} · ${m.name} · ${opening.spans.map(formatStockLength).join(" × ")} cut through ${formatStockLength(piece.size[opening.axis])} of stock.`,
      });
    }
    if (m.orderRollWidth) {
      const source: ToolProcessSource = { kind: "piece", id: piece.id, reason: `Fit ${labels.get(piece.id)} · ${piece.name} using the flat roll layout and supplier instructions.` };
      add("cut-foil", source);
      add("staple-foil", source, "conditional", "Verify the backing and approved fastening setup.");
      continue;
    }
    if (m.shape === "pedestal-bench-envelope") {
      add("drive-screw", { kind: "piece", id: piece.id, reason: `Assemble ${labels.get(piece.id)} · ${piece.name}. Match the driver to the supplied kit screws.` }, "conditional", "Confirm screw heads, driver access and kit instructions.");
      continue;
    }
    if (!m.cuttable) continue;
    const source: ToolProcessSource = {
      kind: "piece",
      id: piece.id,
      reason: `Cut ${labels.get(piece.id)} · ${piece.name} from ${m.name}.`,
    };
    const hasValidSource =
      !!piece.cutStock && lineage.valid.has(piece.cutStock.id);
    if (isDrywall(piece.material)) {
      const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b);
      if (!piece.offcut && orientedStockSize(piece).some((size, axis) => axis > 0 && size < stock[axis] - 0.001)) {
        add("score-drywall", source, hasValidSource ? "required" : "conditional");
        add("measure", source);
      }
      continue;
    }
    if (isBatt(piece.material)) {
      const stock = [...m.size].sort((a, b) => a - b);
      const blank = orientedStockSize(piece);
      if (piece.cutPlanes.length || blank.some((d, i) => d < stock[i] - 0.001)) {
        add("cut-insulation", source);
        if (piece.material === saunaCeilingBatt.materialId) {
          const row = requirements.get("cut-insulation")!;
          row.referenceUrls = [...new Set([...row.referenceUrls, saunaCeilingBatt.instructions])];
          row.review = "Confirm the tool and setup for the 9½ in batt thickness with the insulation maker. Check actual cavity dimensions, services and protective equipment.";
        }
        add("ppe-eye", source);
        add("ppe-dust", source, "conditional", "Follow the insulation manufacturer's handling instructions.");
      }
      continue;
    }
    let hasProfile = false;
    if (piece.cutPlanes.length) {
      const { faces } = cutInstructions(piece, {
        lineageStatus: hasValidSource ? "validated" : "unverified",
      });
      hasProfile = faces.length > 0;
      for (const face of faces) {
        const lumberEnd = m.wood && m.stockKind === "linear" &&
          face.spansStockCrossSection;
        const capability = lumberEnd
          ? face.kind === "square-end" ? "wood-crosscut" : "wood-angle-crosscut"
          : "profile-cut";
        add(capability, {
          ...source,
          reason: `${source.reason} Profile face ${face.planeIndex + 1} · ${face.axis} ${face.side} · ${Math.round(face.angleFromSquare * 100) / 100}° from square.`,
        });
      }
    }
    if (m.id === sinkTrap.id) continue;
    if (m.id === sinkTrap.tube) {
      if (piece.size[1] < (piece.cutStock?.size[1] ?? m.size[1]) - 0.001) {
        add("sink-tube-cut", source, piece.cutStock ? "required" : "conditional");
        add("measure", source);
        add("ppe-eye", source);
      }
      continue;
    }
    if (!m.wood) {
      const size = [...piece.size].sort((a, b) => a - b),
        stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b);
      if (
        (piece.cutStock && m.shape !== "glazing-envelope") ||
        hasProfile ||
        size.some((v, i) => v < stock[i] - 0.001)
      ) {
        add(
          isPexPipe(m.id) ? "pex-cut" : m.shape === "tube-envelope" ? "metal-cut" : "plastic-cut",
          source,
          piece.cutStock ? "required" : "conditional",
          piece.cutStock
            ? null
            : "Confirm the dimensional cut schedule and the selected material's instructions.",
        );
        if (m.shape === "tube-envelope" && !isPexPipe(m.id)) {
          if (m.id === everbiltClosetRod.materialId) {
            const row = requirements.get("metal-cut")!;
            row.referenceUrls = [...new Set([...row.referenceUrls, everbiltClosetRod.listing])];
          }
          add("metal-deburr", source,
            piece.cutStock ? "required" : "conditional",
            piece.cutStock ? null : "Review the actual metal, finish, cut edges and file access before shortening this rod; its hollow wall thickness is not inferred.");
          add("measure", source);
          add("clamp", source);
          add("ppe-eye", source);
        }
      }
      continue;
    }
    if (piece.cutStock) {
      const original = piece.cutStock.size;
      const axes = stockAxes(piece, original);
      for (const [axis, capability] of [
        [axes.length, "wood-crosscut"],
        [axes.width, "wood-rip"],
        [axes.thickness, null],
      ] as const)
        if (
          piece.size[axis] < original[axis] - 0.001 ||
          piece.cutStock.offset[axis] > 0.001
        ) {
          if (!capability) {
            warnings.push(`${source.reason} A thickness change is recorded. Review a suitable process for the actual stock; the rip and crosscut checklist does not cover it.`);
            continue;
          }
          add(
            capability,
            source,
            hasValidSource ? "required" : "conditional",
            hasValidSource
              ? null
              : "Confirm the inconsistent cut-source record and intended cutting direction.",
          );
        }
    } else {
      // Compare the blank with the placed profile to avoid treating a factory
      // interlocking edge as a planned rip.
      const stock = [...m.size].sort((a, b) => a - b),
        size = orientedStockSize(piece);
      if (size[2] < stock[2] - 0.001) {
        add(
          "wood-crosscut",
          source,
          "conditional",
          "The modeled part is smaller than its stock length; verify its cutting orientation and schedule.",
        );
      }
      if (size[1] < stock[1] - 0.001) {
        add(
          "wood-rip",
          source,
          "conditional",
          "The modeled cross-section is smaller than stock; verify whether this is a width cut or a different orientation/product.",
        );
      }
      if (size[0] < stock[0] - 0.001)
        warnings.push(
          `${piece.name}: modeled thickness differs from stock. Confirm an appropriate product or cutting process; a saw's resaw capability is not assumed.`,
        );
    }
  }
  const cutHistory = project.history.filter((event) =>
    /^Cut\b/i.test(event.message),
  );
  const unknownCutHistory = cutHistory.filter(
    (event) =>
      !project.pieces.some(
        (piece) =>
          piece.cutStock &&
          lineage.valid.has(piece.cutStock.id) &&
          event.message.startsWith(`Cut ${piece.name} to `),
      ),
  );
  if (unknownCutHistory.length) {
    for (const event of unknownCutHistory)
      for (const capability of ["wood-crosscut", "wood-rip"] as const)
        add(
          capability,
          {
            kind: "history",
            id: event.id,
            reason:
              "A recorded cut has no recoverable source-axis information.",
          },
          "conditional",
          "Review the recorded cut to identify its actual direction and tool setup.",
        );
  }
  {
    const cutSources = [...requirements.values()]
      .filter(
        (r) => ([
          "wood-crosscut", "wood-angle-crosscut", "wood-rip", "profile-cut",
          "plastic-cut", "metal-cut", "pex-cut",
        ] as ToolCapability[]).includes(r.capability),
      )
      .flatMap((r) => r.sources);
    for (const source of cutSources) {
      add("measure", source);
      add("clamp", source);
      add("ppe-eye", source);
      add(
        "ppe-hearing",
        source,
        "conditional",
        "When using powered cutting tools, according to their instructions and exposure conditions.",
      );
      add(
        "ppe-dust",
        source,
        "conditional",
        "When cutting creates dust; check the material, extraction setup, and exposure conditions.",
      );
    }
  }
  const fastening = (
    source: ToolProcessSource,
    kind: "screw" | "nail" | "bracket",
    necessity: "required" | "conditional",
  ) => {
    const condition =
      necessity === "conditional"
        ? "Placed hardware has no recorded installation at a joint; confirm how it will be used."
        : null;
    if (kind === "screw") {
      add("drive-screw", source, necessity, condition);
      add(
        "drill-pilot",
        source,
        "conditional",
        "Only where the exact fastener/material or connector instructions require pilot or clearance holes.",
      );
    } else if (kind === "nail") add("drive-nail", source, necessity, condition);
    else add("connector-install", source, necessity, condition);
    add("measure", source);
    add("ppe-eye", source, necessity, condition);
    if (kind !== "bracket")
      add(
        "ppe-hearing",
        source,
        "conditional",
        "When using powered drivers or nailers, according to their instructions and exposure conditions.",
      );
  };
  for (const joint of project.joints) {
    const a = project.pieces.find((piece) => piece.id === joint.a),
      b = project.pieces.find((piece) => piece.id === joint.b);
    const source: ToolProcessSource = {
      kind: "joint",
      id: joint.id,
      reason: `Install ${joint.quantity} ${joint.kind} item(s) at ${a?.name ?? "missing part"} → ${b?.name ?? "missing part"}.`,
    };
    fastening(source, joint.kind, "required");
    if (
      hardwareForJoint(joint)?.id === "connector-screw" ||
      hardwareForJoint(joint)?.connectorFastener
    )
      add("connector-install", source);
  }
  for (const piece of pieces.filter((p) => isHardware(p.material))) {
    const source: ToolProcessSource = {
      kind: "piece",
      id: piece.id,
      reason: `Review installation of placed ${piece.name}.`,
    };
    fastening(
      source,
      material(piece.material).stockKind === "connector"
        ? "bracket"
        : piece.material === "nail" ||
            material(piece.material).fastenerType === "nail"
          ? "nail"
          : "screw",
      "conditional",
    );
    if (
      piece.material === "connector-screw" ||
      material(piece.material).connectorFastener
    )
      add(
        "connector-install",
        source,
        "conditional",
        "Confirm the exact connector and its installation instructions.",
      );
  }
  for (const requirement of requirements.values()) {
    if ((requirement.capability === "drill-pilot" || requirement.capability === "connector-install") &&
        requirement.sources.length && requirement.sources.every((source) => source.kind === "hinge-plan"))
      requirement.referenceUrls = [...getHingeProduct("everbilt-29256-continuous-hinge")!.sources.filter((source) => source.url.endsWith(".pdf")).map((source) => source.url)];
    requirement.supportedBy = selectedTools
      .filter(
        (tool) =>
          tool.checked && tool.capabilities.includes(requirement.capability),
      )
      .flatMap((tool) => {
        const evidenceUrls = [
          ...new Set(
            (tool.evidence ?? [])
              .filter((e) => usableEvidence(e, requirement.capability, now))
              .map((e) => e.url),
          ),
        ];
        return evidenceUrls.length
          ? [{ toolId: tool.id, toolName: tool.name, evidenceUrls }]
          : [];
      });
    if (requirement.supportedBy.length) requirement.status = "supported";
  }
  const result = toolCapabilities.flatMap((capability) =>
    requirements.has(capability) ? [requirements.get(capability)!] : [],
  );
  return {
    requirements: result,
    warnings: [...new Set(warnings)],
    coverage: {
      required: result.filter((r) => r.necessity === "required").length,
      supportedRequired: result.filter(
        (r) => r.necessity === "required" && r.status === "supported",
      ).length,
      unknownRequired: result.filter(
        (r) => r.necessity === "required" && r.status === "unknown",
      ).length,
      conditional: result.filter((r) => r.necessity === "conditional").length,
    },
    note: "Capability evidence supports a process checklist, not operating capacity, safe setup, ownership, stock availability, pricing, or construction approval. Review the exact tool, blade/bit, material and operation before use.",
  };
}
