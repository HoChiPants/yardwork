import type { ConnectionIntent } from "./connectionCoverage";
import { previewFastenerContactRow, type FastenerContactRowPreview } from "./fastenerContactRow";
import { saveFastenerPlan } from "./fastenings";
import type { WoodFastenerProductId } from "./fastenerProducts";
import type { Project, Piece } from "./model";
import { woodPairKey } from "./woodJointDecisions";

type Joint = {
  id: string;
  title: string;
  pair: [Piece, Piece] | null;
  intents: ConnectionIntent[];
};

export function caseworkFastenerBodies(project: Project, intents: readonly ConnectionIntent[], entryId?: string) {
  const sections = new Map(project.sections.map((section) => [section.id, section]));
  const active = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const byPair = new Map<string, ConnectionIntent[]>();
  for (const intent of intents) {
    if (intent.pieceIds.length !== 2) continue;
    const key = woodPairKey(intent.pieceIds[0], intent.pieceIds[1]);
    byPair.set(key, [...(byPair.get(key) ?? []), intent]);
  }
  return project.ideaBindings.flatMap(({ title, entries }) => entries.flatMap((entry) => {
    if ((entryId && entry.id !== entryId) || entry.spec.type !== "structure") return [];
    const kind = entry.spec.structure.kind;
    const bookcase = kind === "casework-shelves";
    if (!bookcase && kind !== "closet-insert") return [];
    const members = new Map<string, Piece[]>();
    for (const { sectionId, role } of entry.sections) {
      if (!bookcase && role !== "casework-panels") continue;
      for (const id of sections.get(sectionId)?.pieceIds ?? []) {
        const piece = active.get(id);
        const panelRole = bookcase ? role : piece?.designRole;
        if (piece && panelRole) members.set(panelRole, [...(members.get(panelRole) ?? []), piece]);
      }
    }
    const sides = bookcase ? ["side-left", "side-right"] : ["side-left", "tower-left", "tower-right", "side-right"];
    const joints: Joint[] = [];
    function addJoint(headRole: string, receiverRole: string) {
      const head = members.get(headRole), receiver = members.get(receiverRole);
      const pair: Joint["pair"] = head?.length === 1 && receiver?.length === 1 ? [head[0], receiver[0]] : null;
      const names: Record<string, string> = {
        "side-left": "Left side", "side-right": "Right side", "tower-left": "Left tower divider",
        "tower-right": "Right tower divider", top: "Top", bottom: "Bottom", back: "Back",
      };
      joints.push({
        id: headRole + "/" + receiverRole,
        title: names[headRole] + " into " + names[receiverRole].toLowerCase(),
        pair,
        intents: pair ? byPair.get(woodPairKey(pair[0].id, pair[1].id)) ?? [] : [],
      });
    }
    for (const side of sides)
      for (const end of ["top", "bottom"]) {
        if (bookcase) addJoint(side, end);
        else addJoint(end, side);
      }
    if (bookcase)
      for (const receiver of [...sides, "top", "bottom"]) addJoint("back", receiver);
    return [{ id: entry.id, title: title + " · " + (bookcase ? "Bookcase body" : "Closet body"), joints }];
  }));
}

type Body = ReturnType<typeof caseworkFastenerBodies>[number];

export function previewCaseworkFastenerRows(project: Project, body: Body, selectedIds: readonly string[], input: {
  count: number; endInset: number; beforeFloorPlacement: boolean; productId: WoodFastenerProductId;
}) {
  const selected = new Set(selectedIds);
  let candidate = project;
  const results = body.joints.filter(({ id }) => selected.has(id)).map((joint): {
    id: string; row?: FastenerContactRowPreview; problem?: string;
  } => {
    if (!joint.pair || joint.intents.length)
      return { id: joint.id, problem: "Review the panels or existing connection record for this joint." };
    try {
      const row = previewFastenerContactRow(candidate, joint.pair[0].id, joint.pair[1].id, input, {
        name: joint.title, productId: input.productId,
      });
      candidate = saveFastenerPlan(candidate, row.plan);
      return { id: joint.id, row };
    } catch (cause) {
      return { id: joint.id, problem: cause instanceof Error ? cause.message : "Review this joint before adding a screw row." };
    }
  });
  return { source: project, project: candidate, results };
}

export type CaseworkFastenerPreview = ReturnType<typeof previewCaseworkFastenerRows>;
