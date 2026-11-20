import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { ArrowHelper, Vector3 } from "three";
import type { Project, V3 } from "./model";
import {
  fastenerReviews,
  qualifiedFastenerLabel,
  type FastenerReview,
  type ReviewedFastenerLocation,
} from "./fastenings";

export type FastenerLayoutMarkerPreview = {
  kind?: "centered-entry" | "contact-row";
  review: FastenerReview;
  seedLocationId: string;
  candidateIds: readonly string[];
  selectedCandidateIds: readonly string[];
  focusedCandidateId?: string | null;
};

/** Caption selection never creates, filters, or recomputes an entered path. */
export function fastenerMarkerPoints(
  review: FastenerReview,
  focusedLocationId?: string | null,
  layoutPreview?: FastenerLayoutMarkerPreview | null,
): {
  point: ReviewedFastenerLocation;
  label: string;
  candidate: boolean;
  candidateIndex: number;
  seed: boolean;
  accepted: boolean;
  focused: boolean;
  showLabel: boolean;
}[] {
  const captionId = layoutPreview
    ? layoutPreview.focusedCandidateId || layoutPreview.seedLocationId
    : (focusedLocationId ??
      review.locations.find((point) => point.entranceWorld)?.location.id);
  return review.locations
    .filter((point) => point.entranceWorld)
    .map((point) => {
      const candidate = !!layoutPreview?.candidateIds.includes(
        point.location.id,
      );
      return {
        point,
        label: qualifiedFastenerLabel(review.plan, point.location),
        candidate,
        candidateIndex:
          layoutPreview?.candidateIds.indexOf(point.location.id) ?? -1,
        seed: layoutPreview?.seedLocationId === point.location.id,
        accepted: !!layoutPreview?.selectedCandidateIds.includes(
          point.location.id,
        ),
        focused: layoutPreview
          ? layoutPreview.focusedCandidateId === point.location.id
          : captionId === point.location.id,
        showLabel: captionId === point.location.id,
      };
    });
}

const feet = (point: V3) => point.map((value) => value / 12) as V3;

/** A fixed-size orientation symbol, never a proposed screw length or tip. */
function OrientationArrow({
  entrance,
  direction,
  color,
}: {
  entrance: V3;
  direction: V3;
  color: string;
}) {
  const arrow = useMemo(() => {
    const result = new ArrowHelper(
      new Vector3(...direction),
      new Vector3(...feet(entrance)),
      0.18,
      color,
      0.05,
      0.025,
    );
    for (const part of [result.line, result.cone]) {
      part.renderOrder = 1200;
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material]) {
        material.depthTest = false;
        material.transparent = true;
        material.opacity = 0.75;
      }
    }
    result.traverse((object) => {
      object.raycast = () => {};
    });
    return result;
  }, [entrance, direction, color]);
  useEffect(() => () => arrow.dispose(), [arrow]);
  return <primitive object={arrow} />;
}

/** Only measured/entered path intent. No screw body, head, hole or inferred nominal tip. */
export function FastenerMarkers({
  project,
  selectedPlanId,
  layoutPreview,
  focusedLocationId,
}: {
  project: Project;
  selectedPlanId?: string | null;
  layoutPreview?: FastenerLayoutMarkerPreview | null;
  focusedLocationId?: string | null;
}) {
  const reviews = useMemo(() => {
    try {
      return fastenerReviews(project);
    } catch {
      return [];
    }
  }, [project]);
  const selected =
    layoutPreview?.review ??
    (selectedPlanId
      ? reviews.find((review) => review.plan.id === selectedPlanId)
      : reviews[0]);
  const visible = selected ? [selected] : [];
  const centered = layoutPreview?.kind === "centered-entry";
  const contactRow = layoutPreview?.kind === "contact-row";
  const contactLine = contactRow
    ? layoutPreview.review.locations.flatMap(({ entranceWorld }) =>
        entranceWorld ? [feet(entranceWorld)] : [],
      )
    : [];
  return (
    <group name="planned-wood-fastener-paths">
      {contactLine.length >= 2 && (
        <Line
          points={contactLine}
          color="#286985"
          lineWidth={2.5}
          depthTest={false}
          depthWrite={false}
          renderOrder={1199}
          raycast={() => null}
        />
      )}
      {visible.flatMap((review) =>
        fastenerMarkerPoints(review, focusedLocationId, layoutPreview).map(
          ({
            point,
            label,
            candidate,
            candidateIndex,
            seed,
            accepted,
            focused,
            showLabel,
          }) => {
            const entrance = feet(point.entranceWorld!),
              tip = point.tipWorld ? feet(point.tipWorld) : null,
              color =
                point.state === "stale" || point.state === "conflict"
                  ? "#bd4e37"
                  : layoutPreview
                    ? seed
                      ? "#39768e"
                      : candidate && accepted
                        ? "#ca812b"
                        : "#8e968e"
                    : "#ca812b",
              orientationOnly = !!point.driveWorld && !tip;
            return (
              <group key={`${review.plan.id}/${point.location.id}`}>
                {tip && (
                  <Line
                    points={[entrance, tip]}
                    color={color}
                    dashed
                    dashSize={0.045}
                    gapSize={0.03}
                    lineWidth={2}
                    depthTest={false}
                    renderOrder={1200}
                    raycast={() => null}
                  />
                )}
                {orientationOnly && (
                  <OrientationArrow
                    entrance={point.entranceWorld!}
                    direction={point.driveWorld!}
                    color={color}
                  />
                )}
                <Html
                  position={entrance}
                  center
                  zIndexRange={showLabel ? [39, 37] : [35, 0]}
                  style={{ pointerEvents: "none" }}
                >
                  <span
                    data-testid={
                      centered
                        ? "fastener-centered-entry-marker"
                        : contactRow
                          ? "fastener-contact-row-marker"
                          : layoutPreview
                            ? candidate
                              ? "fastener-layout-entry-marker"
                              : seed
                                ? "fastener-layout-seed-marker"
                                : "fastener-layout-existing-marker"
                            : "fastener-entry-marker"
                    }
                    data-plan-id={review.plan.id}
                    data-location-id={point.location.id}
                    data-label={label}
                    data-location-label={point.location.label}
                    data-state={point.state}
                    data-position={JSON.stringify(point.entranceWorld)}
                    data-drive={JSON.stringify(point.driveWorld)}
                    data-selected={candidate ? String(accepted) : undefined}
                    data-focused={
                      layoutPreview
                        ? candidate
                          ? String(focused)
                          : undefined
                        : String(showLabel)
                    }
                    title={
                      centered
                        ? "Centered entry preview · direction only"
                        : layoutPreview
                          ? `${seed ? "Layout origin" : candidate ? "Unsaved layout candidate" : "Existing draft location"} · ${label} · ${review.plan.name} · ${point.state}${orientationOnly ? " · orientation symbol only; tip unknown" : ""}`
                          : `${label} · ${review.plan.name} · ${point.location.name} · ${point.state}${orientationOnly ? " · orientation symbol only; tip unknown" : ""}`
                    }
                    style={{
                      display: "block",
                      position: "relative",
                      padding: 0,
                      width: 9,
                      height: 9,
                      border: "1px solid white",
                      borderRadius: "50%",
                      background: color,
                      color: "white",
                      fontSize: 10,
                      whiteSpace: "nowrap",
                      boxShadow: `0 0 0 1px ${color}`,
                    }}
                  >
                    {showLabel && !contactRow && (
                      <span
                        data-testid={
                          layoutPreview
                            ? "fastener-layout-caption"
                            : "fastener-location-caption"
                        }
                        data-plan-id={review.plan.id}
                        data-location-id={point.location.id}
                        data-label={label}
                        style={{
                          position: "absolute",
                          top: 13,
                          right: -3,
                          padding: "2px 4px",
                          border: "1px solid white",
                          borderRadius: 4,
                          background: color,
                          boxShadow: `0 0 0 1px ${color}`,
                        }}
                      >
                        {centered
                          ? "Centered entry"
                          : `${layoutPreview ? (seed ? "Origin · " : `New ${candidateIndex + 1} · `) : ""}${label}`}
                        {orientationOnly && (
                          <small
                            data-testid="fastener-orientation-label"
                            style={{ display: "block", fontSize: 8 }}
                          >
                            Direction only · tip unknown
                          </small>
                        )}
                      </span>
                    )}
                  </span>
                </Html>
                {tip && (
                  <Html
                    position={tip}
                    center
                    zIndexRange={[36, 0]}
                    style={{ pointerEvents: "none" }}
                  >
                    <span
                      data-testid={
                        layoutPreview
                          ? "fastener-layout-tip-marker"
                          : "fastener-tip-marker"
                      }
                      data-plan-id={review.plan.id}
                      data-location-id={point.location.id}
                      data-state={point.state}
                      data-position={JSON.stringify(point.tipWorld)}
                      title={`${label} · proposed tip from user surface-to-tip depth · ${point.state}`}
                      style={{
                        display: "block",
                        width: 8,
                        height: 8,
                        border: `2px solid ${color}`,
                        background: "white",
                        borderRadius: "50%",
                      }}
                    />
                  </Html>
                )}
              </group>
            );
          },
        ),
      )}
    </group>
  );
}
