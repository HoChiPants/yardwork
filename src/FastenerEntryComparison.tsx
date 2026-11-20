import { useMemo, useState } from "react";
import {
  compareFastenerEntries,
  fastenerEntryComparisonNote,
  trialFastenerDepth,
} from "./compareFastenerEntries";
import type { suggestCenteredFastener } from "./fastenings";
import type { FastenerPlan } from "./fasteningSchema";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

type Props = {
  project: Project;
  headId: string;
  receiverId: string;
  productId: FastenerPlan["productId"];
  onPreview: (proposal: ReturnType<typeof suggestCenteredFastener>) => void;
};

export function FastenerEntryComparison(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <details className="field-section" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Compare screw entry sides</summary>
      {open && <EntryOptions {...props} />}
    </details>
  );
}

function EntryOptions({ project, headId, receiverId, productId, onPreview }: Props) {
  const [depth, setDepth] = useState(NaN);
  const entries = useMemo(() => compareFastenerEntries(
    project, headId, receiverId, { productId },
  ), [project, headId, receiverId, productId]);
  return (
    <section aria-label="Screw entry comparison">
      <p className="small-note">
        Each option traces a centerline from an exposed face. Review actual
        seating, driver access, pilot details and joint strength before drilling.
      </p>
      <label className="field">
        Trial depth from entry surface (in)
        <input
          type="number" min="0.001" step="any"
          value={Number.isFinite(depth) ? depth : ""}
          onChange={(event) => setDepth(event.target.valueAsNumber)}
        />
        <small>Optional. This stays in the comparison.</small>
      </label>
      <ul aria-label="Entry side options" className="connection-entry-options">
        {entries.map((entry) => {
          const from = partLabel(project, entry.headId);
          const to = partLabel(project, entry.receiverId);
          const member = project.pieces.find(({ id }) => id === entry.headId);
          const trial = entry.proposal ? trialFastenerDepth(depth, entry.enter, entry.exit) : null;
          return (
            <li key={entry.headId}>
              <strong>{from} → {to}</strong>
              {member && <p className="small-note">Enter from {member.name}</p>}
              {entry.proposal ? (
                <>
                  <p className="small-note">
                    Receiving wood starts at {formatPreciseInches(entry.enter)}.
                    Far face at {formatPreciseInches(entry.exit)}.
                  </p>
                  {trial && <p className="small-note" role="status">{trial}</p>}
                  <button className="text-button" type="button" onClick={() => {
                    const proposal = entry.proposal;
                    onPreview({
                      ...proposal,
                      plan: {
                        ...proposal.plan,
                        notes: fastenerEntryComparisonNote(entry.enter, entry.exit),
                      },
                    });
                  }}>
                    Preview from {from}
                  </button>
                </>
              ) : <p className="small-note">{entry.issue}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
