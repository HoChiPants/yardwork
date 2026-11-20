import { useMemo, useState } from "react";
import {
  assemblyPartLabels,
  findAssemblyPartLabels,
  type AssemblyPartLabel,
} from "./assemblyPartLabels";
import type { Project } from "./model";
import "./GuidePartLabels.css";

export function GuidePartLabels({
  project,
  stepId,
  focusedId,
  onLocate,
  onPrint,
}: {
  project: Project;
  stepId: string;
  focusedId?: string;
  onLocate: (row: AssemblyPartLabel) => void;
  onPrint: (stepId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => assemblyPartLabels(project), [project]);
  const matches = findAssemblyPartLabels(rows, query);
  const ledgerRow =
    !matches.length &&
    project.partLabels.find(
      ({ label }) => label.toLowerCase() === query.trim().toLowerCase(),
    );
  const offcut =
    ledgerRow &&
    project.pieces.some(({ id, offcut }) => id === ledgerRow.partId && offcut);
  return (
    <details className="field-section guide-part-labels">
      <summary>Find or print part labels</summary>
      <label className="field">
        Find by part label or name
        <input
          type="search"
          placeholder="P012 or shelf"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || matches.length !== 1) return;
            event.preventDefault();
            onLocate(matches[0]);
          }}
        />
      </label>
      {query.trim() && !matches.length && (
        <p className="small-note" role="status">
          {offcut
            ? "This label is for a remnant in the Cut pool."
            : ledgerRow
              ? "This label belongs to a part removed from the build."
              : "No matching part."}
        </p>
      )}
      {matches.slice(0, 12).map((row) => (
        <button
          key={row.pieceId}
          type="button"
          className="step-part guide-label-result"
          aria-label={`Locate ${row.label} · ${row.name}`}
          aria-pressed={focusedId === row.pieceId}
          onClick={() => onLocate(row)}
        >
          <strong>{row.label}</strong>
          <span>
            {row.name}
            <small>
              Step {row.step.number} · {row.step.title}
            </small>
          </span>
        </button>
      ))}
      {matches.length > 12 && (
        <p className="small-note">Showing 12 of {matches.length} matches.</p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button secondary small"
          disabled={!rows.some((row) => row.stepId === stepId)}
          onClick={() => onPrint(stepId)}
        >
          Print this step’s labels
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!rows.length}
          onClick={() => onPrint()}
        >
          Print all part labels
        </button>
      </div>
    </details>
  );
}

export function PrintAssemblyPartLabels({
  title,
  labels,
}: {
  title: string;
  labels: readonly AssemblyPartLabel[];
}) {
  const rows = [];
  for (let i = 0; i < labels.length; i += 3) rows.push(labels.slice(i, i + 3));
  return (
    <article
      className="print-assembly-part-labels"
      aria-label="Printable assembly part labels"
    >
      <h1>{title} · Part labels</h1>
      <p>
        Dimensions are length × width × thickness. Match each label to its part
        in the build guide.
      </p>
      {rows.map((row) => (
        <div className="print-part-label-row" key={row[0].pieceId}>
          {row.map((part) => (
            <section
              className="print-part-label"
              key={part.pieceId}
              data-part-label={part.label}
            >
              <h2>{part.label}</h2>
              <strong>{part.name}</strong>
              <span>{part.stock}</span>
              <span>
                {part.caption && `${part.caption} `}
                {part.dimensions}
              </span>
              {part.profile && <span>Profile cuts · see guide</span>}
              <span>
                Step {part.step.number} · {part.step.title}
              </span>
            </section>
          ))}
        </div>
      ))}
    </article>
  );
}
