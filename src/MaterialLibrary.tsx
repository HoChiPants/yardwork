import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { groupedMaterials, materialPlacementOptions, type MaterialGroup } from "./materialGroups";

type Point = { x: number; y: number };
type Drag = {
  pointer: number;
  start: Point;
  tile: HTMLButtonElement;
  group: MaterialGroup;
  stock: MaterialGroup["variants"][number];
  action: "pending" | "place" | "scroll";
  scrollLeft: number;
  scrollTop: number;
};
const dragDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function MaterialLibrary({ category, search, onPreview, onPlace }: {
  category: string;
  search: string;
  onPreview: (point: Point | null, stock?: MaterialGroup["preferred"]) => boolean;
  onPlace: (group: MaterialGroup, pointer?: Point) => void;
}) {
  const groups = useMemo(() => groupedMaterials(category, search).map((group) => ({
    group, stock: materialPlacementOptions(group).preferred,
  })), [category, search]);
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const [ghost, setGhost] = useState<{ drag: Drag; point: Point; overCanvas: boolean } | null>(null);
  useEffect(() => {
    function cancel(event: KeyboardEvent) {
      const active = drag.current;
      if (event.key !== "Escape" || active?.action !== "place") return;
      event.preventDefault();
      event.stopPropagation();
      drag.current = null;
      if (active.tile.hasPointerCapture(active.pointer)) active.tile.releasePointerCapture(active.pointer);
      setGhost(null);
      preview.current(null);
    }
    window.addEventListener("keydown", cancel, true);
    return () => {
      window.removeEventListener("keydown", cancel, true);
      if (drag.current?.action === "place") preview.current(null);
    };
  }, []);
  const pointOf = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  function start(event: PointerEvent<HTMLButtonElement>, group: MaterialGroup, stock: Drag["stock"]) {
    if (drag.current || event.button !== 0 || !event.isPrimary) return;
    drag.current = {
      pointer: event.pointerId, start: pointOf(event), tile: event.currentTarget, group, stock,
      action: "pending", scrollLeft: list.current?.scrollLeft ?? 0, scrollTop: list.current?.scrollTop ?? 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const point = pointOf(event);
    const rail = list.current;
    const dx = point.x - active.start.x, dy = point.y - active.start.y;
    if (active.action === "pending") {
      if (dragDistance(point, active.start) < 6) return;
      // A swipe along the rail browses materials. A crosswise pull brings the tile into the scene.
      const alongRail = rail && event.pointerType === "touch" && (
        (rail.scrollWidth > rail.clientWidth && Math.abs(dx) > 2 * Math.abs(dy)) ||
        (rail.scrollHeight > rail.clientHeight && Math.abs(dy) > 2 * Math.abs(dx))
      );
      active.action = alongRail ? "scroll" : "place";
    }
    if (active.action === "scroll") {
      rail?.scrollTo(active.scrollLeft - dx, active.scrollTop - dy);
      return;
    }
    setGhost({ drag: active, point, overCanvas: onPreview(point, active.stock.id) });
  }
  function art(stock: Drag["stock"]) {
    const profile = stock.wood && stock.stockKind === "linear" ? stock.size.slice().sort((a, b) => a - b)[1] : null;
    return <span className={`material-art ${stock.id} ${stock.stockKind}${stock.shape === "tube-envelope" ? " tube" : ""}`} aria-hidden="true"
      style={{ "--material-color": stock.color, "--board-width": profile ? `${Math.min(27, 8 + profile * 1.8)}px` : undefined } as CSSProperties}><span /></span>;
  }
  function finish(event: PointerEvent<HTMLButtonElement>, place: boolean) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    drag.current = null;
    setGhost(null);
    const point = pointOf(event);
    if (active.action === "place") onPreview(null);
    if (!place || active.action === "scroll") return;
    if (active.action === "place" || dragDistance(point, active.start) >= 6) {
      onPlace(active.group, point);
      return;
    }
    if (event.currentTarget.contains(document.elementFromPoint(point.x, point.y))) {
      onPlace(active.group);
    }
  }
  return <>
    <div className="material-list" ref={list}>
      {groups.map(({ group, stock }) => <div key={group.id} className="material-card" data-material-family={group.id}>
          <button type="button" className="material-grip" title="Drag into the workspace or click to add at the center"
            onClick={(event) => { if (event.detail === 0) onPlace(group); }}
            onPointerDown={(event) => start(event, group, stock)} onPointerMove={move}
            onDragStart={(event) => event.preventDefault()}
            onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)}
            onLostPointerCapture={(event) => finish(event, false)}>
            {art(stock)}
            <strong>{group.name}</strong>
          </button>
          <button type="button" className="material-add" aria-label={`Add ${group.name}`} title="Add at the center" onClick={() => onPlace(group)}><Plus size={16} /></button>
        </div>
      )}
      {!groups.length && <p className="small-note">No matching materials.</p>}
    </div>
    {ghost && createPortal(<div className={`material-drag-preview${ghost.overCanvas ? " can-drop" : ""}`} aria-hidden="true"
      data-left={ghost.point.x > window.innerWidth / 2 || undefined}
      data-above={ghost.point.y > window.innerHeight - 85 || undefined}
      style={{ left: ghost.point.x, top: ghost.point.y }}>
      {art(ghost.drag.stock)}
      <strong>{ghost.drag.group.name}</strong>
    </div>, document.body)}
  </>;
}
