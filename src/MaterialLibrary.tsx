import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { groupedMaterials, materialPlacementOptions, type MaterialGroup } from "./materialGroups";

type Point = { x: number; y: number };
type Drag = { pointer: number; start: Point; group: MaterialGroup; stock: MaterialGroup["variants"][number]; active: boolean };

export function MaterialLibrary({ category, search, canDrop, onPlace }: {
  category: string;
  search: string;
  canDrop: (point: Point) => boolean;
  onPlace: (group: MaterialGroup, pointer?: Point) => void;
}) {
  const groups = useMemo(() => groupedMaterials(category, search).map((group) => ({
    group, stock: materialPlacementOptions(group).preferred,
  })), [category, search]);
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<{ drag: Drag; point: Point; overCanvas: boolean } | null>(null);
  const pointOf = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  function start(event: PointerEvent<HTMLDivElement>, group: MaterialGroup, stock: Drag["stock"]) {
    const target = event.target as Element;
    if (drag.current || event.button !== 0 || !event.isPrimary || target.closest("button")) return;
    drag.current = { pointer: event.pointerId, start: pointOf(event), group, stock, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const point = pointOf(event);
    if (!active.active && Math.hypot(point.x - active.start.x, point.y - active.start.y) < 6) return;
    active.active = true;
    setGhost({ drag: active, point, overCanvas: canDrop(point) });
  }
  function art(stock: Drag["stock"]) {
    return <div className={`material-art ${stock.id} ${stock.stockKind}`} aria-hidden="true"
      style={{ "--material-color": stock.color } as CSSProperties}><div /></div>;
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
      {groups.map(({ group, stock }) => <div key={group.id} className="material-card" data-material-family={group.id}
          onPointerDown={(event) => start(event, group, stock)} onPointerMove={move}
          onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)}
          onLostPointerCapture={(event) => finish(event, false)}>
          {art(stock)}
          <div className="material-info"><strong>{group.name}</strong></div>
          <button type="button" aria-label={`Add ${group.name}`} onClick={() => onPlace(group)}><Plus size={16} /></button>
        </div>
      )}
      {!groups.length && <p className="small-note">No matching materials.</p>}
    </div>
    {ghost && createPortal(<div className={`material-drag-preview${ghost.overCanvas ? " can-drop" : ""}`} aria-hidden="true"
      style={{ left: ghost.point.x, top: ghost.point.y }}>
      {art(ghost.drag.stock)}
      <strong>{ghost.drag.group.name}</strong>
    </div>, document.body)}
  </>;
}
