import { useEffect, useState } from "react";
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
import { material, type Project, type V3 } from "./model";
import {
  createSection,
  duplicateSection,
  removeSection,
  sectionModified,
  sectionSummary,
  transformSection,
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
export function SectionsPanel({
  project,
  selectedId,
  onSelect,
  onChange,
  onGenerate,
  onMoveTool,
  onPartTool,
}: {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (p: Project) => void;
  onGenerate: (id: string) => void;
  onMoveTool: () => void;
  onPartTool: () => void;
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
  const section = project.sections.find((s) => s.id === selectedId),
    owned = new Set(project.sections.flatMap((s) => s.pieceIds));
  const labels = [
    ...new Set(
      project.pieces
        .filter((p) => !p.offcut && !owned.has(p.id))
        .map((p) => p.assembly),
    ),
  ];
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
      <label className="field">
        Current section
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value || null)}
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
                  {s.generator
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
                      s.id === section.id ? { ...s, name } : s,
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
          {section.generator ? (
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
            <button className="text-button full" onClick={onPartTool}>
              Select individual parts
            </button>
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
                  const ids = project.pieces
                    .filter(
                      (p) =>
                        !p.offcut && !owned.has(p.id) && p.assembly === label,
                    )
                    .map((p) => p.id);
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
