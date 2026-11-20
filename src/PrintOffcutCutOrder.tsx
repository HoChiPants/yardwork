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
                  {row.prior ? ` · remnant from cut ${row.prior}` : ""}.
                </p>
                <p>
                  {row.cuts.length
                    ? row.cuts.join(" · ") + "."
                    : "Fits as measured."}
                </p>
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
