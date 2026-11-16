import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
} from "lucide-react";
import { bom } from "./engine";
import { homeDepotHandoff } from "./handoff";
import type { Project } from "./model";
export function HomeDepotHandoff({
  project,
  onDownload,
}: {
  project: Project;
  onDownload: (text: string) => void;
}) {
  const text = useMemo(() => homeDepotHandoff(project), [project]),
    rows = useMemo(() => bom(project), [project]);
  const textarea = useRef<HTMLTextAreaElement>(null),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const unresolved = rows.reduce((n, r) => n + r.oversize, 0),
    hasQuantities = rows.some((r) => r.quantity > 0);
  return (
    <>
      <h2 id="modal-title">Take your list to Home Depot.</h2>
      <p>
        Prepare a material list to paste into the retailer’s list builder. Your
        editable 3D project stays in Yardwork.
      </p>
      <ol className="handoff-steps">
        <li>Copy the list below.</li>
        <li>
          In Home Depot, open <strong>My Account → Lists</strong>, create a
          list, choose <strong>Add Materials</strong>, then{" "}
          <strong>Paste an Existing List</strong>.
        </li>
        <li>
          Review the retailer’s draft quantities and exact products. You can
          move the resulting list into a Home Depot Project.
        </li>
      </ol>
      <a
        className="download-example"
        href="https://www.homedepot.com/c/create-a-list"
        target="_blank"
        rel="noreferrer"
      >
        Open Home Depot’s list instructions <ExternalLink size={13} />
      </a>
      {unresolved > 0 && (
        <div className="notice stock-incomplete">
          <AlertTriangle size={17} />
          <p>
            {unresolved} part(s) exceed the modeled stock. They are listed
            separately and excluded from the purchase quantities. Resolve them
            before ordering.
          </p>
        </div>
      )}
      {!hasQuantities && (
        <p className="small-note">
          Add fitting materials to create a purchase list.
        </p>
      )}
      <label className="field">
        Prepared material list
        <textarea
          ref={textarea}
          aria-label="Home Depot material list"
          rows={13}
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="inline">
        <button
          className="button primary"
          disabled={!hasQuantities && !unresolved}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setError("");
            } catch {
              textarea.current?.focus();
              textarea.current?.select();
              setError(
                "Clipboard access was blocked. The list is selected; copy it with your keyboard or download it.",
              );
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
          {copied ? "List copied" : "Copy material list"}
        </button>
        <button className="button secondary" onClick={() => onDownload(text)}>
          <Download size={15} />
          Download text
        </button>
      </div>
      <div className="notice">
        <Info size={16} />
        <p>
          This copies or downloads text. It does not sign in, create a retailer
          project, or submit an order. Home Depot’s draft still needs your
          review.
        </p>
      </div>
    </>
  );
}
