import { useState } from "react";
import {
  bearingDecisionStateText,
  bearingConnectionScope,
  summarizeBearingConnections,
  type BearingConnection,
} from "./bearingConnections";
import type { BearingDecision } from "./bearingDecisionSchema";
import type { ConnectionIntent } from "./connectionCoverage";
import { connectionStateText } from "./GuideConnections";
import { partLabel } from "./partLabels";
import { recordedRemovalText } from "./recordedRemoval";
import type { Project } from "./model";

function recordGroups(records: BearingConnection["records"]) {
  const groups = new Map<string, ConnectionIntent[]>();
  for (const record of records) {
    const key = `${record.kind}/${record.planId}`;
    const prior = groups.get(key) ?? [];
    prior.push(record);
    groups.set(key, prior);
  }
  return Array.from(groups.values());
}

function RemovableContactEditor({
  pairLabel,
  decision,
  onSave,
  onClear,
}: {
  pairLabel: string;
  decision: BearingConnection["decision"];
  onSave: (note: string) => void;
  onClear: () => void;
}) {
  const [note, setNote] = useState(decision?.saved.note ?? "");
  return (
    <details>
      <summary>
        {decision ? "Edit removable decision" : "Keep removable"}
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(note);
        }}
      >
        <label className="field">
          How this part is supported and removed
          <textarea
            aria-label={`Removal note for ${pairLabel}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={400}
            required
            rows={3}
          />
        </label>
        <div className="button-row">
          <button
            className="button secondary small"
            type="submit"
            disabled={!note.trim()}
          >
            Save removable decision
          </button>
          {decision && (
            <button className="text-button" type="button" onClick={onClear}>
              Clear decision
            </button>
          )}
        </div>
      </form>
    </details>
  );
}

export function BearingConnectionsPanel({
  project,
  pairs,
  withoutContact,
  focused,
  onPlan,
  onReview,
  onSaveDecision,
  onClearDecision,
  onTestRemoval,
}: {
  project: Project;
  pairs: readonly BearingConnection[];
  withoutContact: readonly BearingDecision[];
  focused: boolean;
  onPlan: (topId: string, baseId: string) => void;
  onReview: (record: ConnectionIntent) => void;
  onSaveDecision: (topId: string, baseId: string, note: string) => void;
  onClearDecision: (topId: string, baseId: string) => void;
  onTestRemoval: (topId: string, baseId: string) => void;
}) {
  const [limit, setLimit] = useState(8);
  if (!pairs.length && !withoutContact.length)
    return focused ? (
      <p className="small-note" role="status">
        There are no touching wood bearing faces for the selected part.
      </p>
    ) : null;
  return (
    <details
      className="connection-settings bearing-connections"
      open={focused || undefined}
    >
      <summary>Bearing joints · {pairs.length}</summary>
      <div className="field-section">
        <p className="small-note">{summarizeBearingConnections(pairs)}.</p>
        <p className="small-note">{bearingConnectionScope}</p>
        {pairs.slice(0, limit).map(({ top, base, area, records, decision }) => (
          <div
            className="field-section"
            key={`${top.id}/${base.id}`}
            data-bearing-pair={`${top.id}/${base.id}`}
          >
            <strong>
              {partLabel(project, top.id)} · {top.name} on{" "}
              {partLabel(project, base.id)} · {base.name}
            </strong>
            <p className="small-note">
              Modeled contact ·{" "}
              {area < 0.01 ? "less than 0.01" : Number(area.toFixed(2))} in²
            </p>
            {records.length === 0 && !decision && (
              <p className="small-note">
                No saved connection record for this pair.
              </p>
            )}
            {decision && (
              <>
                <p className="small-note">
                  {bearingDecisionStateText[decision.state]}
                </p>
                <p>{decision.saved.note}</p>
                {decision.removalText && (
                  <p className="small-note">{decision.removalText}</p>
                )}
                <button
                  className="button secondary small"
                  type="button"
                  onClick={() => onTestRemoval(top.id, base.id)}
                >
                  Test removal clearance
                </button>
              </>
            )}
            {recordGroups(records).map(([first, ...rest]) => (
              <div key={first.id}>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onReview(first)}
                >
                  {first.label.split("/")[0]} · {first.name}
                </button>
                <p className="small-note">
                  {[
                    ...new Set(
                      [first, ...rest].map(
                        ({ state }) => connectionStateText[state],
                      ),
                    ),
                  ].join(" · ")}
                </p>
              </div>
            ))}
            <button
              className="button secondary small"
              type="button"
              onClick={() => onPlan(top.id, base.id)}
            >
              Plan wood screws for {partLabel(project, top.id)} and{" "}
              {partLabel(project, base.id)}
            </button>
            <RemovableContactEditor
              key={decision?.saved.note ?? ""}
              pairLabel={`${partLabel(project, top.id)} on ${partLabel(project, base.id)}`}
              decision={decision}
              onSave={(note) => onSaveDecision(top.id, base.id, note)}
              onClear={() => onClearDecision(top.id, base.id)}
            />
          </div>
        ))}
        {pairs.length > limit && (
          <button
            className="text-button"
            type="button"
            onClick={() => setLimit((n) => n + 8)}
          >
            Show {Math.min(8, pairs.length - limit)} more bearing joints
          </button>
        )}
        {withoutContact.length > 0 && (
          <details className="field-section">
            <summary>
              Saved decisions without contact · {withoutContact.length}
            </summary>
            {withoutContact.map((saved) => (
              <div
                className="field-section"
                key={`${saved.topId}/${saved.baseId}`}
              >
                <strong>
                  {partLabel(project, saved.topId)} on{" "}
                  {partLabel(project, saved.baseId)}
                </strong>
                <p className="small-note">
                  The saved parts no longer bear on each other.
                </p>
                <p>{saved.note}</p>
                {saved.removalPath && (
                  <p className="small-note">
                    {recordedRemovalText(saved, null)}
                  </p>
                )}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onClearDecision(saved.topId, saved.baseId)}
                >
                  Clear decision
                </button>
              </div>
            ))}
          </details>
        )}
      </div>
    </details>
  );
}
