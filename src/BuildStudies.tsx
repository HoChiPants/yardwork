import { purchaseUnitLabel } from "./purchaseUnits";
import { workshopAsset } from "./workshopTransport";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { homeDepotStudyStock } from "./studyStock";
import { reviewGreenhouseVentBacking, ventBackingSummary } from "./greenhouseVentBacking";
import { RoofVentFields } from "./RoofVentFields";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, FolderOpen, Layers3 } from "lucide-react";
import { format, projectSchema, type Project } from "./model";
import { copyProjectDraft } from "./recoverSavedRevision";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { generateBuildGuide } from "./guide";
import { everbiltShelfPin, homeDepotShelfPinIds, shelfPinProducts, type HomeDepotShelfPinId } from "./shelfPinReference";
import {
  defaultStudyShelfInsets,
  previewStudyShelfSupports,
} from "./studyShelfSupports";
import { Scene } from "./Scene";
import { material } from "./model";
import { retailerName } from "./retailers";
import { cedarbrookDoor } from "./saunaDoorReference";
import { saunaPedestalRole } from "./saunaBenchReference";
import { saunaBenchReviews } from "./saunaBenches";
import { cedarbrookFoil } from "./saunaFoilReference";
import { saunaCeilingBatt, saunaCeilingBattRole } from "./saunaCeilingReference";
import { saunaCeilingFoilRole, saunaWallFoilRole } from "./saunaFoil";
import { bom } from "./engine";
import { reviewSunliteRoofBacking, roofBackingSummary, sunliteRoofDetail } from "./sunliteRoofBacking";
import { rafterJointSummary, reviewGreenhouseRafterBearing } from "./greenhouseRafterBearing";
import {
  structureMaterialChoices,
  type StructureMaterials,
  type StructureRole,
} from "./structures";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
  fixtureCutTable,
  listBuildFixtures,
  shelfBackStockFit,
  type BuildFixtureId,
  type BuildStudyParameters,
} from "./buildFixtures";

const noop = () => {};
class StudyPreviewBoundary extends Component<
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
        The 3D preview is unavailable. Review the dimensions and cut list below;
        your current project has not changed.
      </div>
    ) : (
      this.props.children
    );
  }
}
const choices = listBuildFixtures();
export default function BuildStudies({
  project,
  onOpen,
  onClose,
}: {
  project: Project;
  onOpen: (next: Project) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<BuildFixtureId>("storage-banquette"),
    [parameters, setParameters] = useState<BuildStudyParameters>(() =>
      defaultBuildStudyParameters("storage-banquette"),
    ),
    [selections, setSelections] = useState<StructureMaterials>({}),
    [preset, setPreset] = useState("iso"),
    [previewLayer, setPreviewLayer] = useState<"room" | "seating" | "foil" | "wall-batts" | "ceiling-batts">("room"),
    [replaceAcknowledged, setReplaceAcknowledged] = useState(false);
  const [openingExample, setOpeningExample] = useState(false);
  const [exampleError, setExampleError] = useState("");
  const [includeShelfSupports, setIncludeShelfSupports] = useState(false);
  const [shelfPinId, setShelfPinId] = useState<HomeDepotShelfPinId>(everbiltShelfPin.productId);
  const [shelfInsets, setShelfInsets] = useState(defaultStudyShelfInsets);
  const exampleRequest = useRef<AbortController | null>(null);
  const exampleFiles = workshopAsset(`/examples/builds/${selected}`);
  const hasDraft =
    project.pieces.length > 0 ||
    project.planLines.length > 0 ||
    project.notes.trim().length > 0;
  const canOpen = !openingExample && (!hasDraft || replaceAcknowledged);
  useEffect(() => () => exampleRequest.current?.abort(), []);

  async function openExample() {
    if (!canOpen) return;
    const controller = new AbortController();
    exampleRequest.current = controller;
    setExampleError("");
    setOpeningExample(true);
    try {
      const response = await fetch(`${exampleFiles}.yardwork.json`, {
        signal: controller.signal,
      });
      if (!response.ok) throw Error("The saved example is unavailable.");
      const saved = projectSchema.parse(await response.json());
      if (!controller.signal.aborted)
        onOpen(copyProjectDraft(saved, " · example copy"));
    } catch {
      if (!controller.signal.aborted)
        setExampleError(
          "The saved example could not be opened. Try again or download the editable file.",
        );
    } finally {
      if (exampleRequest.current === controller && !controller.signal.aborted) {
        exampleRequest.current = null;
        setOpeningExample(false);
      }
    }
  }
  const result = useMemo(() => {
    try {
      return {
        study: createBuildStudy(selected, parameters, project, selections),
        error: null,
      };
    } catch (e) {
      return {
        study: null,
        error:
          e instanceof Error
            ? e.message
            : "This study could not be generated at those dimensions.",
      };
    }
  }, [selected, parameters, project, selections]);
  const study = result.study,
    backFit = study ? shelfBackStockFit(study) : null,
    cutRows = useMemo(
      () => (study ? fixtureCutTable(study.project) : []),
      [study],
    ),
    view = useMemo(() => ({ preset, nonce: Date.now() }), [preset, study, previewLayer]);
  const homeDepotStock = useMemo(
    () => study ? homeDepotStudyStock(study, selections) : {},
    [study, selections],
  );
  const offersShelfSupports =
    (selected === "shelves" || selected === "closet-insert") &&
    project.retailer === "home-depot";
  const supportDraft = useMemo(() => {
    if (!offersShelfSupports || !includeShelfSupports || !study) return null;
    if (!Object.values(shelfInsets).every((value) => value > 0 && value <= 120))
      return {
        error: "Enter both support insets greater than zero and up to 120 inches.",
        preview: null,
      };
    try {
      return {
        error: "",
        preview: previewStudyShelfSupports(study.project, shelfInsets, shelfPinId),
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Shelf supports could not be planned for this study.",
        preview: null,
      };
    }
  }, [offersShelfSupports, includeShelfSupports, study, shelfInsets, shelfPinId]);
  const supportPreview = supportDraft?.preview;
  const supportOffer = supportPreview?.purchases.referenceOffers.find(({ retailer }) => retailer === "home-depot");
  const supportConflicts = [
    ...new Set(
      supportPreview?.review.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message),
    ),
  ];
  const benchReview = useMemo(() => study ? saunaBenchReviews(study.project)[0] : undefined, [study]);
  const roofBacking = useMemo(() => study && selected === "greenhouse" ? reviewSunliteRoofBacking(study.project) : [], [study, selected]);
  const ventBacking = useMemo(() => study && selected === "greenhouse" ? reviewGreenhouseVentBacking(study.project) : [], [study, selected]);
  const rafterBearing = useMemo(() => study && selected === "greenhouse" ? reviewGreenhouseRafterBearing(study.project) : [], [study, selected]);
  const preview = useMemo(() => {
    if (!study?.structure || previewLayer === "room") return study?.project;
    const { geometryRoles, dimensions } = study.structure;
    if (previewLayer === "foil") {
      const ids = new Set([...(geometryRoles[saunaWallFoilRole] ?? []), ...(geometryRoles[saunaCeilingFoilRole] ?? [])]);
      return { ...study.project, pieces: study.project.pieces.filter((piece) => ids.has(piece.id)) };
    }
    if (previewLayer === "wall-batts" || previewLayer === "ceiling-batts") {
      const [framingRole, battRole] = previewLayer === "wall-batts"
        ? ["wall-framing", "wall-insulation"]
        : ["ceiling-framing", saunaCeilingBattRole];
      const ids = new Set([...(geometryRoles[framingRole] ?? []), ...(geometryRoles[battRole] ?? [])]);
      return { ...study.project, pieces: study.project.pieces.filter((piece) => ids.has(piece.id)) };
    }
    const benchIds = new Set(geometryRoles[saunaPedestalRole]);
    const frameIds = new Set(geometryRoles["wall-framing"]);
    const rearFace = -(dimensions.clearDepth / 2 + dimensions.reservedInteriorLayer);
    return {
      ...study.project,
      pieces: study.project.pieces.filter((piece) =>
        benchIds.has(piece.id) || (frameIds.has(piece.id) && piece.position[2] < rearFace),
      ),
    };
  }, [study, previewLayer]);
  const stockRows = useMemo(() => study ? bom(study.project) : [], [study]);
  const saunaStock = selected === "sauna" ? stockRows : [];
  const foilStock = saunaStock.find((row) => row.id === cedarbrookFoil.materialId);
  const wallBattStock = saunaStock.find((row) => row.id === selections.saunaInsulation?.materialId);
  const ceilingBattStock = saunaStock.find((row) => row.id === saunaCeilingBatt.materialId);
  const widthLabel =
      selected === "sauna"
        ? "Clear inside width"
        : selected === "storage-banquette"
          ? "Total seating width"
          : "Outside width",
    depthLabel = selected === "sauna" ? "Clear inside depth" : "Outside depth",
    heightLabel =
      selected === "greenhouse"
        ? "Outside eave height"
        : selected === "sauna"
          ? "Clear inside height"
          : selected === "storage-banquette"
            ? "Finished seat height"
            : "Outside height";
  function field(
    key: Exclude<keyof BuildStudyParameters, 'roofVent' | 'rafterSpacing'>,
    label: string,
    min = 1,
    max = 240,
    defaultUnit: "in" | "ft" = "in",
  ) {
    return (
      <LengthInput
        key={`${selected}-${key}`}
        label={label}
        ariaLabel={`Study ${label.toLowerCase()}`}
        value={parameters[key]}
        onChange={(value) => setParameters((p) => ({ ...p, [key]: value }))}
        min={min}
        max={max}
        defaultUnit={defaultUnit}
      />
    );
  }
  function materialField(
    role: StructureRole,
    label: string,
    fallbackLabel: string,
  ) {
    const options = structureMaterialChoices(role),
      chosen = options.find(
        (o) =>
          o.materialId === selections[role]?.materialId &&
          o.productRegistryRef === selections[role]?.productRegistryRef,
      );
    return (
      <div key={role}>
        <label className="field">
          {label}
          <select
            aria-label={`Study ${label.toLowerCase()}`}
            value={chosen?.materialId ?? ""}
            onChange={(e) => {
              const option = options.find(
                (o) => o.materialId === e.target.value,
              );
              setSelections((current) => {
                const next = { ...current };
                if (option)
                  next[role] = {
                    materialId: option.materialId,
                    productRegistryRef: option.productRegistryRef,
                  };
                else delete next[role];
                return next;
              });
              if (role === "saunaDoor" && option)
                setParameters((current) => ({
                  ...current,
                  doorWidth: cedarbrookDoor.roughWidth,
                  doorHeight: cedarbrookDoor.roughHeight,
                }));
              if (role === "saunaBench")
                setPreviewLayer(option ? "seating" : "room");
              if (role === "saunaVaporBarrier")
                setPreviewLayer(option ? "foil" : "room");
              if (role === "saunaInsulation" && !option && previewLayer === "wall-batts")
                setPreviewLayer("room");
            }}
          >
            <option value="">{fallbackLabel}</option>
            {options.map((option) => (
              <option
                key={`${option.materialId}-${option.productRegistryRef}`}
                value={option.materialId}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {chosen && (
          <p className="small-note">
            {chosen.scope}{" "}
            {chosen.sourceUrls[0] && (
              <a href={chosen.sourceUrls[0]} target="_blank" rel="noreferrer">
                Review product source
              </a>
            )}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="build-studies">
      <div className="modal-icon">
        <Layers3 size={25} />
      </div>
      <span className="eyebrow">FROM PARTS TO WHOLE DESIGNS</span>
      <h2 id="modal-title">Explore whole builds.</h2>
      <p>
        Start a separate editable design study. These are working geometry
        examples with missing decisions shown—not ready-to-build kits.
      </p>
      <details className="field-section">
        <summary>Measured hinge software demo</summary>
        <p className="small-note">An optional three-seat project shows entered hinge cuts, mounting datums, motion and guide steps. Its measurement inputs are synthetic and do not describe purchased hardware.</p>
        <a className="text-button" href={workshopAsset("/examples/hinges/synthetic-measured-banquette.yardwork.json")} download>Download synthetic hinge demo</a>
      </details>
      <label className="field">
        Choose a study
        <select
          aria-label="Choose a build study"
          value={selected}
          disabled={openingExample}
          onChange={(e) => {
            const id = e.target.value as BuildFixtureId;
            setSelected(id);
            setParameters(defaultBuildStudyParameters(id));
            setSelections({});
            setPreset("iso");
            setPreviewLayer("room");
            setExampleError("");
            setReplaceAcknowledged(false);
            setIncludeShelfSupports(false);
            setShelfPinId(everbiltShelfPin.productId);
            setShelfInsets(defaultStudyShelfInsets);
          }}
        >
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      {hasDraft && (
        <label className="field">
          <span>
            <input
              type="checkbox"
              aria-label="Replace current workspace with this study"
              checked={replaceAcknowledged}
              disabled={openingExample}
              onChange={(e) => setReplaceAcknowledged(e.target.checked)}
            />{" "}
            Open a separate study and set this draft aside.
          </span>
        </label>
      )}
      <details className="field-section">
        <summary>Saved example and downloads</summary>
        <p className="small-note">
          The saved example includes its own dimensions, material choices and
          build guide.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            disabled={!canOpen}
            onClick={() => void openExample()}
          >
            {openingExample ? "Opening saved example…" : "Open saved example"}
          </button>
          <a className="text-button" href={`${exampleFiles}.yardwork.json`} download>
            Editable project
          </a>
          <a className="text-button" href={`${exampleFiles}.md`} download>
            Build guide
          </a>
          <a className="text-button" href={`${exampleFiles}.csv`} download>
            Stock CSV
          </a>
          <a className="text-button" href={`${exampleFiles}-shopping.txt`} download>
            Shopping checklist
          </a>
        </div>
        {exampleError && (
          <p role="alert" className="form-error">
            {exampleError}
          </p>
        )}
      </details>
      <div className="planner-module-grid">
        {field(
          "width",
          widthLabel,
          selected === "greenhouse" || selected === "sauna" ? 48 : 8,
          240,
          "ft",
        )}
        {field(
          "depth",
          depthLabel,
          selected === "greenhouse" || selected === "sauna" ? 48 : 8,
          240,
          "ft",
        )}
        {field(
          "height",
          heightLabel,
          selected === "sauna" ? 72 : 8,
          240,
          selected === "storage-banquette" ? "in" : "ft",
        )}
      </div>
      {selected === "storage-banquette" && (
        <p className="small-note">
          The total width is divided into three independent enclosed storage
          seats, each with an opening lid and no above-seat back. Hinges, lid
          supports and assembly connections remain unspecified.
        </p>
      )}
      {selected === "greenhouse" && (
        <>
          {field("roofRise", "Roof rise above eave", 6, 120)}
          <LengthInput label="Rafter spacing" ariaLabel="Study rafter spacing" value={parameters.rafterSpacing ?? 24}
            onChange={(rafterSpacing) => setParameters((previous) => ({ ...previous, rafterSpacing }))} min={8} max={48} />
          <RoofVentFields value={parameters.roofVent} onChange={(roofVent) =>
            setParameters((previous) => ({ ...previous, roofVent }))} />
          <p className="small-note">
            Eave and ridge describe the outside roof line. The wall plate is
            lower by the actual rafter depth and any selected glazing layer.
            Ridge height is eave height plus roof rise; impossible door/header
            fits are reported.
          </p>
        </>
      )}
      {(selected === "greenhouse" || selected === "sauna") && (
        <div className="planner-module-grid">
          {field("doorWidth", "Door opening width", 18, 120)}
          {field("doorHeight", "Door opening height", 36, 120)}
        </div>
      )}
      {selected === "sauna" &&
        field("interiorLayerAllowance", "Interior layer allowance", 0, 12)}
      {selected === "closet-insert" &&
        field("towerWidth", "Clear shelf-tower width", 8, 200)}
      {(selected === "shelves" || selected === "closet-insert") && (
        <label className="field">
          Adjustable shelf count
          <input
            aria-label="Study adjustable shelf count"
            type="number"
            step="1"
            min="1"
            max="6"
            value={
              Number.isFinite(parameters.shelfCount)
                ? parameters.shelfCount
                : ""
            }
            onChange={(e) =>
              setParameters((p) => ({
                ...p,
                shelfCount: e.target.valueAsNumber,
              }))
            }
          />
        </label>
      )}
      {offersShelfSupports && (
        <div className="field-section">
          <label className="inline study-shelf-support-option">
            <input
              type="checkbox"
              checked={includeShelfSupports}
              onChange={(event) => setIncludeShelfSupports(event.target.checked)}
            />
            Plan supports for all adjustable shelves
          </label>
          {includeShelfSupports && (
            <>
              <label className="field">
                Shelf support pack
                <select
                  value={shelfPinId}
                  onChange={(event) => setShelfPinId(event.target.value as HomeDepotShelfPinId)}
                >
                  {homeDepotShelfPinIds.map((id) => (
                    <option key={id} value={id}>{shelfPinProducts[id].name}</option>
                  ))}
                </select>
              </label>
              <div className="planner-module-grid">
                <LengthInput
                  label="Front support inset"
                  value={shelfInsets.frontInset}
                  min={0.001}
                  max={120}
                  onChange={(frontInset) =>
                    setShelfInsets((current) => ({ ...current, frontInset }))
                  }
                />
                <LengthInput
                  label="Rear support inset"
                  value={shelfInsets.rearInset}
                  min={0.001}
                  max={120}
                  onChange={(rearInset) =>
                    setShelfInsets((current) => ({ ...current, rearInset }))
                  }
                />
              </div>
              <p className="small-note">
                Insets are measured from the side-panel edges. Confirm fit and
                drilling depth on the delivered pin and panel.
              </p>
              {supportDraft?.error && (
                <p role="alert" className="form-error">{supportDraft.error}</p>
              )}
              {supportConflicts.length > 0 && (
                <div role="alert" className="form-error">
                  <p>Adjust the support layout before opening the project.</p>
                  <ul>
                    {supportConflicts.slice(0, 4).map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {supportPreview && !supportConflicts.length && (
                <p role="status" className="study-shelf-support-summary">
                  {supportPreview.purchases.plannedPins} planned supports ·{" "}
                  {supportPreview.purchases.requiredPacks}{" "}
                  {supportPreview.purchases.requiredPacks === 1 ? "pack" : "packs"} ·{" "}
                  {supportOffer ? (
                    <a href={supportOffer.url} target="_blank" rel="noreferrer">
                      {supportPreview.purchases.productName}
                    </a>
                  ) : supportPreview.purchases.productName}
                  {" · "}
                  {supportPreview.purchases.requiredPacks * supportPreview.purchases.pinsPerPack - supportPreview.purchases.plannedPins} spare.
                  {" "}Add purchase packs in List.
                </p>
              )}
            </>
          )}
        </div>
      )}
      <details className="study-material-selection">
        <summary>Source-matched stock options</summary>
        {!!Object.keys(homeDepotStock).length && (
          <div>
            <button type="button" className="button secondary"
              onClick={() => setSelections((current) => ({ ...homeDepotStock, ...current }))}>
              Use Home Depot stock
            </button>
            <p className="small-note">
              Fills open wood stock choices for the current cuts. If a part still needs larger stock, it stays flagged below. Check your store snapshot before buying.
            </p>
          </div>
        )}
        <p className="small-note">
          These selections use reviewed product dimensions and limited material
          scopes. Check local availability with store snapshots or request
          current pricing and availability from a direct supplier.
        </p>
        {(selected === "storage-banquette" ||
          selected === "shelves" ||
          selected === "closet-insert") &&
          materialField(
            "caseworkPanels",
            "Panel stock",
            "Generic ¾ in plywood · identity unresolved",
          )}
        {(selected === "storage-banquette" ||
          selected === "greenhouse" ||
          selected === "sauna") &&
          materialField(
            "frameLumber",
            "Framing stock",
            "Generic 2×4 dimensions · grade and identity unresolved",
          )}
        {selected === "greenhouse" && (
          <>
            {materialField(
              "greenhouseBase",
              "Base stock",
              "Use framing stock · review exposure and foundation",
            )}
            {materialField(
              "ridgeLumber",
              "Ridge stock",
              "Generic 2×6 dimensions · grade and identity unresolved",
            )}
            {materialField(
              "greenhouseGlazing",
              "Greenhouse glazing",
              "Unselected · glazing remains unbuilt",
            )}
          </>
        )}
        {selected === "sauna" && (
          <>
            {materialField(
              "saunaInsulation",
              "Wall cavity insulation",
              "Unselected · wall cavities remain empty",
            )}
            {materialField(
              "saunaCeilingJoists",
              "Ceiling joist stock",
              "Use the selected wall framing stock",
            )}
            {materialField(
              "saunaCeilingInsulation",
              "Ceiling cavity insulation",
              "Unselected · ceiling cavities remain empty",
            )}
            {materialField(
              "saunaInterior",
              "Wall and ceiling lining",
              "Unselected · lining remains unbuilt",
            )}
            {materialField("saunaVaporBarrier", "Wall and ceiling foil", "Unselected · vapor layer remains unbuilt")}
            {materialField(
              "saunaDoor",
              "Sauna door",
              "Unselected · rough opening only",
            )}
            {materialField("saunaBench", "Freestanding sauna bench", "Unselected · reserve seating space")}
            {selections.saunaBench && (
              <div className="planner-module-grid">
                {field("benchOffsetX", "Bench offset from center", -120, 120)}
                {field("benchRearGap", "Bench gap from rear wall", 0, 240)}
              </div>
            )}
          </>
        )}
        {selected === "closet-insert" && (
          <>
            {materialField(
              "closetRod",
              "Closet hanging rods",
              "Unselected · rods remain unbuilt",
            )}
            {selections.closetRod &&
              field("rodHeight", "Rod center height", 6, 240)}
          </>
        )}
      </details>
      {result.error && (
        <div className="notice warning" role="alert">
          <AlertTriangle size={16} />
          <p>{result.error}</p>
        </div>
      )}
      {study && (
        <>
          <div className="notice warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Design review required</strong>
              <p>{study.baselineScope}</p>
            </div>
          </div>
          <div
            className="idea-preview build-study-preview"
            aria-label="Build study 3D preview"
          >
            <StudyPreviewBoundary key={selected}>
              <Scene
                project={supportPreview?.project ?? preview ?? study.project}
                selected={null}
                onSelect={noop}
                onMove={noop}
                selectedSectionId={null}
                onSectionMove={noop}
                mode="rotate"
                snap={false}
                explode={false}
                xray={false}
                stage={null}
                view={view}
                onCamera={noop}
                fitToView
                readOnly={!!supportPreview}
                showAttachments={!!supportPreview}
                selectedAttachmentPlanId={supportPreview?.review.plan.id}
              />
            </StudyPreviewBoundary>
          </div>
          <div className="prompt-examples">
            {[
              ["iso", "Perspective"],
              ["front", "Front"],
              ["top", "Top"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {label}
              </button>
            ))}
            {benchReview?.piece && previewLayer !== "seating" && (
              <button type="button" onClick={() => setPreviewLayer("seating")}>
                Show seating layout
              </button>
            )}
            {foilStock && previewLayer !== "foil" && (
              <button type="button" onClick={() => setPreviewLayer("foil")}>Show foil layout</button>
            )}
            {wallBattStock && previewLayer !== "wall-batts" && (
              <button type="button" onClick={() => setPreviewLayer("wall-batts")}>Show wall insulation</button>
            )}
            {ceilingBattStock && previewLayer !== "ceiling-batts" && (
              <button type="button" onClick={() => setPreviewLayer("ceiling-batts")}>Show ceiling insulation</button>
            )}
            {previewLayer !== "room" && (
              <button type="button" onClick={() => setPreviewLayer("room")}>Show full room</button>
            )}
          </div>
          {foilStock && <p className="small-note">Foil quote length · {foilStock.quantity} linear ft at {cedarbrookFoil.rollWidth} in wide · {foilStock.pieces} cuts including folds. Confirm the supplied length with Cedarbrook.</p>}
          {wallBattStock && (
            <p className="small-note">
              Wall insulation · {wallBattStock.pieces} fitted pieces · {wallBattStock.physicalStockUnits} full batts · {wallBattStock.quantity} {wallBattStock.quantity === 1 ? "bag" : "bags"}.
            </p>
          )}
          {ceilingBattStock && (
            <p className="small-note">
              Ceiling insulation · {ceilingBattStock.pieces} fitted pieces · {ceilingBattStock.physicalStockUnits} full batts · {ceilingBattStock.quantity} {ceilingBattStock.quantity === 1 ? "bag" : "bags"}.
            </p>
          )}
          {benchReview?.findings.map(({ kind, detail }) => (
            <div className="notice warning" key={kind} role="status">
              <AlertTriangle size={16} />
              <p>{detail}</p>
            </div>
          ))}
          <p className="planner-provider">
            {study.project.pieces.length} actual editable parts ·{" "}
            {study.project.sections.length} sections ·{" "}
            {study.project.pieces.filter((p) => p.cutPlanes.length).length}{" "}
            parts with angled/profile cuts.
          </p>
          {study.structure && (
            <p className="small-note">
              {Object.entries(study.structure.dimensions)
                .filter(([key]) =>
                  selected === "greenhouse"
                    ? [
                        "wallPlateHeight",
                        "ridgeHeight",
                        "actualGlazingThickness",
                        "roofVentOpeningWidth",
                        "roofVentOpeningLength",
                      ].includes(key)
                    : selected === "sauna"
                      ? key.startsWith("outsideFraming") || key.startsWith("door") || key.startsWith("bench") || key.startsWith("ceiling") || ["liningThickness", "remainingInteriorLayer"].includes(key)
                      : key === "actualPanelThickness",
                )
                .map(
                  ([key, value]) =>
                    `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${key.startsWith("bench") ? formatStockLength(value) : format(value)}`,
                )
                .join(" · ")}
            </p>
          )}
          {backFit && (
            <div className="notice warning">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <p role="status" className="small-note">
                  {backFit.state === "too-long"
                    ? `The ${formatStockLength(backFit.backWidth)} back panel exceeds the ${formatStockLength(backFit.sheetWidth)} sheet width.`
                    : `The ${formatStockLength(backFit.backWidth)} back panel leaves less than the ${formatStockLength(backFit.kerf)} saw kerf at the sheet edge.`}
                </p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setParameters((current) => ({
                      ...current,
                      width: backFit.suggestedWidth,
                    }))
                  }
                >
                  Set outside width to {formatStockLength(backFit.suggestedWidth)}
                </button>
              </div>
            </div>
          )}
          <details className="study-cut-list">
            <summary>Stock quantities</summary>
            <table aria-label="Whole stock for this study">
              <thead>
                <tr><th>Stock</th><th>Purchase quantity</th><th>Source</th></tr>
              </thead>
              <tbody>
                {stockRows.map((row) => {
                  const stock = material(row.id);
                  const offer = reviewedOfferForMaterial(stock, study.project.retailer);
                  return (
                    <tr key={row.id}>
                      <td>{stock.name}</td>
                      <td>
                        {row.quantity} {purchaseUnitLabel(stock.unit, row.quantity)}
                        {row.oversize > 0 && <small> · {row.oversize} {row.oversize === 1 ? "part needs" : "parts need"} larger stock</small>}
                      </td>
                      <td>
                        {offer ? <a href={offer.url} target="_blank" rel="noreferrer">Product #{offer.productId}</a>
                          : row.supplier ? <a href={row.supplier.url} target="_blank" rel="noreferrer">{row.supplier.seller}</a>
                          : "Product match pending"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
          <details className="study-cut-list">
            <summary>
              Cut list · {cutRows.reduce((n, r) => n + r.quantity, 0)} cuttable
              parts
            </summary>
            <p className="small-note">
              Actual blank dimensions. Angled/profile cuts remain attached to
              their parts. See Stock quantities for whole boards and sheets.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Blank dimensions</th>
                  <th>Qty</th>
                  <th>Cut details</th>
                </tr>
              </thead>
              <tbody>
                {cutRows.map((row, i) => (
                  <tr key={i}>
                    <td>{material(row.materialId).name}</td>
                    <td>{row.dimensions.map(format).join(" × ")}</td>
                    <td>{row.quantity}</td>
                    <td>
                      {!row.stockFits
                        ? "Exceeds selected stock"
                        : row.cutPlanes.length
                          ? "Angled/profile cuts"
                          : "Straight cuts"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details open className="study-material-review">
            <summary>
              Materials and components to resolve ·{" "}
              {study.missingMaterials.length}
            </summary>
            <ul>
              {study.missingMaterials.map((item, i) => (
                <li key={`${item.id}-${i}`}>
                  <strong>
                    {item.id
                      .replace(/^material\./, "")
                      .replace(/([A-Z])/g, " $1")}
                    :{" "}
                  </strong>
                  {item.reason}
                </li>
              ))}
            </ul>
          </details>
          <details open className="study-design-review">
            <summary>
              Design and installation decisions · {study.unresolved.length + roofBacking.length + ventBacking.length + rafterBearing.length}
            </summary>
            <ul>
              {rafterBearing.map((review) => (
                <li key={review.entryId}>
                  {rafterJointSummary(review, "eave")} {rafterJointSummary(review, "ridge")} See Checks for the joint locations.
                </li>
              ))}
              {roofBacking.map((review) => (
                <li key={review.roomId}>
                  {roofBackingSummary(review)} Inspect the locations under Checks after opening the design.{" "}
                  <a href={sunliteRoofDetail} target="_blank" rel="noreferrer">Palram roof connector detail</a>
                </li>
              ))}
              {ventBacking.map((review) => (
                <li key={`vent-${review.id}`}>{ventBackingSummary(review)} Review the vent under Checks after opening the design.</li>
              ))}
              {study.unresolved.map((item, i) => (
                <li key={`${item.id}-${i}`}>
                  {item.reason}
                  {item.sourceRefs[0] && (
                    <>
                      {" "}
                      <a
                        href={item.sourceRefs[0]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Review source
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <p className="small-note">
            New study context: {retailerName(project.retailer)} · ZIP{" "}
            {project.zip}
            {project.store
              ? ` · store ${project.store}`
              : " · no store selected"}
            . Matching observations and selected tools are retained. Current
            project geometry is not copied.
          </p>
          <button
            className="button primary full"
            disabled={
              !canOpen || !!supportDraft?.error || supportConflicts.length > 0
            }
            onClick={() =>
              onOpen(
                supportPreview
                  ? generateBuildGuide(supportPreview.project)
                  : study.project,
              )
            }
          >
            <FolderOpen size={16} />
            Open as new project
          </button>
        </>
      )}
      <p className="small-note">
        Opening creates a separate draft and changes the current workspace view.
        Resolve the listed missing materials, hardware, tools, support and
        installation decisions before building.
      </p>
      <button className="button ghost full" onClick={onClose}>
        Back to workspace
      </button>
    </div>
  );
}
