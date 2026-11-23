import { bounds } from "./engine";
import { material, type Project, type Section, type V3 } from "./model";
import { createWoodGroupSlide, woodSlideStopLabel } from "./placement";
import { movingSectionIds, transformSection } from "./sections";

const epsilon = 1e-6;
const lowFaces = ["left work-zone boundary", "ground", "rear work-zone boundary"];
const highFaces = ["right work-zone boundary", "work-zone ceiling", "front work-zone boundary"];

function sectionTravelParts(project: Project, section: Section) {
  const ids = movingSectionIds(project, section);
  return project.pieces.filter(({ id, offcut }) => ids.has(id) && !offcut);
}

export function createSectionWoodSlide(project: Project, section: Section) {
  return createWoodGroupSlide(project, sectionTravelParts(project, section), section.origin);
}

export function previewSectionTranslation(source: Project, sectionId: string, offset: V3) {
  const section = source.sections.find(({ id }) => id === sectionId);
  if (!section) throw Error("Choose a section to move.");
  if (!offset.every(Number.isFinite) || !offset.some((value) => Math.abs(value) > epsilon))
    throw Error("Enter a distance along at least one axis.");
  const parts = sectionTravelParts(source, section);
  if (!parts.length) throw Error("Choose a section with parts to move.");
  const travel = createWoodGroupSlide(source, parts, section.origin);
  if (!travel && parts.some((piece) => material(piece.material).wood))
    throw Error("Review the section’s starting position and wood overlaps before checking a move.");

  const boxes = parts.map(bounds);
  const min = [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis])));
  const zone = source.workZone;
  const low = zone ? [-zone.width / 2, 0, -zone.depth / 2] : [-Infinity, 0, -Infinity];
  const high = zone ? [zone.width / 2, zone.height, zone.depth / 2] : [Infinity, Infinity, Infinity];
  let fraction = 1;
  let boundary = "";
  for (const [axis, distance] of offset.entries()) {
    if (min[axis] < low[axis] - epsilon || max[axis] > high[axis] + epsilon)
      throw Error("Start with the whole section inside the available space before checking its move.");
    if (!distance) continue;
    const limit = distance < 0 ? (low[axis] - min[axis]) / distance : (high[axis] - max[axis]) / distance;
    if (limit < fraction) {
      fraction = Math.max(0, limit);
      boundary = distance < 0 ? lowFaces[axis] : highFaces[axis];
    }
  }
  const target = section.origin.map((value, axis) => value + offset[axis] * fraction) as V3;
  const checked = travel?.(target);
  const position = checked?.position ?? target;
  const stop = checked?.stop ? woodSlideStopLabel(source, checked.stop) : boundary ? `Stopped at the ${boundary}` : "";
  const shifted = position.some((value, axis) => Math.abs(value - section.origin[axis]) > epsilon);
  const project = shifted ? transformSection(source, section.id, position, section.rotation) : source;
  const ids = new Set(parts.map(({ id }) => id));
  return { source, project, sectionId, position, stop, parts: project.pieces.filter(({ id }) => ids.has(id)) };
}

export type SectionTranslationPreview = ReturnType<typeof previewSectionTranslation>;
