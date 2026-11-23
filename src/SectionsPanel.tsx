import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  Copy,
  Layers3,
  Move3D,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { material, type Piece, type Project, type Section, type V3 } from "./model";
import { LidMotionPanel } from "./LidMotionPanel";
import type { LidPreview } from "./lidMotion";
import { LidHingesPanel } from "./LidHingesPanel";
import { removeLidHingePlan } from "./hinges";
import { CheckedSectionMove } from "./CheckedSectionMove";
import type { SectionTranslationPreview } from "./sectionTranslation";
import {
  createSection,
  duplicateSection,
  isSimpleSection,
  looseSectionParts,
  removeSection,
  sectionModified,
  sectionSummary,
  transformSection,
  ungroupSectionBlocker,
  previewRecipeResize,
  setSectionLidOpen,
} from "./sections";
function AxisInput({
  label,
  value,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          value={draft}
          step={unit === "°" ? 15 : 0.125}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const number = Number(draft);
            if (draft.trim() && Number.isFinite(number) && number !== value) {
              try {
                onCommit(number);
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Invalid section transform",
                );
                setDraft(String(value));
              }
            } else setDraft(String(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <small>{unit}</small>
      </div>
      {error && (
        <span role="alert" className="form-error">
          {error}
        </span>
      )}
    </label>
  );
}
function RecipeEditor({
  project,
  section,
  onChange,
  onLidPreview,
  lidPreviewSectionId,
}: {
  project: Project;
  section: Section;
  onChange: (project: Project) => void;
  onLidPreview?: (preview: LidPreview | null) => void;
  lidPreviewSectionId?: string | null;
}) {
  const recipe = section.recipe!;
  const [showHinges, setShowHinges] = useState(false);
  const [draft, setDraft] = useState({
      width: String(recipe.width),
      depth: String(recipe.depth),
      height: String(recipe.height),
    }),
    [error, setError] = useState("");
  useEffect(
    () =>
      setDraft({
        width: String(recipe.width),
        depth: String(recipe.depth),
        height: String(recipe.height),
      }),
    [recipe.width, recipe.depth, recipe.height],
  );
  const preview = useMemo(() => {
    try {
      if (Object.values(draft).some((v) => !v.trim()))
        throw Error("Enter all three section dimensions.");
      return {
        value: previewRecipeResize(project, section.id, {
          width: Number(draft.width),
          depth: Number(draft.depth),
          height: Number(draft.height),
        }),
        error: null,
      };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : "Invalid dimensions",
      };
    }
  }, [project, section.id, draft]);
  const changed =
    Number(draft.width) !== recipe.width ||
    Number(draft.depth) !== recipe.depth ||
    Number(draft.height) !== recipe.height;
  return (
    <div className="section-description recipe-editor">
      <span className="tag">
        Editable {recipe.kind}
        {recipe.storage ? " · enclosed storage" : ""}
      </span>
      <p>
        {recipe.width} × {recipe.depth} in footprint · {recipe.height} in{" "}
        {recipe.kind === "bench" ? "seat" : "overall"} height.
      </p>
      <div className="number-row">
        {(["width", "depth", "height"] as const).map((field) => (
          <label className="number-field" key={field}>
            <span>
              {field === "height" && recipe.kind === "bench"
                ? "Seat height"
                : field[0].toUpperCase() + field.slice(1)}
            </span>
            <div>
              <input
                aria-label={`Section ${field === "height" && recipe.kind === "bench" ? "seat height" : field}`}
                type="number"
                step="0.125"
                min="0.125"
                max="240"
                value={draft[field]}
                onChange={(e) => {
                  onLidPreview?.(null);
                  setDraft((d) => ({ ...d, [field]: e.target.value }));
                }}
              />
              <small>in</small>
            </div>
          </label>
        ))}
      </div>
      <p className="small-note">
        Rebuilds cut lengths from the recipe while keeping stock thickness,
        section placement and unrelated parts.
      </p>
      {!changed && preview.value?.manualEdits && (
        <div className="notice">
          <AlertTriangle size={16} />
          <p>
            This section has manual part edits. Applying dimensions replaces
            them with recipe geometry and removes affected connections; preview
            lid access preserves its edits around the provisional pivot.
          </p>
        </div>
      )}
      {changed && preview.value && (
        <div className="notice">
          <AlertTriangle size={16} />
          <p>
            Replace {preview.value.replacedParts} parts with{" "}
            {preview.value.newParts}; remove {preview.value.removedConnections}{" "}
            connection(s) involving them.{" "}
            {preview.value.manualEdits
              ? "Manual part edits in this section will be replaced. "
              : ""}
            {preview.value.incompleteEstimate
              ? "Some cuts exceed available stock. "
              : ""}
            {preview.value.affectedMotions.length > 0 &&
              `After rebuilding, retest ${preview.value.affectedMotions.join(", ")} and review the new mounting faces. `}
            Undo is available.
          </p>
        </div>
      )}
      {preview.error && (
        <p className="form-error" role="alert">
          {preview.error}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={!changed || !preview.value}
        onClick={() => {
          onLidPreview?.(null);
          if (preview.value) onChange(preview.value.project);
        }}
      >
        Apply dimensions
      </button>
      {recipe.openingLid && (
        <>
          <label className="field">
            <span>
              <input
                type="checkbox"
                aria-label="Preview lid open"
                checked={recipe.lidOpen}
                onChange={(e) => {
                  onLidPreview?.(null);
                  try {
                    onChange(
                      setSectionLidOpen(project, section.id, e.target.checked),
                    );
                    setError("");
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Could not preview lid",
                    );
                  }
                }}
              />{" "}
              Preview lid open
            </span>
          </label>
          <p className="small-note">
            This saves the selected measured hinge pose, or the provisional rear
            pivot when no measured hinge is selected. Close the saved pose
            before generating a closed build guide.
          </p>
          {onLidPreview && (
            <LidMotionPanel
              project={project}
              section={section}
              onPreview={onLidPreview}
              onChange={onChange}
              previewActive={lidPreviewSectionId === section.id}
            />
          )}
          <button
            className="button secondary full"
            type="button"
            aria-expanded={showHinges}
            onClick={() => setShowHinges((value) => !value)}
          >
            Measured hinges
          </button>
          {showHinges && (
            <LidHingesPanel
              project={project}
              sectionId={section.id}
              onChange={onChange}
              onPreview={onLidPreview}
            />
          )}
        </>
      )}
    </div>
  );
}

export function SectionPartPicker({
  project,
  parts,
  selectedIds,
  onToggle,
  onCreate,
  onCancel,
  onPickInWorkspace,
}: {
  project: Project;
  parts: readonly Piece[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onCreate: (name: string) => void;
  onCancel: () => void;
  onPickInWorkspace?: () => void;
}) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(25);
  const rows = useMemo(() => {
    const labels = new Map(project.partLabels.map(({ partId, label }) => [partId, label]));
    return parts.map(({ id, name }) => ({
      id,
      label: [labels.get(id), name].filter(Boolean).join(" · "),
    }));
  }, [parts, project.partLabels]);
  const matches = rows.filter(({ label }) => label.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <section className="group-parts-picker" aria-label="Group loose parts">
      <div className="panel-intro">
        <h2>Group loose parts</h2>
        <p>Select pieces in the workspace or from the list.</p>
      </div>
      {onPickInWorkspace && <button type="button" className="button secondary full" onClick={onPickInWorkspace}>Pick in 3D</button>}
      <label className="field">
        Section name
        <input value={name} maxLength={80} placeholder="My section" onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="small-note" role="status">{selectedIds.size} selected · Choose at least two</p>
      <button type="button" className="button primary full" disabled={selectedIds.size < 2} onClick={() => onCreate(name)}>
        <Layers3 size={15} /> Create section
      </button>
      <button type="button" className="text-button full" onClick={onCancel}>Cancel grouping</button>
      {rows.length > 8 && (
        <label className="field">
          Find loose parts
          <input type="search" value={filter} onChange={(event) => {
            setFilter(event.target.value);
            setLimit(25);
          }} />
        </label>
      )}
      <fieldset className="group-part-list">
        <legend>Loose parts</legend>
        {matches.slice(0, limit).map(({ id, label }) => (
          <label key={id}>
            <input type="checkbox" checked={selectedIds.has(id)} onChange={() => onToggle(id)} />
            <span>{label}</span>
          </label>
        ))}
        {!matches.length && <p className="small-note">No matching parts.</p>}
        {matches.length > limit && (
          <button type="button" className="text-button" onClick={() => setLimit(limit + 25)}>Show more parts</button>
        )}
      </fieldset>
    </section>
  );
}

export function SectionsPanel({
  project,
  selectedId,
  onSelect,
  onChange,
  onGenerate,
  onReviewFloorBase,
  onReviewWindowOpening,
  onEditCabinetPulls,
  onMoveTool,
  translationPreview,
  onTranslationPreview,
  onApplyTranslation,
  onPartTool,
  onUngroup,
  onLidPreview,
  lidPreviewSectionId,
}: {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (p: Project) => void;
  onGenerate: (id: string) => void;
  onReviewFloorBase: (section: Section) => void;
  onReviewWindowOpening: (section: Section) => void;
  onEditCabinetPulls: (section: Section) => void;
  onMoveTool: () => void;
  translationPreview: SectionTranslationPreview | null;
  onTranslationPreview: (value: SectionTranslationPreview | null) => void;
  onApplyTranslation: (value: SectionTranslationPreview) => void;
  onPartTool: () => void;
  onUngroup: (id: string) => void;
  onLidPreview?: (preview: LidPreview | null) => void;
  lidPreviewSectionId?: string | null;
}) {
  const [error, setError] = useState("");
  const attempt = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Section edit failed");
    }
  };
  const section = project.sections.find((s) => s.id === selectedId);
  const canShowUngroup = !!section && isSimpleSection(section);
  const ungroupBlocker = canShowUngroup ? ungroupSectionBlocker(project, section) : undefined;
  const loose = looseSectionParts(project);
  const labels = [...new Set(loose.map((part) => part.assembly))];
  const orphanedHinges = project.lidHingePlans.filter(
    (plan) =>
      !project.sections.some(
        (section) =>
          section.id === plan.sectionId && !!section.recipe?.openingLid,
      ),
  );
  const members = section
    ? project.pieces.filter((p) => section.pieceIds.includes(p.id))
    : [];
  return (
    <>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="panel-intro">
        <span className="eyebrow">BUILD WITH WHOLE SECTIONS</span>
        <h2>Pieces that work together.</h2>
        <p>
          Select a section to move, rotate, duplicate, or regenerate it. Every
          part stays editable.
        </p>
      </div>
      {orphanedHinges.length > 0 && (
        <details
          className="field-section"
          aria-label="Hinge plans without an opening section"
        >
          <summary>
            Hinge plans without an opening section ({orphanedHinges.length})
          </summary>
          <p className="small-note">
            These saved intents no longer have an opening section. Select
            another opening section’s Measured hinges controls to map one
            explicitly, or remove an intent here. Other plans, purchases and
            label history stay in place.
          </p>
          {orphanedHinges.map((plan) => (
            <div key={plan.id}>
              <p className="small-note">
                <strong>
                  {plan.label} · {plan.name}
                </strong>
              </p>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  attempt(() => {
                    onLidPreview?.(null);
                    onChange(removeLidHingePlan(project, plan.id));
                  })
                }
              >
                Remove {plan.label} hinge plan
              </button>
            </div>
          ))}
        </details>
      )}
      <label className="field">
        Current section
        <select
          value={selectedId ?? ""}
          onChange={(e) => {
            onLidPreview?.(null);
            onSelect(e.target.value || null);
          }}
        >
          <option value="">Choose a section…</option>
          {project.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.pieceIds.length} parts
            </option>
          ))}
        </select>
      </label>
      {!section && (
        <div className="section-picker">
          {project.sections.map((s) => (
            <button
              key={s.id}
              aria-label={`Select section ${s.name}`}
              onClick={() => onSelect(s.id)}
            >
              <Layers3 size={16} />
              <span>
                <strong>{s.name}</strong>
                <small>
                  {s.recipe
                    ? `${s.recipe.width} × ${s.recipe.depth} in ${s.recipe.kind}`
                    : s.generator
                      ? sectionSummary(s.generator)
                      : `${s.pieceIds.length} grouped parts`}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      {section && (
        <>
          <label className="field">
            Section name
            <input
              value={section.name}
              maxLength={80}
              onChange={(e) => {
                const name = e.target.value;
                if (name)
                  onChange({
                    ...project,
                    sections: project.sections.map((s) =>
                      s.id === section.id
                        ? {
                            ...s,
                            name,
                            recipe: s.recipe ? { ...s.recipe, name } : null,
                          }
                        : s,
                    ),
                    pieces: project.pieces.map((p) =>
                      section.pieceIds.includes(p.id)
                        ? { ...p, assembly: name }
                        : p,
                    ),
                  });
              }}
            />
          </label>
          {section.cabinetDoors && <button type="button" className="button secondary full" onClick={() => onEditCabinetPulls(section)}>
            Edit cabinet pulls
          </button>}
          {section.recipe ? (
            <RecipeEditor
              key={`${project.id}/${section.id}`}
              project={project}
              section={section}
              onChange={onChange}
              onLidPreview={onLidPreview}
              lidPreviewSectionId={lidPreviewSectionId}
            />
          ) : section.generator ? (
            <div className="section-description">
              <span className="tag">
                Generated {section.generator.type === "wall" ? "wall" : "base"}
              </span>
              <p>{sectionSummary(section.generator)}</p>
              <button
                className="button primary full"
                onClick={() => onGenerate(section.id)}
              >
                <Sparkles size={14} />
                Revise this section
              </button>
              {section.generator.windowOpening && (
                <button type="button" className="button secondary full" onClick={() => onReviewWindowOpening(section)}>
                  Plan flashing for this opening
                </button>
              )}
              {section.generator.type === "foundation" && (
                <button type="button" className="button secondary full" onClick={() => onReviewFloorBase(section)}>
                  Review floor-base joist ends
                </button>
              )}
              {sectionModified(project, section) && (
                <div className="notice">
                  <AlertTriangle size={16} />
                  <p>
                    This section has manual part edits. Regenerating replaces
                    its parts and removes their connections. Review the proposal
                    before applying.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="small-note">
              Manually grouped section. Its parts move together. Dimensioned
              regeneration is available for generated walls and bases.
            </p>
          )}
          <div className="field-section">
            <h4>
              <Move3D size={14} />
              Section anchor
            </h4>
            <div className="number-row">
              {["Section X", "Section Y", "Section Z"].map((label, i) => (
                <AxisInput
                  key={label}
                  label={label}
                  value={section.origin[i]}
                  unit="in"
                  onCommit={(n) => {
                    const origin = [...section.origin] as V3;
                    origin[i] = n;
                    onChange(
                      transformSection(
                        project,
                        section.id,
                        origin,
                        section.rotation,
                      ),
                    );
                  }}
                />
              ))}
            </div>
            <div className="number-row">
              {["Section pitch", "Section yaw", "Section roll"].map(
                (label, i) => (
                  <AxisInput
                    key={label}
                    label={label}
                    value={(section.rotation[i] * 180) / Math.PI}
                    unit="°"
                    onCommit={(n) => {
                      const rotation = [...section.rotation] as V3;
                      rotation[i] = (n * Math.PI) / 180;
                      onChange(
                        transformSection(
                          project,
                          section.id,
                          section.origin,
                          rotation,
                        ),
                      );
                    }}
                  />
                ),
              )}
            </div>
            <button className="button secondary full" onClick={onMoveTool}>
              <Move3D size={14} />
              Move section in 3D
            </button>
            <CheckedSectionMove key={section.id} project={project} section={section} preview={translationPreview}
              onPreview={onTranslationPreview} onApply={onApplyTranslation} />
            <button className="text-button full" onClick={onPartTool}>
              Select individual parts
            </button>
            {canShowUngroup && (
              <>
                <button type="button" className="button secondary full" disabled={!!ungroupBlocker}
                  onClick={() => onUngroup(section.id)}>
                  Ungroup parts
                </button>
                {ungroupBlocker && <p className="small-note">{ungroupBlocker}</p>}
              </>
            )}
          </div>
          <div className="field-section">
            <h4>
              <Box size={14} />
              Parts in this section
            </h4>
            <div className="section-material-counts">
              {[...new Set(members.map((a) => a.material))].map((id) => (
                <p key={id}>
                  {members.filter((a) => a.material === id).length} ×{" "}
                  {material(id).name}
                </p>
              ))}
            </div>
          </div>
          <div className="inline">
            <button
              className="button secondary"
              onClick={() =>
                attempt(() => {
                  const result = duplicateSection(project, section.id);
                  onChange(result.project);
                  onSelect(result.sectionId);
                })
              }
            >
              <Copy size={14} />
              Duplicate section
            </button>
          </div>
          <small className="small-note">
            Copies internal screw connections and adds a build step. Specify
            connections to the rest of the project separately.
          </small>
          <button
            className="button danger full"
            onClick={() =>
              attempt(() => {
                onChange(removeSection(project, section.id));
                onSelect(null);
              })
            }
          >
            <Trash2 size={14} />
            Remove section & parts
          </button>
        </>
      )}
      {labels.length > 0 && (
        <div className="field-section">
          <h4>Group existing parts</h4>
          <p>
            Older projects and loose parts can be grouped by their assembly
            label. Offcuts stay separate.
          </p>
          {labels.map((label) => (
            <button
              key={label}
              className="step-part"
              onClick={() =>
                attempt(() => {
                  const ids = loose.filter((part) => part.assembly === label).map((part) => part.id);
                  const result = createSection(
                    project,
                    ids,
                    label || "My section",
                  );
                  onChange(result.project);
                  onSelect(result.sectionId);
                })
              }
            >
              <Plus size={14} />
              <span>Group {label || "unnamed parts"}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
