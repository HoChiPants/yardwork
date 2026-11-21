import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { groupedMaterials, materialPlacementOptions, type MaterialGroup } from "./materialGroups";

type Point = { x: number; y: number };
type Drag = { pointer: number; start: Point; group: MaterialGroup; active: boolean };

export function MaterialLibrary({ category, search, onPlace }: {
  category: string;
  search: string;
  onPlace: (group: MaterialGroup, pointer?: Point) => void;
}) {
  const groups = groupedMaterials(category, search);
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<{ name: string; point: Point } | null>(null);
  const pointOf = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  function start(event: PointerEvent<HTMLDivElement>, group: MaterialGroup) {
    const target = event.target as Element;
    if (event.button !== 0 || !event.isPrimary || target.closest("button") ||
        (event.pointerType === "touch" && !target.closest(".material-art"))) return;
    drag.current = { pointer: event.pointerId, start: pointOf(event), group, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const point = pointOf(event);
    if (!active.active && Math.hypot(point.x - active.start.x, point.y - active.start.y) < 6) return;
    active.active = true;
    setGhost({ name: active.group.name, point });
  }
  function finish(event: PointerEvent<HTMLDivElement>, place: boolean) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    drag.current = null;
    setGhost(null);
    if (place && active.active) onPlace(active.group, pointOf(event));
  }
  return <>
    <div className="section-label">
      {category === "All" ? "MATERIAL TYPES" : category.toUpperCase()}
      <span>{groups.length}</span>
    </div>
    <div className="material-list">
      {groups.map((group) => {
        const { preferred: stock } = materialPlacementOptions(group);
        return <div key={group.id} className="material-card" data-material-family={group.id}
          onPointerDown={(event) => start(event, group)} onPointerMove={move}
          onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)}
          onLostPointerCapture={(event) => finish(event, false)}>
          <div className={`material-art ${stock.id} ${stock.stockKind}`} aria-hidden="true"
            style={{ "--material-color": stock.color } as CSSProperties}><div /></div>
          <div className="material-info"><strong>{group.name}</strong></div>
          <button type="button" aria-label={`Add ${group.name}`} onClick={() => onPlace(group)}><Plus size={16} /></button>
        </div>;
      })}
      {!groups.length && <p className="small-note">No matching materials.</p>}
    </div>
    {ghost && createPortal(<div className="material-drag-preview" aria-hidden="true"
      style={{ left: ghost.point.x + 12, top: ghost.point.y + 12 }}>{ghost.name}</div>, document.body)}
  </>;
}
