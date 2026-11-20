import { useMemo, useState } from "react";
import type { ConnectionIntent } from "./connectionCoverage";
import {
  greenhouseAttachmentScope,
  greenhouseRoofAttachments,
  roofAttachmentSummary,
  roofJointIntentText,
  roofJointPairLabel,
} from "./greenhouseRoofAttachments";
import type { Project } from "./model";

export function GreenhouseConnectionsPanel({
  project,
  memberIds,
  intents,
  initiallyOpen,
  entryId,
  onPlanPair,
  onReviewIntent,
}: {
  project: Project;
  memberIds: readonly string[];
  intents: readonly ConnectionIntent[];
  initiallyOpen: boolean;
  entryId?: string;
  onPlanPair: (a: string, b: string) => void;
  onReviewIntent: (intent: ConnectionIntent) => void;
}) {
  const reviews = useMemo(
    () => greenhouseRoofAttachments(project, intents),
    [project, intents],
  );
  const members = new Set(memberIds);
  const joints = reviews
    .filter((review) => !entryId || review.entryId === entryId)
    .flatMap((review) =>
      review.joints.filter(({ pieceIds }) =>
        pieceIds.some((id) => members.has(id)),
      ),
    );
  const [tab, setTab] = useState<"eaves" | "ridge">("eaves");
  if (!joints.length) return null;
  const eaves = joints.filter(({ kind }) => kind !== "rafter-ridge");
  const ridge = joints.filter(({ kind }) => kind === "rafter-ridge");
  const showEaves = !!eaves.length && (tab === "eaves" || !ridge.length);
  return (
    <details
      className="field-section greenhouse-connections"
      open={initiallyOpen || undefined}
    >
      <summary>Greenhouse roof attachment checklist</summary>
      <p className="small-note">{greenhouseAttachmentScope}</p>
      {!!eaves.length && !!ridge.length && (
        <div
          className="segmented"
          role="group"
          aria-label="Roof joint location"
        >
          <button
            type="button"
            className={showEaves ? "active" : ""}
            aria-pressed={showEaves}
            onClick={() => setTab("eaves")}
          >
            Eaves ({eaves.length})
          </button>
          <button
            type="button"
            className={!showEaves ? "active" : ""}
            aria-pressed={!showEaves}
            onClick={() => setTab("ridge")}
          >
            Ridge ({ridge.length})
          </button>
        </div>
      )}
      <p className="small-note" data-testid="roof-attachment-summary">
        {roofAttachmentSummary(showEaves ? eaves : ridge).line}
      </p>
      {(showEaves ? eaves : ridge).map((joint) => {
        const plans = [
          ...new Map(
            joint.intents
              .filter(({ kind }) => kind !== "legacy-joint")
              .map((intent) => [intent.planId, intent]),
          ).values(),
        ];
        return (
          <div
            className="field-section"
            key={joint.id}
            data-roof-joint={joint.kind}
            data-fit-state={joint.contact ? "contact" : "review"}
            data-have-plan={plans.length > 0}
          >
            <strong>
              {joint.label} · {roofJointPairLabel(project, joint)}
            </strong>
            <p className="small-note">
              {joint.contact ? "Wood face contact." : "Check the changed fit."}{" "}
              {roofJointIntentText(joint)}.
            </p>
            <div className="button-row">
              {plans.map((intent) => (
                <button
                  type="button"
                  className="text-button"
                  key={intent.planId}
                  onClick={() => onReviewIntent(intent)}
                >
                  Review {intent.label.split("/")[0]}
                </button>
              ))}
              {joint.contact &&
                joint.intents.every(
                  ({ kind, state }) =>
                    kind === "legacy-joint" ||
                    state === "stale" ||
                    state === "conflict",
                ) && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onPlanPair(...joint.pieceIds)}
                  >
                    Plan screw path
                  </button>
                )}
            </div>
          </div>
        );
      })}
    </details>
  );
}
