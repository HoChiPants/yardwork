import { useMemo } from "react";
import { LengthInput } from "./LengthInput";
import { compareFloorBaseStock, type FloorBaseStockOption } from "./floorBaseStock";
import { baseBoardDepth, baseBoardIds, baseMemberLengths, baseMembers, fittingBaseBoards } from "./homeDepotTreatedLumber";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import { material, type SectionCommand } from "./model";

const genericStock = { rim: "treated", joist: "treated" } as const;
const memberLabels = { rim: "Rim board stock", joist: "Joist stock" } as const;
const stockSummary = ({ boards, purchasedLength, remnantLength }: FloorBaseStockOption) =>
  `${boards} ${boards === 1 ? "board" : "boards"} · ${formatStockLength(purchasedLength)} of stock · ${formatStockLength(remnantLength)} total in remnants`;

export function FloorBaseFields({
  command,
  canSuggestStock,
  onChange,
}: {
  command: SectionCommand;
  canSuggestStock: boolean;
  onChange: (command: SectionCommand) => void;
}) {
  const stock = command.baseStock ?? genericStock;
  const memberDepth = baseBoardDepth(stock.rim);
  const boardChoices = baseBoardIds.filter((id) => baseBoardDepth(id) === memberDepth);
  const lengths = baseMemberLengths(command);
  const suggested = fittingBaseBoards(command, memberDepth);
  const hasFit = baseMembers.some((member) =>
    suggested[member] !== "treated" && material(suggested[member]).size[2] >= lengths[member]);
  const canSuggest = canSuggestStock && hasFit &&
    (stock.rim !== suggested.rim || stock.joist !== suggested.joist) &&
    Number.isFinite(command.width) && Number.isFinite(command.depth);
  const { width, depth, height, spacing, type } = command;
  const comparison = useMemo(
    () => canSuggestStock ? compareFloorBaseStock({ type, width, depth, height, spacing }, memberDepth) : null,
    [canSuggestStock, type, width, depth, height, spacing, memberDepth],
  );
  const matched = comparison?.options.find(
    ({ stock: choice }) => choice.rim === stock.rim && choice.joist === stock.joist,
  );
  const least = comparison?.leastLumber;
  const fewest = comparison?.fewestBoards;
  const shorter = matched && least ? matched.purchasedLength - least.purchasedLength : 0;
  const dimensionsFit = baseMembers.every((member) =>
    stock[member] !== "treated" && material(stock[member]).size[2] >= lengths[member]);
  const suggestions = [
    ...(least ? [{ label: "Least lumber", choice: least }] : []),
    ...(fewest && fewest !== least ? [{ label: "Fewest boards", choice: fewest }] : []),
  ];

  return (
    <div className="floor-base-fields">
      <div className="number-row">
        <LengthInput label="Base width" value={command.width} required min={24} max={192}
          defaultUnit={preferredLengthUnit(command.width)}
          onChange={(width) => onChange({ ...command, width })}
        />
        <LengthInput label="Base depth" value={command.depth} required min={24} max={192}
          defaultUnit={preferredLengthUnit(command.depth)}
          onChange={(depth) => onChange({ ...command, depth })}
        />
      </div>
      <label className="field">
        Joist spacing
        <select value={command.spacing} onChange={(event) => {
          const spacing = Number(event.target.value);
          if (spacing === 12 || spacing === 16 || spacing === 24) onChange({ ...command, spacing });
        }}>
          <option value={12}>12 in</option>
          <option value={16}>16 in</option>
          <option value={24}>24 in</option>
        </select>
      </label>
      {canSuggestStock && (
        <label className="field">
          Framing size
          <select aria-label="Framing size" aria-describedby={memberDepth === 7.5 ? "floor-base-stock-note" : undefined}
            value={memberDepth} onChange={(event) => {
            const next = Number(event.target.value);
            if (next === 5.5 || next === 7.5)
              onChange({ ...command, baseStock: fittingBaseBoards(command, next) });
          }}>
            <option value={5.5}>2 × 6 · 5½ in deep</option>
            <option value={7.5}>2 × 8 · 7½ in deep</option>
          </select>
          {memberDepth === 7.5 && <small id="floor-base-stock-note">Check the delivered board depth and treatment before cutting.</small>}
        </label>
      )}
      {baseMembers.map((member) => (
        <label className="field" key={member}>
          {memberLabels[member]}
          <select aria-label={memberLabels[member]} value={stock[member]} onChange={(event) => {
            const selected = boardChoices.find((id) => id === event.target.value);
            if (selected)
              onChange({ ...command, baseStock: { ...stock, [member]: selected } });
          }}>
            {boardChoices.map((id) => (
              <option key={id} value={id}>
                {id === "treated" ? "Generic 8 ft · example" : material(id).name}
              </option>
            ))}
          </select>
          {Number.isFinite(lengths[member]) && lengths[member] > 0 && (
            <small>{formatStockLength(lengths[member])} finished cut</small>
          )}
        </label>
      ))}
      {canSuggest && (
        <button type="button" className="button secondary" onClick={() => onChange({ ...command, baseStock: suggested })}>
          Use shortest Home Depot boards that fit
        </button>
      )}
      {suggestions.length > 0 && (
        <details className="floor-stock-comparison">
          <summary>Compare board lengths{shorter > 0 && ` · ${formatStockLength(shorter)} less stock`}</summary>
          <p className="small-note">Estimates cover this base using the modeled saw kerf.</p>
          {matched && matched !== least && matched !== fewest && (
            <p className="small-note">Current choice · {stockSummary(matched)}</p>
          )}
          {!matched && dimensionsFit && <p className="small-note">The current lengths need a cut-order review.</p>}
          <ul aria-label="Floor base stock options">
            {suggestions.map(({ label, choice }) => (
              <li key={label}>
                <strong>{label}</strong>
                <span>{formatStockLength(material(choice.stock.rim).size[2])} rims · {formatStockLength(material(choice.stock.joist).size[2])} joists</span>
                <span>{stockSummary(choice)}</span>
                {matched === choice
                  ? <span>Selected</span>
                  : <button type="button" className="button secondary small"
                      onClick={() => onChange({ ...command, baseStock: choice.stock })}>
                      Use {label.toLowerCase()}
                    </button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
