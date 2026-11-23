import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import type { Project, Section, V3 } from "./model";
import { previewSectionTranslation, type SectionTranslationPreview } from "./sectionTranslation";

export function CheckedSectionMove({ project, section, preview, onPreview, onApply }: {
  project: Project;
  section: Section;
  preview: SectionTranslationPreview | null;
  onPreview: (value: SectionTranslationPreview | null) => void;
  onApply: (value: SectionTranslationPreview) => void;
}) {
  const [offset, setOffset] = useState<V3>([0, 0, 0]);
  const [error, setError] = useState("");
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onPreview(previewSectionTranslation(project, section.id, offset));
      setError("");
    } catch (cause) {
      onPreview(null);
      setError(cause instanceof Error ? cause.message : "Check the section before moving it.");
    }
  }
  return <details className="field-section" onToggle={(event) => {
    if (!event.currentTarget.open && preview) onPreview(null);
  }}>
    <summary>Check a section move</summary>
    <form onSubmit={check}>
      <p className="small-note">Enter distances from the current position. The check follows a straight path, including fitted parts, and checks wood-to-wood contact and work-zone limits.</p>
      <div className="number-row">
        {["X offset", "Y offset", "Z offset"].map((label, axis) => (
          <LengthInput key={label} label={label} value={offset[axis]} min={-12000} max={12000} required
            onChange={(value) => {
              onPreview(null);
              setError("");
              setOffset((current) => current.map((distance, index) => index === axis ? value : distance) as V3);
            }} />
        ))}
      </div>
      <button type="submit" className="button secondary full">Preview section move</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <section aria-label="Section move preview" className="field-section">
      <p role="status">{preview.stop ? `${preview.stop}.` : "Requested move clears."}</p>
      <p className="small-note">Anchor {preview.position.map(formatPreciseInches).join(" / ")} (X / Y / Z) · {preview.parts.length} moving parts</p>
      <div className="button-row">
        {preview.project !== preview.source && (
          <button type="button" className="button primary small" onClick={() => onApply(preview)}>
            {preview.stop ? "Move to stop" : "Apply section move"}
          </button>
        )}
        <button type="button" className="text-button" onClick={() => onPreview(null)}>Cancel preview</button>
      </div>
    </section>}
  </details>;
}
