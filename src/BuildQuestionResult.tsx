import type {
  BuildQuestionAction,
  BuildQuestionAnswer,
} from "./buildQuestions";

export function BuildQuestionResult({
  answer,
  onAction,
}: {
  answer: BuildQuestionAnswer;
  onAction: (action: BuildQuestionAction) => void;
}) {
  return (
    <section className="proposal workspace-question" aria-label={answer.title}>
      <h3>{answer.title}</h3>
      <p role="status">{answer.detail}</p>
      {answer.rows?.map(({ id, title, detail, link }) => (
        <article key={id} aria-label={title}>
          <strong>{title}</strong>
          <p>{detail}</p>
          {link && (
            <button
              className="button secondary"
              type="button"
              onClick={() => onAction(link.action)}
            >
              {link.label}
            </button>
          )}
        </article>
      ))}
      {answer.scope && <p className="small-note">{answer.scope}</p>}
      {answer.link && (
        <button
          className="button secondary"
          type="button"
          onClick={() => onAction(answer.link!.action)}
        >
          {answer.link.label}
        </button>
      )}
    </section>
  );
}
