import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Copy,
  Cuboid,
  Download,
  Expand,
  Eye,
  FolderOpen,
  Hammer,
  Layers3,
  Leaf,
  Link2,
  Loader2,
  Magnet,
  MousePointer2,
  Move3D,
  Package,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  Scissors,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
  Wrench,
  AlertTriangle,
  Info,
  ExternalLink,
} from "lucide-react";
import * as THREE from "three";
import { Scene } from "./Scene";
import { InventoryForm } from "./InventoryForm";
import {
  addMaterial,
  bom,
  bounds,
  connect,
  cutPiece,
  distance,
  guideMarkdown,
  parseDxf,
  parseInventory,
  recordChanges,
  shoppingCsv,
  validate,
} from "./engine";
import {
  applyCommand,
  blank,
  catalog,
  commandSchema,
  coop,
  format,
  material,
  projectSchema,
  step,
  uid,
  type Command,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
type Modal =
  | "inventory"
  | "projects"
  | "settings"
  | "import"
  | "export"
  | "assistant"
  | "new"
  | "step"
  | "help"
  | null;
type Summary = {
  id: string;
  name: string;
  updatedAt: string;
  pieces: number;
  revision: number;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
const DRAFT_KEY = "yardwork-draft-v1";
function initial() {
  try {
    const data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (data)
      return {
        project: projectSchema.parse(data.project),
        revision: Number(data.revision) || 0,
      };
  } catch {}
  return { project: coop(), revision: 0 };
}
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Num({
  label,
  value,
  onChange,
  min = -12000,
  max = 12000,
  unit = "in",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onChange(n);
    } else setDraft(String(value));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step="0.125"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
function ZipInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label="Store ZIP"
      inputMode="numeric"
      value={draft}
      maxLength={5}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
      onBlur={() => {
        if (/^\d{5}$/.test(draft)) {
          if (draft !== value) onChange(draft);
        } else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty">
        <Cuboid size={40} />
        <h3>3D rendering is unavailable</h3>
        <p>
          Enable WebGL or try another browser. Your plan and exports remain
          available.
        </p>
        <button onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const [boot] = useState(initial);
  const [project, setProject] = useState<Project>(boot.project);
  const current = useRef(project);
  current.current = project;
  const revision = useRef(boot.revision),
    undoStack = useRef<Project[]>([]),
    redoStack = useRef<Project[]>([]);
  const [, force] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<"select" | "move" | "rotate" | "screw">(
      "select",
    );
  const [snap, setSnap] = useState(true),
    [explode, setExplode] = useState(false),
    [xray, setXray] = useState(false),
    [view, setView] = useState({ preset: "iso", nonce: 0 });
  const [panel, setPanel] = useState<"part" | "checks" | "materials" | "step">(
      "checks",
    ),
    [library, setLibrary] = useState<"parts" | "assemblies">("parts"),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  const [stepId, setStepId] = useState(project.steps[0].id),
    [stage, setStage] = useState<number | null>(null),
    [playing, setPlaying] = useState(false);
  const [modal, setModal] = useState<Modal>(null),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [projects, setProjects] = useState<Summary[]>([]);
  const [inventoryTick, setInventoryTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setInventoryTick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const [health, setHealth] = useState<{ ai: string; catalog: boolean } | null>(
      null,
    ),
    [prompt, setPrompt] = useState(
      "Build a wall 8 ft wide and 6 ft tall, 16 inches on center",
    ),
    [proposal, setProposal] = useState<{
      command: Command;
      provider: string;
      message: string;
    } | null>(null);
  const [importKind, setImportKind] = useState("project"),
    [dxfScale, setDxfScale] = useState(1),
    [newStep, setNewStep] = useState(""),
    [newStepNotes, setNewStepNotes] = useState(""),
    [cutLength, setCutLength] = useState(24),
    [connectionTarget, setConnectionTarget] = useState(""),
    [screws, setScrews] = useState(2),
    [screwLength, setScrewLength] = useState(3);
  const viewport = useRef<HTMLDivElement>(null),
    camera = useRef<THREE.Camera | null>(null),
    file = useRef<HTMLInputElement>(null);
  const onCamera = useCallback((c: THREE.Camera) => {
    camera.current = c;
  }, []);
  const notify = (text: string, error = false) => setToast({ text, error });
  const change = useCallback((update: Project | ((p: Project) => Project)) => {
    const proposal =
      typeof update === "function" ? update(current.current) : update;
    const next = recordChanges(current.current, proposal);
    projectSchema.parse(next);
    undoStack.current.push(current.current);
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    setProject(next);
    setSaved(false);
  }, []);
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Something went wrong", true);
    }
  };
  useEffect(() => {
    api("/api/health")
      .then(setHealth)
      .catch(() =>
        notify(
          "Server is unavailable. Your browser draft is still accessible.",
          true,
        ),
      );
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ project, revision: revision.current }),
        );
      } catch {
        notify(
          "Browser storage is full. Export your project to keep a copy.",
          true,
        );
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setStage((s) => {
          const next = (s ?? -1) + 1;
          if (next >= project.steps.length) {
            setPlaying(false);
            return null;
          }
          setStepId(project.steps[next].id);
          return next;
        }),
      1800,
    );
    return () => clearInterval(timer);
  }, [playing, project.steps]);
  const undo = () => {
    const previous = undoStack.current.pop();
    if (previous) {
      redoStack.current.push(current.current);
      setProject(previous);
      setSaved(false);
      force((n) => n + 1);
      setSelected(null);
      setStage(null);
    }
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (next) {
      undoStack.current.push(current.current);
      setProject(next);
      setSaved(false);
      force((n) => n + 1);
      setSelected(null);
      setStage(null);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setMode("select");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        document.getElementById("save-project")?.click();
      }
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key.toLowerCase() === "v") setMode("select");
      if (e.key.toLowerCase() === "m") setMode("move");
      if (e.key.toLowerCase() === "r") setMode("rotate");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const piece = project.pieces.find((p) => p.id === selected),
    currentStep =
      project.steps.find((s) => s.id === stepId) ?? project.steps[0],
    findings = useMemo(() => validate(project), [project, inventoryTick]),
    rows = useMemo(() => bom(project), [project, inventoryTick]);
  const warnings = findings.filter((f) => f.severity !== "info"),
    total = rows.reduce((n, r) => n + r.total, 0),
    completed = project.steps.filter((s) => s.complete).length;
  const activeStepId = currentStep.id;
  const baseName =
    project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
    "yardwork-project";
  const updatePart = (patch: Partial<Piece>) => {
    if (piece)
      change((p) => ({
        ...p,
        pieces: p.pieces.map((x) =>
          x.id === piece.id ? { ...x, ...patch } : x,
        ),
      }));
  };
  function move(id: string, position: V3, rotation: V3) {
    safe(() => {
      const p = current.current.pieces.find((p) => p.id === id)!;
      const candidate = { ...p, position, rotation };
      if (snap && rotation.every((r) => Math.abs(r % (Math.PI / 2)) < 0.001)) {
        const b = bounds(candidate);
        for (let axis = 0; axis < 3; axis++) {
          let closest = 0.8,
            offset = 0;
          for (const other of current.current.pieces) {
            if (other.id === id || other.offcut) continue;
            const o = bounds(other);
            if (
              ![0, 1, 2]
                .filter((i) => i !== axis)
                .every(
                  (i) =>
                    Math.min(b.max[i], o.max[i]) -
                      Math.max(b.min[i], o.min[i]) >
                    -0.75,
                )
            )
              continue;
            for (const delta of [
              o.max[axis] - b.min[axis],
              o.min[axis] - b.max[axis],
            ])
              if (Math.abs(delta) < closest) {
                closest = Math.abs(delta);
                offset = delta;
              }
          }
          position[axis] += offset;
        }
      }
      change((pr) => ({
        ...pr,
        pieces: pr.pieces.map((x) =>
          x.id === id ? { ...x, position, rotation } : x,
        ),
      }));
    });
  }
  function select(id: string) {
    if (!id) {
      setSelected(null);
      return;
    }
    if (mode === "screw" && selected && id !== selected) {
      safe(() => {
        change(
          connect(
            current.current,
            selected,
            id,
            activeStepId,
            screws,
            screwLength,
          ),
        );
        notify(`Connected with ${screws} screws`);
      });
      return;
    }
    setSelected(id);
    setPanel("part");
  }
  function add(id: MaterialId, position: V3 = [60, 0, 0]) {
    safe(() => {
      const next = addMaterial(project, id, position, activeStepId);
      change(next);
      setSelected(next.pieces.at(-1)!.id);
      setPanel("part");
      setStage(null);
      notify(`${material(id).name} added. Drag the arrows to position it.`);
    });
  }
  function replace(p: Project, rev = 0) {
    revision.current = rev;
    undoStack.current = [];
    redoStack.current = [];
    setProject(p);
    setStepId(p.steps[0].id);
    setSelected(null);
    setStage(null);
    setSaved(rev > 0);
    setModal(null);
    setView((v) => ({ preset: "iso", nonce: v.nonce + 1 }));
  }
  async function save() {
    setBusy(true);
    const snapshot = current.current;
    try {
      const record = await api(`/api/projects/${snapshot.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: snapshot,
          baseRevision: revision.current,
        }),
      });
      revision.current = record.revision;
      setSaved(current.current === snapshot);
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            project: current.current,
            revision: revision.current,
          }),
        );
      } catch {}
      notify("Saved to your self-hosted project library");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function openProjects() {
    setModal("projects");
    try {
      setProjects(await api("/api/projects"));
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function generate() {
    setBusy(true);
    setProposal(null);
    try {
      const p = await api("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      setProposal({ ...p, command: commandSchema.parse(p.command) });
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(f: File) {
    try {
      if (f.size > 4 * 1024 * 1024)
        throw Error("Use a file smaller than 4 MB.");
      const text = await f.text();
      if (importKind === "project") {
        const p = projectSchema.parse(JSON.parse(text));
        const clone = {
          ...p,
          id: uid(),
          name: `${p.name.slice(0, 108)} · imported`,
        };
        replace(clone);
        notify("Plan imported as a new project");
      } else if (importKind === "inventory") {
        const entries = parseInventory(text);
        change((p) => ({ ...p, inventory: entries }));
        setModal(null);
        notify(
          "Inventory snapshot imported. Store, ZIP, and timestamps will be checked.",
        );
      } else {
        const lines = parseDxf(text, dxfScale);
        change((p) => ({ ...p, planLines: lines }));
        setModal(null);
        setView((v) => ({ preset: "top", nonce: v.nonce + 1 }));
        notify(
          `${lines.length} DXF reference lines imported. These are not construction parts.`,
        );
      }
    } catch (e) {
      notify((e as Error).message, true);
    }
    if (file.current) file.current.value = "";
  }
  async function refreshCatalog() {
    setBusy(true);
    try {
      if (!project.store)
        throw Error("Enter an exact Home Depot store number first.");
      const entries = parseInventory(
        JSON.stringify(
          await api(
            `/api/catalog?zip=${project.zip}&store=${encodeURIComponent(project.store)}`,
          ),
        ),
      );
      change((p) => ({ ...p, inventory: entries }));
      notify("Provider inventory refreshed");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function drop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData(
      "application/yardwork-material",
    ) as MaterialId;
    if (
      !catalog.some((m) => m.id === id) ||
      !camera.current ||
      !viewport.current
    )
      return;
    const rect = viewport.current.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera.current);
    const point = new THREE.Vector3();
    if (
      ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        point,
      )
    ) {
      const round = (v: number) => (snap ? Math.round(v * 12) : v * 12);
      add(id, [round(point.x), 0, round(point.z)]);
    }
  }
  const clonePiece = () => {
    if (piece) {
      const copy = {
        ...structuredClone(piece),
        id: uid(),
        name: `${piece.name} · copy`,
        position: [
          piece.position[0] + 6,
          piece.position[1],
          piece.position[2],
        ] as V3,
      };
      change((p) => ({ ...p, pieces: [...p.pieces, copy] }));
      setSelected(copy.id);
    }
  };
  const deletePiece = () => {
    if (piece) {
      change((p) => ({
        ...p,
        pieces: p.pieces.filter((x) => x.id !== piece.id),
        joints: p.joints.filter((j) => j.a !== piece.id && j.b !== piece.id),
      }));
      setSelected(null);
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setModal("help")}
          aria-label="About Yardwork"
        >
          <span className="brand-mark">
            <span />
          </span>
          yardwork<span className="beta">EARLY BUILD</span>
        </button>
        <div className="breadcrumb">
          <button onClick={openProjects}>My workshop</button>
          <ChevronRight size={13} />
          <span>{project.name}</span>
        </div>
        <div className="top-actions">
          <span className={`save-state ${saved ? "saved" : ""}`}>
            <span />
            {saved ? "Saved to library" : "Browser draft"}
          </span>
          <button
            className="icon-button"
            aria-label="Project settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={18} />
          </button>
          <button
            onClick={() => setModal("export")}
            className="button secondary"
          >
            <ArrowUpFromLine size={15} />
            Export
          </button>
          <button
            id="save-project"
            onClick={save}
            disabled={busy}
            className="button primary"
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            Save project
          </button>
        </div>
      </header>
      <aside className="library">
        <div className="library-heading">
          <div>
            <span className="eyebrow">THE GOOD STUFF</span>
            <h2>Build your idea.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Import a plan"
            onClick={() => setModal("import")}
          >
            <ArrowDownToLine size={18} />
          </button>
        </div>
        <div className="segmented">
          <button
            className={library === "parts" ? "active" : ""}
            onClick={() => setLibrary("parts")}
          >
            <Package size={14} />
            Materials
          </button>
          <button
            className={library === "assemblies" ? "active" : ""}
            onClick={() => setLibrary("assemblies")}
          >
            <Layers3 size={14} />
            Assemblies
          </button>
        </div>
        {library === "parts" ? (
          <>
            <label className="search-field">
              <Search size={16} />
              <input
                placeholder="Find a material…"
                aria-label="Find a material"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
            <div className="categories">
              {["All", "Lumber", "Panels", "Roof & wire", "Fasteners"].map(
                (c) => (
                  <button
                    key={c}
                    className={filter === c ? "active" : ""}
                    onClick={() => setFilter(c)}
                  >
                    {c}
                  </button>
                ),
              )}
            </div>
            <div className="section-label">
              {filter === "All" ? "STARTER MATERIALS" : filter.toUpperCase()}
              <span>
                {
                  catalog.filter(
                    (m) =>
                      (filter === "All" || m.category === filter) &&
                      m.name.toLowerCase().includes(search.toLowerCase()),
                  ).length
                }
              </span>
            </div>
            <div className="material-list">
              {catalog
                .filter(
                  (m) =>
                    (filter === "All" || m.category === filter) &&
                    m.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((m) => (
                  <div
                    key={m.id}
                    className="material-card"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/yardwork-material",
                        m.id,
                      )
                    }
                  >
                    <div
                      className={`material-art ${m.id}`}
                      style={
                        { "--material-color": m.color } as React.CSSProperties
                      }
                    >
                      <div />
                      <div />
                      <div />
                    </div>
                    <div className="material-info">
                      <strong>{m.name}</strong>
                      <small>{m.subtitle}</small>
                      <span>
                        {money(m.price)} <em>/ {m.unit} · example</em>
                      </span>
                    </div>
                    <button
                      aria-label={`Add ${m.name}`}
                      onClick={() => add(m.id)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
            </div>
            <div className="drag-hint">
              <MousePointer2 size={15} />
              <span>
                Drag a material onto the ground.
                <br />
                Or tap + to add it beside your build.
              </span>
            </div>
          </>
        ) : (
          <div className="assembly-list">
            <button
              className="assembly-card"
              onClick={() => {
                setPrompt(
                  "Build a wall 8 ft wide and 6 ft tall, 16 inches on center",
                );
                setProposal(null);
                setModal("assistant");
              }}
            >
              <div className="assembly-art wall-art">▥</div>
              <strong>Framed wall</strong>
              <small>
                Width, height, and stud spacing.
                <br />
                Every board stays editable.
              </small>
              <span>
                Configure wall <ArrowRight size={14} />
              </span>
            </button>
            <button
              className="assembly-card"
              onClick={() => {
                setPrompt("Build a base 6 by 4 ft");
                setProposal(null);
                setModal("assistant");
              }}
            >
              <div className="assembly-art floor-art">▤</div>
              <strong>Floor & foundation</strong>
              <small>
                Start with a base.
                <br />
                Build up, piece by piece.
              </small>
              <span>
                Configure base <ArrowRight size={14} />
              </span>
            </button>
            <button className="text-button" onClick={() => setModal("new")}>
              <Plus size={15} />
              Start a new project
            </button>
          </div>
        )}
        <div className="store-card">
          <div className="store-logo">HD</div>
          <div>
            <strong>Home Depot sourcing</strong>
            <span>
              ZIP {project.zip} ·{" "}
              {project.store ? `Store ${project.store}` : "choose a store"}
            </span>
          </div>
          <button
            aria-label="Configure store"
            onClick={() => setModal("settings")}
          >
            <ChevronRight size={16} />
          </button>
          <p>
            Example catalog · live stock{" "}
            {health?.catalog ? "provider configured" : "not connected"}
          </p>
        </div>
      </aside>
      <main className="workbench">
        <div className="project-heading">
          <div>
            <div className="eyebrow">
              <span className="green-dot" />
              YOUR NEXT GOOD BUILD
            </div>
            <h1 aria-label={project.name}>
              {project.name}
              <button
                aria-label="Rename project"
                onClick={() => setModal("settings")}
              >
                <ChevronDown size={18} />
              </button>
            </h1>
            <p>
              {project.kind === "coop"
                ? "A little planning. A better backyard."
                : "Big ideas start with the first piece."}
            </p>
          </div>
          <button
            className="button ai-button"
            onClick={() => {
              setProposal(null);
              setModal("assistant");
            }}
          >
            <Sparkles size={16} />
            Build with a prompt
          </button>
        </div>
        <div
          className="canvas-wrap"
          ref={viewport}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
        >
          <SceneBoundary>
            <Scene
              project={project}
              selected={selected}
              onSelect={select}
              onMove={move}
              mode={mode}
              snap={snap}
              explode={explode}
              xray={xray}
              stage={stage}
              view={view}
              onCamera={onCamera}
            />
          </SceneBoundary>
          <div className="scene-label">
            <span className="scene-tag">
              <span />
              3D WORKSPACE
            </span>
            <span>Inches · actual dimensions</span>
          </div>
          <div className="scene-tools" role="toolbar" aria-label="Model tools">
            {(
              [
                { id: "select", icon: MousePointer2, label: "Select (V)" },
                { id: "move", icon: Move3D, label: "Move (M)" },
                { id: "rotate", icon: RotateCw, label: "Rotate (R)" },
                { id: "screw", icon: Wrench, label: "Connect with screws" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                aria-label={t.label}
                title={t.label}
                className={mode === t.id ? "active" : ""}
                onClick={() => {
                  setMode(t.id);
                  if (t.id === "screw")
                    notify(
                      "Select a first part, then click a touching second part to connect them.",
                    );
                }}
              >
                <t.icon size={18} />
              </button>
            ))}
            <i />
            <button
              aria-label="Undo"
              title="Undo ⌘Z"
              disabled={!undoStack.current.length}
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="Redo"
              title="Redo ⇧⌘Z"
              disabled={!redoStack.current.length}
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
            <i />
            <button
              aria-label="Toggle snapping"
              title="Snap to 1 inch grid and nearby faces"
              className={snap ? "active" : ""}
              onClick={() => setSnap(!snap)}
            >
              <Magnet size={18} />
            </button>
          </div>
          <div className="view-tools">
            <button
              className={xray ? "active" : ""}
              onClick={() => setXray(!xray)}
              title="See through the enclosure"
              aria-label="Toggle X-ray"
            >
              <Eye size={16} />
            </button>
            <button
              className={explode ? "active" : ""}
              onClick={() => setExplode(!explode)}
              title="Explode by build step"
              aria-label="Explode assembly"
            >
              <Layers3 size={16} />
            </button>
            <button
              onClick={() =>
                setView((v) => ({ preset: "iso", nonce: v.nonce + 1 }))
              }
              title="Fit project"
              aria-label="Fit project"
            >
              <Expand size={16} />
            </button>
          </div>
          <div className="scene-bottom">
            <div className="view-switch">
              {["iso", "front", "top"].map((v) => (
                <button
                  key={v}
                  className={view.preset === v ? "active" : ""}
                  onClick={() =>
                    setView((s) => ({ preset: v, nonce: s.nonce + 1 }))
                  }
                >
                  {v === "iso"
                    ? "Perspective"
                    : v === "front"
                      ? "Front"
                      : "Top"}
                </button>
              ))}
            </div>
            <span className="orbit-hint">
              Drag to orbit <b>·</b> Scroll to zoom
            </span>
            <button
              className="icon-button"
              aria-label="Workspace help"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={17} />
            </button>
          </div>
          {mode === "screw" && (
            <div className="mode-banner">
              <Wrench size={15} />
              {selected
                ? "Now choose a touching second part"
                : "Choose the first part to connect"}
            </div>
          )}
          {stage !== null && (
            <div className="preview-badge">
              Step {stage + 1} of {project.steps.length}
              <button
                onClick={() => {
                  setPlaying(false);
                  setStage(null);
                }}
              >
                Show all <X size={12} />
              </button>
            </div>
          )}
        </div>
        <section className="build-timeline">
          <div className="timeline-heading">
            <div>
              <span className="eyebrow">PIECE BY PIECE</span>
              <h3>
                Your build, in steps <span>{project.steps.length}</span>
              </h3>
            </div>
            <div>
              <button
                className={`text-button ${playing ? "accent" : ""}`}
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                  } else {
                    setStage(-1);
                    setPlaying(true);
                  }
                }}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}Preview
                build
              </button>
              <button
                className="button small secondary"
                onClick={() => {
                  setNewStep("");
                  setNewStepNotes("");
                  setModal("step");
                }}
              >
                <Plus size={14} />
                Add step
              </button>
            </div>
          </div>
          <div className="step-track">
            {project.steps.map((s, i) => (
              <button
                key={s.id}
                className={`step-chip ${s.id === activeStepId ? "active" : ""} ${s.complete ? "complete" : ""}`}
                onClick={() => {
                  setStepId(s.id);
                  setPanel("step");
                }}
              >
                <span className="step-number">
                  {s.complete ? (
                    <Check size={14} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <small>
                    {
                      project.pieces.filter(
                        (p) => p.stepId === s.id && !p.offcut,
                      ).length
                    }{" "}
                    parts
                  </small>
                </div>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="timeline-foot">
            <span>
              <span className="green-dot" />
              {completed} of {project.steps.length} steps completed
            </span>
            <button onClick={() => setModal("export")}>
              Take your build guide with you <ArrowUpFromLine size={12} />
            </button>
          </div>
        </section>
      </main>
      <aside className="inspector">
        <div className="inspector-tabs">
          {(
            [
              { id: "part", icon: Settings2, label: "Part" },
              { id: "checks", icon: ShieldCheck, label: "Checks" },
              { id: "materials", icon: ClipboardList, label: "List" },
              { id: "step", icon: Layers3, label: "Step" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={panel === t.id ? "active" : ""}
              onClick={() => setPanel(t.id)}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
              {t.id === "checks" && warnings.length > 0 && (
                <b>{warnings.length}</b>
              )}
            </button>
          ))}
        </div>
        <div className="inspector-scroll">
          {panel === "checks" && (
            <>
              <div className="panel-intro">
                <div className="round-icon">
                  <ShieldCheck size={22} />
                </div>
                <span className="eyebrow">A SECOND SET OF EYES</span>
                <h2>Make every piece count.</h2>
                <p>Catch planning issues before you get the tools out.</p>
              </div>
              <div className="check-summary">
                <span className="warning-dot" />
                {warnings.length} things to review<span>Concept plan</span>
              </div>
              <div className="findings">
                {findings.map((f) => (
                  <button
                    key={f.id}
                    className={`finding ${f.severity}`}
                    onClick={() => {
                      if (f.pieceId) {
                        setSelected(f.pieceId);
                        setPanel("part");
                      }
                    }}
                  >
                    {f.severity === "info" ? (
                      <Info size={16} />
                    ) : (
                      <AlertTriangle size={16} />
                    )}
                    <div>
                      <strong>{f.title}</strong>
                      <p>{f.detail}</p>
                    </div>
                    {f.pieceId && <ChevronRight size={13} />}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "part" &&
            (!piece ? (
              <div className="panel-intro empty-part">
                <MousePointer2 size={30} />
                <h2>Meet your materials.</h2>
                <p>
                  Select a part in the workspace to change dimensions, make a
                  cut, or specify a connection.
                </p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setLibrary("assemblies");
                    setModal("assistant");
                  }}
                >
                  <Plus size={15} />
                  Generate a wall
                </button>
              </div>
            ) : (
              <>
                <div className="part-title">
                  <span className="eyebrow">
                    {piece.offcut ? "REUSABLE OFFCUT" : "SELECTED PART"}
                  </span>
                  <h2>{piece.name}</h2>
                  <span className="tag">{material(piece.material).name}</span>
                </div>
                <label className="field">
                  Part name
                  <input
                    value={piece.name}
                    onChange={(e) => {
                      if (e.target.value)
                        updatePart({ name: e.target.value.slice(0, 120) });
                    }}
                  />
                </label>
                <div className="field-section">
                  <h4>
                    <Ruler size={14} />
                    Dimensions <span>inches</span>
                  </h4>
                  <div className="number-row">
                    {["Width X", "Height Y", "Depth Z"].map((label, i) => (
                      <Num
                        key={label}
                        label={label}
                        value={piece.size[i]}
                        min={0.001}
                        max={240}
                        onChange={(n) =>
                          safe(() => {
                            const size = [...piece.size] as V3;
                            size[i] = n;
                            updatePart({ size });
                          })
                        }
                      />
                    ))}
                  </div>
                  <small className="muted">
                    Actual size. Longest axis is used for cuts.
                  </small>
                </div>
                <div className="field-section">
                  <h4>
                    <Move3D size={14} />
                    Position
                  </h4>
                  <div className="number-row">
                    {["X", "Y", "Z"].map((label, i) => (
                      <Num
                        key={label}
                        label={label}
                        value={piece.position[i]}
                        onChange={(n) => {
                          const position = [...piece.position] as V3;
                          position[i] = n;
                          updatePart({ position });
                        }}
                      />
                    ))}
                  </div>
                  <div className="number-row">
                    {["Pitch", "Yaw", "Roll"].map((label, i) => (
                      <Num
                        key={label}
                        label={label}
                        value={(piece.rotation[i] * 180) / Math.PI}
                        min={-360}
                        max={360}
                        unit="°"
                        onChange={(n) => {
                          const rotation = [...piece.rotation] as V3;
                          rotation[i] = (n * Math.PI) / 180;
                          updatePart({ rotation });
                        }}
                      />
                    ))}
                  </div>
                </div>
                <label className="field">
                  Build step
                  <select
                    value={piece.stepId}
                    onChange={(e) => updatePart({ stepId: e.target.value })}
                  >
                    {project.steps.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {i + 1}. {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-section cut-section">
                  <h4>
                    <Scissors size={15} />
                    Make a cut
                  </h4>
                  <p>
                    Cut along the longest axis. A ⅛ in saw kerf is removed; the
                    offcut stays in your plan.
                  </p>
                  <div className="inline">
                    <Num
                      label="Cut length"
                      value={cutLength}
                      min={0.125}
                      max={240}
                      onChange={setCutLength}
                    />
                    <button
                      className="button secondary"
                      onClick={() =>
                        safe(() => {
                          change(cutPiece(project, piece.id, cutLength));
                          notify("Cut made. The remaining offcut is retained.");
                        })
                      }
                    >
                      <Scissors size={14} />
                      Cut
                    </button>
                  </div>
                </div>
                {piece.offcut && (
                  <button
                    className="button secondary full"
                    onClick={() =>
                      updatePart({
                        offcut: false,
                        name: piece.name.replace(/^Offcut · /, "Reused · "),
                      })
                    }
                  >
                    Use offcut in build
                  </button>
                )}
                <div className="field-section">
                  <h4>
                    <Link2 size={14} />
                    Specify a connection
                  </h4>
                  <p>
                    Connections require two parts within ½ inch. Set quantity
                    and screw length.
                  </p>
                  <select
                    aria-label="Connect to part"
                    value={connectionTarget}
                    onChange={(e) => setConnectionTarget(e.target.value)}
                  >
                    <option value="">Choose a second part…</option>
                    {project.pieces
                      .filter((x) => x.id !== piece.id && !x.offcut)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}{" "}
                          {distance(piece, x) <= 0.5 ? "· touching" : ""}
                        </option>
                      ))}
                  </select>
                  <div className="number-row">
                    <Num
                      label="Screw count"
                      value={screws}
                      min={1}
                      max={100}
                      unit="pcs"
                      onChange={(n) => setScrews(Math.round(n))}
                    />
                    <Num
                      label="Screw length"
                      value={screwLength}
                      min={0.25}
                      max={12}
                      onChange={setScrewLength}
                    />
                  </div>
                  <button
                    className="button secondary full"
                    disabled={!connectionTarget}
                    onClick={() =>
                      safe(() => {
                        change(
                          connect(
                            project,
                            piece.id,
                            connectionTarget,
                            activeStepId,
                            screws,
                            screwLength,
                          ),
                        );
                        notify("Connection added to the build guide");
                      })
                    }
                  >
                    <Wrench size={14} />
                    Add screw connection
                  </button>
                  {project.joints
                    .filter((j) => j.a === piece.id || j.b === piece.id)
                    .map((j) => (
                      <div className="joint-row" key={j.id}>
                        <span>
                          {j.quantity} × {j.length} in screws
                        </span>
                        <button
                          aria-label="Remove connection"
                          onClick={() =>
                            change((p) => ({
                              ...p,
                              joints: p.joints.filter((x) => x.id !== j.id),
                            }))
                          }
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                </div>
                <div className="inline part-actions">
                  <button className="button secondary" onClick={clonePiece}>
                    <Copy size={14} />
                    Duplicate
                  </button>
                  <button className="button danger" onClick={deletePiece}>
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              </>
            ))}
          {panel === "materials" && (
            <>
              <div className="panel-intro">
                <span className="eyebrow">LESS GUESSWORK. MORE BUILDING.</span>
                <h2>Your material list.</h2>
                <button
                  className="button secondary full"
                  onClick={() => setModal("inventory")}
                >
                  <Plus size={14} />
                  Record store snapshot
                </button>
                <p>
                  Board cuts are packed with a ⅛ in kerf. Panels use one stock
                  sheet per piece, conservatively.
                </p>
              </div>
              <div className="estimate">
                <span>Planning estimate</span>
                <strong>{money(total)}</strong>
                <small>
                  Example prices unless a matching fresh snapshot exists.
                  Excludes tax, delivery, waste allowance, and oversized parts.
                </small>
              </div>
              {rows.map((r) => (
                <div className="bom-row" key={r.id}>
                  <div>
                    <strong>{material(r.id).name}</strong>
                    <span>
                      {r.quantity} {material(r.id).unit}
                      {r.quantity !== 1 ? "s" : ""} · {r.pieces} parts
                    </span>
                  </div>
                  <b>{money(r.total)}</b>
                  <small>
                    {r.verified
                      ? `Snapshot · ${r.inventory!.available} available`
                      : "Availability unverified"}
                  </small>
                  {r.oversize > 0 && (
                    <em>{r.oversize} oversized · excluded from estimate</em>
                  )}
                  <a
                    href={
                      r.inventory?.url ??
                      `https://www.homedepot.com/s/${encodeURIComponent(material(r.id).search)}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Find at Home Depot <ExternalLink size={11} />
                  </a>
                  {r.bins.length > 0 && (
                    <details>
                      <summary>Cut layout · {r.bins.length} boards</summary>
                      {r.bins.map((b, i) => (
                        <div className="cut-board" key={i}>
                          <small>
                            Board {i + 1} · {format(b.remaining)} remaining
                          </small>
                          <div>
                            {b.cuts.map((c) => (
                              <span
                                key={c.id}
                                style={{ flex: c.length }}
                                title={`${c.name} · ${format(c.length)}`}
                              >
                                {format(c.length)}
                              </span>
                            ))}
                            {b.remaining > 0 && (
                              <i style={{ flex: b.remaining }} />
                            )}
                          </div>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ))}
              <button
                className="button secondary full"
                onClick={() =>
                  download(
                    `${baseName}-shopping.csv`,
                    shoppingCsv(project),
                    "text/csv",
                  )
                }
              >
                <Download size={14} />
                Export shopping list
              </button>
              <p className="small-note">
                This CSV is a shopping handoff. Direct import into Home Depot
                Project Planning is not connected.
              </p>
            </>
          )}
          {panel === "step" && (
            <>
              <div className="part-title">
                <span className="eyebrow">
                  STEP{" "}
                  {project.steps.findIndex((s) => s.id === activeStepId) + 1} OF{" "}
                  {project.steps.length}
                </span>
                <h2>{currentStep.title}</h2>
              </div>
              <label className="field">
                Step title
                <input
                  value={currentStep.title}
                  onChange={(e) => {
                    if (e.target.value)
                      change((p) => ({
                        ...p,
                        steps: p.steps.map((s) =>
                          s.id === activeStepId
                            ? { ...s, title: e.target.value.slice(0, 120) }
                            : s,
                        ),
                      }));
                  }}
                />
              </label>
              <label className="field">
                Build instructions
                <textarea
                  rows={7}
                  placeholder="What happens in this step? Add measurements, tools, and things to watch for."
                  value={currentStep.notes}
                  onChange={(e) =>
                    change((p) => ({
                      ...p,
                      steps: p.steps.map((s) =>
                        s.id === activeStepId
                          ? { ...s, notes: e.target.value.slice(0, 5000) }
                          : s,
                      ),
                    }))
                  }
                />
              </label>
              <button
                className={`button full ${currentStep.complete ? "green" : "primary"}`}
                onClick={() =>
                  change((p) => ({
                    ...p,
                    steps: p.steps.map((s) =>
                      s.id === activeStepId
                        ? { ...s, complete: !s.complete }
                        : s,
                    ),
                  }))
                }
              >
                <CheckCircle2 size={16} />
                {currentStep.complete
                  ? "Completed · mark unfinished"
                  : "Mark step complete"}
              </button>
              <div className="inline">
                <button
                  className="button secondary"
                  disabled={project.steps[0].id === activeStepId}
                  onClick={() => {
                    const i = project.steps.findIndex(
                      (s) => s.id === activeStepId,
                    );
                    change((p) => {
                      const steps = [...p.steps];
                      [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                      return { ...p, steps };
                    });
                  }}
                >
                  <ArrowLeft size={13} />
                  Earlier
                </button>
                <button
                  className="button secondary"
                  disabled={project.steps.at(-1)!.id === activeStepId}
                  onClick={() => {
                    const i = project.steps.findIndex(
                      (s) => s.id === activeStepId,
                    );
                    change((p) => {
                      const steps = [...p.steps];
                      [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
                      return { ...p, steps };
                    });
                  }}
                >
                  Later
                  <ArrowRight size={13} />
                </button>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setPlaying(false);
                  setStage(
                    project.steps.findIndex((s) => s.id === activeStepId),
                  );
                }}
              >
                <Eye size={14} />
                Show build through this step
              </button>
              <div className="field-section">
                <h4>Parts in this step</h4>
                {project.pieces
                  .filter((x) => x.stepId === activeStepId)
                  .map((x) => (
                    <button
                      className="step-part"
                      key={x.id}
                      onClick={() => select(x.id)}
                    >
                      <Box size={14} />
                      <span>{x.name}</span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
              </div>
              {project.history.some((h) => h.stepId === activeStepId) && (
                <div className="field-section">
                  <h4>Recorded operations</h4>
                  {project.history
                    .filter((h) => h.stepId === activeStepId)
                    .slice(-30)
                    .map((h) => (
                      <p key={h.id}>{h.message}</p>
                    ))}
                </div>
              )}
              {project.steps.length > 1 && (
                <button
                  className="button danger full"
                  onClick={() => {
                    const target = project.steps.find(
                      (s) => s.id !== activeStepId,
                    )!.id;
                    change((p) => ({
                      ...p,
                      steps: p.steps.filter((s) => s.id !== activeStepId),
                      pieces: p.pieces.map((x) =>
                        x.stepId === activeStepId
                          ? { ...x, stepId: target }
                          : x,
                      ),
                      history: p.history.map((h) =>
                        h.stepId === activeStepId
                          ? { ...h, stepId: target }
                          : h,
                      ),
                      joints: p.joints.map((j) =>
                        j.stepId === activeStepId
                          ? { ...j, stepId: target }
                          : j,
                      ),
                    }));
                    setStepId(target);
                    setStage(null);
                    notify(
                      "Step removed. Its parts and connections were moved to the first remaining step.",
                    );
                  }}
                >
                  <Trash2 size={14} />
                  Remove step
                </button>
              )}
            </>
          )}
        </div>
        <div className="inspector-footer">
          <Leaf size={16} />
          <span>
            Plan thoughtfully.
            <br />
            <strong>Build something good.</strong>
          </span>
        </div>
      </aside>
      <footer className="statusbar">
        <span>
          <span className="green-dot" />
          {project.pieces.filter((p) => !p.offcut).length} parts <b>·</b>{" "}
          {project.joints.length} connections <b>·</b>{" "}
          {project.pieces.filter((p) => p.offcut).length} offcuts
        </span>
        <span>Concept workspace · engineering review required</span>
        <button onClick={() => setModal("help")}>
          Made for the making <ArrowRight size={12} />
        </button>
      </footer>
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? (
            <AlertTriangle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "assistant" ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "assistant" && (
              <>
                <div className="modal-icon">
                  <Sparkles size={25} />
                </div>
                <span className="eyebrow">
                  FROM AN IDEA TO INDIVIDUAL PIECES
                </span>
                <h2 id="modal-title">What are we building?</h2>
                <p>
                  Describe a framed wall or base with dimensions. Or start with
                  the backyard coop concept.
                </p>
                <div className="provider-pill">
                  <span className="green-dot" />
                  {health?.ai === "ollama"
                    ? "AI connected · Ollama"
                    : "Local dimensioned templates · no AI model connected"}
                </div>
                <textarea
                  className="prompt-input"
                  aria-label="Describe your build"
                  rows={4}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setProposal(null);
                  }}
                />
                <div className="prompt-examples">
                  {[
                    "Wall 8 ft wide, 6 ft tall",
                    "Base 6 by 4 ft",
                    "A chicken coop",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setPrompt(s);
                        setProposal(null);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  className="button primary full"
                  disabled={busy || !prompt.trim()}
                  onClick={generate}
                >
                  {busy ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  Preview proposal
                </button>
                {proposal && (
                  <div className="proposal">
                    <div>
                      <CheckCircle2 size={19} />
                      <strong>
                        {proposal.command.type === "coop"
                          ? "Backyard coop concept"
                          : proposal.command.type === "wall"
                            ? "Framed wall assembly"
                            : "Floor base assembly"}
                      </strong>
                    </div>
                    <p>
                      {proposal.command.type === "coop"
                        ? "Fixed 6 × 4 ft footprint · elevated coop concept. This replaces the current canvas; undo is available."
                        : `${format(proposal.command.width)} wide × ${format(proposal.command.type === "wall" ? proposal.command.height : proposal.command.depth)} ${proposal.command.type === "wall" ? "tall" : "deep"} · ${proposal.command.spacing} in spacing. Added beside existing parts.`}
                    </p>
                    <small>
                      {proposal.provider} · {proposal.message}
                    </small>
                    <button
                      className="button primary full"
                      onClick={() =>
                        safe(() => {
                          const next = applyCommand(project, proposal.command);
                          change(next);
                          setStepId(next.steps.at(-1)!.id);
                          setStage(null);
                          setSelected(null);
                          setView((v) => ({
                            preset: "iso",
                            nonce: v.nonce + 1,
                          }));
                          setModal(null);
                          notify(
                            "Assembly created. Each part and step is editable.",
                          );
                        })
                      }
                    >
                      <Plus size={15} />
                      Add to workspace
                    </button>
                  </div>
                )}
                <p className="small-note">
                  Ollama can be configured on your server for natural-language
                  interpretation. All proposals pass through the same dimension
                  checks; they do not certify structure.
                </p>
              </>
            )}
            {modal === "settings" && (
              <>
                <h2 id="modal-title">Make it your project.</h2>
                <label className="field">
                  Project name
                  <input
                    value={project.name}
                    onChange={(e) => {
                      if (e.target.value)
                        change((p) => ({
                          ...p,
                          name: e.target.value.slice(0, 120),
                        }));
                    }}
                  />
                </label>
                <div className="two-col">
                  <label className="field">
                    Store ZIP
                    <ZipInput
                      value={project.zip}
                      onChange={(zip) => change((p) => ({ ...p, zip }))}
                    />
                    <small>Default: 84121</small>
                  </label>
                  <label className="field">
                    Exact store number
                    <input
                      value={project.store}
                      placeholder="e.g. 4409"
                      onChange={(e) =>
                        change((p) => ({
                          ...p,
                          store: e.target.value.slice(0, 80),
                        }))
                      }
                    />
                    <small>Use the retailer's store ID.</small>
                  </label>
                </div>
                <label className="field">
                  Project notes
                  <textarea
                    rows={4}
                    value={project.notes}
                    onChange={(e) =>
                      change((p) => ({
                        ...p,
                        notes: e.target.value.slice(0, 10000),
                      }))
                    }
                  />
                </label>
                <div className="notice">
                  <Info size={17} />
                  <p>
                    {health?.catalog
                      ? "A catalog provider is configured. Refresh checks its data for your exact store."
                      : "Live Home Depot inventory is not connected. Use verified inventory snapshots, or configure an authorized provider in the server environment."}
                  </p>
                </div>
                <div className="inline">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setImportKind("inventory");
                      setModal("import");
                    }}
                  >
                    <ArrowDownToLine size={14} />
                    Import inventory
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={refreshCatalog}
                  >
                    <RotateCcw size={14} />
                    Refresh provider
                  </button>
                </div>
                <button
                  className="button primary full"
                  onClick={() => setModal(null)}
                >
                  Done
                </button>
              </>
            )}
            {modal === "inventory" && (
              <InventoryForm
                project={project}
                onSave={(entry) =>
                  safe(() => {
                    change((p) => ({
                      ...p,
                      zip: entry.zip,
                      store: entry.store,
                      inventory: [
                        ...p.inventory.filter(
                          (i) =>
                            !(
                              i.material === entry.material &&
                              i.store === entry.store &&
                              i.zip === entry.zip
                            ),
                        ),
                        entry,
                      ],
                    }));
                    setModal(null);
                    setPanel("materials");
                    notify(
                      "Snapshot recorded. It is valid for this store and ZIP for 24 hours.",
                    );
                  })
                }
              />
            )}
            {modal === "projects" && (
              <>
                <h2 id="modal-title">Your workshop.</h2>
                <p>
                  Projects saved on this server. Browser drafts stay on this
                  device until you save or export them.
                </p>
                <button
                  className="button primary"
                  onClick={() => setModal("new")}
                >
                  <Plus size={15} />
                  New project
                </button>
                <div className="project-list">
                  {projects.length ? (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={async () => {
                          try {
                            const data = await api(`/api/projects/${p.id}`);
                            replace(
                              projectSchema.parse(data.project),
                              data.revision,
                            );
                          } catch (e) {
                            notify((e as Error).message, true);
                          }
                        }}
                      >
                        <span className="project-thumb">
                          <Cuboid size={25} />
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {p.pieces} parts ·{" "}
                            {new Date(p.updatedAt).toLocaleDateString()}
                          </small>
                        </div>
                        <ChevronRight size={17} />
                      </button>
                    ))
                  ) : (
                    <div className="empty">
                      <FolderOpen size={30} />
                      <p>
                        Your first good build is waiting.
                        <br />
                        Save the current project to see it here.
                      </p>
                    </div>
                  )}
                </div>
                <div className="notice">
                  <Info size={15} />
                  <p>
                    Switching replaces the current browser draft. Save or export
                    it first if you want to keep changes.
                  </p>
                </div>
              </>
            )}
            {modal === "new" && (
              <>
                <h2 id="modal-title">Start with a little possibility.</h2>
                <p>
                  Choose a starting point. Your current draft will be replaced;
                  save it first to keep it.
                </p>
                <button
                  className="template-choice"
                  onClick={() => {
                    replace(coop());
                    notify("Coop concept loaded");
                  }}
                >
                  <span>⌂</span>
                  <div>
                    <strong>The backyard coop</strong>
                    <small>6 × 4 ft concept · five editable build steps</small>
                  </div>
                  <ArrowRight size={17} />
                </button>
                <button
                  className="template-choice"
                  onClick={() => replace(blank("My next good build"))}
                >
                  <Square size={27} />
                  <div>
                    <strong>A blank canvas</strong>
                    <small>Your materials. Your dimensions. Your idea.</small>
                  </div>
                  <ArrowRight size={17} />
                </button>
                <button
                  className="template-choice"
                  onClick={() => {
                    const p = blank("Framed wall study");
                    p.kind = "wall";
                    replace(
                      applyCommand(p, {
                        type: "wall",
                        width: 96,
                        height: 72,
                        depth: 48,
                        spacing: 16,
                      }),
                    );
                  }}
                >
                  <Layers3 size={27} />
                  <div>
                    <strong>A framed wall</strong>
                    <small>8 ft wide × 6 ft tall · 16 in on center</small>
                  </div>
                  <ArrowRight size={17} />
                </button>
              </>
            )}
            {modal === "step" && (
              <>
                <h2 id="modal-title">One step closer.</h2>
                <p>
                  Add your own instructions. New parts can be assigned to this
                  step.
                </p>
                <label className="field">
                  Step title
                  <input
                    autoFocus
                    maxLength={120}
                    placeholder="e.g. Install the nesting boxes"
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                  />
                </label>
                <label className="field">
                  Instructions
                  <textarea
                    rows={5}
                    maxLength={5000}
                    placeholder="Tools, measurements, and what to do…"
                    value={newStepNotes}
                    onChange={(e) => setNewStepNotes(e.target.value)}
                  />
                </label>
                <button
                  className="button primary full"
                  disabled={!newStep.trim()}
                  onClick={() => {
                    const s = step(newStep.trim(), newStepNotes);
                    change((p) => ({ ...p, steps: [...p.steps, s] }));
                    setStepId(s.id);
                    setPanel("step");
                    setModal(null);
                  }}
                >
                  <Plus size={16} />
                  Add build step
                </button>
              </>
            )}
            {modal === "import" && (
              <>
                <h2 id="modal-title">Bring a plan along.</h2>
                <p>
                  Start with a saved Yardwork project or use CAD linework as a
                  layout reference.
                </p>
                <label className="field">
                  Import format
                  <select
                    value={importKind}
                    onChange={(e) => setImportKind(e.target.value)}
                  >
                    <option value="project">Yardwork project · JSON</option>
                    <option value="dxf">
                      2D plan reference · ASCII DXF LINE entities
                    </option>
                    <option value="inventory">
                      Store inventory snapshot · JSON
                    </option>
                  </select>
                </label>
                {importKind === "dxf" ? (
                  <>
                    <label className="field">
                      DXF drawing units
                      <select
                        value={dxfScale}
                        onChange={(e) => setDxfScale(Number(e.target.value))}
                      >
                        <option value={1}>Inches</option>
                        <option value={12}>Feet</option>
                        <option value={1 / 25.4}>Millimeters</option>
                        <option value={100 / 2.54}>Meters</option>
                      </select>
                    </label>
                    <p className="small-note">
                      Import exploded LINE entities near the origin. These
                      appear in blue on the ground; the app does not infer
                      framing from drawings. PDF/image tracing is a future
                      addition.
                    </p>
                    <a
                      className="download-example"
                      href="/examples/base-plan.dxf"
                      download
                    >
                      Download example DXF <Download size={13} />
                    </a>
                  </>
                ) : importKind === "inventory" ? (
                  <>
                    <div className="notice">
                      <Info size={16} />
                      <p>
                        Snapshots need a material ID, Home Depot Internet
                        number/URL, price, available quantity, store, ZIP, and
                        checkedAt timestamp. Imported values are user-supplied
                        and are not independently verified.
                      </p>
                    </div>
                    <a
                      className="download-example"
                      href="/examples/inventory.json"
                      download
                    >
                      Download inventory format example <Download size={13} />
                    </a>
                  </>
                ) : (
                  <p className="small-note">
                    A valid version 1 project imports as a new copy, including
                    parts, connections, build steps, store settings, and plan
                    references.
                  </p>
                )}
                <input
                  ref={file}
                  type="file"
                  accept={importKind === "dxf" ? ".dxf" : ".json"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                  }}
                />
                <button
                  className="button primary full"
                  onClick={() => file.current?.click()}
                >
                  <ArrowDownToLine size={16} />
                  Choose file to import
                </button>
              </>
            )}
            {modal === "export" && (
              <>
                <h2 id="modal-title">From screen to workbench.</h2>
                <p>
                  Keep an editable plan, take a shopping list, or print your
                  build steps.
                </p>
                {[
                  {
                    title: "Editable project",
                    description:
                      "JSON · parts, cuts, joints, steps, and inventory",
                    icon: Box,
                    action: () =>
                      download(
                        `${baseName}.json`,
                        JSON.stringify(project, null, 2),
                        "application/json",
                      ),
                  },
                  {
                    title: "Shopping list",
                    description:
                      "CSV · stock quantities, pricing, and product links",
                    icon: ClipboardList,
                    action: () =>
                      download(
                        `${baseName}-shopping.csv`,
                        shoppingCsv(project),
                        "text/csv",
                      ),
                  },
                  {
                    title: "Build guide",
                    description:
                      "Markdown · ordered instructions and part dimensions",
                    icon: Layers3,
                    action: () =>
                      download(
                        `${baseName}-guide.md`,
                        guideMarkdown(project),
                        "text/markdown",
                      ),
                  },
                  {
                    title: "Print / save guide as PDF",
                    description: "Open the browser print dialog",
                    icon: Download,
                    action: () => {
                      setModal(null);
                      setTimeout(() => window.print(), 100);
                    },
                  },
                ].map((item) => (
                  <button
                    className="export-choice"
                    key={item.title}
                    onClick={item.action}
                  >
                    <item.icon size={22} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </div>
                    <ArrowUpFromLine size={16} />
                  </button>
                ))}
                <div className="notice">
                  <Info size={16} />
                  <p>
                    Home Depot's project workspace is separate. The CSV helps
                    transfer your shopping list manually; native project import
                    and checkout are not integrated.
                  </p>
                </div>
              </>
            )}
            {modal === "help" && (
              <>
                <div className="modal-icon">
                  <Hammer size={25} />
                </div>
                <h2 id="modal-title">A workshop for your ideas.</h2>
                <p>
                  Yardwork is an independent, open-source concept planner. It is
                  not affiliated with The Home Depot.
                </p>
                <div className="help-grid">
                  <div>
                    <MousePointer2 size={20} />
                    <strong>Place & shape</strong>
                    <p>
                      Drag a material onto the ground. Select it, then use Move
                      (M), Rotate (R), or numeric dimensions.
                    </p>
                  </div>
                  <div>
                    <Magnet size={20} />
                    <strong>A little guidance</strong>
                    <p>
                      Snap uses a 1 in grid and nearby faces. Cuts keep offcuts.
                      Screws record connections between touching parts.
                    </p>
                  </div>
                  <div>
                    <Layers3 size={20} />
                    <strong>Every step counts</strong>
                    <p>
                      Add instructions, assign parts, reorder steps, and preview
                      the build. Export the guide when ready.
                    </p>
                  </div>
                  <div>
                    <Sparkles size={20} />
                    <strong>Build from words</strong>
                    <p>
                      Local commands handle dimensioned walls and bases. Connect
                      Ollama for AI interpretation.
                    </p>
                  </div>
                </div>
                <div className="notice">
                  <AlertTriangle size={18} />
                  <p>
                    Checks cover geometry and purchasing assumptions. Get
                    qualified review for loads, spans, foundations, code, and
                    connection design before building.
                  </p>
                </div>
                <button
                  className="button primary full"
                  onClick={() => setModal(null)}
                >
                  Back to the making
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <article className="print-guide">
        <h1>{project.name}</h1>
        <p>
          Concept build guide · {project.zip} ·{" "}
          {new Date().toLocaleDateString()}
        </p>
        <p>{project.notes}</p>
        <strong>
          Planning only. Verify site, code, engineering, and connections before
          construction.
        </strong>
        {project.steps.map((s, i) => (
          <section key={s.id}>
            <h2>
              {i + 1}. {s.title}
            </h2>
            <p>{s.notes}</p>
            <ul>
              {project.pieces
                .filter((x) => x.stepId === s.id && !x.offcut)
                .map((x) => (
                  <li key={x.id}>
                    {x.name} · {x.size.map(format).join(" × ")} ·{" "}
                    {material(x.material).name}
                  </li>
                ))}
            </ul>
            <p>
              {project.joints
                .filter((j) => j.stepId === s.id)
                .reduce((n, j) => n + j.quantity, 0)}{" "}
              screws specified
            </p>
            {project.history
              .filter((h) => h.stepId === s.id)
              .map((h) => (
                <p key={h.id}>Operation: {h.message}</p>
              ))}
          </section>
        ))}
        <h2>Shopping list · estimate {money(total)}</h2>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              {r.quantity} {material(r.id).unit} × {material(r.id).name} ·{" "}
              {money(r.total)} ·{" "}
              {r.verified ? "snapshot available" : "stock unverified"}
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
