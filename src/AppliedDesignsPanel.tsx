import { Pencil, Unlink } from "lucide-react";
import type { Project } from "./model";

/** Persistent design identity is separate from section and individual-part selection. */
export function AppliedDesignsPanel({
  project,
  onRevise,
  onDetach,
  onAdopt,
}: {
  project: Project;
  onRevise: (bindingId: string, entryIds?: string[]) => void;
  onDetach: (bindingId: string) => void;
  onAdopt: (sectionId: string) => void;
}) {
  const bindings = project.ideaBindings,
    mapped = new Set(
      bindings.flatMap((binding) =>
        binding.entries.flatMap((entry) =>
          entry.sections.map((s) => s.sectionId),
        ),
      ),
    ),
    legacy = project.sections.filter(
      (section) => section.recipe && !mapped.has(section.id),
    );
  if (!bindings.length && !legacy.length) return null;
  return (
    <section className="applied-designs" aria-label="Saved editable designs">
      <h4>Saved designs</h4>
      <p className="small-note">
        Revise an applied design after saving or reopening. Other project work
        stays in place.
      </p>
      {bindings.map((binding) => (
        <div className="applied-design-row" key={binding.id}>
          <button
            className="saved-design-edit"
            onClick={() => onRevise(binding.id)}
            aria-label={`Revise design ${binding.title}`}
          >
            <Pencil size={14} />
            <span>
              <strong>{binding.title}</strong>
              <small>
                {binding.entries.length}{" "}
                {binding.entries.length === 1 ? "assembly" : "assemblies"} ·
                revision {binding.revision}
              </small>
            </span>
          </button>
          <details>
            <summary>Individual assemblies and actions</summary>
            {binding.entries.map((entry) => {
              const name =
                entry.spec.type === "furniture"
                  ? entry.spec.recipe.name
                  : entry.spec.structure.kind.replaceAll("-", " ");
              return (
                <button
                  key={entry.id}
                  className="text-button full"
                  onClick={() => onRevise(binding.id, [entry.id])}
                >
                  Revise {name}
                </button>
              );
            })}
            <button
              className="text-button"
              onClick={() => onDetach(binding.id)}
            >
              <Unlink size={13} /> Make independent parts
            </button>
            <p className="small-note">
              Making independent parts removes the saved design controls and
              retains its geometry, cuts and connections. Undo is available.
            </p>
          </details>
        </div>
      ))}
      {legacy.length > 0 && (
        <details>
          <summary>Enable revisions for older furniture sections</summary>
          <p className="small-note">
            Use the saved recipe as an editable baseline. Existing custom cuts
            and parts stay in place; any affected rebuild needs review.
          </p>
          {legacy.map((section) => (
            <button
              className="text-button full"
              key={section.id}
              onClick={() => onAdopt(section.id)}
            >
              Enable revisions for {section.name}
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
