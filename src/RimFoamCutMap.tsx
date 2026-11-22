import { fitLayoutLabel } from "./layoutLabels";
import { formatStockLength } from "./measurement";
import { foamBlankSize, type RimFoamSheet } from "./rimAirSeals";
import type { RimFoamCutRecord } from "./rimAirSealSchema";

type FoamSource = RimFoamSheet & { record?: RimFoamCutRecord };

export function RimFoamCutMap({ source, showOrder = false }: { source: FoamSource; showOrder?: boolean }) {
  const { label, stock, order, record } = source;
  const { width, length, placements } = stock;
  const padding = Math.max(width, length) / 30;
  const parts = new Map(placements.map((placement) => [placement.id, placement]));
  const regions = [
    ...order.layout.kept.map((box, index) => ({
      ...box,
      tag: `B${index + 1}`,
      name: parts.get(box.id)?.name ?? "Rim blank",
      turned: parts.get(box.id)?.rotated,
      remnant: false,
    })),
    ...order.layout.leftovers.map((box, index) => ({
      ...box,
      tag: `R${index + 1}`,
      name: record ? "Original remnant area" : "Expected remnant",
      turned: false,
      remnant: true,
    })),
  ];
  return (
    <figure className="rim-foam-cut-map">
      <figcaption><strong>{label}</strong> · {foamBlankSize(width, length)}</figcaption>
      <svg
        viewBox={`${-padding} ${-padding} ${width + 2 * padding} ${length + 2 * padding}`}
        role="img" aria-label={`${label} cut map`}
      >
        <rect width={width} height={length} className="foam-map-stock" vectorEffect="non-scaling-stroke" />
        {regions.map((region) => {
          const { x, y, width, length, tag, name, remnant } = region;
          const fontSize = Math.min(padding, length * 0.55, width / (tag.length * 0.7 + 0.6));
          const anchor = fontSize >= padding / 2 && fitLayoutLabel([
            [x, y], [x + width, y], [x + width, y + length], [x, y + length],
          ], tag, fontSize);
          return <g key={tag} data-foam-region={tag}>
            <title>{tag} · {name} · {foamBlankSize(width, length)}</title>
            <rect x={x} y={y} width={width} height={length}
              className={remnant ? "foam-map-remnant" : "foam-map-blank"}
              vectorEffect="non-scaling-stroke" />
            {anchor && <text textAnchor="middle" dominantBaseline="middle" aria-hidden="true" {...anchor}>{tag}</text>}
          </g>;
        })}
        <circle cx={0} cy={0} r={padding / 3} className="foam-map-origin" />
      </svg>
      <p className="small-note">Measure right and down from the marked corner.</p>
      <ul aria-label={`${label} blanks and remnants`}>
        {regions.map(({ tag, name, width, length, x, y, turned }) => <li key={tag}>
          <strong>{tag}</strong> · {name}{turned && " (turned)"} · {foamBlankSize(width, length)}
          {" · "}{formatStockLength(x)} right, {formatStockLength(y)} down
        </li>)}
      </ul>
      {record?.remnants.map(({ id, label, slot, width, length }) => <p className="small-note" key={id}>
        R{slot + 1} · {label} measured at {foamBlankSize(width, length)} and recorded in Cut pool.
      </p>)}
      {showOrder && <>
        <p><strong>Cut order</strong> · {formatStockLength(source.kerf)} cutting loss</p>
        <ol aria-label={`${label} cut order`}>
          {order.steps.filter(Boolean).map((step, index) => <li key={index}>{step}</li>)}
        </ol>
        {order.remnants.map((size, index) => <p key={index} className="small-note">
          Keep reusable foam {size} · R{index + 1}. Measure and label it after cutting.
        </p>)}
      </>}
    </figure>
  );
}
