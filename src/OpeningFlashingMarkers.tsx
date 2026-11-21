import { Html, Line } from "@react-three/drei";
import type { V3 } from "./model";
import type { OpeningFlashingPreview } from "./openingFlashing";

const feet = (point: V3) => point.map((value) => value / 12) as V3;
const mid = (a: V3, b: V3) => a.map((value, i) => (value + b[i]) / 24) as V3;

export function OpeningFlashingMarkers({ preview }: { preview: OpeningFlashingPreview }) {
  const { apron, pan, drainage, interiorSeal } = preview;
  return (
    <group>
      {[pan, apron].map((points, i) => <Line key={i} points={points.map(feet)}
        color="#bc621c" lineWidth={3} depthTest={false} raycast={() => null} />)}
      {drainage.map((points, i) => <Line key={i} points={points.map(feet)}
        color="#187043" lineWidth={4} dashed dashSize={0.055} gapSize={0.04} depthTest={false} raycast={() => null} />)}
      <Line points={interiorSeal.map(feet)} color="#237fa1" lineWidth={3} depthTest={false} raycast={() => null} />
      <Html center position={mid(apron[1], apron[2])} style={{ pointerEvents: "none" }} zIndexRange={[35, 0]}>
        <span className="site-clearance-marker" data-testid="opening-flashing-apron">Exterior apron and drainage</span>
      </Html>
      <Html center position={mid(interiorSeal[1], interiorSeal[2])} style={{ pointerEvents: "none" }} zIndexRange={[35, 0]}>
        <span className="site-clearance-marker" data-testid="opening-flashing-air-seal">Interior air seal after setting the unit</span>
      </Html>
    </group>
  );
}
