import {
  offcutCutOrderScope,
  offcutCutOrderTitle,
  type OffcutCutRow,
} from "./offcutCutGuide";

export function PrintOffcutCutOrder({
  rows,
}: {
  rows: readonly OffcutCutRow[];
}) {
  if (!rows.length) return null;
  return (
    <section className="offcut-cut-order-print">
      <h2>{offcutCutOrderTitle}</h2>
      <p>{offcutCutOrderScope}</p>
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            {row.issues.length ? (
              <p>
                <strong>Review needed.</strong> {row.issues.join(" ")}
              </p>
            ) : (
              <>
                <p>
                  Starting size {row.inputSize}
                  {row.prior ? ` · remnant from cut ${row.prior}` : row.preparedBy ? ` · blank from cut ${row.preparedBy}` : ""}.
                </p>
                {row.waitForStockCuts && <p>
                  Complete the source stock cut order before using this blank.
                  {row.sourceOrderLabel && ` Find ${row.sourceOrderLabel} under Planned stock cuts.`}
                </p>}
                <p>
                  {row.cuts.length
                    ? row.cuts.join(" · ") + "."
                    : "Fits as measured."}
                </p>
                {row.cuttingLoss && <p>{row.cuttingLoss}</p>}
                {row.remnants.length > 0 && (
                  <p>Keep {row.remnants.join(" and ")}.</p>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
