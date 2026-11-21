import { useEffect, useRef, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import type { Project, V3 } from "./model";
import {
  codeRowLabels,
  codeRowSourcesForDisplay,
  reviewProjectCode,
  saveProjectCode,
  type CodeReviewRow,
} from "./projectCode";
import {
  blankProjectCode,
  projectCodeTrades,
  tradeNames,
  type ProjectCodeContext,
} from "./projectCodeSchema";
import { utahAuthorityDirectories } from "./utahCodeSources";
import { PlumbingVentLayoutPanel } from "./PlumbingVentLayoutPanel";
import { DryerExhaustFields } from "./DryerExhaustFields";
import { ShingleRoofEstimate, ShingleRoofFields } from "./ShingleRoofFields";

export function ProjectCodeRows({ rows }: { rows: readonly CodeReviewRow[] }) {
  return (
    <ul className="code-review-list">
      {rows.map((row, index) => {
        const sources = codeRowSourcesForDisplay(rows, index);
        return (
          <li key={row.id}>
            <strong>{row.label}</strong>
            <p className="small-note">
              <b>{codeRowLabels[row.state]}</b> · {row.detail}
            </p>
            {!!sources.length && (
              <ul className="small-note">
                {sources.map((source) => (
                  <li key={source.title}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ProjectCodeForm({
  project,
  measurement,
  measuredDistance,
  onChange,
}: {
  project: Project;
  measurement: { a: V3 | null; b: V3 | null };
  measuredDistance: number | null;
  onChange: (project: Project) => void;
}) {
  const [draft, setDraft] = useState(project.projectCode ?? blankProjectCode);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const savedCode = useRef(JSON.stringify(project.projectCode));
  useEffect(() => {
    const current = JSON.stringify(project.projectCode);
    if (savedCode.current === current) return;
    savedCode.current = current;
    setDraft(project.projectCode ?? blankProjectCode());
    setError("");
  }, [project.projectCode]);

  function field<K extends keyof ProjectCodeContext>(
    key: K,
    value: ProjectCodeContext[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFeedback("");
    setError("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onChange(saveProjectCode(project, draft));
      setFeedback("Project code inputs saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Review the project code inputs.",
      );
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="field">
        Build jurisdiction
        <select
          value={draft.region}
          onChange={(event) =>
            field("region", event.target.value as ProjectCodeContext["region"])
          }
        >
          <option value="unconfirmed">Confirm jurisdiction</option>
          <option value="utah">Utah</option>
          <option value="other">Outside Utah</option>
        </select>
      </label>
      <label className="field">
        Project or permit date
        <input
          type="date"
          value={draft.projectDate ?? ""}
          onChange={(event) => field("projectDate", event.target.value || null)}
        />
      </label>
      <label className="field">
        Site or permit reference (optional)
        <input
          value={draft.siteReference}
          maxLength={180}
          onChange={(event) => field("siteReference", event.target.value)}
        />
      </label>
      <label className="field">
        Building authority
        <input
          value={draft.buildingAuthority}
          maxLength={100}
          onChange={(event) => field("buildingAuthority", event.target.value)}
        />
      </label>
      <label className="field">
        Authority confirmation notes
        <textarea
          value={draft.authorityBasis}
          maxLength={400}
          rows={2}
          placeholder="Record where you confirmed the authority and the applicable code path."
          onChange={(event) => field("authorityBasis", event.target.value)}
        />
      </label>
      <label className="field">
        Building code path
        <select
          value={draft.codePath}
          onChange={(event) =>
            field(
              "codePath",
              event.target.value as ProjectCodeContext["codePath"],
            )
          }
        >
          <option value="unknown">Confirm with authority</option>
          <option value="irc">IRC · residential path</option>
          <option value="ibc">IBC · building code path</option>
        </select>
      </label>
      <label className="field">
        Work type
        <select
          value={draft.work}
          onChange={(event) =>
            field("work", event.target.value as ProjectCodeContext["work"])
          }
        >
          <option value="unknown">Confirm work type</option>
          <option value="new">New work</option>
          <option value="existing">Alteration or repair</option>
        </select>
      </label>
      <fieldset className="field">
        <legend>Work areas</legend>
        {projectCodeTrades.options.map((trade) => (
          <label key={trade} className="code-trade-choice">
            <input
              type="checkbox"
              checked={draft.trades.includes(trade)}
              onChange={(event) => {
                field(
                  "trades",
                  event.target.checked
                    ? [...draft.trades, trade]
                    : draft.trades.filter((item) => item !== trade),
                );
              }}
            />
            {tradeNames[trade]}
          </label>
        ))}
      </fieldset>
      {draft.trades.includes("hvac") && (
        <DryerExhaustFields
          plan={draft.dryerExhaust}
          measurement={measurement}
          onChange={(value) => field("dryerExhaust", value)}
        />
      )}
      {draft.trades.includes("roofing") && (
        <ShingleRoofFields
          project={project}
          plan={draft.shingleRoof}
          measuredDistance={measuredDistance}
          onChange={(value) => field("shingleRoof", value)}
        />
      )}
      {draft.trades.includes("sprinklers") && (
        <>
          <label className="field">
            Fire authority
            <input
              value={draft.fireAuthority}
              maxLength={100}
              onChange={(event) => field("fireAuthority", event.target.value)}
            />
          </label>
          <label className="field">
            Fire sprinkler standard under review
            <select
              value={draft.fireSystem}
              onChange={(event) =>
                field(
                  "fireSystem",
                  event.target.value as ProjectCodeContext["fireSystem"],
                )
              }
            >
              <option value="unknown">Confirm with fire authority</option>
              <option value="nfpa-13">NFPA 13</option>
              <option value="nfpa-13d">NFPA 13D</option>
              <option value="nfpa-13r">NFPA 13R</option>
            </select>
          </label>
        </>
      )}
      {draft.trades.includes("irrigation") && (
        <label className="field">
          Landscape irrigation water source
          <select
            value={draft.irrigationSupply}
            onChange={(event) =>
              field(
                "irrigationSupply",
                event.target.value as ProjectCodeContext["irrigationSupply"],
              )
            }
          >
            <option value="unknown">Confirm water source</option>
            <option value="potable">Potable water</option>
            <option value="secondary">Secondary water</option>
            <option value="dual">Secondary with potable backup</option>
            <option value="graywater">Graywater</option>
          </select>
        </label>
      )}
      {draft.trades.includes("plumbing") && (
        <>
          <label className="field">
            Plumbing vent ends through a wall
            <select
              value={draft.wallVent.inScope}
              onChange={(event) =>
                field("wallVent", {
                  ...draft.wallVent,
                  inScope: event.target
                    .value as ProjectCodeContext["wallVent"]["inScope"],
                })
              }
            >
              <option value="unknown">Confirm vent route</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          {draft.wallVent.inScope === "yes" && (
            <>
              {draft.wallVent.layout ? (
                <p className="small-note">
                  The saved vent datums supply the wall distance.
                </p>
              ) : (
                <LengthInput
                  label="Vent distance from exterior wall"
                  value={draft.wallVent.projection ?? NaN}
                  onChange={(value) =>
                    field("wallVent", {
                      ...draft.wallVent,
                      projection: Number.isFinite(value) ? value : null,
                    })
                  }
                  min={0}
                  max={240}
                />
              )}
              <label className="field">
                Termination elbow direction
                <select
                  value={draft.wallVent.elbow}
                  onChange={(event) =>
                    field("wallVent", {
                      ...draft.wallVent,
                      elbow: event.target
                        .value as ProjectCodeContext["wallVent"]["elbow"],
                    })
                  }
                >
                  <option value="unknown">Verify direction</option>
                  <option value="down">Downward</option>
                  <option value="other">Another direction</option>
                </select>
              </label>
            </>
          )}
        </>
      )}
      <label className="field">
        Permit notes
        <textarea
          value={draft.permitNotes}
          maxLength={400}
          rows={2}
          onChange={(event) => field("permitNotes", event.target.value)}
        />
      </label>
      <button className="button secondary full">Save code review inputs</button>
      {feedback && (
        <p className="small-note" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ProjectCodePanel({
  project,
  measurement,
  measuredDistance,
  onChange,
  shownVentDatums,
  onShowVentDatums,
  shownDryerDuct,
  onShowDryerDuct,
  onWaterPressure,
}: {
  project: Project;
  measurement: { a: V3 | null; b: V3 | null };
  measuredDistance: number | null;
  onChange: (project: Project) => void;
  shownVentDatums: boolean;
  onShowVentDatums: (show: boolean) => void;
  shownDryerDuct: boolean;
  onShowDryerDuct: (show: boolean) => void;
  onWaterPressure: () => void;
}) {
  const review = project.projectCode
    ? reviewProjectCode(project.projectCode, project)
    : null;
  return (
    <details className="field-section">
      <summary>Project code references</summary>
      <p className="small-note">
        Use the build jurisdiction and date to find adopted editions and compare
        recorded project facts with the available checks.
      </p>
      {!!(project.waterRuns?.length || project.waterPressureTests?.length) &&
        <button type="button" className="button secondary" onClick={onWaterPressure}>Water pressure test</button>}
      <PlumbingVentLayoutPanel
        project={project}
        onChange={onChange}
        shown={shownVentDatums}
        onShow={onShowVentDatums}
      />
      {project.projectCode?.trades.includes("hvac") &&
        project.projectCode.dryerExhaust?.appliance === "ducted" &&
        project.projectCode.dryerExhaust.layout && (
          <button type="button" className="button secondary"
            aria-pressed={shownDryerDuct} onClick={() => onShowDryerDuct(!shownDryerDuct)}>
            {shownDryerDuct ? "Hide dryer duct layout" : "Show dryer duct layout in 3D"}
          </button>
        )}
      {project.projectCode?.trades.includes("roofing") &&
        project.projectCode.shingleRoof && (
          <ShingleRoofEstimate
            project={project}
            plan={project.projectCode.shingleRoof}
            onChange={onChange}
          />
        )}
      {review && <ProjectCodeRows rows={review.rows} />}
      <details open={!review}>
        <summary>
          {review ? "Edit project code inputs" : "Set project code inputs"}
        </summary>
        <ProjectCodeForm project={project} measurement={measurement} measuredDistance={measuredDistance} onChange={onChange} />
      </details>
      <details>
        <summary>Utah authority directories</summary>
        <ul className="small-note">
          {utahAuthorityDirectories.map((item) => (
            <li key={item.title}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </details>
  );
}
