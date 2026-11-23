import { drywallScrews, drywallScrewTool, drywallSpecification } from "./drywallReference";
import { formatPreciseInches } from "./measurement";
import { drywallScrewRows, type WallDrywallScrewReview } from "./wallDrywallScrews";

export function DrywallScrewReview({ review, showFace = false }: { review: WallDrywallScrewReview; showFace?: boolean }) {
  const { sheets, total, blocked, problem } = review;
  return <details className="field-section">
    <summary>Screws and backing{showFace && ` · ${review.section.wallDrywall?.side} face`}{total > 0 && ` · ${total} marks`}</summary>
    <p className={problem ? "form-error" : "small-note"} role="status">
      {problem ?? `${total} planned screws on this face. Clear marks have a modeled path into wood.`}
    </p>
    <p className="small-note">
      {drywallScrewTool}. Verify concealed services before driving.{" "}
      <a href={drywallSpecification} target="_blank" rel="noreferrer">USG fastener schedule</a>
      {" · "}<a href={drywallScrews.listing} target="_blank" rel="noreferrer">Grip-Rite 1-lb box</a>
    </p>
    {!!blocked && <p className="small-note">Orange crosses mark paths to check.</p>}
    {sheets.map(({ sheet, cuts, marks, backingIssue }) => {
      const [width, , height] = sheet.size;
      const marker = Math.max(width, height) / 140;
      return <details className="field-section" key={sheet.id}>
        <summary>{sheet.name} · {marks.length} marks</summary>
        {backingIssue && <p className="form-error">{backingIssue}</p>}
        <svg role="img" aria-label={`${sheet.name} screw marks and cutouts`} width="100%" viewBox={`-1 -1 ${width + 2} ${height + 2}`}>
          <rect width={width} height={height} fill="#e7e2d7" stroke="#888175" strokeWidth={marker / 3} />
          {cuts.map(([[left, right], [bottom, top]], i) => (
            <rect key={i} x={left} y={height - top} width={right - left} height={top - bottom} fill="#393b40" />
          ))}
          {marks.map(({ x, y, clear }, i) => clear
            ? <circle key={i} cx={x} cy={height - y} r={marker} fill="#345940" />
            : <path key={i} d={`M ${x - marker} ${height - y - marker} l ${marker * 2} ${marker * 2} m -${marker * 2} 0 l ${marker * 2} -${marker * 2}`}
              stroke="#d1411a" strokeWidth={marker} />)}
        </svg>
        <table>
          <caption>Marks from the installed face</caption>
          <thead><tr><th scope="col">From left</th><th scope="col">From bottom</th></tr></thead>
          <tbody>{drywallScrewRows(marks).map(({ x, marks }) => <tr key={x}>
            <th scope="row">{formatPreciseInches(x)}</th>
            <td>{marks.map(({ y, clear }) => formatPreciseInches(y) + (clear ? "" : " (check path)")).join(", ")}</td>
          </tr>)}</tbody>
        </table>
      </details>;
    })}
  </details>;
}
