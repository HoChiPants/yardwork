import { useMemo, useState } from "react";
import type { ConnectionIntent } from "./connectionCoverage";
import { floorBaseConnections, floorBaseConnectionScope, floorBaseJointFit, floorBaseJointPlan } from "./floorBaseConnections";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { FloorHangerPanel } from "./FloorHangerPanel";
import type { FloorHangerPlan } from "./floorHangerSchema";

export function FloorBaseConnectionsPanel({ project, intents, memberIds, ownerId, onPlanPair, onReviewIntent, onInspectPiece, onSaveHangers }: {
  project: Project;
  intents: readonly ConnectionIntent[];
  memberIds: readonly string[];
  ownerId?: string;
  onPlanPair: (rim: string, joist: string) => void;
  onReviewIntent: (intent: ConnectionIntent) => void;
  onInspectPiece: (id: string) => void;
  onSaveHangers?: (sectionId: string, plan: FloorHangerPlan | null) => void;
}) {
  const reviews = useMemo(() => floorBaseConnections(project, intents), [project, intents]);
  const scope = new Set(memberIds);
  return reviews.filter((base) => base.id === ownerId || base.memberIds.some((id) => scope.has(id)))
    .map((base) => (
      <FloorBaseJointList key={base.id} project={project} base={base} scope={scope} focused={base.id === ownerId}
        onPlanPair={onPlanPair} onReviewIntent={onReviewIntent} onInspectPiece={onInspectPiece}
        onSaveHangers={onSaveHangers ? (plan) => onSaveHangers(base.id, plan) : undefined} />
    ));
}

function FloorBaseJointList({ project, base, scope, focused, onPlanPair, onReviewIntent, onInspectPiece, onSaveHangers }: {
  project: Project;
  base: ReturnType<typeof floorBaseConnections>[number];
  scope: ReadonlySet<string>;
  focused: boolean;
  onPlanPair: (rim: string, joist: string) => void;
  onReviewIntent: (intent: ConnectionIntent) => void;
  onInspectPiece: (id: string) => void;
  onSaveHangers?: (plan: FloorHangerPlan | null) => void;
}) {
  const [side, setSide] = useState<"back" | "front">("back");
  const rows = base.rows.filter(({ rim, joist }) => focused || scope.has(joist.id) || (rim && scope.has(rim.id)));
  const back = rows.filter(({ side }) => side === "back");
  const front = rows.filter(({ side }) => side === "front");
  const shown = back.length && (!front.length || side === "back") ? back : front;
  const savedHangers = project.sections.find(({ id }) => id === base.id)?.floorHangerPlan;
  return (
    <details className="field-section floor-base-connections" open={focused || undefined}>
      <summary>Floor base joist ends · {base.name}</summary>
      <p className="small-note">{rows.filter(({ fullFace }) => fullFace).length} of {rows.length} shown ends have full contact.</p>
      {base.joists !== base.expected && (
        <p className="small-note">Generated layout had {base.expected} joists. This section has {base.joists} identified joists.</p>
      )}
      <p className="small-note">{floorBaseConnectionScope}</p>
      <a href="https://www.strongtie.com/resources/product-installers-guide/lus-installation" target="_blank" rel="noreferrer">
        Face-mount hanger installation reference
      </a>
      {focused && project.retailer === "home-depot" && onSaveHangers && (
        <FloorHangerPanel project={project} base={base} saved={savedHangers} onSave={onSaveHangers} />
      )}
      {!!back.length && !!front.length && (
        <div className="segmented" role="group" aria-label="Floor base rim">
          <button type="button" className={side === "back" ? "active" : ""} aria-pressed={side === "back"} onClick={() => setSide("back")}>Back rim ({back.length})</button>
          <button type="button" className={side === "front" ? "active" : ""} aria-pressed={side === "front"} onClick={() => setSide("front")}>Front rim ({front.length})</button>
        </div>
      )}
      {shown.map((joint) => {
        const { rim, joist } = joint;
        const plans = [...new Map(joint.plans.filter(({ kind }) => kind !== "legacy-joint").map((plan) => [plan.planId, plan])).values()];
        return (
          <div className="field-section" key={`${joint.side}/${joist.id}`} data-joist-end={joint.side} data-joist-id={joist.id}>
            <strong>{partLabel(project, joist.id)} to {rim ? partLabel(project, rim.id) : "unidentified rim"}</strong>
            <p className="small-note">{floorBaseJointFit(joint)} {floorBaseJointPlan(joint)}</p>
            <div className="button-row">
              <button type="button" className="text-button" onClick={() => onInspectPiece(joist.id)}>Inspect joist</button>
              {plans.map((intent) => (
                <button type="button" className="text-button" key={intent.planId} onClick={() => onReviewIntent(intent)}>
                  Review {intent.label.split("/")[0]}
                </button>
              ))}
              {joint.fullFace && rim && !plans.some(({ current }) => current) && (
                <button type="button" className="text-button" onClick={() => onPlanPair(rim.id, joist.id)}>Open wood-fastener planner</button>
              )}
            </div>
          </div>
        );
      })}
    </details>
  );
}
