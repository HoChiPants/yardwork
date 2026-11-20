import type { Piece, Project } from "./model";

export type StockVisibility = {
  showOffcuts?: boolean;
  selectedId?: string | null;
  /** Assembly precision tools and lid previews do not pick virtual loose stock. */
  assemblyOnly?: boolean;
};

/** Display policy only. Project, source accounting and exports retain every part. */
export function visibleStockPieces(project: Project, options: StockVisibility): Piece[] {
  return project.pieces.filter((piece) => !piece.offcut || (
    !options.assemblyOnly && (options.showOffcuts || piece.id === options.selectedId)
  ));
}

export function visibleStagePieces(project: Project, options: StockVisibility & { stage: number | null }): Piece[] {
  return visibleStockPieces(project, options).filter((piece) =>
    options.stage === null || (piece.offcut && piece.id === options.selectedId) ||
    project.steps.findIndex((step) => step.id === piece.stepId) <= options.stage,
  );
}

/** A selected remnant returns to an actual surviving part of that same source. */
export function assemblyPartForOffcut(project: Project, offcutId: string): string | null {
  const source = project.pieces.find((piece) => piece.id === offcutId && piece.offcut)?.cutStock?.id;
  return source ? project.pieces.find((piece) => !piece.offcut && piece.cutStock?.id === source)?.id ?? null : null;
}
