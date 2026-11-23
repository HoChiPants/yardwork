import {
  blank, catalog, material, maxPartDimension, maxProjectPieces, part, projectSchema,
  type Material, type MaterialId, type Project, type V3,
} from "./model";
import { orientedStockSize } from "./stockAxes";

const headers = ["name", "stock", "quantity", "length", "width", "thickness", "unit"] as const;
const required = ["name", "stock", "quantity", "length", "unit"] as const;
const inchFactors: Readonly<Record<string, number>> = { in: 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54 };
const tolerance = 0.000001;
const eligible = (stock: Material) => stock.cuttable && !stock.shape && !stock.includedComponent &&
  (stock.stockKind === "linear" || stock.stockKind === "sheet");
export const cutListStocks = catalog.filter(eligible);
const cutListStockById = new Map(cutListStocks.map((stock) => [stock.id, stock]));

type RecordRow = { line: number; fields: string[] };

function readRecords(text: string) {
  const records: RecordRow[] = [];
  let value = "", fields: string[] = [], quoted = false, closed = false, line = 1, start = 1;
  const finishField = () => {
    fields.push(value);
    value = "";
    closed = false;
  };
  const finishRecord = () => {
    finishField();
    if (fields.length > 1 || fields[0].trim()) records.push({ line: start, fields });
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const newline = ch === "\n" || (ch === "\r" && text[i + 1] !== "\n");
    if (ch === "\0") throw Error("Use a text CSV file.");
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else {
        value += ch;
        if (newline) line++;
      }
    } else if (ch === ",") {
      finishField();
    } else if (ch === "\r" || ch === "\n") {
      finishRecord();
      if (ch === "\r" && text[i + 1] === "\n") i++;
      start = ++line;
    } else if (ch === '"' && !value && !closed) {
      quoted = true;
    } else if (closed || ch === '"') {
      throw Error("Check the CSV quotes on line " + line + ". Double any quote inside a quoted field.");
    } else {
      value += ch;
    }
  }
  if (quoted) throw Error("Close the quoted CSV field starting on line " + start + ".");
  if (value || closed || fields.length) finishRecord();
  return records;
}

type CutRow = {
  line: number;
  name: string;
  stock: string;
  quantity: number;
  length: number;
  width: number | null;
  thickness: number | null;
};

function dimension(value: string, factor: number) {
  if (!value) return null;
  const number = Number(value);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(number) ||
      number * factor <= 0 || number * factor > maxPartDimension)
    return NaN;
  return number * factor;
}

export function parseCutListCsv(text: string): CutRow[] {
  const [first, ...records] = readRecords(text.replace(/^\uFEFF/, ""));
  const columns = first?.fields.map((field) => field.trim().toLowerCase()) ?? [];
  if (required.some((name) => !columns.includes(name)) || new Set(columns).size !== columns.length)
    throw Error("Use one column each for name, stock, quantity, length and unit. Width and thickness are optional columns.");
  if (!records.length) throw Error("The cut list needs at least one part row.");
  let total = 0;
  return records.map(({ line, fields }) => {
    const get = (name: typeof headers[number]) => fields[columns.indexOf(name)]?.trim() ?? "";
    const fail = (message: string): never => { throw Error("Line " + line + " · " + message); };
    if (fields.length !== columns.length) fail("The row needs the same number of fields as the header.");
    const name = get("name").replace(/[\r\n\t]+/g, " "), stock = get("stock");
    if (!name || name.length > 120) fail("Enter a part name of up to 120 characters.");
    if (!stock || stock.length > 240) fail("Enter a stock name or Yardwork stock ID.");
    const units = get("unit").toLowerCase();
    const factor = Object.hasOwn(inchFactors, units) ? inchFactors[units] : 0;
    if (!factor) fail("Use in, ft, mm, cm or m for the unit.");
    const quantity = Number(get("quantity"));
    if (!/^\d+$/.test(get("quantity")) || !Number.isSafeInteger(quantity) || quantity < 1)
      fail("Enter a positive whole number for quantity.");
    total += quantity;
    if (total > maxProjectPieces) fail("The cut list exceeds the project limit of " + maxProjectPieces + " parts.");
    const length = dimension(get("length"), factor) ?? NaN;
    const width = dimension(get("width"), factor), thickness = dimension(get("thickness"), factor);
    if ([length, width, thickness].some(Number.isNaN)) fail("Use positive numeric dimensions in the specified unit.");
    return { line, name, stock, quantity, length, width, thickness };
  });
}

export function initialCutListStock(rows: readonly CutRow[]) {
  const ids = new Map<string, MaterialId>();
  for (const { stock } of rows) {
    const match = cutListStocks.find(({ id }) => id === stock.toLowerCase());
    const named = match ? [match] : cutListStocks.filter(({ name }) => name.toLowerCase() === stock.toLowerCase());
    if (named.length === 1) ids.set(stock, named[0].id);
  }
  return ids;
}

function selectedDimensions(row: CutRow, stock: Material) {
  const [thickness, width, length] = [...(stock.stockSize ?? stock.size)].sort((a, b) => a - b);
  if (stock.stockKind === "sheet" && row.width === null)
    return { problem: "Enter the finished width for sheet stock." } as const;
  const finishedWidth = row.width ?? width;
  if (row.thickness !== null && Math.abs(row.thickness - thickness) > tolerance)
    return { problem: "Use the stock’s actual thickness or leave thickness blank." } as const;
  if (stock.stockKind === "linear" && Math.abs(finishedWidth - width) > tolerance)
    return { problem: "Use the stock’s actual board width or leave width blank." } as const;
  if (row.length > length + tolerance || finishedWidth > width + tolerance)
    return { problem: "The cut does not fit this stock in the entered length direction." } as const;
  const size: V3 = [Math.min(finishedWidth, width), thickness, Math.min(row.length, length)];
  return { size } as const;
}

type CheckedRow = { row: CutRow; stock?: Material; size?: V3; problem?: string };

export function reviewCutList(rows: readonly CutRow[], choices: ReadonlyMap<string, MaterialId>): CheckedRow[] {
  return rows.map((row) => {
    const id = choices.get(row.stock);
    const stock = id ? cutListStockById.get(id) : undefined;
    return stock ? { row, stock, ...selectedDimensions(row, stock) }
      : { row, stock: undefined, problem: "Choose stock for " + row.stock + "." };
  });
}

export function createCutListProject(name: string, checked: readonly CheckedRow[]): Project {
  if (!checked.length)
    throw Error("Resolve the stock and dimension issues before opening the cut list.");
  const valid = checked.map(({ row, size, stock }) => {
    if (!size || !stock) throw Error("Resolve the stock and dimension issues before opening the cut list.");
    return { row, size, stock };
  });
  const project = blank(name.trim().slice(0, 120) || "Imported cut list");
  const task = project.steps[0];
  task.title = "Sort and dry-fit the cut parts";
  task.notes = "Imported parts are set out on the floor. Use the stock cut order for the blanks and place the actual pieces before deciding on joints or assembly steps.";
  const gap = 2;
  const area = valid.reduce((sum, { row, size }) => sum + row.quantity * (size[0] + gap) * (size[2] + gap), 0);
  const targetWidth = Math.max(Math.sqrt(area), ...valid.map(({ size }) => size[0]));
  let x = 0, z = 0, rowDepth = 0, usedWidth = 0;
  for (const { row, size, stock } of valid) {
    const [width, thickness, length] = size;
    for (let i = 0; i < row.quantity; i++) {
      if (x > 0 && x + width > targetWidth) {
        x = 0;
        z += rowDepth + gap;
        rowDepth = 0;
      }
      project.pieces.push({
        ...part(row.name, stock.id, [...size], [x + width / 2, thickness / 2, z + length / 2], task.id, "Imported cut list"),
        stockLengthAxis: 2,
      });
      usedWidth = Math.max(usedWidth, x + width);
      x += width + gap;
      rowDepth = Math.max(rowDepth, length);
    }
  }
  const depth = z + rowDepth;
  for (const piece of project.pieces) {
    piece.position[0] -= usedWidth / 2;
    piece.position[2] -= depth / 2;
  }
  return projectSchema.parse(project);
}

const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = typeof value === "string" && /^\s*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
};
export const cutListTemplate = headers.join(",") + "\r\n" +
  '"Long rail","stud",2,38,,,in\r\n"Seat panel","plywood",1,42,19,0.75,in\r\n';

export function exportCutList(project: Project) {
  const groups = new Map<string, { cells: [string, MaterialId, number, number, number, number, string]; count: number }>();
  let skipped = 0;
  let count = 0;
  for (const piece of project.pieces) {
    if (piece.offcut) continue;
    const stock = material(piece.material);
    const [thickness, width, length] = orientedStockSize(piece);
    const cells = [piece.name, stock.id, 1, length, width, thickness, "in"] as const;
    if (!eligible(stock) || piece.cutPlanes.length || piece.roundOpenings?.length ||
        piece.rectangularOpenings?.length || piece.foilReturns ||
        !selectedDimensions({ line: 0, name: piece.name, stock: stock.id, quantity: 1, length, width, thickness }, stock).size) {
      skipped++;
      continue;
    }
    const key = JSON.stringify(cells);
    const entry = groups.get(key);
    if (entry) entry.count++;
    else groups.set(key, { cells: [...cells], count: 1 });
    count++;
  }
  const rows = [...groups.values()].map(({ cells, count }) => {
    cells[2] = count;
    return cells.map(csvCell).join(",");
  });
  return { count, skipped, text: [headers.join(","), ...rows].join("\r\n") + "\r\n" };
}
