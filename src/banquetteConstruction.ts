import { material, type Piece, type Project, type V3 } from "./model";
import { rotate } from "./spatial";
import { prepareCollisionSolid } from "./solidCollision";
import { clipBox } from "./cutProfiles";
import {
  reviewConnectionContact,
  type ConnectionContactReview,
} from "./connectionContacts";
import { fastenerReviews, type FastenerReview } from "./fastenings";
import { connectorReviews, type ConnectorReview } from "./connectors";

export type BanquettePairState =
  | "no-record"
  | "started"
  | "needs-layout"
  | "measurements-pending"
  | "paths-reviewed"
  | "mixed"
  | "excluded"
  | "legacy-unlocated";
export type BanquetteIntentSummary = {
  kind: "wood-fastener" | "angle-connector" | "legacy-joint";
  planId: string;
  label: string;
  state: BanquettePairState;
  locationIds: string[];
};
export type BanquettePairReview = {
  id: string;
  pieceIds: [string, string];
  kind: "frame" | "shell" | "existing-only";
  contact: ConnectionContactReview | null;
  state: BanquettePairState;
  intentIds: string[];
  intents: BanquetteIntentSummary[];
  externalPieceIds: string[];
};
export type BanquetteSeatReview = {
  pieceId: string | null;
  state:
    | "missing"
    | "ambiguous"
    | "open"
    | "not-horizontal"
    | "unsupported"
    | "contacts-found"
    | "no-bearing-contact"
    | "interference"
    | "incomplete";
  undersideNormal: V3 | null;
  supportIds: string[];
  contacts: {
    memberId: string;
    contact: ConnectionContactReview;
    actualContact: boolean;
  }[];
};
export type BanquetteConstructionFinding = {
  code: string;
  pieceIds: string[];
  message: string;
};
export type BanquetteConstructionReport = {
  entryId: string;
  sectionId: string;
  name: string;
  memberIds: string[];
  seats: BanquetteSeatReview[];
  pairs: BanquettePairReview[];
  roleCounts: Record<string, number>;
  findings: BanquetteConstructionFinding[];
  enumeration: {
    checkedPairs: number;
    possiblePairs: number;
    omittedPairs: number;
    complete: boolean;
  };
};
export type BanquetteConstructionCache = {
  fasteners?: readonly FastenerReview[];
  connectors?: readonly ConnectorReview[];
  maxChecks?: number;
  maxGap?: number;
};
const frameRoles = new Set(["leg", "top-rail", "top-cross-rail"]);
const shellRoles = new Set([
  "storage-bottom",
  "storage-front",
  "storage-rear",
  "storage-left",
  "storage-right",
]);
const numericEpsilon = 1e-7;
const pairKey = (a: string, b: string) => [a, b].sort().join("/");
const combine = (states: readonly BanquettePairState[]): BanquettePairState =>
  !states.length
    ? "no-record"
    : new Set(states).size === 1
      ? states[0]
      : "mixed";
const downward = (v: V3) => Math.hypot(v[0], v[1] + 1, v[2]) <= numericEpsilon;

function woodIntent(review: FastenerReview): BanquetteIntentSummary {
  const states = review.locations.map((point): BanquettePairState =>
    review.state === "stale" ||
    !point.includedInDemand ||
    point.state === "stale" ||
    point.state === "conflict"
      ? "excluded"
      : !point.entranceWorld || !point.driveWorld
        ? "needs-layout"
        : point.state === "path-reviewed"
          ? "paths-reviewed"
          : "measurements-pending",
  );
  return {
    kind: "wood-fastener",
    planId: review.plan.id,
    label: review.plan.label,
    state: states.length
      ? combine(states)
      : review.state === "stale" || review.state === "conflict"
        ? "excluded"
        : "started",
    locationIds: review.locations.map((point) => point.location.id),
  };
}
function angleIntent(review: ConnectorReview): BanquetteIntentSummary {
  return {
    kind: "angle-connector",
    planId: review.plan.id,
    label: review.plan.label,
    state: !review.activeConnectorCount
      ? "excluded"
      : review.entries.some(
            (point) => !point.entranceWorld || !point.driveWorld,
          )
        ? "needs-layout"
        : review.state === "paths-reviewed"
          ? "paths-reviewed"
          : "measurements-pending",
    locationIds: review.entries.map((point) => point.entry.id),
  };
}

/** Current modeled contacts and exact saved pair intent. No state represents installed joinery or capacity. */
export function banquetteConstruction(
  project: Project,
  cache: BanquetteConstructionCache = {},
): BanquetteConstructionReport[] {
  const maxChecks = cache.maxChecks ?? 5000,
    maxGap = cache.maxGap ?? 0.125;
  if (
    !Number.isInteger(maxChecks) ||
    maxChecks < 0 ||
    maxChecks > 100000 ||
    !Number.isFinite(maxGap) ||
    maxGap < 0 ||
    maxGap > 12
  )
    throw Error(
      "Choose a bounded contact check count and finite search gap from zero to 12 inches.",
    );
  const sections = project.sections.filter(
    (section) => section.recipe?.kind === "bench" && section.recipe.storage,
  );
  if (!sections.length) return [];
  const active = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const fasteners =
    cache.fasteners ??
    (project.fastenerPlans.length ? fastenerReviews(project) : []);
  const connectors =
    cache.connectors ??
    (project.connectorPlans.length ? connectorReviews(project) : []);
  const intentsByPair = new Map<string, BanquetteIntentSummary[]>();
  const explicitPairs = new Map<string, [string, string]>();
  const addIntent = (
    a: string,
    b: string,
    summary: BanquetteIntentSummary,
    explicit = true,
  ) => {
    const key = pairKey(a, b);
    intentsByPair.set(key, [...(intentsByPair.get(key) ?? []), summary]);
    if (explicit) explicitPairs.set(key, [a, b]);
  };
  for (const plan of project.fastenerPlans) {
    const review = fasteners.find((row) => row.plan.id === plan.id);
    addIntent(
      plan.head.pieceId,
      plan.receiver.pieceId,
      review
        ? woodIntent(review)
        : {
            kind: "wood-fastener",
            planId: plan.id,
            label: plan.label,
            state: "excluded",
            locationIds: plan.locations.map((point) => point.id),
          },
    );
  }
  for (const plan of project.connectorPlans) {
    const review = connectors.find((row) => row.plan.id === plan.id);
    addIntent(
      plan.base.pieceId,
      plan.post.pieceId,
      review
        ? angleIntent(review)
        : {
            kind: "angle-connector",
            planId: plan.id,
            label: plan.label,
            state: "excluded",
            locationIds: plan.entries.map((point) => point.id),
          },
    );
  }
  for (const joint of project.joints)
    addIntent(
      joint.a,
      joint.b,
      {
        kind: "legacy-joint",
        planId: joint.id,
        label: "Legacy quantity record",
        state: "legacy-unlocated",
        locationIds: [],
      },
      false,
    );
  const contactCache = new Map<string, ConnectionContactReview | null>();
  let checked = 0;
  const declaredOrder = new Map(
    sections.map((section, index) => [section.id, index]),
  );
  return [...sections]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((section) => {
      const reviewed = new Set<string>(),
        seatContactKeys = new Set<string>(),
        unsupportedPairs = new Set<string>(),
        unavailableFrameIds = new Set<string>();
      const ownedIds = new Set(section.pieceIds),
        members = section.pieceIds
          .flatMap((id) => (active.get(id) ? [active.get(id)!] : []))
          .sort((a, b) => a.id.localeCompare(b.id));
      const jointMembers = members.filter(
        (piece) =>
          frameRoles.has(piece.designRole ?? "") ||
          shellRoles.has(piece.designRole ?? ""),
      );
      const jointMemberIds = new Set(jointMembers.map((piece) => piece.id));
      let possiblePairs = (jointMembers.length * (jointMembers.length - 1)) / 2;
      const entries = project.ideaBindings
        .flatMap((binding) => binding.entries)
        .filter(
          (entry) =>
            entry.spec.type === "furniture" &&
            entry.spec.recipe.kind === "bench" &&
            entry.spec.recipe.storage &&
            entry.sections.some((ref) => ref.sectionId === section.id),
        );
      const entryId = entries.length === 1 ? entries[0].id : section.id;
      const findings: BanquetteConstructionFinding[] = [];
      const finding = (code: string, pieceIds: string[], message: string) =>
        findings.push({ code, pieceIds, message });
      const retainUnsupported = (result: ConnectionContactReview | null) => {
        if (result?.state === "unsupported") {
          const key = pairKey(result.aId, result.bId);
          if (!unsupportedPairs.has(key))
            finding(
              "unsupported-member-contact",
              [result.aId, result.bId],
              "These actual retained contact surfaces cannot be reviewed. No absence of contact, bearing or intended counterpart is inferred.",
            );
          unsupportedPairs.add(key);
          unavailableFrameIds.add(result.aId);
          unavailableFrameIds.add(result.bId);
        }
        return result;
      };
      const contact = (a: Piece, b: Piece): ConnectionContactReview | null => {
        const key = pairKey(a.id, b.id);
        if (contactCache.has(key)) {
          reviewed.add(key);
          const cached = contactCache.get(key)!;
          return retainUnsupported(
            cached && cached.aId !== a.id
              ? {
                  ...cached,
                  aId: a.id,
                  bId: b.id,
                  normal: cached.normal
                    ? (cached.normal.map((value) => -value) as V3)
                    : null,
                }
              : cached,
          );
        }
        if (checked >= maxChecks) return null;
        checked++;
        reviewed.add(key);
        const result = reviewConnectionContact(a, b, maxGap);
        contactCache.set(key, result);
        return retainUnsupported(result);
      };
      const roleCounts: Record<string, number> = {};
      for (const member of members)
        if (member.designRole)
          roleCounts[member.designRole] =
            (roleCounts[member.designRole] ?? 0) + 1;
      const seatRole = section.recipe!.openingLid ? "seat-lid" : "seat";
      for (const role of [...frameRoles, ...shellRoles, seatRole])
        if (!roleCounts[role])
          finding(
            "role-not-present",
            [],
            `No active member is explicitly tagged ${role}. This is a role observation, not a guessed missing counterpart.`,
          );
      const custom = members.filter(
        (piece) =>
          !frameRoles.has(piece.designRole ?? "") &&
          !shellRoles.has(piece.designRole ?? "") &&
          !["seat", "seat-lid", "back-panel"].includes(piece.designRole ?? ""),
      );
      if (custom.length)
        finding(
          "custom-members",
          custom.map((piece) => piece.id),
          "Custom or untyped members remain outside automatic frame/shell pair classification. Inspect their actual nearby faces separately.",
        );
      const seats = members.filter((piece) => piece.designRole === seatRole);
      const seat: BanquetteSeatReview = {
        pieceId: seats.length === 1 ? seats[0].id : null,
        state:
          seats.length === 0
            ? "missing"
            : seats.length > 1
              ? "ambiguous"
              : "no-bearing-contact",
        undersideNormal: null,
        supportIds: [],
        contacts: [],
      };
      if (seats.length !== 1)
        finding(
          "seat-identity",
          seats.map((piece) => piece.id),
          "A single actual role-tagged seat is required; no name or array-order substitute was chosen.",
        );
      else {
        const actual = seats[0],
          panelNormal = rotate([0, 1, 0], actual.rotation);
        const horizontal =
          Math.hypot(
            panelNormal[0],
            Math.abs(panelNormal[1]) - 1,
            panelNormal[2],
          ) <= numericEpsilon;
        let supported = false;
        try {
          supported =
            material(actual.material).wood &&
            prepareCollisionSolid(actual)?.kind === "solid";
          if (supported) {
            const retained = clipBox(actual.size, actual.cutPlanes);
            const face = retained.faces.find(
              (face) =>
                Math.hypot(
                  face.normal[0],
                  Math.abs(face.normal[1]) - 1,
                  face.normal[2],
                ) <= numericEpsilon &&
                downward(rotate(face.normal, actual.rotation)),
            );
            seat.undersideNormal = face
              ? rotate(face.normal, actual.rotation)
              : null;
          }
        } catch {
          supported = false;
          seat.undersideNormal = null;
        }
        if (!supported) seat.state = "unsupported";
        else if (!horizontal)
          seat.state =
            section.recipe!.openingLid && section.recipe!.lidOpen
              ? "open"
              : "not-horizontal";
        else {
          let incomplete = false;
          if (section.recipe!.openingLid && section.recipe!.lidOpen)
            finding(
              "lid-pose-flag-mismatch",
              [actual.id],
              "The actual lid underside is horizontal despite the saved open-state flag. Current actual contacts are shown; no geometry was reclosed or regenerated.",
            );
          for (const member of members) {
            if (member.id === actual.id || !material(member.material).wood)
              continue;
            possiblePairs++;
            seatContactKeys.add(pairKey(actual.id, member.id));
            const review = contact(actual, member);
            if (!review) {
              incomplete = true;
              continue;
            }
            if (review.state === "unsupported") incomplete = true;
            if (review.state === "interference") {
              finding(
                "seat-interference",
                [actual.id, member.id],
                "The current retained seat overlaps this actual member. Inspect before choosing a mounting or bearing detail.",
              );
              seat.state = "interference";
            }
            if (
              (review.state === "face-contact" ||
                review.state === "near-face") &&
              review.normal &&
              downward(review.normal)
            )
              seat.contacts.push({
                memberId: member.id,
                contact: review,
                actualContact:
                  review.state === "face-contact" && (review.area ?? 0) > 0,
              });
          }
          seat.supportIds = seat.contacts
            .filter((row) => row.actualContact)
            .map((row) => row.memberId);
          if (seat.state !== "interference")
            seat.state = incomplete
              ? "incomplete"
              : seat.supportIds.length
                ? "contacts-found"
                : "no-bearing-contact";
          for (const row of seat.contacts)
            if (!row.actualContact)
              finding(
                "seat-bearing-gap",
                [actual.id, row.memberId],
                `The actual seat underside is separated from this retained member by ${row.contact.gap} in; proximity is not bearing contact.`,
              );
        }
        if (
          [
            "open",
            "not-horizontal",
            "unsupported",
            "no-bearing-contact",
            "incomplete",
          ].includes(seat.state)
        )
          finding(
            `seat-${seat.state}`,
            [actual.id],
            `The actual seat state is ${seat.state}. No closed-seat contact or capacity is inferred from its hinge, purchases or recipe.`,
          );
      }
      const pairs = new Map<string, BanquettePairReview>();
      const makePair = (
        aId: string,
        bId: string,
        kind: BanquettePairReview["kind"],
        geometry: ConnectionContactReview | null,
      ) => {
        const key = pairKey(aId, bId),
          intents = intentsByPair.get(key) ?? [];
        const existing = pairs.get(key);
        if (existing) return;
        const pieceIds = [aId, bId].sort() as [string, string];
        pairs.set(key, {
          id: `${entryId}/${key}`,
          pieceIds,
          kind,
          contact: geometry,
          state: combine(intents.map((intent) => intent.state)),
          intents,
          intentIds: intents.map((intent) => `${intent.kind}:${intent.planId}`),
          externalPieceIds: pieceIds.filter((id) => !ownedIds.has(id)),
        });
      };
      autoPairs: for (let i = 0; i < jointMembers.length; i++)
        for (let j = i + 1; j < jointMembers.length; j++) {
          // Count the complete candidate space above, without allocating omitted O(n²) keys.
          if (checked >= maxChecks) break autoPairs;
          const a = jointMembers[i],
            b = jointMembers[j],
            review = contact(a, b);
          if (review?.state === "face-contact" || review?.state === "near-face")
            makePair(
              a.id,
              b.id,
              frameRoles.has(a.designRole!) && frameRoles.has(b.designRole!)
                ? "frame"
                : "shell",
              review,
            );
          else if (review?.state === "interference")
            finding(
              "member-interference",
              [a.id, b.id],
              "These retained members overlap; review placement or intended joinery cuts before choosing a fastening layout.",
            );
        }
      for (const [key, ids] of explicitPairs)
        if (ids.some((id) => ownedIds.has(id)) && !pairs.has(key)) {
          const a = active.get(ids[0]),
            b = active.get(ids[1]);
          if (
            a &&
            b &&
            !seatContactKeys.has(key) &&
            !(jointMemberIds.has(a.id) && jointMemberIds.has(b.id))
          )
            possiblePairs++;
          const review = a && b ? contact(a, b) : null;
          makePair(ids[0], ids[1], "existing-only", review);
          if (!a || !b)
            finding(
              "saved-pair-member-missing",
              ids.filter((id) => !active.has(id)),
              "A saved W/C endpoint is missing or offcut. Its exact reference remains; no same-name replacement was bound.",
            );
          else if (
            review &&
            !["face-contact", "near-face"].includes(review.state)
          )
            finding(
              "saved-pair-contact",
              ids,
              `The saved actual pair now has ${review.state}. Review its existing intent and placement.`,
            );
        }
      const omittedPairs = possiblePairs - reviewed.size;
      if (!omittedPairs)
        for (const member of members.filter((piece) =>
          frameRoles.has(piece.designRole ?? ""),
        )) {
          const hasFrameContact = [...pairs.values()].some(
            (pair) =>
              pair.kind === "frame" &&
              pair.contact?.state === "face-contact" &&
              pair.pieceIds.includes(member.id),
          );
          if (!hasFrameContact && !unavailableFrameIds.has(member.id))
            finding(
              "frame-member-no-contact",
              [member.id],
              "This actual frame member has no current retained face contact with another tagged frame member. No missing counterpart was guessed.",
            );
        }
      if (omittedPairs)
        finding(
          "enumeration-incomplete",
          [],
          `${omittedPairs} candidate geometry checks were omitted by the explicit ${maxChecks}-check bound. This is not a complete contact inventory.`,
        );
      if (entries.length > 1)
        finding(
          "ambiguous-binding-owner",
          members.map((piece) => piece.id),
          "More than one furniture entry refers to this section; section identity was retained without choosing an owner by order.",
        );
      const rank = { frame: 0, shell: 1, "existing-only": 2 };
      return {
        entryId,
        sectionId: section.id,
        name: section.name,
        memberIds: members.map((piece) => piece.id),
        seats: [seat],
        pairs: [...pairs.values()].sort(
          (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id),
        ),
        roleCounts,
        findings,
        enumeration: {
          checkedPairs: reviewed.size,
          possiblePairs,
          omittedPairs,
          complete: omittedPairs === 0 && unsupportedPairs.size === 0,
        },
      };
    })
    .sort(
      (a, b) =>
        declaredOrder.get(a.sectionId)! - declaredOrder.get(b.sectionId)!,
    );
}
