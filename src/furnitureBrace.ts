import { Euler, Matrix4, Vector3 } from "three";
import { touchingWoodPatches } from "./connectionContacts";
import { flatCasing } from "./doorCasingReference";
import { fittedStockFaces } from "./fittedStock";
import { furnitureBraceInputSchema, type FurnitureBraceInput, type FurnitureBraceRecord } from "./furnitureBraceSchema";
import { formatPreciseInches } from "./measurement";
import { material, part, projectSchema, type Piece, type Project, type V3 } from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { ensurePartLabels, partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";

export const furnitureBraceTitle = "Furniture diagonal braces";
export const furnitureBraceScope = "A face-mounted brace can be dry-fitted using these marks. Review fasteners, edge distances, attachment to both posts and stability in each direction.";
export const furnitureBraceReference = "https://learn.kregtool.com/wp-content/themes/kreg-cms/prince.php?action=download&author=Kreg+Tool&plan_id=5638&plan_name=modern-farmhouse-table&template=project_plan";
export const furnitureBraceStockNames = { "hd-pine-1x4": "1 × 4 common pine", [flatCasing.id]: "1 × 3 select pine" };

const EPS = 1e-6;
const vector = (p: V3) => new Vector3(...p);
const near = (a: V3, b: V3) => vector(a).distanceTo(vector(b)) < EPS;

export function furnitureBracePosts(project: Project) {
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  const framing = new Set(project.sections.filter(({ generator }) => generator).flatMap(({ pieceIds }) => pieceIds));
  return project.pieces.filter((piece) => {
    const stock = material(piece.material);
    return !piece.offcut && stock.wood && stock.stockKind === "linear" && !stock.shape &&
      !moving.has(piece.id) && !framing.has(piece.id) && !piece.cutPlanes.length &&
      !piece.roundOpenings?.length && !piece.rectangularOpenings?.length &&
      stockAxes(piece, piece.cutStock?.size ?? piece.size).length === 1 && near(rotate([0, 1, 0], piece.rotation), [0, 1, 0]);
  });
}

function braceGeometry(project: Project, input: FurnitureBraceInput, posts = furnitureBracePosts(project)) {
  const first = posts.find(({ id }) => id === input.firstId), second = posts.find(({ id }) => id === input.secondId);
  if (!first || !second || first.id === second.id)
    throw Error("Choose two distinct, stationary upright wood posts in the furniture frame.");
  const owner = project.sections.find(({ pieceIds }) => pieceIds.includes(first.id));
  if (owner?.id !== project.sections.find(({ pieceIds }) => pieceIds.includes(second.id))?.id)
    throw Error("Choose two posts in the same furniture section so the brace can move with them.");

  const direction: V3 = [0, 0, 0];
  direction[input.face[1] === "Z" ? 2 : 0] = input.face[0] === "+" ? 1 : -1;
  const a = fittedStockFaces(project, first.id).find(({ normalLocal }) => near(normalLocal, direction))!;
  const normal = vector(a.normalWorld);
  const b = fittedStockFaces(project, second.id).find(({ normalWorld, centerWorld }) =>
    near(normalWorld, a.normalWorld) &&
    Math.abs(vector(centerWorld).sub(vector(a.centerWorld)).dot(normal)) < EPS,
  );
  if (!b) throw Error("These post faces need to face the same way and share one plane for a flat brace.");
  const origin = (face: typeof a, height: number) => {
    const bottom = Math.min(...face.verticesWorld.map((p) => p[1]));
    const top = Math.max(...face.verticesWorld.map((p) => p[1]));
    if (height <= EPS || bottom + height >= top - EPS)
      throw Error("Place each mark between the bottom and top of its post.");
    const mark = vector(face.centerWorld);
    mark.y = bottom + height;
    return mark;
  };
  const from = origin(a, input.firstHeight), to = origin(b, input.secondHeight);
  const slope = to.clone().sub(from);
  const rise = Math.abs(slope.y), run = Math.hypot(slope.x, slope.z);
  if (rise < EPS || run < EPS) throw Error("Use marks at different heights on posts across the bay.");
  const path = slope.length();
  const length = path + 2 * input.extension;
  const [depth, width, stockLength] = [...material(input.stock).size].sort((x, y) => x - y);
  if (length > stockLength + EPS) throw Error("The brace needs a longer board or different attachment marks.");
  const axis = slope.normalize();
  const widthAxis = axis.clone().cross(normal).normalize();
  const euler = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(widthAxis, axis, normal));
  const rotation: V3 = [euler.x, euler.y, euler.z];
  const position = from.clone().lerp(to, 0.5).addScaledVector(normal, depth / 2).toArray() as V3;
  const size: V3 = [width, length, depth];
  return { first, second, owner, path, run, rise, length, size, rotation, position };
}

function endContacts(brace: Piece, geometry: ReturnType<typeof braceGeometry>) {
  return [geometry.first, geometry.second].map((post) =>
    touchingWoodPatches(brace, post).reduce((sum, patch) => sum + patch.area, 0),
  );
}

export function previewFurnitureBrace(project: Project, raw: FurnitureBraceInput, reuse: boolean) {
  const input = furnitureBraceInputSchema.parse(raw);
  const geometry = braceGeometry(project, input);
  const { owner, first, second, size, position, rotation } = geometry;
  const brace = {
    ...part("Furniture diagonal brace", input.stock, size, position, first.stepId, owner?.name ?? first.assembly, rotation),
    stockLengthAxis: 1 as const,
  };
  const contacts = endContacts(brace, geometry);
  if (contacts.some((area) => area <= EPS)) throw Error("The brace needs retained face contact at both posts.");
  const shape = prepareCollisionSolid(brace)!;
  const zone = project.workZone;
  if (shape.vertices.some(([x, y, z]) => y < -EPS || (zone && (
    Math.abs(x) > zone.width / 2 + EPS || Math.abs(z) > zone.depth / 2 + EPS || y > zone.height + EPS
  )))) throw Error("The brace extends outside the work zone. Review the end extension and marks.");
  for (const other of project.pieces) {
    if (other.offcut || other.id === first.id || other.id === second.id) continue;
    const solid = prepareCollisionSolid(other);
    if (solidOverlap(shape, solid ?? prepareCollisionBox(other.size, other.position, other.rotation), EPS))
      throw Error(`Check ${partLabel(project, other.id)} · ${other.name}. It occupies part of the brace in the saved pose.`);
  }
  const match = reuse ? fittingOffcuts(project, brace)[0] : undefined;
  const draft = ensurePartLabels({ ...project, pieces: [...project.pieces, brace] });
  const allocated = match ? assignOffcutToPart(draft, brace.id, match.piece.id) : draft;
  return {
    source: project, input, geometry, contacts, brace, match,
    project: projectSchema.parse({
      ...allocated, guideFingerprint: null,
      sections: allocated.sections.map((section) => section.id === owner?.id
        ? { ...section, pieceIds: [...section.pieceIds, brace.id] } : section),
      furnitureBraces: [...(project.furnitureBraces ?? []), { input, partId: brace.id }],
    }),
  };
}

export function furnitureBraceReviews(project: Project) {
  if (!project.furnitureBraces?.length) return [];
  const posts = furnitureBracePosts(project);
  return project.furnitureBraces.flatMap<{
    record: FurnitureBraceRecord; label: string; ownerId?: string; contacts?: number[]; issue?: string;
  }>((record) => {
    const brace = project.pieces.find(({ id, offcut }) => id === record.partId && !offcut);
    if (!brace) return [];
    const label = `${partLabel(project, brace.id)} · Diagonal brace`;
    try {
      const geometry = braceGeometry(project, record.input, posts);
      const contacts = endContacts(brace, geometry);
      const unchanged = brace.material === record.input.stock && !brace.cutPlanes.length &&
        !brace.rectangularOpenings?.length && !brace.roundOpenings?.length &&
        near(brace.size, geometry.size) && near(brace.position, geometry.position) &&
        ([1, 2] as const).every((axis) => {
          const local: V3 = [0, 0, 0];
          local[axis] = 1;
          return near(rotate(local, brace.rotation), rotate(local, geometry.rotation));
        });
      return unchanged && contacts.every((area) => area > EPS)
        ? [{ record, label, ownerId: geometry.owner?.id, contacts }]
        : [{ record, label, issue: "The brace or its post contact moved. Check both marks and cuts again." }];
    } catch (cause) {
      return [{ record, label, issue: cause instanceof Error ? cause.message : "Review the current brace and posts." }];
    }
  });
}

export function furnitureBraceGuideLines(project: Project) {
  return furnitureBraceReviews(project).map(({ record, label, contacts, issue }) => {
    if (issue || !contacts) return `${label}. ${issue ?? "Check both post faces."}`;
    const brace = project.pieces.find(({ id }) => id === record.partId)!;
    const { firstId, secondId, firstHeight, secondHeight, extension } = record.input;
    const mark = (value: number) => formatPreciseInches(value);
    return `${label}. Square-cut the board to ${mark(brace.size[1])}. Mark ${partLabel(project, firstId)} at ${mark(firstHeight)} and ${partLabel(project, secondId)} at ${mark(secondHeight)} above their respective bottoms. Align the brace centerline ${mark(extension)} from each end to those marks. Modeled face contact ${Number(contacts[0].toFixed(2))} and ${Number(contacts[1].toFixed(2))} sq in. Review both connections before fastening.`;
  });
}
