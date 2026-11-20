export const SAVED_PROJECT_NOTES_TITLE = "Saved project notes";
export const SAVED_PROJECT_NOTES_CONTEXT =
  "May include earlier assumptions. Review against the current parts, plans and purchase records below.";

/** Preserve free text; it is not a computed status of later plans or purchases. */
export function projectNotesMarkdown(notes: string) {
  return notes.trim()
    ? `## ${SAVED_PROJECT_NOTES_TITLE}\n\n${SAVED_PROJECT_NOTES_CONTEXT}\n\n${notes}\n\n---\n\n`
    : "";
}
