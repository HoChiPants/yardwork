import { ChevronRight } from "lucide-react";
import {
  buildPreparationScope,
  type BuildPreparationAction,
  type BuildPreparationGroup,
  type BuildPreparationItem,
} from "./buildPreparation";

function ReviewRows({
  items,
  onOpen,
}: {
  items: readonly BuildPreparationItem[];
  onOpen: (action: BuildPreparationAction) => void;
}) {
  return (
    <ul className="preparation-rows">
      {items.map(({ id, title, detail, action }) => (
        <li key={id}>
          <button type="button" onClick={() => onOpen(action)}>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function BuildPreparationPanel({
  groups,
  onOpen,
  onBack,
}: {
  groups: readonly BuildPreparationGroup[];
  onOpen: (action: BuildPreparationAction) => void;
  onBack: () => void;
}) {
  return (
    <section
      className="build-preparation"
      aria-labelledby="build-preparation-heading"
    >
      <button type="button" className="text-button" onClick={onBack}>
        ← Back to guide
      </button>
      <h2 id="build-preparation-heading">Build preparation</h2>
      <p className="small-note">{buildPreparationScope}</p>
      {groups.map(({ id, title, empty, intro, reviewCount, items }) => (
        <details key={id} className="field-section preparation-group">
          <summary>
            <span>{title}</span>
            <span className="preparation-count">{reviewCount ?? items.length} to review</span>
          </summary>
          {intro && <p className="small-note">{intro}</p>}
          {items.length ? (
            <>
              <ReviewRows items={items.slice(0, 6)} onOpen={onOpen} />
              {items.length > 6 && (
                <details className="preparation-more">
                  <summary>Show {items.length - 6} more</summary>
                  <ReviewRows items={items.slice(6)} onOpen={onOpen} />
                </details>
              )}
            </>
          ) : (
            <p className="small-note">{empty}</p>
          )}
        </details>
      ))}
    </section>
  );
}

export function PrintBuildPreparation({
  groups,
}: {
  groups: readonly BuildPreparationGroup[];
}) {
  if (!groups.length) return null;
  return (
    <section className="build-preparation-print">
      <h2>Build preparation</h2>
      <p>{buildPreparationScope}</p>
      {groups.map(({ id, title, empty, intro, items }) => (
        <div key={id}>
          <h3>{title}</h3>
          {intro && <p>{intro}</p>}
          {items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong> · {item.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>{empty}</p>
          )}
        </div>
      ))}
    </section>
  );
}
