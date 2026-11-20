import { Vector3 } from "three";
import {
  faceContactPatch,
  retainedWoodFaces,
  reviewConnectionContact,
} from "./connectionContacts";
import {
  addFastenerLocation,
  fastenerEntryThroughContact,
  fastenerReviews,
  makeFastenerPlan,
  type MakeFastenerPlanOptions,
} from "./fastenings";
import { formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";

const epsilon = 1e-6;
const vector = (value: V3) => new Vector3(...value);

function contactStrip(
  patch: NonNullable<ReturnType<typeof faceContactPatch>>,
  normal: V3,
  headRotation: V3,
) {
  const center = vector(patch.center);
  const points = patch.outline.map((point) => vector(point).sub(center));
  const axes = points.flatMap((point, i) => {
    const along = points[(i + 1) % points.length].clone().sub(point);
    if (along.length() <= epsilon) return [];
    along.normalize();
    const headLocal = rotate(along.toArray(), inverseRotation(headRotation));
    const firstAxis = headLocal.find((value) => Math.abs(value) > epsilon);
    if (firstAxis !== undefined && firstAxis < 0) along.negate();
    const across = vector(normal).cross(along).normalize();
    const span = (axis: Vector3) => {
      const limits = points.map((p) => p.dot(axis));
      return Math.max(...limits) - Math.min(...limits);
    };
    const length = span(along);
    const width = span(across);
    return length > width + epsilon &&
      Math.abs(length * width - patch.area) <= epsilon * Math.max(1, patch.area)
      ? [{ along, length, width }]
      : [];
  });
  return axes[0];
}

export function previewFastenerContactRow(
  project: Project,
  headId: string,
  receiverId: string,
  {
    count,
    endInset,
    beforeFloorPlacement,
  }: { count: number; endInset: number; beforeFloorPlacement: boolean },
  options: MakeFastenerPlanOptions,
) {
  if (!Number.isInteger(count) || count < 2 || count > 100)
    throw Error("Enter between 2 and 100 marks.");
  if (!Number.isFinite(endInset) || endInset <= epsilon)
    throw Error("Enter a positive inset from both ends of the contact.");
  const head = project.pieces.find(
    ({ id, offcut }) => !offcut && id === headId,
  );
  const receiver = project.pieces.find(
    ({ id, offcut }) => !offcut && id === receiverId,
  );
  if (!head || !receiver || headId === receiverId)
    throw Error("Choose two distinct active wood members.");
  const contact = reviewConnectionContact(head, receiver, 0);
  if (contact.state !== "face-contact" || !contact.center || !contact.normal)
    throw Error("This row needs two retained wood faces in direct contact.");
  const normal = contact.normal;
  const receivingFaces = retainedWoodFaces(receiver);
  const patches = retainedWoodFaces(head).flatMap((face) =>
    vector(face.normal).distanceTo(vector(normal)) <= epsilon
      ? receivingFaces.flatMap((other) => faceContactPatch(face, other) ?? [])
      : [],
  );
  if (patches.length !== 1)
    throw Error(
      "Choose a joint with one uninterrupted contact strip for the row.",
    );
  const strip = contactStrip(patches[0], normal, head.rotation);
  if (!strip)
    throw Error(
      "This row needs a rectangular contact with a clear long direction.",
    );
  const usable = strip.length - 2 * endInset;
  if (usable <= epsilon * (count - 1))
    throw Error(
      "The inset leaves too little room for distinct marks on this contact.",
    );

  const spacing = usable / (count - 1);
  let floorAccess = false;
  const surfaces = Array.from({ length: count }, (_, index) => {
    const point = vector(patches[0].center)
      .addScaledVector(
        strip.along,
        endInset - strip.length / 2 + index * spacing,
      )
      .toArray();
    const { surface, entrance } = fastenerEntryThroughContact(
      project,
      head,
      receiver,
      point,
      normal,
    );
    if (entrance[1] <= epsilon && normal[1] > epsilon) floorAccess = true;
    return surface;
  });
  if (floorAccess && !beforeFloorPlacement)
    throw Error(
      "The modeled floor blocks access to these entrances. Change the entry side or plan to drive before setting the assembly down.",
    );

  let plan = makeFastenerPlan(project, headId, receiverId, {
    ...options,
    measurements: undefined,
    notes: [
      options.notes,
      `${count} modeled centers along the contact strip. Entered end inset ${formatStockLength(endInset)} at each end. Center spacing ${formatStockLength(spacing)}. Review the actual joint, spacing and hardware before drilling.`,
      floorAccess
        ? "Floor-side access. Plan these entries before setting the assembly down."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  for (const [index, surface] of surfaces.entries()) {
    const next = addFastenerLocation(plan);
    next.locations[index] = {
      ...next.locations[index],
      ...surface,
      name: `Contact row mark ${index + 1}`,
    };
    plan = next;
  }
  const review = fastenerReviews({
    ...project,
    fastenerPlans: [...project.fastenerPlans, plan],
  }).find((item) => item.plan.id === plan.id)!;
  if (
    review.activePointCount !== count ||
    review.locations.some(({ gap, state }) => gap !== 0 || state === "conflict")
  )
    throw Error(
      review.issues.find(({ severity }) => severity === "error")?.message ??
        "Some entries could not be traced through both parts. Review the pair or use individual marks.",
    );
  return {
    plan,
    review,
    length: strip.length,
    width: strip.width,
    spacing,
    floorAccess,
  };
}

export type FastenerContactRowPreview = ReturnType<
  typeof previewFastenerContactRow
>;
