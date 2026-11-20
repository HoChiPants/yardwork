import { bounds } from "./engine";
import { uid, type Piece, type Project, type V3 } from "./model";
import { separateWood } from "./placement";

export type ObjectClipboard = {
  pieces: Piece[];
  name: string;
  grouped: boolean;
};
export function copyObjects(
  project: Project,
  selectedId: string | null,
  sectionId: string | null,
): ObjectClipboard | null {
  const section = project.sections.find((s) => s.id === sectionId);
  const pieces = project.pieces.filter((p) =>
    section
      ? section.pieceIds.includes(p.id) && !p.offcut
      : p.id === selectedId,
  );
  return pieces.length
    ? {
        pieces: structuredClone(pieces),
        name: section?.name ?? pieces[0].name,
        grouped: !!section,
      }
    : null;
}
export function pasteObjects(
  project: Project,
  clipboard: ObjectClipboard,
  stepId: string,
) {
  if (!project.steps.some((step) => step.id === stepId))
    throw Error("Choose a current build step.");
  if (!clipboard.pieces.length) throw Error("Copy an object first.");
  const source = clipboard.pieces.map(bounds),
    existing = project.pieces.filter((p) => !p.offcut).map(bounds);
  const shift: V3 = [
    existing.length
      ? Math.max(...existing.map((b) => b.max[0])) +
        2 -
        Math.min(...source.map((b) => b.min[0]))
      : 0,
    0,
    0,
  ];
  const name = `${clipboard.name.slice(0, 104)} · copy`;
  let pieces: Piece[] = clipboard.pieces.map((p) => ({
    ...structuredClone(p),
    id: uid(),
    name: `${p.name.slice(0, 104)} · copy`,
    position: p.position.map((n, i) => n + shift[i]) as V3,
    stepId,
    assembly: clipboard.grouped ? name : "Loose parts",
    offcut: false,
    cutStock: null,
    ...(p.roundOpenings?.length ? { roundOpenings: p.roundOpenings.map(({ source: _source, ...opening }) => opening) } : {}),
    guidePlacement: undefined,
  }));
  const placement = separateWood(project, pieces);
  if (placement.blocked)
    throw Error("No clear placement was found for the copy.");
  pieces = pieces.map((p) => ({
    ...p,
    position: p.position.map((n, i) => n + placement.offset[i]) as V3,
  }));
  const sectionId = clipboard.grouped ? uid() : null;
  return {
    project: {
      ...project,
      pieces: [...project.pieces, ...pieces],
      sections: sectionId
        ? [
            ...project.sections,
            {
              id: sectionId,
              name,
              pieceIds: pieces.map((p) => p.id),
              origin: pieces[0].position,
              rotation: [0, 0, 0] as V3,
              recipe: null,
              generator: null,
            },
          ]
        : project.sections,
    },
    pieceId: pieces[0].id,
    sectionId,
  };
}
