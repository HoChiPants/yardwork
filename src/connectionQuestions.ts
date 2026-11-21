import {
  nearbyConnectionPairs,
  reviewConnectionContact,
  type ConnectionContactReview,
} from "./connectionContacts";
import { material, type Piece, type Project } from "./model";
import { ensurePartLabels } from "./partLabels";
import { modeledTrimSeamEdges } from "./trimSeamGeometry";
import { trimSeamLine, woodJointDecisionEntries, woodPairKey } from "./woodJointDecisions";

export type ConnectionQuestion = {
  first: string;
  second?: string;
  kind?: "trim-seam";
};

const findNearby =
  /^(?:what can i (?:screw|attach) (.+?) to|(?:find|review|show|suggest) (?:nearby )?(?:wood[- ]screw |screw )?(?:joints|connections) (?:for|near|around) (.+))$/i;
const pairRequest =
  /^(?:(?:screw|attach|fasten|join|connect)(?: from)?|(?:plan|review|check|compare) (?:a |the )?(?:wood[- ]screw |screw )?(?:joint|connection)(?: from| between)?)\s+(.+)$/i;
const trimRequest = /^(?:plan|review|check) (?:the )?(?:trim seam|trim sealant|sealant joint) between\s+(.+)$/i;
const pairMembers =
  /^(?:"([^"]+)"|([^"]+?))\s+(?:to|into|onto|and)\s+(?:"([^"]+)"|([^"]+))$/i;
const partNumber = /^([po])(\d{1,6})$/i;
const asName = (value: string) => value.trim().toLowerCase();

export function connectionQuestion(project: Project, prompt: string): ConnectionQuestion | null {
  const text = prompt.trim().replace(/[“”]/g, '"').replace(/[.?!]+$/, "")
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you\s+|how (?:can|do|should) i\s+)?(?:please\s+)?/i, "");
  const nearby = findNearby.exec(text);
  if (nearby) return { first: nearby[1] ?? nearby[2] };
  const trim = trimRequest.exec(text);
  const request = trim ?? pairRequest.exec(text);
  if (!request) return null;
  const pair = pairMembers.exec(request[1]);
  if (!pair) return null;
  const first = pair[1] ?? pair[2], second = pair[3] ?? pair[4];
  if (/^(?:attach|join|connect)\b/i.test(text)) {
    const references = [first, second].map(asName);
    // Generic instructions to attach a new object belong to layout planning.
    if (!references.some((ref) => partNumber.test(ref)) &&
        !project.pieces.some(({ name, offcut }) => !offcut && references.some(
          (ref) => ref === asName(name) || ref.replace(/^the\s+/, "") === asName(name),
        ))) return null;
  }
  return { first, second, ...(trim && { kind: "trim-seam" }) };
}

type Member = { id: string; label: string; name: string };
export type ConnectionAnswerPair = {
  first: Member;
  second: Member;
  contact: ConnectionContactReview;
  plans: { id: string; label: string }[];
  trimSeam?: string;
};
type ConnectionAnswer =
  | { message: string; choices: string[] }
  | { anchor: Member; pairs: ConnectionAnswerPair[]; more: boolean };

function resolveMember(
  raw: string,
  pieces: Piece[],
  labels: Map<string, string>,
): { piece: Piece } | { message: string; choices: string[] } {
  const value = raw.trim().replace(/^"|"$/g, "");
  const label = partNumber.exec(value);
  if (label) {
    const key = `${label[1].toUpperCase()}${label[2].padStart(3, "0")}`;
    const id = labels.get(key);
    const piece = pieces.find((item) => item.id === id);
    if (piece) return { piece };
    return {
      message: id
        ? `${key} is no longer an active wood part. Choose a current part.`
        : `I couldn’t find part label ${key}. Check the label on the model.`,
      choices: [],
    };
  }
  const name = asName(value);
  const exact = pieces.filter((item) => asName(item.name) === name);
  const matches = exact.length ? exact : pieces.filter(
    (item) => asName(item.name) === name.replace(/^the\s+/, ""),
  );
  if (matches.length === 1) return { piece: matches[0] };
  if (matches.length > 1) {
    const ids = new Set(matches.map((piece) => piece.id));
    return {
      message: `More than one active wood part is named “${value}”. Use its part label.`,
      choices: [...labels].filter(([, id]) => ids.has(id)).map(([part]) => part).slice(0, 8),
    };
  }
  return {
    message: `I couldn’t find an active wood part named “${value}”. Use its exact name or part label.`,
    choices: [],
  };
}

export function answerConnectionQuestion(project: Project, question: ConnectionQuestion): ConnectionAnswer {
  const labeled = ensurePartLabels(project);
  const labels = new Map(labeled.partLabels.map(({ label, partId }) => [label, partId]));
  const labelById = new Map(labeled.partLabels.map(({ label, partId }) => [partId, label]));
  const wood = labeled.pieces.filter((part) => !part.offcut && material(part.material).wood);
  const members = new Map(wood.map(({ id, name }) => [id, { id, label: labelById.get(id)!, name }]));
  const first = resolveMember(question.first, wood, labels);
  if (!("piece" in first)) return first;
  const anchor = members.get(first.piece.id)!;
  const pair = (secondId: string, contact: ConnectionContactReview): ConnectionAnswerPair => ({
    first: anchor,
    second: members.get(secondId)!,
    contact,
    plans: labeled.fastenerPlans
      .filter(({ head, receiver }) =>
        (head.pieceId === anchor.id && receiver.pieceId === secondId) ||
        (receiver.pieceId === anchor.id && head.pieceId === secondId))
      .map(({ id, label }) => ({ id, label })),
  });
  if (question.second !== undefined) {
    const second = resolveMember(question.second, wood, labels);
    if (!("piece" in second)) return second;
    if (anchor.id === second.piece.id)
      return { message: "Choose two different active wood parts.", choices: [] };
    const answer = pair(second.piece.id, reviewConnectionContact(first.piece, second.piece));
    if (question.kind === "trim-seam") {
      const id = woodPairKey(first.piece.id, second.piece.id);
      const saved = woodJointDecisionEntries(project).find((entry) => entry.id === id);
      const measured = saved && trimSeamLine(saved);
      answer.trimSeam = measured || (modeledTrimSeamEdges(first.piece, second.piece)?.edges.length
        ? "Inspect the joint to choose an exposed edge and record the measured bead."
        : "Review the fit and measure exposed seams in the field.");
    }
    return { anchor, pairs: [answer], more: false };
  }
  const nearby = nearbyConnectionPairs(labeled, [anchor.id], { limit: 6, maxChecks: 5000 });
  return {
    anchor,
    pairs: nearby.pairs.map((contact) =>
      pair(contact.aId === anchor.id ? contact.bId : contact.aId, contact)),
    more: !nearby.complete || nearby.candidateCount > nearby.pairs.length,
  };
}
