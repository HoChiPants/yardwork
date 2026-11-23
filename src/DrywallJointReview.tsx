import { drywallInstallation, drywallJointTape, drywallJointTapeScope } from "./drywallReference";
import { formatStockLength } from "./measurement";
import { drywallJointMark, type reviewWallDrywallJoints } from "./wallDrywallJoints";

export function DrywallJointReview({ review, showFace, initiallyOpen }: {
  review: ReturnType<typeof reviewWallDrywallJoints>;
  showFace: boolean;
  initiallyOpen: boolean;
}) {
  const { section, sheets, joints, length, width, height, problem } = review;
  return <details className="field-section" open={initiallyOpen || undefined}>
    <summary>Joint tape{showFace && " · " + section.wallDrywall?.side + " face"}{length > 0 && " · " + formatStockLength(length)}</summary>
    {problem ? <p className="form-error" role="status">{problem}</p> : <>
      <p className="small-note">{length ? formatStockLength(length) + " of flat joints on this face." : "No flat joints on this face."}</p>
      {length > 0 && <>
        <svg role="img" aria-label={(section.wallDrywall?.side ?? "Wall") + " drywall joint and opening map"}
          width="100%" viewBox={[-2, -2, width + 4, height + 4].join(" ")}>
          {sheets.map(({ area: [[left, right], [bottom, top]], cutouts }, i) =>
            <g key={i}>
              <rect x={left} y={height - top} width={right - left} height={top - bottom}
                fill="#e7e2d7" stroke="#888175" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {cutouts.map(([[a, b], [c, d]], j) =>
                <rect key={j} x={a} y={height - d} width={b - a} height={d - c} fill="#393b40" />)}
            </g>)}
          {joints.map(({ axis, position, start, end }, i) =>
            <line key={i} x1={axis === 0 ? position : start} x2={axis === 0 ? position : end}
              y1={height - (axis === 0 ? start : position)} y2={height - (axis === 0 ? end : position)}
              stroke="#345940" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        </svg>
        <p className="small-note">Measure from the installed drywall’s left and bottom. Green lines show tape runs.</p>
        <ul>{joints.map((joint, i) =>
          <li key={i}>{drywallJointMark(joint)} · tape {formatStockLength(joint.end - joint.start)}</li>)}</ul>
      </>}
      <p className="small-note">{drywallJointTapeScope}</p>
      <p className="small-note"><a href={drywallInstallation} target="_blank" rel="noreferrer">USG finishing instructions</a>
        {" · "}<a href={drywallJointTape.listing} target="_blank" rel="noreferrer">250 ft paper tape</a></p>
    </>}
  </details>;
}
