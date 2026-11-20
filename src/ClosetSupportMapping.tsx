import { useEffect, useMemo, useState } from "react";
import { material, type Piece, type Project } from "./model";
import { partLabel } from "./partLabels";
import {
  assignClosetSupportRoles,
  closetSupportRoleOptions,
} from "./attachments";

export type ClosetSupportMappingProps = {
  project: Project;
  entryId: string;
  onChange: (project: Project) => void;
  onCancel: () => void;
  onComplete?: () => void;
};

const shortId = (id: string) => id.slice(0, 8);
const sizeText = (piece: Piece) =>
  `${piece.size.map((value) => Number(value.toFixed(3))).join(" × ")} in`;
const partText = (project: Project, piece: Piece) =>
  `${partLabel(project, piece.id)} · ${piece.name || material(piece.material).name} · ${sizeText(piece)} · ${shortId(piece.id)}`;

export function ClosetSupportMapping({
  project,
  entryId,
  onChange,
  onCancel,
  onComplete,
}: ClosetSupportMappingProps) {
  const context = useMemo(() => {
    try {
      const entry = project.ideaBindings
        .flatMap((binding) => binding.entries)
        .find((candidate) => candidate.id === entryId);
      const sectionIds = new Set(
        entry?.sections.map((mapping) => mapping.sectionId) ?? [],
      );
      const ownedIds = new Set(
        project.sections
          .filter((section) => sectionIds.has(section.id))
          .flatMap((section) => section.pieceIds),
      );
      return {
        roles: closetSupportRoleOptions(project, entryId),
        candidates: project.pieces.filter((piece) => {
          const stock = material(piece.material);
          return (
            ownedIds.has(piece.id) &&
            !piece.offcut &&
            stock.wood &&
            stock.stockKind === "sheet"
          );
        }),
        error: "",
      };
    } catch (error) {
      return {
        roles: [],
        candidates: [],
        error:
          error instanceof Error
            ? error.message
            : "The closet panels could not be read.",
      };
    }
  }, [project, entryId]);
  const recorded = () =>
    Object.fromEntries(
      context.roles.map((role) => [role.role, role.assignedPieceId ?? ""]),
    );
  const [choices, setChoices] = useState<Record<string, string>>(recorded),
    [error, setError] = useState("");
  useEffect(() => {
    setChoices(recorded());
    setError("");
  }, [project.id, entryId]);
  const candidateIds = new Set(context.candidates.map((piece) => piece.id));
  const missing = context.roles.filter(
    (role) => !candidateIds.has(choices[role.role] ?? ""),
  );
  const selectedIds = context.roles
    .map((role) => choices[role.role])
    .filter((id): id is string => !!id);
  const duplicateIds = new Set(
    selectedIds.filter((id, index) => selectedIds.indexOf(id) !== index),
  );
  const suggested = context.roles.filter(
    (role) => role.suggestedPieceId && candidateIds.has(role.suggestedPieceId),
  );
  const canConfirm =
    context.roles.length > 0 && missing.length === 0 && duplicateIds.size === 0;
  const choose = (role: string, pieceId: string) => {
    setChoices((current) => ({ ...current, [role]: pieceId }));
    setError("");
  };
  return (
    <section
      className="attachments-panel closet-support-mapping"
      aria-label="Closet support role mapping"
    >
      <span className="eyebrow">EXISTING CLOSET PANELS</span>
      <h2>Map closet support roles.</h2>
      <p className="small-note">
        Identify the two tower dividers and each shelf using the actual panels
        in this saved closet. Review the selections, then confirm them for
        support planning.
      </p>
      {suggested.length > 0 && (
        <div className="attachment-refresh-preview">
          <p className="small-note">
            Suggestions match the saved dimensions, source and placement
            exactly. Choose them below to stage a selection; confirmation saves
            it.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setChoices((current) => ({
                ...current,
                ...Object.fromEntries(
                  suggested.map((role) => [role.role, role.suggestedPieceId!]),
                ),
              }));
              setError("");
            }}
          >
            Use all suggested panels
          </button>
        </div>
      )}
      {!context.roles.length && !context.error && (
        <p role="alert" className="form-error">
          This saved design has no current closet tower roles to map. Return to
          shelf supports and choose a saved closet insert.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canConfirm) return;
          setError("");
          try {
            const assignments = Object.fromEntries(
              context.roles.map((role) => [role.role, choices[role.role]]),
            );
            onChange(assignClosetSupportRoles(project, entryId, assignments));
            onComplete?.();
          } catch (problem) {
            setError(
              problem instanceof Error
                ? problem.message
                : "The closet support roles could not be saved.",
            );
          }
        }}
      >
        {context.roles.map((role) => {
          const selected = choices[role.role] ?? "";
          const suggestion = context.candidates.find(
            (piece) => piece.id === role.suggestedPieceId,
          );
          return (
            <div className="attachment-plan" key={role.role}>
              <label className="field">
                {role.label}
                <select
                  aria-label={`Panel for ${role.label}`}
                  aria-invalid={duplicateIds.has(selected) || undefined}
                  value={selected}
                  onChange={(event) => choose(role.role, event.target.value)}
                >
                  <option value="">Choose a current panel</option>
                  {selected && !candidateIds.has(selected) && (
                    <option value={selected}>
                      Unavailable panel · {shortId(selected)}
                    </option>
                  )}
                  {context.candidates.map((piece) => (
                    <option
                      key={piece.id}
                      value={piece.id}
                      title={`${piece.name} · ${piece.id} · ${material(piece.material).name}`}
                    >
                      {partText(project, piece)}
                    </option>
                  ))}
                </select>
              </label>
              {duplicateIds.has(selected) && (
                <p className="form-error">
                  This panel is selected for more than one role. Choose a
                  different panel for each role.
                </p>
              )}
              {suggestion && selected !== suggestion.id && (
                <>
                  <p className="small-note">
                    Suggested: {partText(project, suggestion)}
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Use suggested panel for ${role.label}`}
                    onClick={() => choose(role.role, suggestion.id)}
                  >
                    Use suggested panel
                  </button>
                </>
              )}
              {!suggestion && (
                <p className="small-note">
                  No unique geometry match. Identify this panel from your edited
                  closet before selecting it.
                </p>
              )}
            </div>
          );
        })}
        {(error || context.error) && (
          <p role="alert" className="form-error">
            {error || context.error}
          </p>
        )}
        {missing.length > 0 && (
          <p className="small-note" role="status">
            {missing.length}{" "}
            {missing.length === 1 ? "role needs" : "roles need"} a current
            panel.
          </p>
        )}
        <button
          type="submit"
          className="button primary full"
          disabled={!canConfirm}
        >
          Confirm closet support roles
        </button>
        <button
          type="button"
          className="text-button"
          onClick={onCancel}
          style={{ marginTop: 12 }}
        >
          Cancel role mapping
        </button>
      </form>
    </section>
  );
}
