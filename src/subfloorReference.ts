export const subfloorReference = {
  guide: "https://www.apawood.org/guides-tools-training/technical-document-library/construction-guides/e30x-fc-engineered-wood-excerpt-floor-construction/",
  specification: "https://royomartin.com/wp-content/uploads/2023/05/APA-%E2%80%93-Floor-Construction.pdf",
  code: "https://www.seattle.gov/documents/Departments/SDCI/Codes/SeattleResidentialCode/2021SRCChapter5.pdf",
  maxSpacing: 24,
  minimumPanelWidth: 24,
  minimumBearing: 0.5,
  edgeInset: 0.375,
  edgeSpacing: 6,
  fieldSpacing: 12,
} as const;

export const subfloorJointReference = {
  endGap: 0.125,
  // Limit the review to nearby edges on the same plane.
  maxModelGap: 1,
  spacing: "https://apawood.org/buildertips/pages/M300.html",
  airSeal: "https://basc.pnnl.gov/resource-guides/floor-above-unconditioned-basement-or-vented-crawlspace",
} as const;

export const subfloorNails = {
  id: "grip-rite-8c1",
  name: "Grip-Rite 8C1 8d common nails",
  model: "8C1",
  internet: "202308488",
  sku: "192996",
  listing: "https://www.homedepot.com/p/202308488",
  specification: "https://grip-rite.com/product/common-nail/",
  reviewedAt: "2026-11-21T16:56:00.000Z",
  estimatedBoxCount: 101,
} as const;

export const subfloorNailSchedules = {
  "deformed-6d": { label: "6d ring- or screw-shank", length: 2, shank: 0.120 },
  "common-8d": { label: "Grip-Rite 8C1 common nail", length: 2.5, shank: 0.131 },
} as const;

export const subfloorScope =
  "Screen a rectangular, horizontal 23/32 in, 24 oc APA Sturd-I-Floor panel at least 24 in wide over solid wood joists. Check the delivered stamp, strength axis, joint gap and framing before building. This layout uses wood backing on all four edges. Check joist capacity, attachment, perimeter details and any diaphragm or finish requirements separately.";

export const subfloorNailing =
  "APA Table 14 shows up to 6 in at supported edges, up to 12 in at intermediate supports and a ⅜ in panel edge inset. Its glue-nailed 23/32 in, 24 oc row permits 8d common nails when the specified ring- or screw-shank nails are unavailable. For this example, confirm the substitution and adhesive with the panel instructions and local authority. Check ASTM D3498 or APA AFG-01 compatibility and avoid bright nails in treated, wet or exterior work.";

export const subfloorAdhesive = {
  id: "liquid-nails-lnp-902",
  name: "Liquid Nails subfloor adhesive",
  model: "LNP-902",
  internet: "202203997",
  sku: "515581",
  listing: "https://www.homedepot.com/p/202203997",
  specification: "https://images.thdstatic.com/catalog/pdfImages/a5/a5de5c38-8ef2-478d-b888-8b289022c0f0.pdf",
  apa: "https://stage.apawood.org/buildertips/pages/Q300.html",
  reviewedAt: "2026-11-21T18:16:00.000Z",
  coverageFeet: 85,
  bead: 0.25,
} as const;

export const subfloorAdhesiveScope =
  "The map estimates ¼ in zigzag beads where the sheet touches the framing. Follow the actual sheet and cartridge instructions for bare or coated faces, shared seams, tongue-and-groove joints and spacing. Allow extra adhesive for field changes and nozzle waste.";

export const subfloorAdhesiveInstallation =
  "Install and check the joists and blocking first. Dry-fit on clean, sound framing and have fasteners ready. Work one sheet at a time, laying beads over its marked bearing strips, then seat and fasten the sheet before the adhesive skins. Aim to finish within 15 minutes or sooner if the label or conditions call for it. Use the delivered panel's fastening schedule.";
