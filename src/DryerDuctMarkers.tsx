import { Edges, Html } from "@react-three/drei";
import type { reviewDryerDuctLayout } from "./dryerDuctLayout";
import { formatStockLength } from "./measurement";
import type { V3 } from "./model";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

export function DryerDuctMarkers({
  runs,
}: {
  runs: ReturnType<typeof reviewDryerDuctLayout>;
}) {
  return (
    <group>
      {runs.map((run, index) => {
        const state = run.hits.length
          ? "overlap"
          : run.unreviewed.length
            ? "review"
            : "clear";
        const color =
          state === "overlap"
            ? "#ad472f"
            : state === "review"
              ? "#90662c"
              : "#247087";
        return (
          <group key={index}>
            <mesh
              position={feet(run.center)}
              rotation={run.rotation}
              raycast={() => null}
            >
              <boxGeometry args={feet(run.size)} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.25}
                depthWrite={false}
              />
              <Edges color={color} />
            </mesh>
            <Html
              center
              position={feet([
                run.center[0],
                run.center[1] + run.size[0] / 2 + 3,
                run.center[2],
              ])}
              style={{ pointerEvents: "none" }}
            >
              <span
                className="site-clearance-marker"
                data-testid="dryer-duct-run-marker"
                data-review={state}
              >
                Run {index + 1} · {formatStockLength(run.length)}
                {state === "overlap"
                  ? " · Overlap"
                  : state === "review"
                    ? " · Review"
                    : ""}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
