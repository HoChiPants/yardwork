import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { material, type SectionCommand } from "./model";
import { wallFramingStockIds, windowFramingSource, windowWallScope, windowWallTemplate, type WindowOpening } from "./windowWall";
import { doorAndWindowTemplate } from "./wallOpenings";

const initial: WindowOpening = { width: 36, height: 48, sill: 32 };
export const windowWallExample = "Build a wall 8 ft wide and 8 ft tall with a 36 by 48 in rough window opening, sill 32 in above floor";

function WindowWallPreview({ command, opening }: { command: SectionCommand; opening: WindowOpening }) {
  const { width, height } = command;
  if (![width, height, opening.width, opening.height, opening.sill, opening.offset ?? 0].every(Number.isFinite) || width <= 0 || height <= 0)
    return null;
  let parts: ReturnType<typeof windowWallTemplate>;
  try {
    parts = command.doorOpening
      ? doorAndWindowTemplate(command, command.doorOpening, opening, 3.5, command.doorUnit)
      : windowWallTemplate(command, opening, 3.5);
  } catch {
    return null;
  }
  const ratio = width / height;
  const areas = [{ ...opening, bottom: opening.sill, name: "Rough window" }];
  if (command.doorOpening) areas.push({
    ...command.doorOpening, sill: 0, bottom: command.doorOpening.floor ?? 0, name: "Rough doorway",
  });
  return (
    <div role="img" aria-label="Framed wall front view" className="window-wall-preview"
      style={{ width: `min(100%, ${210 * ratio}px)`, aspectRatio: ratio }}>
      {areas.map((area) => <span key={area.name} title={area.name} className="window-wall-opening" style={{
        left: `${(width / 2 + (area.offset ?? 0) - area.width / 2) / width * 100}%`,
        width: `${area.width / width * 100}%`,
        bottom: `${area.bottom / height * 100}%`,
        height: `${area.height / height * 100}%`,
      }} />)}
      {parts.map(({ role, name, size: [w, h], position: [x, y] }) => (
        <span key={role} className="window-wall-board" title={name} style={{
          left: `${(width / 2 + x - w / 2) / width * 100}%`,
          width: `${w / width * 100}%`,
          bottom: `${(y - h / 2) / height * 100}%`,
          height: `${h / height * 100}%`,
        }} />
      ))}
    </div>
  );
}

export function WindowWallFields({ command, onChange }: {
  command: SectionCommand;
  onChange: (command: SectionCommand) => void;
}) {
  const opening = command.windowOpening;
  if (!opening) return (
    <button type="button" className="text-button" onClick={() => {
      const sill = Math.max(command.height - 75, Math.min(32, command.height / 2));
      const height = Math.min(48, command.height - sill - 4.5);
      const door = command.doorOpening;
      const side = (door?.offset ?? 0) <= 0 ? 1 : -1;
      const offset = door ? side * (command.width / 2 - 4.5 - initial.width / 2) : undefined;
      onChange({ ...command, windowOpening: { ...initial, width: Math.min(36, command.width - 9), height, sill, offset, stock: command.wallStock } });
    }}>Add a rough window opening</button>
  );
  const set = <K extends keyof WindowOpening>(key: K, value: WindowOpening[K]) =>
    onChange({ ...command, windowOpening: { ...opening, [key]: value } });
  return (
    <section className="field-section" aria-label="Window wall dimensions">
      <WindowWallPreview command={command} opening={opening} />
      <div className="two-col">
        <LengthInput label="Wall width" value={command.width} min={24} max={192} onChange={(width) => onChange({ ...command, width })} />
        <LengthInput label="Wall height" value={command.height} min={12} max={120} onChange={(height) => onChange({ ...command, height })} />
      </div>
      <label className="field">Stud spacing
        <select value={command.spacing} onChange={({ currentTarget }) =>
          onChange({ ...command, spacing: Number(currentTarget.value) as 12 | 16 | 24 })}>
          {[12, 16, 24].map((value) => <option value={value} key={value}>{value} in on center</option>)}
        </select>
      </label>
      <div className="two-col">
        <LengthInput label="Rough window width" value={opening.width} min={0.001} max={96} onChange={(value) => set("width", value)} />
        <LengthInput label="Rough window height" value={opening.height} min={0.001} max={100} onChange={(value) => set("height", value)} />
      </div>
      <div className="two-col">
        <LengthInput label="Sill height from wall base" value={opening.sill} min={3} max={116} onChange={(value) => set("sill", value)} />
        <LengthInput label={command.doorOpening ? "Window offset from wall center" : "Offset from wall center"}
          value={opening.offset ?? 0} min={-96} max={96} onChange={(value) => set("offset", value)} />
      </div>
      <p className="small-note">Use the unit's rough dimensions. Negative offsets move the opening left.</p>
      <label className="field">Framing board
        <select value={opening.stock ?? "stud"} onChange={({ currentTarget }) =>
          set("stock", wallFramingStockIds.find((id) => id === currentTarget.value))}>
          {wallFramingStockIds.map((id) => {
            const stock = material(id);
            const dimensions = [...(stock.stockSize ?? stock.size)].sort((a, b) => a - b);
            return <option key={id} value={id}>{stock.name} · {formatStockLength(dimensions[2])}</option>;
          })}
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={opening.upperBacking ?? false} onChange={({ currentTarget }) => set("upperBacking", currentTarget.checked)} />
        Add short backing studs above the head
      </label>
      <p className="small-note">{windowWallScope} <a href={windowFramingSource} target="_blank" rel="noreferrer">Window framing reference</a></p>
      <button type="button" className="text-button" onClick={() => onChange({ ...command, windowOpening: null })}>
        Remove the rough opening
      </button>
    </section>
  );
}
