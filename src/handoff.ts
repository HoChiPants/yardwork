import { bom, hardwareForJoint, inspectCutStock, projectPricingCoverage, stockOnHand } from "./engine";
import { retailerName } from "./retailers";
import { purchaseUnitLabel } from "./purchaseUnits";
import type { StoreProductLocation } from "./storeProductLocation";
import { shoppingOfferForMaterial } from "./retailerCatalog";
import { format, material, type MaterialId, type Project } from "./model";
import { suppliesMarkdown, supplyRows } from "./supplies";
import { attachmentPurchaseSummaries } from "./attachmentPurchases";
import { formatPricedSubtotal, pricingCoverageText } from "./pricing";
import { hingePurchaseAllocations } from "./hinges";
import { hingePurchaseSummary } from "./hingePurchases";
import { connectorPurchaseSummary } from "./connectorPurchases";
import { rodSocketPurchases } from "./rodFits";
import { homeDepotAssemblyPurchaseReview, homeDepotPurchaseNeeds, homeDepotStockMatch, homeDepotToolReview } from "./handoffPurchases";
import { rimFoam, rimFoamPurchasePurpose } from "./rimAirSealReference";
import { reviewRimAirSeals } from "./rimAirSeals";
import { valleyPurchasePurpose, weatherWatch } from "./roofValleyReference";
import { reviewRoofValleys } from "./roofValleys";
const clean = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
const ventPurchaseReview = {
  name: "Sauna ventilation",
  reason: "Confirm compatible ducts, grilles, the adjustable intake valve and termination after reviewing the wall marks and route.",
};

export type HomeDepotPurchaseItem = {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  productId: string;
  url: string;
  source: { kind: "stock"; id: MaterialId } | { kind: "supply"; id: string };
  snapshot?: { available: number; checkedAt: string; price: number; location?: StoreProductLocation } | null;
  isTool?: boolean;
  suggested?: boolean;
};

function placedAndRecorded(project: Project, id: string) {
  const physicalUnits = project.pieces.filter((piece) => piece.material === id).length;
  const recordedUnits = project.joints
    .filter((joint) => hardwareForJoint(joint)?.id === id)
    .reduce((sum, joint) => sum + joint.quantity, 0);
  return physicalUnits && recordedUnits ? { physicalUnits, recordedUnits } : null;
}

/** Detailed checklist for the builder, including items outside the retailer list. */
function formatHandoff(project: Project): string {
  const rows = bom(project),
    supplies = supplyRows(project),
    onHand = stockOnHand(rows),
    pricing = projectPricingCoverage(project, rows, supplies),
    oversized = rows.flatMap((r) => r.oversizedParts),
    cutSources = inspectCutStock(project).invalid,
    ventLayout = project.retailer === "home-depot" && !!project.saunaVentilationPlans?.length,
    plannedNeeds = project.retailer !== "lowes" ? homeDepotPurchaseNeeds(project, rows, supplies) : [],
    assemblyReview = project.retailer !== "lowes" ? homeDepotAssemblyPurchaseReview(project) : null,
    supplyQuestions = supplies.some((r) => r.unresolved),
    unresolvedHardware = project.joints.filter(
      (joint) => !hardwareForJoint(joint),
    ),
    possibleDuplicates = rows.flatMap((row) => {
      const duplicates = placedAndRecorded(project, row.id);
      return duplicates ? [{ materialId: row.id, ...duplicates }] : [];
    });
  const lines = [
    `Project: ${clean(project.name)}`,
    `Retailer: ${retailerName(project.retailer)}`,
    `Store: ${clean(project.store) || "not selected"} | ZIP: ${project.zip}`,
    "",
    oversized.length ||
    unresolvedHardware.length ||
    possibleDuplicates.length ||
    cutSources.length ||
    supplyQuestions || plannedNeeds.length || ventLayout || assemblyReview?.incomplete || pricing.status === "partial"
      ? "INCOMPLETE MATERIAL LIST — resolve the part, hardware, price and quantity questions below before ordering."
      : "MATERIAL LIST FOR REVIEW",
    "",
    "PRICING COVERAGE",
    formatPricedSubtotal(pricing),
    pricingCoverageText(pricing),
    pricing.scope,
  ];
  if (assemblyReview?.scopeNotes.length)
    lines.push("", "BUILD SYSTEMS TO REVIEW",
      ...assemblyReview.scopeNotes.map((note) => `- ${clean(note)}`));
  if (assemblyReview?.connections.length)
    lines.push("", "ASSEMBLY CONNECTIONS TO REVIEW",
      "These findings identify hardware decisions to review against the actual parts. Purchase quantities come from the stock and hardware lines below.",
      ...assemblyReview.connections.map(({ title, detail }) => `- ${clean(title)} · ${clean(detail)}`));
  lines.push("", "PURCHASE STOCK UNITS",
    "Use the whole-stock quantities below. Cut pieces and offcuts are already accounted for; do not add them again.", "");
  for (const row of rows) {
    if (!row.quantity || row.supplier) continue;
    const m = material(row.id);
    lines.push(
      `- ${row.quantity} ${m.unit}${row.quantity === 1 || m.unit === "each" ? "" : "s"} — ${m.name} — ${m.subtitle}`,
    );
    if (row.packCount > 1)
      lines.push(
        `  ${row.physicalStockUnits} individual stock items required; ${row.packCount} per purchase unit; ${row.purchasedStockUnits} supplied, ${row.surplusStockUnits} spare. Stock/cut layouts count individual items, not packs.`,
      );
    if (row.inventory) {
      lines.push(
        `  Product: ${clean(row.inventory.name)} | ${project.retailer === "lowes" ? "Product number" : "Internet number"}: ${row.inventory.internetNumber}`,
        `  ${row.inventory.url}`,
        `  User-recorded snapshot: ${row.inventory.available} available at store ${clean(row.inventory.store)}, ZIP ${row.inventory.zip}; checked ${row.inventory.checkedAt}. Confirm current stock.`,
      );
    } else {
      const reference = shoppingOfferForMaterial(m, project.retailer);
      if (reference)
        lines.push(
          `  ${reference.suggested ? "Suggested regional listing" : "Reviewed product reference"}: ${reference.offer.productId} | model ${reference.offer.retailerModel ?? "see listing"}`,
          `  ${reference.offer.url}`,
          ...(reference.suggested ? ["  Confirm grade, species and treatment at your store."] : []),
          "  Reference specifications only. Current price and store availability are unverified.",
        );
      else
        lines.push(
          m.productReference
            ? "  No reviewed current offer for this exact modeled variant at the selected retailer. Choose a compatible sourced product before ordering."
            : "  Exact product match and availability are unverified. Match the listed stock dimensions and purchase unit.",
        );
    }
  }
  if (!rows.some((r) => r.quantity))
    lines.push(onHand.length ? "No additional stock units to buy from the current takeoff." : "No fitting stock units have been calculated.");
  if (onHand.length) {
    lines.push("", "STOCK ON HAND — credited in the purchase quantities",
      ...onHand.map(({ name, quantity }) => `- ${quantity} ${quantity === 1 ? "source" : "sources"} — ${name}`));
  }
  const supplierRows = rows.filter((row) => row.quantity && row.supplier);
  if (supplierRows.length) {
    lines.push("", "DIRECT SUPPLIER PURCHASES — get current pricing and availability from the supplier");
    for (const row of supplierRows) {
      const m = material(row.id);
      const supplier = row.supplier!;
      lines.push(
        `- ${row.quantity} ${purchaseUnitLabel(m.unit, row.quantity)} — ${supplier.seller} ${supplier.productCode} — ${m.name}`,
        m.orderRollWidth
          ? `  Request a ${m.orderRollWidth} in wide roll with the quoted length. Review delivered segment lengths against the cut layout.`
          : `  ${row.physicalStockUnits} individual stock items required; ${row.packCount} per purchase unit; ${row.surplusStockUnits} spare.`,
        `  ${supplier.url}`,
      );
    }
  }
  if (oversized.length) {
    lines.push(
      "",
      "UNRESOLVED PARTS — excluded from the purchase quantities and cost estimate",
    );
    for (const piece of oversized)
      lines.push(
        `- ${clean(piece.name)}: ${piece.size.map(format).join(" × ")} — ${material(piece.material).name}. Needs a suitable stock product or revised dimensions.`,
      );
  }
  if (cutSources.length) {
    lines.push(
      "",
      "CUT SOURCE QUESTIONS — shared-stock grouping disabled; separate-part totals used",
    );
    for (const source of cutSources)
      lines.push(
        `- ${clean(project.pieces.find((piece) => piece.id === source.pieceId)?.name ?? "Cut stock")}: ${source.detail} Recreate or correct the source before ordering.`,
      );
  }
  if (unresolvedHardware.length) {
    lines.push(
      "",
      "UNRESOLVED HARDWARE — excluded from purchase quantities and cost estimate",
    );
    for (const joint of unresolvedHardware) {
      const a = project.pieces.find((piece) => piece.id === joint.a);
      const b = project.pieces.find((piece) => piece.id === joint.b);
      lines.push(
        `- ${joint.quantity} × ${joint.length} in ${joint.kind}: ${clean(a?.name ?? "missing part")} → ${clean(b?.name ?? "missing part")}. Choose an exact matching catalog hardware size/type; no substitute has been counted.`,
      );
    }
  }
  if (possibleDuplicates.length) {
    lines.push(
      "",
      "POSSIBLE HARDWARE DOUBLE COUNTING — confirm before ordering",
      "Placed hardware parts and recorded connection quantities are both included. They have no shared item identity, so this list cannot tell whether they represent the same physical items. Remove a duplicate record, or confirm they are additional items.",
    );
    for (const item of possibleDuplicates)
      lines.push(
        `- ${material(item.materialId).name}: ${item.physicalUnits} placed item(s) + ${item.recordedUnits} item(s) specified by connections. Current purchase total includes both; no automatic deduction has been made.`,
      );
  }
  if (project.supplies.length) lines.push(suppliesMarkdown(project));
  if (plannedNeeds.length) {
    lines.push("", "PURCHASES STILL TO SELECT FROM THE PLAN");
    for (const need of plannedNeeds) {
      const quantity = need.missing !== null
        ? ` ${need.quantityText} to select.`
        : need.required !== null ? " Check combined quantity." : "";
      lines.push(`- ${clean(need.name)} · ${need.basis}.${quantity}${need.issue ? ` ${need.issue}` : ""}`);
    }
  }
  if (project.retailer !== "lowes") {
    const { required, conditional } = homeDepotToolReview(project);
    if (required.length)
      lines.push("", "TOOL CAPABILITIES TO CHECK",
        "Review the tools you already have or add needed tools from the Yardwork Tools tab.",
        ...required.map((tool) => `- ${tool.name}`));
    if (conditional.length)
      lines.push("", "TOOLS TO CHECK FOR THE CHOSEN METHOD",
        ...conditional.map(({ name, condition }) => `- ${clean(name)}${condition ? ` · ${clean(condition)}` : ""}`));
  }
  const sockets = rodSocketPurchases(project);
  if (sockets.needed || sockets.selected)
    lines.push("", "EVERBILT CLOSET ROD SOCKETS",
      `${sockets.needed} end-socket pairs planned · ${sockets.selected} selected · ${sockets.missing} missing. One open and one closed socket per pair. Verify delivered fit and any intermediate supports and fasteners.`);
  if (project.lidHingePlans.length || project.hingeStockSources.length) {
    const comparison = hingePurchaseSummary(project, hingePurchaseAllocations(project));
    lines.push("", "PLANNED HINGE SOURCES — comparison only; selected supply rows above are the purchase quantities",
      `${comparison.requiredHinges} distinct physical hinge sources allocated; ${comparison.selectedHinges} whole hinges selected; ${comparison.shortfallHinges} missing. Multiple retained segments from one source do not add purchase units.`,
      "Unallocated or stale hinge plans do not establish complete demand. Supplied screws are not credited as generic fastener purchases. Entered axes and cut remnants are installation records, not extra shopping lines.", ...comparison.warnings);
  }
  if (project.attachmentPlans.length) {
    lines.push(
      "",
      "PLANNED SHELF SUPPORTS — comparison only; selected supply rows above are the purchase quantities",
      "No tool-kit pins or on-hand stock are credited. Geometry, fit and capacity remain separate reviews.",
    );
    for (const comparison of attachmentPurchaseSummaries(project)) {
      lines.push(`${clean(comparison.productName)}: ${comparison.plannedPins} included planned pins; ${comparison.requiredPacks} × ${comparison.pinsPerPack}-pin packs required by count; ${comparison.selectedPacks} packs already selected; ${comparison.shortfallPacks} missing packs.`);
      for (const row of comparison.planRows)
        if (!row.included)
          lines.push(
            `- ${clean(row.name)}: ${row.proposedPinCount} stale/conflicting planned points excluded; revise the attachment plan before using its schedule.`,
          );
      if (comparison.fitPending)
        lines.push(
          "Pin fit/depth measurements remain pending; the count is provisional intent.",
        );
      if (!comparison.retailerSupported)
        lines.push("This exact pin pack has no reviewed offer at the selected retailer.");
    }
  }
  if (project.connectorPlans.length) {
    const comparison = connectorPurchaseSummary(project);
    lines.push("", "PLANNED A21Z CONNECTORS — comparison only; selected supply rows above are the purchase quantities",
      `${comparison.plannedConnectors} provisional angles; ${comparison.plannedFasteners} reference fasteners; ${comparison.excludedConnectors} excluded connector plans. A source schedule is not manufactured fit or an installed joint.`);
    for (const row of comparison.products)
      lines.push(`- ${row.productName}: ${row.requiredUnits} provisional units, ${row.unitsPerPack}/pack; required packs ${row.requiredPacks}, selected packs ${row.selectedPacks}, missing packs ${row.shortfallPacks}.`);
    lines.push("Each plan chooses one complete screw OR nail schedule. Manual supplies alone purchase packs; no paid line, included-fastener credit or legacy-quantity offset is created by a plan.", ...comparison.warnings);
  }
  if (ventLayout) lines.push("", ventPurchaseReview.name, ventPurchaseReview.reason);
  lines.push(
    "",
    "PROJECT PHASES — organize the purchase list without duplicating its quantities",
  );
  project.steps.forEach((s, i) => lines.push(`${i + 1}. ${clean(s.title)}`));
  lines.push(
    "",
    "Review the retailer draft: quantities, units, exact products, substitutions, and store availability. Tax, delivery, waste allowance, roof overlaps, and construction adequacy are not established by this list.",
    `Keep the Yardwork JSON separately for the editable 3D plan, connections, and build guide. This text does not synchronize a ${retailerName(project.retailer)} account.`,
  );
  return lines.join("\n");
}

export function homeDepotHandoff(project: Project) {
  if (project.retailer === "lowes")
    throw Error(
      "This project targets Lowe's. Use the retailer shopping-list handoff instead.",
    );
  return formatHandoff(project);
}
export function retailerHandoff(project: Project) {
  return formatHandoff(project);
}

export function homeDepotShoppingList(project: Project, rows = bom(project), supplies = supplyRows(project)) {
  if (project.retailer === "lowes") throw Error("This project targets Lowe's.");

  const reviews: { name: string; reason: string }[] = [];
  if (project.saunaVentilationPlans?.length) reviews.push(ventPurchaseReview);
  const candidates: (HomeDepotPurchaseItem & { duplicate?: boolean })[] = [];

  const sockets = rodSocketPurchases(project);
  if (sockets.missing)
    reviews.push({ name: "Everbilt 311V end sockets", reason: `${sockets.missing} ${sockets.missing === 1 ? "pair" : "pairs"} to add in List` });

  for (const joint of project.joints) {
    if (!hardwareForJoint(joint))
      reviews.push({
        name: `${joint.quantity} × ${joint.length} in ${joint.kind}`,
        reason: "Choose exact connection hardware",
      });
  }
  for (const source of inspectCutStock(project).invalid) {
    const part = project.pieces.find((piece) => piece.id === source.pieceId);
    reviews.push({ name: part?.name ?? "Cut stock", reason: source.detail });
  }

  for (const row of rows) {
    const stock = material(row.id);
    for (const part of row.oversizedParts)
      reviews.push({ name: part.name, reason: "Exceeds stock dimensions" });
    if (!row.quantity) continue;
    const name = `${stock.name} · ${stock.subtitle}`;
    if (row.supplier) {
      reviews.push({
        name,
        reason: `Direct supplier · ${row.supplier.seller}`,
      });
      continue;
    }
    const { offer, snapshot, productId, url, suggested } = homeDepotStockMatch(row);
    if (!productId || !url || (offer && offer.seller !== "The Home Depot")) {
      reviews.push({
        name,
        reason: offer
          ? `Marketplace · ${offer.seller}`
          : "Exact product match needed",
      });
      continue;
    }
    candidates.push({
      name,
      description: snapshot?.name ?? name,
      quantity: row.quantity,
      unit: purchaseUnitLabel(stock.unit, row.quantity),
      productId,
      url,
      source: { kind: "stock", id: row.id },
      snapshot,
      suggested,
      duplicate: !!placedAndRecorded(project, row.id),
    });
  }

  for (const supply of supplies) {
    let quantity = supply.quantity;
    const plannedPurpose = supply.productId === rimFoam.id ? rimFoamPurchasePurpose :
      supply.productId === weatherWatch.id ? valleyPurchasePurpose : undefined;
    if (plannedPurpose) {
      const selectedForPlan = supply.selections.filter(({ purpose }) => purpose === plannedPurpose)
        .reduce((total, row) => total + row.quantity, 0);
      if (selectedForPlan) {
        let supported: number;
        if (plannedPurpose === rimFoamPurchasePurpose) {
          const plan = reviewRimAirSeals(project);
          supported = plan.needsReview ? 0 : plan.sheets.length;
        } else {
          const plan = reviewRoofValleys(project);
          supported = plan.needsReview ? 0 : plan.rolls.length;
        }
        const withheld = selectedForPlan - supported;
        if (withheld > 0) {
          quantity -= withheld;
          reviews.push({ name: supply.name, reason: `Review ${withheld} previously selected ${purchaseUnitLabel(supply.purchaseUnit, withheld)} against the current cut plan.` });
        }
      }
    }
    if (!quantity) continue;
    if (supply.unresolved || !supply.offer || !supply.storeSnapshotEligible) {
      reviews.push({
        name: supply.name,
        reason: supply.offer
          ? `Marketplace · ${supply.offer.seller}`
          : "Exact product match needed",
      });
      continue;
    }
    candidates.push({
      name: supply.name,
      description: supply.name,
      quantity,
      unit: purchaseUnitLabel(supply.purchaseUnit, quantity),
      productId: supply.offer.productId,
      url: supply.offer.url,
      source: { kind: "supply", id: supply.productId },
      snapshot: supply.inventory,
      isTool: supply.isTool,
    });
  }

  const counts = new Map<string, number>();
  for (const { productId } of candidates)
    counts.set(productId, (counts.get(productId) ?? 0) + 1);
  const items = candidates.filter(({ name, productId, duplicate }) => {
    if (!duplicate && counts.get(productId) === 1) return true;
    reviews.push({ name, reason: `Possible double count · ${productId}` });
    return false;
  });
  return {
    items,
    onHand: stockOnHand(rows),
    reviews,
    plannedNeeds: homeDepotPurchaseNeeds(project, rows, supplies),
    toolReview: homeDepotToolReview(project),
    text: items
      .map(
        (item) =>
          `${item.quantity} ${item.unit} — ${clean(item.description)} — Internet #${item.productId}`,
      )
      .join("\n"),
  };
}
