import { Html, Line } from "@react-three/drei";
import type { V3 } from "./model";
import { formatStockLength } from "./measurement";
import { ventLayoutMeasurements } from "./plumbingVentLayout";
import type { PlumbingVentLayout } from "./plumbingVentSchema";
import { clearanceAxis } from "./siteClearance";

type Marker = {
  id: string;
  points: V3[];
  label: string;
  labelPoint: V3;
  color: string;
  dashed?: boolean;
};
const blue = "#266e89";
const amber = "#ab4e2e";
const feet = (coords: V3) => coords.map((v) => v / 12) as V3;
const center = (a: V3, b: V3): V3 => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
  (a[2] + b[2]) / 2,
];

export function PlumbingVentMarkers({
  layout,
}: {
  layout: PlumbingVentLayout;
}) {
  const { terminal, gradePoint } = layout;
  const { wallPoint, projection, lotPoint, lotDistance, gradeRise } =
    ventLayoutMeasurements(layout);
  const axis = clearanceAxis(layout.exteriorSide);
  const wallCorner = (across: number, elevation: number): V3 =>
    wallPoint.map(
      (v, i) => v + (i === axis ? 0 : i === 1 ? elevation : across),
    ) as V3;
  const markers: Marker[] = [
    {
      id: "wall",
      label: "Wall datum",
      labelPoint: wallCorner(0, 12),
      color: blue,
      points: [
        wallCorner(-8, -10),
        wallCorner(8, -10),
        wallCorner(8, 10),
        wallCorner(-8, 10),
        wallCorner(-8, -10),
      ],
    },
    {
      id: "terminal",
      label:
        projection > 0
          ? `Vent · ${formatStockLength(projection)} from wall`
          : "Vent · on or inside wall",
      labelPoint: [terminal[0], terminal[1] + 5, terminal[2]],
      color: projection > 0 ? blue : amber,
      points: [wallPoint, terminal],
    },
  ];
  if (lotPoint && lotDistance !== null && layout.lotLine) {
    const [[ax, az], [bx, bz]] = layout.lotLine;
    const length = Math.hypot(bx - ax, bz - az);
    const back = Math.min(8, Math.hypot(lotPoint[0] - ax, lotPoint[2] - az));
    const forward = Math.min(8, Math.hypot(lotPoint[0] - bx, lotPoint[2] - bz));
    const onLine = (offset: number): V3 => [
      lotPoint[0] + ((bx - ax) / length) * offset,
      lotPoint[1],
      lotPoint[2] + ((bz - az) / length) * offset,
    ];
    markers.push({
      id: "lot",
      label: `Lot line · ${formatStockLength(lotDistance)}`,
      labelPoint: [lotPoint[0], lotPoint[1] + 5, lotPoint[2]],
      color: blue,
      points: [onLine(-back), onLine(forward)],
      dashed: true,
    });
  }
  if (gradePoint) {
    const directlyBelow: V3 = [terminal[0], gradePoint[1], terminal[2]];
    markers.push({
      id: "grade",
      label:
        gradeRise === null
          ? "Grade point · outside 10 ft radius"
          : `Grade rise · ${formatStockLength(gradeRise)}`,
      labelPoint:
        gradeRise === null ? gradePoint : center(terminal, directlyBelow),
      color: gradeRise === null ? amber : blue,
      points: [terminal, directlyBelow, gradePoint],
      dashed: true,
    });
  }
  return (
    <group>
      {lotPoint && (
        <Line
          points={[feet(terminal), feet(lotPoint)]}
          color={blue}
          lineWidth={2}
          dashed
          dashSize={0.16}
          gapSize={0.09}
          raycast={() => null}
        />
      )}
      {markers.map((marker) => (
        <group key={marker.id}>
          <Line
            points={marker.points.map(feet)}
            color={marker.color}
            lineWidth={2}
            dashed={marker.dashed ?? false}
            dashSize={0.16}
            gapSize={0.09}
            raycast={() => null}
          />
          <Html
            center
            position={feet(marker.labelPoint)}
            zIndexRange={[35, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span
              className="site-clearance-marker"
              data-testid={`plumbing-vent-${marker.id}`}
              style={
                marker.id === "wall"
                  ? { position: "relative", top: -18 }
                  : undefined
              }
            >
              {marker.label}
            </span>
          </Html>
        </group>
      ))}
      {[terminal, ...(gradePoint ? [gradePoint] : [])].map((point, index) => (
        <mesh key={index} position={feet(point)} raycast={() => null}>
          <sphereGeometry args={[0.12, 14, 10]} />
          <meshBasicMaterial
            color={index === 0 && projection <= 0 ? amber : blue}
          />
        </mesh>
      ))}
    </group>
  );
}
