import {
  sunliteEstimateLines,
  sunliteEstimateScope,
  sunliteInstructions,
  type SunliteTakeoff,
} from "./sunliteTakeoff";

export function SunliteTakeoffPanel({
  estimate,
  onAdd,
  backingNotes = [],
}: {
  estimate: SunliteTakeoff;
  onAdd?: () => void;
  backingNotes?: string[];
}) {
  const { findings, review, allocations } = sunliteEstimateLines(estimate);
  const canAdd = estimate.quantities.some((row) => row.offer && row.missing);
  const details = (
    <>
      <p className="small-note">{sunliteEstimateScope}</p>
      {backingNotes.map((note, index) => (
        <p className="small-note" key={index}>
          {note}
        </p>
      ))}
      <p className="small-note">
        Stock allocations use nominal lengths. Add allowances for cuts, trim and
        tape overlap.
      </p>
      <ul>
        {findings.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="small-note">
        <a href={sunliteInstructions} target="_blank" rel="noreferrer">
          Palram installation resources
        </a>
      </p>
      {review.length > 0 && (
        <>
          <h4>Edges and seams to review</h4>
          <ul>
            {review.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
  const cuts = (
    <ol>
      {allocations.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
  );
  if (!onAdd)
    return (
      <section>
        <h2>SUNLITE panel accessory estimate</h2>
        {details}
        {allocations.length > 0 && (
          <>
            <h3>Nominal profile cuts</h3>
            {cuts}
          </>
        )}
      </section>
    );
  return (
    <details className="field-section">
      <summary>
        SUNLITE panel accessory estimate · {estimate.panels.length} panels
      </summary>
      {details}
      {allocations.length > 0 && (
        <details>
          <summary>Nominal profile cuts</summary>
          {cuts}
        </details>
      )}
      {canAdd && (
        <button type="button" className="button secondary full" onClick={onAdd}>
          Add missing estimated supplies
        </button>
      )}
    </details>
  );
}
