import { useState } from "react";
import { Plus } from "lucide-react";
import { groupedMaterials } from "./materialGroups";
import type { MaterialId } from "./model";
import { formatStockLength } from "./measurement";

export function MaterialLibrary({
  category,
  search,
  onAdd,
}: {
  category: string;
  search: string;
  onAdd: (id: MaterialId) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const groups = groupedMaterials(category, search);
  return (
    <>
      <div className="section-label">
        {category === "All" ? "MATERIAL TYPES" : category.toUpperCase()}
        <span>{groups.length}</span>
      </div>
      <div className="material-list">
        {groups.map((group) => {
          const m =
            group.variants.find((v) => v.id === choices[group.id]) ??
            group.variants.find((v) => v.id === group.preferred)!;
          return (
            <div
              key={group.id}
              className="material-card"
              data-material-family={group.id}
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  "application/yardwork-material",
                  m.id,
                )
              }
            >
              <div
                className={`material-art ${m.id} ${m.stockKind}`}
                style={{ "--material-color": m.color } as React.CSSProperties}
              >
                <div />
              </div>
              <div className="material-info">
                <strong>{group.name}</strong>
                {group.variants.length > 1 && (
                  <select
                    aria-label={`${group.name} option`}
                    value={m.id}
                    onChange={(event) =>
                      setChoices({ ...choices, [group.id]: event.target.value })
                    }
                  >
                    {group.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {formatStockLength(Math.max(...variant.size))} ·{" "}
                        {variant.name}
                        {variant.priceKind === "unpriced" ? "" : " · example"}
                      </option>
                    ))}
                  </select>
                )}
                <small>{m.subtitle}</small>
                {group.variants.length > 1 && <small>{m.name}</small>}
                <span>
                  {m.priceKind === "unpriced"
                    ? "Price not recorded"
                    : new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(m.price)}{" "}
                  <em>
                    / {m.unit}
                    {m.priceKind === "unpriced"
                      ? " · reviewed product specs"
                      : " · example"}
                  </em>
                </span>
              </div>
              <button aria-label={`Add ${m.name}`} onClick={() => onAdd(m.id)}>
                <Plus size={16} />
              </button>
            </div>
          );
        })}
        {!groups.length && <p className="small-note">No matching materials.</p>}
      </div>
    </>
  );
}
