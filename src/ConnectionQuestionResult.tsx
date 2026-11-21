import type {
  answerConnectionQuestion,
  ConnectionAnswerPair,
} from "./connectionQuestions";
import { formatPreciseInches } from "./measurement";

export type ConnectionQuestionAction =
  | { kind: "inspect"; firstId: string; secondId?: string }
  | { kind: "compare"; firstId: string; secondId: string }
  | { kind: "open-plan"; firstId: string; secondId: string; planId: string };

const contactStatus = {
  "face-contact": "Wood faces meet",
  "near-face": "Wood faces are close",
  interference: "Parts overlap",
  "outside-search": "Faces are apart",
  "no-facing-contact": "No facing wood surfaces found",
  unsupported: "Surface review unavailable",
} satisfies Record<ConnectionAnswerPair["contact"]["state"], string>;

export function ConnectionQuestionResult({
  answer,
  onAction,
}: {
  answer: ReturnType<typeof answerConnectionQuestion>;
  onAction: (action: ConnectionQuestionAction) => void;
}) {
  return (
    <section className="proposal workspace-question" aria-label="Workspace joint review">
      <h3>Workspace joint review</h3>
      {"message" in answer ? (
        <p role="status">
          {answer.message}
          {!!answer.choices.length && <> Available labels {answer.choices.join(", ")}.</>}
        </p>
      ) : (
        <>
          {!answer.pairs.length && (
            <>
              <p>No facing wood surfaces found near {answer.anchor.label} · {answer.anchor.name}. Check its placement or specify the other part.</p>
              <button type="button" className="button secondary" onClick={() =>
                onAction({ kind: "inspect", firstId: answer.anchor.id })}>
                Inspect {answer.anchor.label}
              </button>
            </>
          )}
          {answer.pairs.map(({ first, second, contact, plans, trimSeam }) => {
            const memberIds = { firstId: first.id, secondId: second.id };
            return (
              <article key={second.id}>
                <strong>{first.label} · {first.name} → {second.label} · {second.name}</strong>
                <p>
                  {contactStatus[contact.state]}
                  {contact.gap !== null && <> · {formatPreciseInches(contact.gap)} gap</>}.
                </p>
                {trimSeam && <p>{trimSeam}</p>}
                <div className="button-row">
                  {!trimSeam && plans.map(({ id, label }) => (
                    <button key={id} type="button" className="button secondary" onClick={() =>
                      onAction({ kind: "open-plan", ...memberIds, planId: id })}>
                      Open screw plan {label}
                    </button>
                  ))}
                  {!trimSeam && !plans.length && contact.state === "face-contact" && (
                    <button type="button" className="button secondary" onClick={() =>
                      onAction({ kind: "compare", ...memberIds })}>
                      Compare screw entry sides
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={() =>
                    onAction({ kind: "inspect", ...memberIds })}>
                    Inspect joint
                  </button>
                </div>
              </article>
            );
          })}
          {answer.more && (
            <button type="button" className="text-button" onClick={() =>
              onAction({ kind: "inspect", firstId: answer.anchor.id })}>
              Review more faces near {answer.anchor.label}
            </button>
          )}
        </>
      )}
    </section>
  );
}
