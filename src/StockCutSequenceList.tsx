import { useId, useState } from "react";
import type { BomRow } from "./engine";
import { material, type Project } from "./model";
import { tubeKerfSchema } from "./cutSourceAxes";
import {
  stockCutSequenceContext,
  stockCutMaterialNotes,
  type StockCutLayout,
  type StockCutSequence,
  stockCutSequences,
} from "./stockCutSequence";

export function MaterialCutNote({ id }: { id: BomRow["id"] }) {
  const notes = stockCutMaterialNotes(id);
  if (!notes) return null;
  return (
    <p className="small-note">
      {notes.text}
      {notes.link && (
        <>
          {" "}
          <a href={notes.link.url} target="_blank" rel="noreferrer">
            {notes.link.label}
          </a>
        </>
      )}
    </p>
  );
}

function SequenceBody({ sequence }: { sequence: StockCutSequence }) {
  if (sequence.review) return <p className="small-note">{sequence.review}</p>;
  return (
    <>
      <ol>
        {sequence.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {sequence.followUp.map((step) => (
        <p className="small-note" key={step}>
          {step}
        </p>
      ))}
      {sequence.remnants.length > 0 && (
        <p className="small-note">
          Expected leftovers · {sequence.remnants.join(" · ")}
        </p>
      )}
    </>
  );
}

export function StockCutSequenceList({
  project,
  row,
  sequences,
  onRecord,
  onRecordMany,
  onSaveLoss,
}: {
  project: Project;
  row: BomRow;
  sequences: readonly StockCutSequence[];
  onRecord: (layout: StockCutLayout, onHand: boolean) => void;
  onRecordMany: (layouts: StockCutLayout[], onHand: boolean) => void;
  onSaveLoss: (layout: StockCutLayout) => void;
}) {
  const [allOnHand, setAllOnHand] = useState(false);
  if (!sequences.length) return null;
  const needsReview = sequences.filter(
    (sequence) => sequence.review && !sequence.tube?.fitsMeasured,
  ).length;
  const ready = sequences.filter(({ layout, review }) =>
    !review && layout.kind !== "tube" && layout.kept.length > 0,
  );
  return (
    <details className="stock-cut-order">
      <summary>
        Stock cut order · {sequences.length}{" "}
        {sequences.length === 1 ? "unit" : "units"}
        {needsReview > 0 && ` · ${needsReview} to review`}
      </summary>
      <p className="small-note">{stockCutSequenceContext}</p>
      <MaterialCutNote id={row.id} />
      {ready.length > 1 && (
        <div>
        <details className="stock-cut-batch">
          <summary>Record multiple stock units</summary>
          <p className="small-note">
            Record {ready.length} stock units together after checking their cut orders.
            {" "}This adds {ready.reduce((total, { layout }) => total + layout.leftovers.length, 0)} expected offcuts to the Cut pool.
            {ready.length < sequences.length && " Units that need review stay available individually."}
          </p>
          <label className="checkbox-field">
            <input type="checkbox" checked={allOnHand} onChange={(event) => setAllOnHand(event.target.checked)} />
            I already have all these stock units
          </label>
          <button type="button" className="button secondary small" onClick={() => {
            onRecordMany(ready.map(({ layout }) => layout), allOnHand);
            setAllOnHand(false);
          }}>
            Record {ready.length} stock units
          </button>
        </details>
        </div>
      )}
      {sequences.map((sequence) => (
        <StockCutUnit
          key={
            sequence.tube?.key ?? sequence.layout.kept[0]?.id ?? sequence.title
          }
          project={project}
          row={row}
          sequence={sequence}
          onRecord={onRecord}
          onSaveLoss={onSaveLoss}
        />
      ))}
    </details>
  );
}

export function StockCutUnit({
  project,
  row,
  sequence,
  initiallyOpen,
  onRecord,
  onSaveLoss,
}: {
  project: Project;
  row: BomRow;
  sequence: StockCutSequence;
  initiallyOpen?: boolean;
  onRecord: (layout: StockCutLayout, onHand: boolean) => void;
  onSaveLoss: (layout: StockCutLayout) => void;
}) {
  const fieldId = useId();
  const [entered, setEntered] = useState<string | null>(null);
  const [onHand, setOnHand] = useState(false);
  const editableLoss = sequence.tube?.fitsMeasured;
  const savedLoss = sequence.layout.tubeKerf;
  const enteredLoss =
    editableLoss && entered !== null && entered.trim() !== ""
      ? tubeKerfSchema.safeParse(Number(entered))
      : null;
  const invalid = enteredLoss?.success === false;
  const displayed =
    editableLoss && entered !== null && !invalid
      ? stockCutSequences(project, [row], enteredLoss?.data ?? null)
          .get(row.id)
          ?.find((candidate) => candidate.tube?.key === sequence.tube?.key)
      : sequence;

  return (
    <details open={initiallyOpen}>
      <summary>
        {sequence.title} · {displayed?.source ?? sequence.source}
        {displayed?.review || invalid ? " · Review needed" : ""}
      </summary>
      {editableLoss && (
        <label htmlFor={fieldId} className="field">
          Measured loss per cut (in)
          <input
            id={fieldId}
            type="number"
            min={0}
            max={sequence.layout.length}
            step="any"
            value={entered ?? savedLoss?.toString() ?? ""}
            placeholder="0.125 modeled"
            onChange={(event) => setEntered(event.target.value)}
          />
        </label>
      )}
      {invalid || !displayed ? (
        <p role="alert" className="form-error">
          Enter a nonnegative cutting loss in inches.
        </p>
      ) : (
        <>
          <SequenceBody sequence={displayed} />
          {!displayed.review && displayed.layout.kept.length > 0 && (
            <>
              {editableLoss && (
                <button
                  type="button"
                  className="button secondary small"
                  disabled={displayed.layout.tubeKerf === savedLoss}
                  onClick={() => {
                    onSaveLoss(displayed.layout);
                    setEntered(null);
                  }}
                >
                  {entered === "" && savedLoss !== undefined
                    ? "Use modeled loss"
                    : "Save cutting loss"}
                </button>
              )}
              <p className="small-note">
                {displayed.layout.kind === "tube"
                  ? "Check the actual stock length and loss before cutting. Record the completed cuts to put the remaining tube in the Cut pool."
                  : "Once the stock is prepared, record it to link the parts and add any rectangular leftovers to the Cut pool."}
              </p>
              <label className="checkbox-field">
                <input type="checkbox" checked={onHand} onChange={(event) => setOnHand(event.target.checked)} />
                I already have this stock
              </label>
              <button
                type="button"
                className="button secondary small"
                onClick={() => onRecord(displayed.layout, onHand)}
              >
                Record this stock unit
              </button>
            </>
          )}
        </>
      )}
    </details>
  );
}

export function PrintStockCutSequences({
  groups,
}: {
  groups: ReturnType<typeof stockCutSequences>;
}) {
  if (!groups.size) return null;
  return (
    <section className="stock-cut-order-print">
      <h2>Stock cut order</h2>
      <p>{stockCutSequenceContext}</p>
      {[...groups].flatMap(([id, sequences]) => [
        <MaterialCutNote key={id} id={id} />,
        ...sequences.map((sequence) => (
          <section key={`${id}-${sequence.title}`}>
            <h3>
              {material(id).name} · {sequence.title}
            </h3>
            <p>{sequence.source}</p>
            <SequenceBody sequence={sequence} />
          </section>
        )),
      ])}
    </section>
  );
}
