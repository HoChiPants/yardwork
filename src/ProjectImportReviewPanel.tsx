import type { ProjectImportReview } from "./projectImport";

export function ProjectImportReviewPanel({ review, reading, saving, onImport, onOpenLibrary }: {
  review: ProjectImportReview | null;
  reading: boolean;
  saving: boolean;
  onImport: () => void;
  onOpenLibrary: () => void;
}) {
  if (reading) return <p role="status" className="small-note">Reading project files…</p>;
  if (!review) return null;
  const pending = review.candidates.length;
  const retry = review.candidates.some(({ error }) => error);
  const pendingLabel = `${pending} ${pending === 1 ? "project" : "projects"}`;
  return (
    <section className="project-import-review" aria-label="Project import review">
      {pending > 0 && (
        <>
          <p role="status">{saving ? `Saving ${pendingLabel}…` : `${pendingLabel} ready to import`}</p>
          <ul aria-label="Projects to import">
            {review.candidates.map(({ source, project, error }) => (
              <li key={project.id}>
                <strong>{project.name}</strong>
                <small>{source}</small>
                {error && <span className="project-import-error">{error}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="button primary full" disabled={saving} onClick={onImport}>
            {retry ? `Retry ${pendingLabel}` : `Import ${pendingLabel}`}
          </button>
        </>
      )}
      {review.saved > 0 && (
        <p role="status">{review.saved} {review.saved === 1 ? "project" : "projects"} saved to the library.</p>
      )}
      {review.issues.length > 0 && (
        <div aria-label="Files that could not be imported" role="group">
          <p>{review.issues.length === 1 ? "One file needs attention." : "Some files need attention."}</p>
          <ul>
            {review.issues.map(({ source, detail }, index) => (
              <li key={`${source}/${index}`}><strong>{source}</strong><small>{detail}</small></li>
            ))}
          </ul>
        </div>
      )}
      {review.saved > 0 && !saving && (
        <button type="button" className="button secondary full" onClick={onOpenLibrary}>Open project library</button>
      )}
    </section>
  );
}
