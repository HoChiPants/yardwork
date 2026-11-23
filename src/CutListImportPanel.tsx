import { useMemo, useRef, useState } from "react";
import {
  createCutListProject, cutListStocks, initialCutListStock, parseCutListCsv, reviewCutList,
} from "./cutListCsv";
import { formatStockLength } from "./measurement";
import type { MaterialId, Project } from "./model";

type Rows = ReturnType<typeof parseCutListCsv>;
const previewLimit = 30;

export function CutListImportPanel({ onOpen, onDownloadTemplate }: {
  onOpen: (project: Project) => void;
  onDownloadTemplate: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [rows, setRows] = useState<Rows>([]);
  const [choices, setChoices] = useState(new Map<string, MaterialId>());
  const [activeToken, setActiveToken] = useState("");
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [reading, setReading] = useState(false);
  const checked = useMemo(() => reviewCutList(rows, choices), [rows, choices]);
  const tokens = useMemo(() => [...new Set(rows.map(({ stock }) => stock))], [rows]);
  const token = tokens.includes(activeToken) ? activeToken : tokens.find((stock) => !choices.has(stock)) ?? tokens[0];
  const count = rows.reduce((sum, row) => sum + row.quantity, 0);
  const ready = count > 0 && checked.every(({ size }) => !!size);

  async function read(source: File) {
    const id = ++request.current;
    setRows([]);
    setProblem("");
    setActiveToken("");
    setExpanded(false);
    setReading(true);
    try {
      if (source.size > 4 * 1024 * 1024) throw Error("Use a CSV file no larger than 4 MB.");
      const text = await source.text();
      if (request.current !== id) return;
      const parsed = parseCutListCsv(text);
      setChoices(initialCutListStock(parsed));
      setName(source.name.replace(/\.csv$/i, "").slice(0, 120));
      setRows(parsed);
    } catch (cause) {
      if (request.current === id)
        setProblem(cause instanceof Error ? cause.message : "Could not read this cut list.");
    } finally {
      if (request.current === id) setReading(false);
    }
  }

  return <section aria-label="Cut list import">
    <p className="small-note">Import rectangular boards and sheets as loose parts in a new project. Use one unit per row. Length follows the stock length or grain direction.</p>
    <input ref={file} type="file" accept=".csv,text/csv" aria-label="Cut list CSV file"
      onChange={(event) => {
        const source = event.target.files?.[0];
        event.target.value = "";
        if (source) void read(source);
      }} />
    <div className="button-row">
      <button type="button" className="button secondary" onClick={() => file.current?.click()}>
        Choose cut list CSV
      </button>
      <button type="button" className="text-button" onClick={onDownloadTemplate}>Download cut list template</button>
    </div>
    {reading && <p role="status" className="small-note">Reading the cut list…</p>}
    {problem && <p role="alert" className="form-error">{problem}</p>}
    {!!rows.length && <>
      <label className="field">Project name
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </label>
      {tokens.length > 1 && <label className="field">Stock listed in the CSV
        <select value={token} onChange={(event) => setActiveToken(event.target.value)}>
          {tokens.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>}
      <label className="field">
        {"Stock for “" + token + "”"}
        <select value={choices.get(token) ?? ""} onChange={(event) => {
          setActiveToken(token);
          const id = event.target.value as MaterialId;
          setChoices((current) => {
            const next = new Map(current);
            if (id) next.set(token, id);
            else next.delete(token);
            return next;
          });
          setProblem("");
        }}>
          <option value="">Choose stock</option>
          {cutListStocks.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
        </select>
      </label>
      <p className="small-note" role="status">{count} {count === 1 ? "part" : "parts"} in {rows.length} {rows.length === 1 ? "row" : "rows"}.{
        !ready && " Resolve the highlighted rows before opening."
      }</p>
      <table>
        <caption>Finished parts from the cut list</caption>
        <thead><tr><th scope="col">Part</th><th scope="col">Qty</th><th scope="col">Stock</th><th scope="col">Length × width × thickness</th></tr></thead>
        <tbody>{(expanded ? checked : checked.slice(0, previewLimit)).map(({ row, stock, size, problem }) =>
          <tr key={row.line}>
            <th scope="row">{row.name}</th>
            <td>{row.quantity}</td>
            <td>{stock?.name ?? row.stock}</td>
            <td>{size ? [size[2], size[0], size[1]].map(formatStockLength).join(" × ")
              : <span className="form-error">{"Line " + row.line + " · " + problem}</span>}</td>
          </tr>)}</tbody>
      </table>
      {checked.length > previewLimit && <button type="button" className="text-button" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show fewer rows" : "Show all " + checked.length + " rows"}
      </button>}
      <button type="button" className="button primary full" disabled={!ready} onClick={() => {
        try {
          onOpen(createCutListProject(name, checked));
        } catch (cause) {
          setProblem(cause instanceof Error ? cause.message : "Could not open the cut list.");
        }
      }}>Open cut list as new project</button>
    </>}
  </section>;
}
