const state = "https://le.utah.gov/xcode/Title15A";
export const utahSourceReviewDate = "2026-11-19";

export type CodeSource = { title: string; url: string };
const source = (title: string, path: string): CodeSource => ({
  title,
  url: `${state}/${path}`,
});
export const utahAdoptionVersions = [
  {
    id: "utah-construction-2026-07-01",
    effectiveFrom: "2026-07-01",
    effectiveUntil: "2027-01-01", // exclusive
    source: source(
      "Utah Code §15A-2-103 · effective July 1, 2026",
      "Chapter2/C15A-2-S103_2026050620260701.pdf",
    ),
    wildland: "Utah Wildland Urban Interface Code · 2006 · local adoption path",
  },
  {
    id: "utah-construction-2027-01-01",
    effectiveFrom: "2027-01-01",
    effectiveUntil: null, // no superseding date established in this review
    source: source(
      "Utah Code §15A-2-103 · effective January 1, 2027",
      "Chapter2/C15A-2-S103_2026050620270101.pdf",
    ),
    wildland:
      "International Wildland-Urban Interface Code · 2024 · statewide adoption reference",
  },
] as const;

const amendment = (part: number, title: string) =>
  source(title, `Chapter3/C15A-3-P${part}_1800010118000101.pdf`);

export const utahSources = {
  local: source(
    "Utah Title 15A, Chapter 4 · local amendments",
    "Chapter4/C15A-4_1800010118000101.pdf",
  ),
  irc: amendment(2, "Utah IRC amendments · Title 15A, Chapter 3, Part 2"),
  ircMechanicalAmendments: source(
    "Utah Code §15A-3-203 · effective July 1, 2026",
    "Chapter3/C15A-3-S203_2026050620260701.pdf",
  ),
  ircDryerExhaust: {
    title: "2021 IRC M1502.4 · dryer exhaust ducts",
    url: "https://codes.iccsafe.org/content/IRC2021P3/chapter-15-exhaust-systems",
  },
  ircShingles: {
    title: "2021 IRC R905.2 · asphalt shingles",
    url: "https://codes.iccsafe.org/content/IRC2021P1/chapter-9-roof-assemblies",
  },
  ircDripEdge: {
    title: "2021 IRC R905.2.8.5 · text as reproduced in ICC’s Bellevue edition",
    url: "https://codes.iccsafe.org/s/WABellevueRC2021P1/part-iii-building-planning-and-construction/WABellevueRC2021P1-Pt03-Ch09-SecR905.2.8.5",
  },
  ibc: amendment(1, "Utah IBC amendments · Title 15A, Chapter 3, Part 1"),
  ipc: amendment(3, "Utah IPC amendments · Title 15A, Chapter 3, Part 3"),
  hvac: amendment(
    4,
    "Utah mechanical amendments · Title 15A, Chapter 3, Part 4",
  ),
  fuelGas: amendment(
    5,
    "Utah fuel gas amendments · Title 15A, Chapter 3, Part 5",
  ),
  electricalScope: amendment(6, "Utah Code §15A-3-601(1) · electrical scope"),
  wallVentIrc: amendment(2, "Utah Code §15A-3-205(22) · IRC P3101.4"),
  wallVentIpc: amendment(3, "Utah Code §15A-3-309(2) · IPC 903.7"),
  ipcSidewall: {
    title: "2024 International Plumbing Code §903.1.4 · sidewall vent",
    url: "https://codes.iccsafe.org/content/IPC2024V2.0/chapter-9-vents",
  },
  fire: source(
    "Utah Code §15A-5-103 · State Fire Code adoption",
    "Chapter5/C15A-5-S103_2026050620260701.pdf",
  ),
  fireAmendments: source(
    "Utah Title 15A, Chapter 5, Part 2 · fire amendments",
    "Chapter5/C15A-5-P2_1800010118000101.pdf",
  ),
  sprinklers: source(
    "Utah Code §15A-5-304 · fire sprinkler amendments",
    "Chapter5/C15A-5-S304_2026050620260701.pdf",
  ),
} satisfies Record<string, CodeSource>;

export const utahAuthorityDirectories: CodeSource[] = [
  {
    title: "Greater Salt Lake MSD service and design criteria",
    url: "https://msd.utah.gov/316/Codes-and-Design-Criteria",
  },
  {
    title: "Salt Lake City building permit services",
    url: "https://www.slc.gov/buildingservices/building-permits/",
  },
  {
    title: "Utah Uniform Building Codes laws and rules",
    url: "https://commerce.utah.gov/dopl/uniform-building-codes/laws-and-rules/",
  },
];
