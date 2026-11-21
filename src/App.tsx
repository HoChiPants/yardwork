import { DrawingReferencePanel } from "./DrawingReferencePanel";
import { drawingPlanLines, drawingReferenceDescription, type DrawingReference } from "./drawingReference";
import { WallTracePanel } from "./WallTracePanel";
import { detectPlanOutlines, outlineAtPoint } from "./planOutlines";
import { emptyWallTrace, reviewWallOutline, reviewWallTrace, snapWallTracePoint, type OutlineFace, type WallTracePoint } from "./wallTrace";
import { BuildPreparationPanel, PrintBuildPreparation } from "./BuildPreparationPanel";
import { reviewModeledWoodContacts } from "./modeledWoodContacts";
import { clearWoodJointDecision, saveTrimSeam, saveWoodJointDecision, trimBackerRodCutPlan, trimBackerRodGuideLines, woodJointDecisionEntries, woodJointDecisionLine, woodJointDecisionScope } from "./woodJointDecisions";
import { trimBackerRodInstructions, trimBackerRodScope } from "./trimBackerRodReference";
import { reviewSillGaskets, sillGasketGuideLines } from "./sillGaskets";
import { sillGasketScope } from "./sillGasketReference";
import { SillGasketPanel } from "./SillGasketPanel";
import { OpeningFlashingPanel } from "./OpeningFlashingPanel";
import { WindowWallFields, windowWallExample } from "./WindowWallFields";
import { DoorOpeningFields, DoorwayPanel, doorwayExample } from "./DoorwayPanel";
import { WallWaterPanel } from "./WallWaterPanel";
import { WaterFittingPanel } from "./WaterFittingPanel";
import { WaterStopPanel } from "./WaterStopPanel";
import { SinkDrainPanel } from "./SinkDrainPanel";
import { removeSinkDrain, sinkDrainGuide } from "./sinkDrain";
import { sinkTrap } from "./sinkDrainReference";
import { WaterPressurePanel } from "./WaterPressurePanel";
import { WaterSupportPanel } from "./WaterSupportPanel";
import { removeWaterRun, waterRunGuide } from "./wallWater";
import { removeWaterFitting, waterFittingGuide } from "./waterFittings";
import { removeWaterStop, waterStopGuide } from "./waterStops";
import { waterStop } from "./waterStopReference";
import { reviewWaterPressure, waterPressureGuideStep, waterPressureObservations } from "./waterPressure";
import { waterSupportGuideLines, waterSupportNetwork } from "./waterSupportNetwork";
import { waterSupportReference } from "./waterSupportReference";
import { maxInsertionChart, maxFittingInstructions } from "./waterFittingReference";
import { pexInstallation, pipeProtectionSource, studBoreSource } from "./wallWaterReference";
import { previewDoorway } from "./doorwayPreview";
import { generatedWindowMembers, windowFramingSource, windowWallScope } from "./windowWall";
import { homeDepotFraming } from "./homeDepotFramingReference";
import { openingFlashingGuideLines, reviewGeneratedWindowWalls, reviewOpeningFlashings, type OpeningFlashingPreview } from "./openingFlashing";
import { flexWrap, openingAirSealGuide, openingFlashingScope } from "./openingFlashingReference";
import { browserWorkshop, workshopAsset, workshopRequest } from "./workshopTransport";
import { ZodError } from "zod";
import { FloorBaseFields } from "./FloorBaseFields";
import { fittingBaseBoards } from "./homeDepotTreatedLumber";
import { assemblyOrderPreparation, buildPreparation, type BuildPreparationAction } from "./buildPreparation";
import { reviewAssemblyOrder } from "./assemblyOrder";
import { homeDepotShoppingList } from "./handoff";
import { PrintSunliteMounts, SunliteMountPanel } from "./SunliteMountPanel";
import { reviewSunliteMounts } from "./sunliteMounts";
import type { Finding } from "./engine";
import { reviewGreenhouseVentBacking, ventBackingGuideLines, ventBackingScope, ventBackingSource, ventBackingSummary } from "./greenhouseVentBacking";
import { concreteAnchor, concreteAnchorScope } from "./concreteAnchorReference";
import {
  Component,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Copy,
  Cuboid,
  Download,
  DoorOpen,
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
import { useInspectorFocus } from "./useInspectorFocus";
import IdeaPlanner from "./IdeaPlanner";
import type { ConnectionQuestionAction } from "./ConnectionQuestionResult";
import type { BuildQuestionAction } from "./buildQuestions";
import { AppliedDesignsPanel } from "./AppliedDesignsPanel";
import { GreenhouseFoundationsPanel } from "./GreenhouseFoundationsPanel";
import { greenhouseFoundationGuide, greenhouseFoundationReviews, greenhouseFoundationScope } from "./greenhouseFoundation";
import { SiteClearancesPanel } from "./SiteClearancesPanel";
import { reviewSiteClearance, siteClearanceText } from "./siteClearance";
import { lidSiteAngle } from "./lidSiteClearance";
import { lidSiteGuideRows } from "./lidSiteGuide";
import { lidMomentReference, lidStayScope, lidWeightGuideRows, lidWeightScope } from "./lidWeight";
import { everbiltLidSupport, springLidStay } from "./lidStayReference";
import { lidStayFitGuideRows, lidStayFitScope } from "./lidStayFit";
import { adoptLegacyRecipe, detachIdeaBinding } from "./ideaBindings";
import { WorkZoneForm } from "./WorkZoneForm";
import { CutStudio } from "./CutStudio";
import { canEditThroughOpenings } from "./throughOpeningCuts";
import { ToolsPanel } from "./ToolsPanel";
import { GuideConnectionSchedule, type ConnectionReviewScope } from "./GuideConnections";
import { FittedStockPanel } from "./FittedStockPanel";
import { commitFittedStock, type FittedFaceRef, type FittedStockPreview } from "./fittedStock";
import { pickRenderedFittedStockFace } from "./fittedStockPicking";
import { assemblyPartForOffcut } from "./sceneVisibility";
import { rekeyGuidePlacements } from "./guidePlacement";
import { GuidePlacementEditor } from "./GuidePlacementEditor";
import { copySavedRevision } from "./recoverSavedRevision";
import { recordStockCutLayouts, saveTubeCutLoss } from "./recordStockCutLayout";
import { GuidePartLabels, PrintAssemblyPartLabels } from "./GuidePartLabels";
import { assemblyPartLabels, type AssemblyPartLabel } from "./assemblyPartLabels";
import { ConnectionReviewPanel } from "./ConnectionReviewPanel";
import { previewGreenhouseRailFit, type GreenhouseRailFit } from "./greenhouseBaseConnections";
import { EaveBlockPanel } from "./EaveBlockPanel";
import type { EaveFitPreview } from "./eaveStockFit";
import { BanquetteConstructionAppendix } from "./BanquetteConstructionReview";
import { connectionCoverage, type ConnectionIntent } from "./connectionCoverage";
import { LidHingesPanel } from "./LidHingesPanel";
import { MotionPanel } from "./MotionPanel";
import { RemovalMotionPanel } from "./RemovalMotionPanel";
import { clearBearingRemovalPath, saveBearingRemovalPath } from "./recordedRemoval";
import { motionDistance, motionReviewLines, motionTestFindings, projectMotionReviews, runMotionTest, type MotionPreview, type MotionTestSelection } from "./mechanismMotion";
import { everbiltLatch, greenhouseLatchGuideLines } from "./greenhouseLatch";
import { greenhouseDoorStopGuideLines } from "./greenhouseDoorStops";
import { greenhouseDoorSealGuideLines } from "./greenhouseDoorSeal";
import { doorSeal } from "./greenhouseDoorSealReference";
import { LidMotionPanel } from "./LidMotionPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { RestraintsPanel } from "./RestraintsPanel";
import { FastenersPanel } from "./FastenersPanel";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { retainConnectorLabelHistory, type ConnectorReview } from "./connectors";
import { connectorPurchaseSummary } from "./connectorPurchases";
import { connectorGuideText } from "./connectorGuide";
import { connectorScheduleCsv } from "./connectorCsv";
import { PROJECT_FORMAT_VERSION } from "./projectVersion";
import { PricingSummary } from "./PricingSummary";
import { fastenerPurchaseSummary } from "./fastenerPurchases";
import { fastenerGuideText } from "./fastenerGuide";
import { fastenerScheduleCsv } from "./fastenerCsv";
import { hingeScheduleCsv } from "./hingeCsv";
import { connectionCoverageCsv } from "./connectionCsv";
import { ConnectionSummary } from "./ConnectionSummary";
import type { DriverAccessLocation } from "./fastenerAccess";
import type { FastenerLayoutMarkerPreview } from "./FastenerMarkers";
import { hingeGuideText } from "./hingeGuide";
import { retainFastenerLabelHistory } from "./fastenings";
import { retainHingeLabelHistory } from "./hingeHistory";
import { pickFastenerSurface } from "./fastenerPicking";
import { restraintGuideText } from "./restraintGuide";
import {
  restraintPurchaseSummary,
  addMissingRestraintKits,
} from "./restraintPurchases";
import { attachmentGuideText } from "./attachmentGuide";
import {
  ensurePartLabels,
  partLabel,
  retainPartLabelHistory,
} from "./partLabels";
import { attachmentScheduleCsv } from "./attachmentCsv";
import {
  attachmentPurchaseSummaries,
  addMissingAttachmentPinPacks,
} from "./attachmentPurchases";
import {
  CURRENT_DRAFT_KEY as DRAFT_KEY,
  PREVIOUS_DRAFT_KEY,
  readInitialBrowserDrafts,
  writeBrowserDraft,
  browserDraftRecoveries,
} from "./drafts";
import { SuppliesPanel } from "./SuppliesPanel";
import type { TrimSeamMarker } from "./trimSeamGeometry";
import { TrimSealantPanel } from "./TrimSealantPanel";
import { WoodGluePanel } from "./WoodGluePanel";
import { PrintSunliteProfiles, SunliteProfilePanel } from "./SunliteProfilePanel";
import { reviewSunliteProfiles } from "./sunliteProfiles";
import { SunliteTakeoffPanel } from "./SunliteTakeoffPanel";
import { PrintSunliteTape, SunliteTapePanel } from "./SunliteTapePanel";
import { EdgeBandingPanel, PrintEdgeBanding } from "./EdgeBandingPanel";
import { isBandingPanel, reviewEdgeBanding, type BandingEdge } from "./edgeBanding";
import { reviewSunliteTape } from "./sunliteTapePlan";
import { PrintSunliteThermal, SunliteThermalPanel } from "./SunliteThermalPanel";
import { sunliteThermalReview } from "./sunliteThermal";
import { ProjectCodePanel, ProjectCodeRows } from "./ProjectCodePanel";
import { dryerExhaustGuideLines } from "./dryerExhaust";
import { shingleRoofGuideLines } from "./shingleRoof";
import { reviewProjectCode } from "./projectCode";
import { ventLayoutGuideLines } from "./plumbingVentLayout";
import { CaseworkTipUpPanel } from "./CaseworkTipUpPanel";
import { caseworkTipUpGuideLines } from "./caseworkTipUp";
import { SaunaBenchTravelPanel } from "./SaunaBenchTravelPanel";
import { saunaBenchTravelGuideLines } from "./saunaBenchTravel";
import { SaunaHeaterPanel } from "./SaunaHeaterPanel";
import { SaunaVentilationPanel } from "./SaunaVentilationPanel";
import { saunaVentilationGuideLines, saunaVentilationReview, saunaVentReference, saunaVentScope } from "./saunaVentilation";
import { saunaBenchGuideLines } from "./saunaBenches";
import { cedarbrookBenchInstructions } from "./saunaBenchReference";
import { foilBlankSize, foilReturnText } from "./saunaFoil";
import { saunaCeilingGuideLines } from "./saunaCeilingCoverage";
import { saunaLiningGuideLines, saunaLiningScope, saunaLiningSources, saunaLiningTools } from "./saunaLiningBacking";
import { SaunaLiningPurchasePanel } from "./SaunaLiningPurchasePanel";
import { saunaWallCoverageScope, saunaWallGuideLines } from "./saunaWallCoverage";
import { stockAxes } from "./stockAxes";
import { purchaseUnitLabel } from "./purchaseUnits";
import { addMissingSaunaHeaters, saunaHeaterGuideLines, saunaHeaterGuideSources, saunaHeaterPurchases, saunaHeaterReview, saunaHeaterScope } from "./saunaHeaters";
import { harviaKit, steel6 } from "./saunaHeaterReference";
import { RodFitsPanel } from "./RodFitsPanel";
import { addMissingEverbiltRodBrackets, addMissingRodBrackets, addMissingRodFlanges, addMissingRodSockets, everbiltRodBracketPurchases, rodBracketPurchases, rodFitGuideLines, rodFlangePurchases, rodSocketPurchases } from "./rodFits";
import { addEstimatedSunlitePurchases, sunliteTakeoff } from "./sunliteTakeoff";
import { reviewSunliteRoofBacking, roofBackingGuideLines, roofBackingScope, roofBackingSummary, sunliteRoofDetail } from "./sunliteRoofBacking";
import { isHorizontalPanel, panelBearingGuideLines, panelBearingScope, panelFloorBearing, reviewPanelBearing } from "./panelBearing";
import { PanelSupportBlockFields } from "./PanelSupportBlockFields";
import { stationarySupportStops, type PanelSupportBlockPreview } from "./panelSupportBlock";
import { beamSource, shelfSagGuideLines, shelfSagScope, stiffnessSource } from "./shelfSag";
import { ShelfSagPanel } from "./ShelfSagPanel";
import type { ShelfDividerPreview } from "./shelfDivider";
import { WoodSupportPanel } from "./WoodSupportPanel";
import { bearingConnectionGuideLines, bearingConnections, bearingConnectionScope } from "./bearingConnections";
import { clearBearingDecision, saveBearingDecision } from "./bearingDecisions";
import { reviewWoodSupport, woodSupportGuideLines, woodSupportScope } from "./woodSupport";
import { rafterBearingGuideLines, rafterBearingScope, reviewGreenhouseRafterBearing } from "./greenhouseRafterBearing";
import { greenhouseAttachmentScope, greenhouseRoofAttachmentLines, greenhouseRoofAttachments } from "./greenhouseRoofAttachments";
import { greenhouseBaseConnections, greenhouseBaseGuideLines, greenhouseBaseScope } from "./greenhouseBaseConnections";
import { floorBaseConnections, floorBaseConnectionGuideLines, floorBaseConnectionScope } from "./floorBaseConnections";
import { floorHangerGuideLines, saveFloorHangerPlan } from "./floorHangerPlans";
import { floorHangerReport, floorHangerScope } from "./floorHangerReference";
import { supplyRows, formatSupplyContent } from "./supplies";
import { shoppingOfferForMaterial } from "./retailerCatalog";
import { CatalogReferences } from "./CatalogReferences";
import BuildStudies from "./BuildStudies";
import { SheetLayouts, sheetPlansMarkdown } from "./SheetLayouts";
import { PrintStockCutSequences, StockCutSequenceList, WoodStockKerf } from "./StockCutSequenceList";
import { PrintOffcutCutOrder } from "./PrintOffcutCutOrder";
import { offcutCutRows } from "./offcutCutGuide";
import { stockCutSequences, type StockCutLayout } from "./stockCutSequence";
import { PartStockPlan } from "./PartStockPlan";
import { StockGroupComparison } from "./StockGroupComparison";
import { previewGroupStockReplacement, previewPartStockReplacement } from "./partStockReplacement";
import { CutStockLayout } from "./CutStockLayoutView";
import { completePlannedCutSource, releasePlannedCutSources } from "./plannedCutSources";
import { cutStockLayoutMarkdown } from "./cutStockLayout";
import "./CutStockLayout.css";
import { cutInstructions, cutInstructionsText } from "./cutInstructions";
import { pieceThroughOpenings, throughOpeningProblem } from "./throughOpenings";
import { toolGuideMarkdown, selectedToolsForProject } from "./toolGuide";
import { toolChecklist } from "./tools";
import { retailerName, retailerSearch, type Retailer } from "./retailers";
import {
  measureBetween,
  formatMeasurement,
  formatPreciseInches,
  formatStockLength,
} from "./measurement";
import { generateBuildGuide, guideIsCurrent } from "./guide";
import {
  SAVED_PROJECT_NOTES_CONTEXT,
  SAVED_PROJECT_NOTES_TITLE,
} from "./projectNotes";
import { snapPlacement, surfacePlacement } from "./editing";
import { createWoodGroupSlide, createWoodSlide, placeWood, separateWood, woodSlideStopLabel } from "./placement";
import { copyObjects, pasteObjects, type ObjectClipboard } from "./editorClipboard";
import { MaterialLibrary } from "./MaterialLibrary";
import { CutPool } from "./CutPool";
import { MeasuredOffcutForm } from "./MeasuredOffcutForm";
import { addMeasuredOffcut } from "./measuredOffcuts";
import { assignOffcutToPart } from "./offcutAssignment";
import { OffcutReleaseReview, type OffcutReleasePreview } from "./OffcutReleaseReview";
import { planOffcutRelease } from "./offcutReleasePlan";
import { OffcutReuseReview } from "./OffcutReuseReview";
import { planOffcutReuse, type OffcutReusePlan } from "./offcutReusePlan";
import { ObjectMovement } from "./ObjectMovement";
import { InventoryForm } from "./InventoryForm";
import { HomeDepotHandoff } from "./HomeDepotHandoff";
import { recordHomeDepotPickup } from "./homeDepotInStore";
import { recordHomeDepotStoreSnapshots } from "./homeDepotStoreSnapshots";
import { mergeStoreSnapshots, readStoreSnapshotFile, recordMaterialObservation, storeSnapshotFile } from "./storeSnapshotFiles";
import { nextStoreCheckChange } from "./storeSnapshotTime";
import { addHomeDepotPurchaseNeed } from "./handoffPurchases";
import { SectionsPanel } from "./SectionsPanel";
import type { LidPreview } from "./lidMotion";
import { inspectLidTravel, lidTravelPose, projectLidTravelChecks, type LidTravelInspection } from "./lidTravelFindings";
import {
  reconcileSections,
  previewSectionCommand,
  sectionContext,
  transformSection,
  snapSectionOrigin,
} from "./sections";
import { composeRotation } from "./spatial";
import {
  addMaterial,
  bom,
  bounds,
  connect,
  distance,
  guideHomeDepotStock,
  guideMarkdown,
  inspectCutStock,
  pieceCutKerf,
  parseDxf,
  parseInventory,
  recordChanges,
  projectPricingCoverage,
  shoppingCsv,
  validate,
} from "./engine";
import { setCutSourceOnHand } from "./cutStock";
import {
  applyCommand,
  blank,
  catalog,
  commandSchema,
  format,
  isBatt,
  material,
  projectSchema,
  step,
  uid,
  type SectionCommand,
  type Command,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
type Modal =
  | "idea"
  | "zone"
  | "cut"
  | "part-stock"
  | "measured-offcut"
  | "offcut-reuse"
  | "offcut-release"
  | "catalog"
  | "studies"
  | "handoff"
  | "inventory"
  | "projects"
  | "settings"
  | "import"
  | "drawing"
  | "doorway"
  | "wall-water"
  | "water-fitting"
  | "water-pressure"
  | "water-stop"
  | "sink-drain"
  | "water-support"
  | "export"
  | "assistant"
  | "base"
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
  loadError?: string;
  originalAvailable?: boolean;
  earlierRevisions?: number[];
};

function EarlierProjectSaves({ project, onOpen }: {
  project: Summary;
  onOpen: (revision: number) => void;
}) {
  if (!project.earlierRevisions?.length) return null;
  return (
    <details className="project-earlier-saves" data-earlier-saves-for={project.id}>
      <summary>Earlier saves · {project.earlierRevisions.length}</summary>
      <ul>
        {project.earlierRevisions.map((revision) => (
          <li key={revision}>
            <button className="text-button" type="button"
              aria-label={`Open revision ${revision} of ${project.name} as a copy`}
              onClick={() => onOpen(revision)}>
              Open revision {revision} as a copy
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
function initial() {
  let drafts: ReturnType<typeof readInitialBrowserDrafts> = {
    resume: null,
    previous: null,
  };
  try {
    drafts = readInitialBrowserDrafts(localStorage);
  } catch {
    /* Storage may be disabled by the browser. */
  }
  return {
    project: blank(),
    revision: 0,
    ...drafts,
  };
}
function recoverableDrafts() {
  try {
    return browserDraftRecoveries(localStorage);
  } catch {
    return [];
  }
}
async function api(url: string, options?: RequestInit) {
  const response = await workshopRequest(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
function download(name: string, body: string | Blob, type: string) {
  const url = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type }));
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
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const numberText=(n:number)=>String(Number(n.toFixed(8)));
  const [draft, setDraft] = useState(numberText(value));
  const edited = useRef(false);
  useEffect(() => {setDraft(numberText(value));edited.current=false;}, [value]);
  const commit = () => {
    if(!edited.current)return;
    edited.current=false;
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onChange(n);
    }
    setDraft(numberText(value));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          disabled={disabled}
          step="0.125"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => {edited.current=true;setDraft(e.target.value);}}
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
type WorkshopPanel = "prep" | "part" | "checks" | "materials" | "step" | "sections" | "tools" | "attachments" | "restraints" | "fasteners" | "connections" | "hinges" | "connectors" | "fit-stock" | "motion" | "lid-travel" | "site-clearances" | "opening-flashing";
export function App() {
  const [boot] = useState(initial);
  const draftTouched = useRef(false);
  const archivedDraft = useRef(false);
  const [resumeDraft, setResumeDraft] = useState(boot.resume);
  const [previousDraft, setPreviousDraft] = useState(boot.previous);
  const [draftRecoveries, setDraftRecoveries] = useState(recoverableDrafts);
  const [project, setProject] = useState<Project>(boot.project);
  const inspectorFocus = useInspectorFocus(project.id);
  const [connectorDraftDirty, setConnectorDraftDirty] = useState(false);
  const connectorDraftDirtyRef = useRef(false);
  const onConnectorDirtyChange = useCallback((dirty:boolean) => { connectorDraftDirtyRef.current = dirty; setConnectorDraftDirty(dirty); }, []);
  const [fittedDraftDirty, setFittedDraftDirty] = useState(false);
  const fittedDraftDirtyRef = useRef(false);
  const onFittedDirtyChange = useCallback((dirty:boolean) => { fittedDraftDirtyRef.current = dirty; setFittedDraftDirty(dirty); }, []);
  const current = useRef(project);
  current.current = project;
  const earlierSaveRequest = useRef<AbortController | null>(null);
  const revision = useRef(boot.revision),
    undoStack = useRef<Project[]>([]),
    redoStack = useRef<Project[]>([]);
  const [, force] = useState(0);
  const objectClipboard = useRef<ObjectClipboard | null>(null);
  const [hasObjectClipboard, setHasObjectClipboard] = useState(false);
  const [moveIncrement, setMoveIncrement] = useState(1);
  const [shownSaunaHeaterId, setShownSaunaHeaterId] = useState<string | null>(null);
  const [shownSaunaVentilationId, setShownSaunaVentilationId] = useState<string | null>(null);
  const [shownProfileRunId, setShownProfileRunId] = useState<string | null>(null);
  const [reviewStockId, setReviewStockId] = useState<MaterialId | null>(null);
  const [reviewFinishPanel, setReviewFinishPanel] = useState<"sunlite-tape-plan" | "edge-banding-plan" | null>(null);
  const [bandingMark, setBandingMark] = useState<{ project: Project; edge: BandingEdge } | null>(null);
  const [offcutReusePlan, setOffcutReusePlan] = useState<OffcutReusePlan | null>(null);
  const [offcutReleasePreview, setOffcutReleasePreview] = useState<OffcutReleasePreview | null>(null);
  const [returnToPreparation, setReturnToPreparation] = useState(false);
  const [sunliteMountPanelId, setSunliteMountPanelId] = useState("");
  const [shownDrawerMountId, setShownDrawerMountId] = useState<string | null>(null);
  const [shownLatchId, setShownLatchId] = useState<string | null>(null);
  const [shownRodSupportId, setShownRodSupportId] = useState<string | null>(null);
  const [shownFoundationId, setShownFoundationId] = useState<string | null>(null);
  const [shownTrimSeam, setShownTrimSeam] = useState<{ project: Project; pair: string; marker: TrimSeamMarker } | null>(null);
  const [shownSillGasketId, setShownSillGasketId] = useState<string | null>(null);
  const [openingFlashingTarget, setOpeningFlashingTarget] = useState<{ projectId: string; sillId?: string } | null>(null);
  const [openingFlashingPreview, setOpeningFlashingPreview] = useState<{ project: Project; value: OpeningFlashingPreview } | null>(null);
  const [shownSiteClearanceId, setShownSiteClearanceId] = useState<string | null>(null);
  const [ventDatumProjectId, setVentDatumProjectId] = useState<string | null>(null);
  const [dryerDuctProjectId, setDryerDuctProjectId] = useState<string | null>(null);
  const [siteReturnPanel, setSiteReturnPanel] = useState<"checks" | "sections" | "motion" | "connections">("checks");
  const [shownAreaFinding, setShownAreaFinding] = useState<{ project: Project; id: string } | null>(null);
  const [supportBlockDraft, setSupportBlockDraft] = useState<{ project: Project; fit: PanelSupportBlockPreview } | null>(null);
  const [eaveBlockDraft, setEaveBlockDraft] = useState<{ project: Project; fit: EaveFitPreview } | null>(null);
  const [shelfDividerDraft, setShelfDividerDraft] = useState<{ project: Project; fit: ShelfDividerPreview } | null>(null);
  const [baseRailDraft, setBaseRailDraft] = useState<{
    project: Project; entryId: string; sideId: string; fit: GreenhouseRailFit;
  } | null>(null);
  const [guidePartFocus, setGuidePartFocus] = useState<{
    project: Project; row: AssemblyPartLabel; isolated: boolean;
  } | null>(null);
  const [stockPlanPartId, setStockPlanPartId] = useState<string | null>(null);
  const [labelPrint, setLabelPrint] = useState<{ title: string; labels: AssemblyPartLabel[] } | null>(null);
  const [printingGuide, setPrintingGuide] = useState(false);
  const hasOpeningLid = project.sections.some(({ recipe }) => recipe?.openingLid);
  const hasMotionPlans = !!project.motionPlans?.length;
  useEffect(() => {
    if ((!hasOpeningLid && !hasMotionPlans) || labelPrint) return;
    const prepareGuide = () => flushSync(() => setPrintingGuide(true));
    const endPrint = () => setPrintingGuide(false);
    window.addEventListener("beforeprint", prepareGuide);
    window.addEventListener("afterprint", endPrint);
    return () => {
      window.removeEventListener("beforeprint", prepareGuide);
      window.removeEventListener("afterprint", endPrint);
    };
  }, [hasOpeningLid, hasMotionPlans, labelPrint]);
  useEffect(() => {
    if (!labelPrint) return;
    const reset = () => setLabelPrint(null);
    const frame = requestAnimationFrame(() => window.print());
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", reset);
    };
  }, [labelPrint]);
  const objectActions = useRef<{copy?:()=>void;paste?:()=>void;duplicate?:()=>void;nudge?:(direction:number)=>void}>({});
  const [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<
      "select" | "move" | "lift" | "rotate" | "screw" | "measure" | "fastener" | "fit-face" | "trace-wall"
    >("select");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [lidMotionPreview, setLidMotionPreview] = useState<{
    project: Project;
    value: LidPreview;
  } | null>(null);
  const [lidTravelInspection, setLidTravelInspection] = useState<(LidTravelInspection & { project: Project }) | null>(null);
  const [sectionMotionPreview, setSectionMotionPreview] = useState<{ project: Project; value: MotionPreview; target: "bench" | "casework" } | null>(null);
  const [motionPreview, setMotionPreview] = useState<{ project: Project; value: MotionPreview } | null>(null);
  const [drawerBoxRequest, setDrawerBoxRequest] = useState<{ projectId: string; panelIds: [string, string] } | null>(null);
  const [motionTestSelection, setMotionTestSelection] = useState<(MotionTestSelection & { project: Project }) | null>(null);
  const [clearanceRetest, setClearanceRetest] = useState<{
    projectId: string;
    target: { kind: "motion" } & NonNullable<MotionPreview["focusTest"]> | { kind: "lid"; sectionId: string };
  } | null>(null);
  useEffect(() => setClearanceRetest(null), [project.id]);
  const [removalTarget, setRemovalTarget] = useState<{ projectId: string; topId: string; baseId: string } | null>(null);
  const [selectionScope, setSelectionScope] = useState<"part" | "section">(
    "part",
  );
  const [measurement, setMeasurement] = useState<{
    a: V3 | null;
    b: V3 | null;
  }>({ a: null, b: null });
  const [wallTrace, setWallTrace] = useState(emptyWallTrace);
  const [outlineTrace, setOutlineTrace] = useState<{ index: number; face: OutlineFace; source: "pdf" | "dxf" } | null>(null);
  useEffect(() => {
    setWallTrace(emptyWallTrace());
    setOutlineTrace(null);
    setMode((previous) => previous === "trace-wall" ? "select" : previous);
  }, [project.id]);
  const readingOutline = mode === "trace-wall" && outlineTrace !== null;
  const pdfPlanLines = useMemo(() => drawingPlanLines(project.drawingReference), [project.drawingReference]);
  const hasDxfLines = project.planLines.length > 0, hasPdfLines = pdfPlanLines.length > 0;
  const canFrameOutline = hasDxfLines || hasPdfLines;
  const outlineSourceName = hasDxfLines && hasPdfLines ? "plan" : hasPdfLines ? "PDF" : "DXF";
  const selectedPlanLines = outlineTrace?.source === "pdf" ? pdfPlanLines : project.planLines;
  const planOutlines = useMemo(() => {
    if (!readingOutline) return { entries: [] };
    try { return { entries: detectPlanOutlines(selectedPlanLines) }; }
    catch (error) { return { entries: [], error: error instanceof Error ? error.message : "Could not read this plan." }; }
  }, [readingOutline, selectedPlanLines]);
  const outlineIndex = outlineTrace?.index === -1 && planOutlines.entries.length === 1 ? 0 : outlineTrace?.index ?? -1;
  const selectedOutline = planOutlines.entries[outlineIndex];
  const wallTraceReview = useMemo(() => {
    if (mode !== "trace-wall" || (outlineTrace ? !selectedOutline : !wallTrace.a || !wallTrace.b)) return {};
    try {
      return { value: outlineTrace && selectedOutline
        ? reviewWallOutline(project, wallTrace, selectedOutline, outlineTrace.face)
        : reviewWallTrace(project, wallTrace) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not preview this wall." };
    }
  }, [mode, project, wallTrace, outlineTrace, selectedOutline]);
  const measured =
    measurement.a && measurement.b
      ? measureBetween(measurement.a, measurement.b)
      : null;
  const [assistantTarget, setAssistantTarget] = useState("");
  const [waterRunTarget, setWaterRunTarget] = useState<string>();
  const [waterFittingTarget, setWaterFittingTarget] = useState<string>();
  const [waterPressureTarget, setWaterPressureTarget] = useState<string>();
  const [waterStopTarget, setWaterStopTarget] = useState<string>();
  const [sinkDrainTarget, setSinkDrainTarget] = useState<string>();
  const [waterFittingTee, setWaterFittingTee] = useState(false);
  const [snap, setSnap] = useState(true),
    [explode, setExplode] = useState(false),
    [xray, setXray] = useState(false),
    [showOffcuts, setShowOffcuts] = useState(false),
    [view, setView] = useState({ preset: "iso", nonce: 0 });
  const [panel, setPanelState] = useState<WorkshopPanel>("checks"),
    [library, setLibrary] = useState<"parts" | "assemblies" | "cuts">("parts"),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  const shownVentDatums = panel === "checks" && project.id === ventDatumProjectId &&
    project.projectCode?.trades.includes("plumbing") && project.projectCode.wallVent.inScope === "yes"
    ? project.projectCode.wallVent.layout : undefined;
  const shownDryerDuct = panel === "checks" && project.id === dryerDuctProjectId &&
    project.projectCode?.trades.includes("hvac") && project.projectCode.dryerExhaust?.appliance === "ducted"
    ? project.projectCode.dryerExhaust.layout : undefined;
  const [stepId, setStepId] = useState(project.steps[0].id),
    [stage, setStage] = useState<number | null>(null),
    [playing, setPlaying] = useState(false);
  const activeLidPreview = lidMotionPreview?.project === project &&
    (panel === "sections" || panel === "hinges" || panel === "lid-travel") && selectedSectionId === lidMotionPreview.value.sectionId
    ? lidMotionPreview.value : null;
  const inspectedLidSection = panel === "lid-travel"
    ? project.sections.find(({ id }) => id === selectedSectionId)
    : undefined;
  const activeSectionMotion = sectionMotionPreview?.project === project && panel === "sections" ? sectionMotionPreview : null;
  const activeMotionPreview = motionPreview?.project === project && panel === "motion" ? motionPreview.value : activeSectionMotion?.value ?? null;
  const activeBaseRailDraft = baseRailDraft?.project === project && panel === "connections" ? baseRailDraft : null;
  const baseRailPreview = activeBaseRailDraft?.fit.kind === "move" ? activeBaseRailDraft.fit.piece : null;
  useEffect(() => {
    setBaseRailDraft(null);
  }, [project]);
  const activeRemoval = panel === "motion" && removalTarget?.projectId === project.id ? removalTarget : null;
  const travelPreviewActive = !!(activeMotionPreview || activeLidPreview);
  useEffect(() => {
    setLidMotionPreview((preview) =>
      panel === "lid-travel" && preview?.project === project && preview.value.sectionId === selectedSectionId
        ? preview
        : null,
    );
  }, [project, panel, selectedSectionId]);
  useEffect(() => {
    setSectionMotionPreview(null);
  }, [project]);
  const [selectedAttachmentPlanId, setSelectedAttachmentPlanId] = useState<
    string | null
  >(null);
  const [selectedFastenerPlanId, setSelectedFastenerPlanId] = useState<string | null>(null);
  const [focusedFastenerLocation, setFocusedFastenerLocation] = useState<{projectId:string;planId:string;locationId:string|null}|null>(null);
  const onFocusFastenerLocation = useCallback((locationId:string|null, planId:string) => {
    setFocusedFastenerLocation({projectId:current.current.id,planId,locationId});
  }, []);
  const [selectedConnectorPlanId, setSelectedConnectorPlanId] = useState<string | null>(null);
  const [focusedConnectorEntryId, setFocusedConnectorEntryId] = useState<string | null>(null);
  const [connectorPreview, setConnectorPreview] = useState<{project:Project;review:ConnectorReview}|null>(null);
  const onConnectorPreview = useCallback((review:ConnectorReview|null) => setConnectorPreview(review ? {project:current.current,review} : null), []);
  // The editor owns its preview, including null for invalid inputs. A parent
  // clearing effect would erase the child's initial review when opening a saved plan.
  const activeConnectorPreview = connectorPreview?.project === project && panel === "connectors" &&
    (!selectedConnectorPlanId || connectorPreview.review.plan.id === selectedConnectorPlanId) &&
    !explode && stage === null && mode !== "fastener" ? connectorPreview.review : null;
  const [fittedPreview, setFittedPreview] = useState<{project:Project;value:FittedStockPreview}|null>(null);
  const onFittedPreview = useCallback((value:FittedStockPreview|null) => setFittedPreview(value ? {project:current.current,value} : null), []);
  const activeFittedPreview = fittedPreview?.project === project && panel === "fit-stock" && !explode && stage === null && mode !== "fit-face" ? fittedPreview.value : null;
  const [fittedFaces, setFittedFaces] = useState<{project:Project;first:FittedFaceRef|null;second:FittedFaceRef|null}|null>(null);
  const onFittedFacesChange = useCallback((faces:{first:FittedFaceRef|null;second:FittedFaceRef|null}) => setFittedFaces({project:current.current,...faces}), []);
  const activeFittedFaces = fittedFaces?.project === project && panel === "fit-stock" ? fittedFaces : undefined;
  const [initialFittedPair, setInitialFittedPair] = useState<{projectId:string;firstId:string;secondId:string;nonce:number}|null>(null);
  const [fittedFacePick, setFittedFacePick] = useState<{project:Project;which:"first"|"second";pieceId:string}|null>(null);
  const [pickedFittedFace, setPickedFittedFace] = useState<{which:"first"|"second";pieceId:string;ref:FittedFaceRef;nonce:number}|null>(null);
  const fittedPickNonce = useRef(0);
  const [fittedConnectionEnds, setFittedConnectionEnds] = useState<{projectId:string;blockId:string;endpoints:[string,string]}|null>(null);
  const cancelFittedPick = useCallback(() => { setFittedFacePick(null); setPickedFittedFace(null); setMode((previous) => previous === "fit-face" ? "select" : previous); }, []);
  const [driverPreview, setDriverPreview] = useState<{ project: Project; value: DriverAccessLocation } | null>(null);
  const activeDriverPreview = driverPreview?.project === project && panel === "fasteners" && !explode && stage === null && mode !== "fastener"
    ? driverPreview.value : null;
  const [fastenerLayoutPreview, setFastenerLayoutPreview] = useState<{project:Project;value:FastenerLayoutMarkerPreview}|null>(null);
  const onFastenerLayoutPreview = useCallback((value:FastenerLayoutMarkerPreview|null) => {
    if (value) setDriverPreview(null);
    setFastenerLayoutPreview(value ? {project:current.current,value} : null);
  }, []);
  const activeFastenerLayoutPreview = fastenerLayoutPreview?.project === project && panel === "fasteners" && !explode && stage === null && mode !== "fastener"
    ? fastenerLayoutPreview.value : null;
  const centeredEntryPreview = activeFastenerLayoutPreview?.kind === "centered-entry";
  const contactRowPreview = activeFastenerLayoutPreview?.kind === "contact-row";
  useEffect(() => {
    setFastenerLayoutPreview(null);
    setDriverPreview(null);
  }, [project,panel,selectedFastenerPlanId]);
  const [entrancePick, setEntrancePick] = useState<{projectId:string;panel:"fasteners"|"connectors";planId:string;locationId:string;headPieceId:string} | null>(null);
  const [pickedEntrance, setPickedEntrance] = useState<{projectId:string;panel:"fasteners"|"connectors";planId:string;locationId:string;entranceLocal:V3;driveLocal:V3;nonce:number} | null>(null);
  const entrancePickNonce = useRef(0);
  const [connectionContext, setConnectionContext] = useState<{projectId:string;scope:ConnectionReviewScope;backPanel:"part"|"checks"|"step"|"sections"|"prep";constructionEntryId?:string}|null>(null);
  const [returnToConnections, setReturnToConnections] = useState(false);
  const [initialFastenerPair, setInitialFastenerPair] = useState<{projectId:string;headId:string;receiverId:string;nonce:number;compareSides?:boolean}|null>(null);
  const [initialConnectorPair, setInitialConnectorPair] = useState<{projectId:string;baseId:string;postId:string;nonce:number}|null>(null);
  const connectionNavigationNonce = useRef(0);
  const [hingeRequest, setHingeRequest] = useState<{planId:string;nonce:number}|null>(null);
  const [displayedHingePlanId, setDisplayedHingePlanId] = useState<string|null>(null);
  const [reviewedRestraintPlanId, setReviewedRestraintPlanId] = useState<string|null>(null);
  const liveConnectionContext = connectionContext?.projectId === project.id ? connectionContext : null;
  const displayedHingePlan = project.lidHingePlans.find((plan) => plan.id === displayedHingePlanId);
  const displayedHingeSection = project.sections.find((section) => section.id === displayedHingePlan?.sectionId && section.recipe?.openingLid);
  useEffect(() => {
    if (panel === "hinges") setSelectedSectionId(displayedHingeSection?.id ?? null);
  }, [panel, project.id, displayedHingeSection?.id]);
  useEffect(() => {
    setConnectionContext(null); setReturnToConnections(false); setInitialFastenerPair(null); setHingeRequest(null); setDisplayedHingePlanId(null);
    setShowOffcuts(false);
  }, [project.id]);
  const [modal, setModalState] = useState<Modal>(null),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [projects, setProjects] = useState<Summary[]>([]);
  const [ideaTarget, setIdeaTarget] = useState<{
    bindingId: string;
    entryIds?: string[];
  } | null>(null);
  const [inventoryTick, setInventoryTick] = useState(0);
  const [inventoryTarget, setInventoryTarget] = useState<MaterialId>();
  useEffect(() => {
    if (!project.store) return;
    const checks = [...project.inventory, ...project.supplyInventory].filter((entry) =>
      (entry.retailer ?? "home-depot") === project.retailer &&
      entry.store === project.store &&
      entry.zip === project.zip
    );
    if (!checks.length) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      const next = nextStoreCheckChange(checks, now);
      if (next !== null)
        timer = window.setTimeout(refresh, Math.min(next - now, 60000));
    };
    const refresh = () => {
      setInventoryTick((n) => n + 1);
      schedule();
    };
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [project.store, project.zip, project.retailer, project.inventory, project.supplyInventory]);
  const [health, setHealth] = useState<{ ai: string; catalog: boolean } | null>(
      null,
    ),
    [prompt, setPrompt] = useState(
      "Build a wall 8 ft wide and 6 ft tall, 16 inches on center",
    ),
    [proposal, setProposal] = useState<{
      command: SectionCommand;
      provider: string;
      message: string;
      targetSectionId?: string;
      reuseWindowOffcuts?: boolean;
    } | null>(null);
  const [importKind, setImportKind] = useState("project"),
    [dxfScale, setDxfScale] = useState(1),
    [newStep, setNewStep] = useState(""),
    [newStepNotes, setNewStepNotes] = useState(""),
    [hardware, setHardware] = useState<MaterialId>("screw"),
    [connectionTarget, setConnectionTarget] = useState(""),
    [screws, setScrews] = useState(2),
    [screwLength, setScrewLength] = useState(3);
  const viewport = useRef<HTMLDivElement>(null),
    camera = useRef<THREE.Camera | null>(null),
    file = useRef<HTMLInputElement>(null);
  const onCamera = useCallback((c: THREE.Camera) => {
    camera.current = c;
  }, []);
  const inspectWorkspace = useCallback(() => {
    inspectorFocus.suspend();
    requestAnimationFrame(() => viewport.current?.scrollIntoView({behavior:"smooth",block:"center"}));
  }, [inspectorFocus.suspend]);
  function showLidMotion(value: LidPreview | null) {
    setLidMotionPreview(value ? { project, value } : null);
    if (value?.focusPair) inspectWorkspace();
  }
  function startSectionMotionPreview() {
    setLidMotionPreview(null);
    setStage(null);
    setPlaying(false);
    setExplode(false);
    inspectWorkspace();
  }
  const notify = (text: string, error = false) => setToast({ text, error });
  function canLeaveWorkingDraft() {
    if (connectorDraftDirtyRef.current) {
      notify("Save or discard the connector draft before leaving or saving the project.", true);
      return false;
    }
    if (fittedDraftDirtyRef.current) {
      notify("Add or cancel the fitted-stock draft before leaving or saving the project.", true);
      return false;
    }
    return true;
  }
  function setModal(next: Modal) {
    if (next !== null && !["export", "help", "projects", "import"].includes(next) && !canLeaveWorkingDraft()) return;
    if (next !== "projects") earlierSaveRequest.current?.abort();
    if (next !== "offcut-reuse") setOffcutReusePlan(null);
    if (next !== "offcut-release") setOffcutReleasePreview(null);
    if (next !== "inventory") setInventoryTarget(undefined);
    if (next !== null) inspectorFocus.suspend();
    setModalState(next);
  }
  function setPanel(next:WorkshopPanel) {
    if ((panel === "connectors" || panel === "fit-stock") && next !== panel && !canLeaveWorkingDraft()) return;
    if (next !== "sections" && mode === "trace-wall") setMode("select");
    if (next !== "motion") {
      setMotionPreview(null);
      setMotionTestSelection(null);
      setShownLatchId(null);
      setRemovalTarget(null);
    }
    if (next !== "sections") setSectionMotionPreview(null);
    if (next !== "lid-travel") setLidTravelInspection(null);
    if (next !== "checks") setShownAreaFinding(null);
    if (next !== "connections") setBaseRailDraft(null);
    if (next !== "opening-flashing") setOpeningFlashingPreview(null);
    if (next !== "step" && guidePartFocus) exitGuidePartView();
    setPanelState(next);
  }
  function exitGuidePartView() {
    setGuidePartFocus(null);
    setStage(null);
  }
  function openOpeningFlashing(sillId?: string) {
    setReturnToConnections(false);
    setOpeningFlashingTarget({ projectId: project.id, sillId });
    setOpeningFlashingPreview(null);
    setPanel("opening-flashing");
    inspectorFocus.scrollRef.current?.scrollTo(0, 0);
  }
  function showFindingArea(finding: Finding) {
    if (!finding.area) return;
    setPanel("checks");
    setSupportBlockDraft(null);
    setEaveBlockDraft(null);
    setShownAreaFinding({ project, id: finding.id });
    setStage(null);
    setPlaying(false);
    setExplode(false);
    const perspective = finding.area.kind === "rafter-eave" || finding.area.kind === "rafter-ridge" || finding.area.kind === "glazing-hole-layout" || finding.area.kind === "roof-plane";
    setView((previous) => ({ preset: perspective ? "iso" : "top", nonce: previous.nonce + 1 }));
    inspectWorkspace();
  }
  function openWorkspaceFinding(finding: Finding, toggle = true) {
    if (finding.area) {
      if (toggle && shownCheckArea === finding.area) setShownAreaFinding(null);
      else showFindingArea(finding);
    } else if (finding.connectionScope) {
      openConnectionReview(finding.connectionScope);
    } else if (finding.hingePlanId) {
      const plan = project.lidHingePlans.find(({ id }) => id === finding.hingePlanId);
      if (plan) {
        setSelectedSectionId(plan.sectionId);
        setSelectionScope("section");
        setPanel("sections");
      }
    } else if (finding.fastenerPlanId) {
      openFasteners(finding.fastenerPlanId);
      if (finding.pieceId) setSelected(finding.pieceId);
    } else if (finding.restraintPlanId) {
      openRestraints();
      if (finding.pieceId) setSelected(finding.pieceId);
    } else if (finding.attachmentPlanId) {
      openAttachments(finding.attachmentPlanId);
      if (finding.pieceId) setSelected(finding.pieceId);
    } else if (finding.openingFlashingSillId) {
      openOpeningFlashing(finding.openingFlashingSillId);
    } else if (finding.pieceId) {
      setSelectionScope("part");
      setSelectedSectionId(null);
      setSelected(finding.pieceId);
      setPanel("part");
    }
  }
  function editClearanceObstruction(
    id: string,
    target: NonNullable<typeof clearanceRetest>["target"],
  ) {
    if (!project.pieces.some((piece) => piece.id === id && !piece.offcut)) {
      notify("This obstruction is no longer an editable part.", true);
      return;
    }
    setClearanceRetest({ projectId: project.id, target });
    setPanel("part");
    setLidMotionPreview(null);
    setSelected(id);
    setSelectedSectionId(null);
    setSelectionScope("part");
    setMode("select");
    setStage(null);
    setPlaying(false);
    setExplode(false);
    inspectorFocus.expand();
    inspectorFocus.scrollRef.current?.scrollTo(0, 0);
  }
  function retestClearance() {
    if (clearanceRetest?.projectId !== project.id) return;
    const { target } = clearanceRetest;
    if (target.kind === "motion") {
      const plan = project.motionPlans?.find(({ id }) => id === target.planId);
      if (!plan) {
        notify("The original motion is no longer in the project.", true);
        return;
      }
      const result = runMotionTest(project, plan, target.setup);
      setPanel("motion");
      setMotionTestSelection({ project, plan, setup: target.setup, scenarioId: target.scenarioId, result });
      setMotionPreview(result.review ? { project, value: result.review.preview(0) } : null);
      if (result.review) inspectWorkspace();
    } else {
      if (!project.sections.some((section) => section.id === target.sectionId && section.recipe?.openingLid)) {
        notify("The original lid is no longer in the project.", true);
        return;
      }
      const entry = inspectLidTravel(project, target.sectionId);
      setPanel("lid-travel");
      setSelected(null);
      setSelectedSectionId(target.sectionId);
      setSelectionScope("section");
      setLidTravelInspection({ project, review: entry.review, error: entry.error });
      const value = entry.review
        ? lidTravelPose(entry.review.preview(0), entry.stays.map(({ status }) => status))
        : null;
      setLidMotionPreview(value ? { project, value } : null);
      if (value) inspectWorkspace();
    }
    setClearanceRetest(null);
  }
  function openBuildPreparationItem(action: BuildPreparationAction, fromPreparation = true) {
    if (action.kind === "offcut-cut") {
      openOffcutReleaseReview(action.id);
      return;
    }
    setReturnToPreparation(fromPreparation && action.kind !== "connections" && action.kind !== "handoff" && action.kind !== "guide-step");
    switch (action.kind) {
      case "guide-step":
        if (guidePartFocus) exitGuidePartView();
        setStepId(action.id);
        setPanel("step");
        inspectorFocus.scrollRef.current?.scrollTo(0, 0);
        break;
      case "offcut":
        inspectStock(action.id);
        break;
      case "part":
        inspectConnectionPiece(action.id);
        setPanel("part");
        break;
      case "connections":
        openConnectionReview(action.scope, "prep");
        break;
      case "stock":
        setReviewStockId(action.id);
        setPanel("materials");
        break;
      case "glazing-tape":
      case "edge-banding":
        setReviewFinishPanel(action.kind === "glazing-tape" ? "sunlite-tape-plan" : "edge-banding-plan");
        setPanel("materials");
        break;
      case "motion": {
        const entry = motionReviews.find(({ plan }) => plan.id === action.planId);
        const recorded = !fromPreparation && entry?.plan.testScenarios?.find(({ id }) => id === action.scenarioId);
        const scenario = entry?.scenarios.find(({ id }) => id === action.scenarioId) ??
          (recorded && entry ? { ...recorded, result: runMotionTest(project, entry.plan, recorded.setup) } : undefined);
        const result = action.scenarioId ? scenario?.result : entry?.[action.variant];
        const finding = result && motionTestFindings(project, result, !fromPreparation || !!scenario).find(({ id }) => id === action.findingId);
        if (!entry || !result || !finding) {
          notify("This clearance finding has changed. Review the current checklist.", true);
          break;
        }
        setRemovalTarget(null);
        const setup = scenario?.setup ?? (action.variant === "saved" ? entry.plan.testSetup : undefined);
        setMotionTestSelection({ project, plan: entry.plan, setup, scenarioId: scenario?.id, result });
        setPanel("motion");
        setStage(null);
        setPlaying(false);
        setExplode(false);
        inspectorFocus.scrollRef.current?.scrollTo(0, 0);
        const value = result.review?.preview(finding.travel ?? 0, undefined, finding.siteFaceId, finding.phase);
        setMotionPreview(value ? { project, value } : null);
        if (value) inspectWorkspace();
        break;
      }
      case "lid": {
        const section = !fromPreparation && project.sections.find(({ id, recipe }) => id === action.sectionId && recipe?.openingLid);
        const entry = lidTravelChecks.find(({ section }) => section.id === action.sectionId) ??
          (section ? { section, ...inspectLidTravel(project, section.id) } : undefined);
        const finding = entry?.findings.find(({ id }) => id === action.findingId) ??
          (!fromPreparation && action.findingId === "clear" && entry?.review && !entry.findings.length
            ? { id: "clear", angle: 0, detail: "No modeled lid travel findings." } : undefined);
        if (!entry || !finding) {
          notify("This lid finding has changed. Review the current checklist.", true);
          break;
        }
        setLidTravelInspection({ project, review: entry.review, error: entry.error, finding });
        setSelectedSectionId(entry.section.id);
        setSelected(null);
        setSelectionScope("section");
        setMode("select");
        setPanel("lid-travel");
        setStage(null);
        setPlaying(false);
        setExplode(false);
        inspectorFocus.scrollRef.current?.scrollTo(0, 0);
        const value = entry.review && finding.angle !== undefined
          ? lidTravelPose(entry.review.preview(finding.angle), entry.stays.map(({ status }) => status), finding.faceId, finding.stayStop)
          : null;
        setLidMotionPreview(value ? { project, value } : null);
        if (value) inspectWorkspace();
        break;
      }
      case "list":
        setPanel("materials");
        break;
      case "handoff":
        setModal("handoff");
        break;
      case "tools":
      case "checks":
        setPanel(action.kind);
        break;
    }
  }
  useEffect(() => {
    if (panel !== "materials" || !reviewStockId) return;
    const row = inspectorFocus.scrollRef.current?.querySelector<HTMLElement>(
      `[data-stock-material="${reviewStockId}"]`,
    );
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
    setReviewStockId(null);
  }, [panel, reviewStockId, inspectorFocus.scrollRef]);
  useEffect(() => {
    if (panel !== "materials" || !reviewFinishPanel) return;
    const plan = inspectorFocus.scrollRef.current?.querySelector<HTMLDetailsElement>(`#${reviewFinishPanel}`);
    if (plan) {
      plan.open = true;
      plan.querySelector("summary")?.focus({ preventScroll: true });
      plan.scrollIntoView({ block: "nearest" });
    }
    setReviewFinishPanel(null);
  }, [panel, reviewFinishPanel, inspectorFocus.scrollRef]);
  function openSiteClearances(from: typeof siteReturnPanel) {
    setSiteReturnPanel(from);
    setPanel("site-clearances");
    inspectorFocus.scrollRef.current?.scrollTo(0, 0);
    setStage(null);
    setPlaying(false);
    setExplode(false);
  }
  useEffect(() => {
    if (fittedFacePick && (fittedFacePick.project !== project || panel !== "fit-stock" || mode !== "fit-face" || stage !== null || explode))
      setFittedFacePick(null);
    if (mode === "fit-face" && (!fittedFacePick || panel !== "fit-stock")) setMode("select");
    if (panel !== "fit-stock") setPickedFittedFace(null);
  }, [fittedFacePick, panel, mode, project, stage, explode]);
  useEffect(() => {
    if (entrancePick && (entrancePick.projectId !== project.id || panel !== entrancePick.panel || mode !== "fastener" || stage !== null || explode || !project.pieces.some((p) => p.id === entrancePick.headPieceId && !p.offcut)))
      setEntrancePick(null);
    if (pickedEntrance && (pickedEntrance.projectId !== project.id || panel !== pickedEntrance.panel)) setPickedEntrance(null);
    if (mode === "fastener" && (!entrancePick || panel !== entrancePick.panel || stage !== null || explode))
      setMode("select");
  }, [entrancePick, pickedEntrance, panel, mode, project.id, project.pieces, stage, explode]);
  function openIdea(
    target: { bindingId: string; entryIds?: string[] } | null = null,
  ) {
    setIdeaTarget(target);
    setModal("idea");
  }
  function openAttachments(planId: string | null = null) {
    setReturnToConnections(false);
    setSelectedAttachmentPlanId(planId);
    setPanel("attachments");
    setStage(null);
    setPlaying(false);
    setExplode(false);
    setMode("select");
    setSelectionScope("part");
    setSelectedSectionId(null);
  }
  function openRestraints() {
    setReturnToConnections(false);
    setReviewedRestraintPlanId(null);
    setPanel("restraints");
    setStage(null);
    setPlaying(false);
    setExplode(false);
    setMode("select");
    setSelectionScope("part");
    setSelectedSectionId(null);
  }
  function openFasteners(planId: string | null = null) {
    setReturnToConnections(false);
    setInitialFastenerPair(null);
    setSelectedFastenerPlanId(planId);
    setPanel("fasteners");
    setStage(null);
    setPlaying(false);
    setExplode(false);
    setMode("select");
    setSelectionScope("part");
    setSelectedSectionId(null);
  }
  function openConnectors(planId: string | null = null) {
    setInitialConnectorPair(null); setSelectedConnectorPlanId(planId); setReturnToConnections(false);
    setPanel("connectors"); setStage(null); setPlaying(false); setExplode(false); setMode("select");
    setSelectionScope("part"); setSelectedSectionId(null);
  }
  function planConnectorPair(baseId: string, postId: string) {
    if (baseId === postId || ![baseId,postId].every((id) => project.pieces.some((piece) => piece.id === id && !piece.offcut && material(piece.material).wood && material(piece.material).stockKind === "linear")))
      throw Error("Choose two actual active wood frame members.");
    openConnectors(); setSelected(baseId); setInitialConnectorPair({projectId:project.id,baseId,postId,nonce:++connectionNavigationNonce.current}); setReturnToConnections(true);
  }
  function openFittedStock(firstId = "", secondId = "") {
    if (!canLeaveWorkingDraft()) return;
    cancelFittedPick(); setFittedPreview(null); setFittedFaces(null);
    setInitialFittedPair({projectId:project.id,firstId,secondId,nonce:++connectionNavigationNonce.current});
    setPanel("fit-stock"); setStage(null); setPlaying(false); setExplode(false); setMode("select");
    setSelectionScope("part"); setSelectedSectionId(null);
    setReturnToConnections(!!liveConnectionContext);
  }
  function openConnectionReview(scope: ConnectionReviewScope, returnTo?: NonNullable<typeof connectionContext>["backPanel"]) {
    const backPanel = returnTo ?? (panel === "part" || panel === "step" || panel === "sections" ? panel : "checks");
    setConnectionContext({projectId:project.id,scope:{...scope,memberIds:[...scope.memberIds]},backPanel});
    setBaseRailDraft(null);
    setReturnToConnections(true); setPanel("connections"); setStage(null); setPlaying(false); setExplode(false); setMode("select"); setSelectionScope("part"); setSelectedSectionId(null);
  }
  function inspectConnectionPiece(id: string) {
    if (!project.pieces.some((piece) => piece.id === id && !piece.offcut)) return;
    setSelected(id); setSelectedSectionId(null); setSelectionScope("part"); setMode("select"); setStage(null);
    inspectWorkspace();
  }
  function planConnectionPair(headId: string, receiverId: string, compareSides = false) {
    if (headId === receiverId || ![headId,receiverId].every((id) => project.pieces.some((piece) => piece.id === id && !piece.offcut && material(piece.material).wood)))
      throw Error("Choose two actual active wood members.");
    openFasteners(); setSelected(headId); setInitialFastenerPair({projectId:project.id,headId,receiverId,compareSides,nonce:++connectionNavigationNonce.current}); setReturnToConnections(true);
  }
  function openAskedConnection(action: ConnectionQuestionAction) {
    if (!canLeaveWorkingDraft()) return;
    const memberIds = action.secondId
      ? [action.firstId, action.secondId]
      : [action.firstId];
    const live = current.current;
    if (new Set(memberIds).size !== memberIds.length || memberIds.some((id) =>
      !live.pieces.some((piece) => piece.id === id && !piece.offcut && material(piece.material).wood)))
      throw Error("The parts changed. Explore this joint again.");
    const plan = action.kind === "open-plan"
      ? live.fastenerPlans.find(({ id }) => id === action.planId)
      : undefined;
    if (action.kind === "open-plan" && (!plan ||
        !memberIds.includes(plan.head.pieceId) || !memberIds.includes(plan.receiver.pieceId)))
      throw Error("The screw plan changed. Explore this joint again.");
    openConnectionReview({
      title: memberIds.map((id) => partLabel(live, id)).join(" and "),
      memberIds,
      focusPair: action.secondId ? [action.firstId, action.secondId] : undefined,
    });
    if (action.kind === "compare") planConnectionPair(action.firstId, action.secondId, true);
    if (plan) {
      openFasteners(plan.id);
      setSelected(plan.head.pieceId);
      setReturnToConnections(true);
    }
    setModal(null);
  }
  function openAskedBuildReview(action: BuildQuestionAction) {
    if (!canLeaveWorkingDraft()) return;
    if (project !== current.current) throw Error("The build changed. Explore the question again.");
    if (action.kind === "offcut-reuse") {
      if (action.plan.source !== project) throw Error("The Cut pool changed. Explore the question again.");
      setOffcutReusePlan(action.plan);
      setModal("offcut-reuse");
      return;
    }
    setModal(null);
    setReturnToPreparation(false);
    switch (action.kind) {
      case "finding": {
        const finding = findings.find(({ id }) => id === action.id);
        if (!finding) throw Error("This check changed. Explore the question again.");
        setPanel("checks");
        openWorkspaceFinding(finding, false);
        break;
      }
      case "checks":
        setPanel("checks");
        break;
      case "cut-pool":
        setLibrary("cuts");
        break;
      case "drawer-box":
        setDrawerBoxRequest({ projectId: project.id, panelIds: action.panelIds });
        setRemovalTarget(null);
        setMotionPreview(null);
        setMotionTestSelection(null);
        setStage(null);
        setExplode(false);
        setPlaying(false);
        setPanel("motion");
        break;
      case "motion-setup":
        setRemovalTarget(null);
        setMotionPreview(null);
        setMotionTestSelection(null);
        setPanel("motion");
        break;
      case "treated-wood":
        setPanel("prep");
        break;
      case "opening-flashing":
        openOpeningFlashing(action.sillId);
        break;
      case "window-wall":
        configureWindowWall(action.command);
        break;
      case "wall-water":
        setWaterRunTarget(action.runId);
        setModal("wall-water");
        break;
      case "water-fitting":
        setWaterFittingTarget(action.fittingId);
        setWaterFittingTee(!!action.tee);
        setModal("water-fitting");
        break;
      case "sink-drain":
        setSinkDrainTarget(action.drainId);
        setModal("sink-drain");
        return;
      case "water-stop":
        setWaterStopTarget(action.stopId);
        setModal("water-stop");
        return;
      case "water-pressure":
        setWaterPressureTarget(action.recordId);
        setModal("water-pressure");
        break;
      case "water-support":
        setModal("water-support");
        break;
      case "greenhouse-weatherseal": {
        const plan = project.motionPlans?.find(({ id }) => id === action.motionId);
        if (!plan) throw Error("This door swing has changed. Explore the question again.");
        setRemovalTarget(null);
        const result = runMotionTest(project, plan);
        setMotionTestSelection({ project, plan, result });
        setMotionPreview(result.review ? { project, value: result.review.preview(0) } : null);
        setStage(null);
        setPlaying(false);
        setExplode(false);
        inspectorFocus.scrollRef.current?.scrollTo(0, 0);
        setPanel("motion");
        break;
      }
      case "part":
      case "offcut":
      case "motion":
      case "lid":
        openBuildPreparationItem(action, false);
        break;
    }
  }
  function reviewConnectionIntent(intent: ConnectionIntent, scope?: ConnectionReviewScope) {
    if (scope) openConnectionReview(scope);
    if (intent.kind === "wood-fastener") openFasteners(intent.planId);
    else if (intent.kind === "angle-connector") openConnectors(intent.planId);
    else if (intent.kind === "shelf-pin") openAttachments(intent.planId);
    else if (intent.kind === "restraint") { openRestraints(); setReviewedRestraintPlanId(intent.planId); }
    else if (intent.kind === "lid-hinge") {
      setHingeRequest({planId:intent.planId,nonce:++connectionNavigationNonce.current}); setDisplayedHingePlanId(intent.planId); setPanel("hinges"); setStage(null); setPlaying(false); setExplode(false); setMode("select"); setSelectionScope("part");
    } else { inspectConnectionPiece(intent.activePieceIds[0] ?? intent.pieceIds[0]); setPanel("part"); }
    setReturnToConnections(true);
  }
  function backToConnectionReview() {
    setPanel(liveConnectionContext ? "connections" : "part"); setStage(null); setMode("select"); setPlaying(false);
  }
  function openRemovalTest(topId: string, baseId: string) {
    setRemovalTarget({ projectId: project.id, topId, baseId });
    setMotionPreview(null); setPanel("motion"); setStage(null); setPlaying(false); setExplode(false);
    setMode("select"); setSelectionScope("part"); setSelectedSectionId(null); setSelected(topId);
  }
  function backFromConnectionReview() {
    const destination = liveConnectionContext?.backPanel ?? "checks";
    const floorBase = destination === "sections" && project.sections.find((section) =>
      section.id === liveConnectionContext?.scope.ownerId && section.generator?.type === "foundation");
    if (floorBase) setSelectedSectionId(floorBase.id);
    if (liveConnectionContext?.scope.stepId && project.steps.some((step) => step.id === liveConnectionContext.scope.stepId)) setStepId(liveConnectionContext.scope.stepId);
    setReturnToConnections(false); setPanel(destination);
  }
  function scopeForGuideIntent(intent?: ConnectionIntent): ConnectionReviewScope {
    const step = project.steps.find((step) => step.id === stepId) ?? project.steps[0];
    if (step.generated?.kind === "assembly-stage") return {title:step.title,memberIds:step.generated.memberIds,ownerId:step.generated.planId,stageKey:step.generated.stageKey,stepId:step.id};
    return {title:step.title,memberIds:intent?.pieceIds ?? project.pieces.filter((piece) => piece.stepId === step.id && !piece.offcut).map((piece) => piece.id),stepId:step.id};
  }
  const change = useCallback((update: Project | ((p: Project) => Project)) => {
    if (fittedDraftDirtyRef.current)
      throw Error("Add or cancel the fitted-stock draft before changing project parts.");
    draftTouched.current = true;
    const proposal =
      typeof update === "function" ? update(current.current) : update;
    const next = projectSchema.parse(
      ensurePartLabels(
        recordChanges(current.current, reconcileSections(proposal)),
      ),
    );
    undoStack.current.push(current.current);
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    setProject(next);
    setSaved(false);
    return next;
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
  function archivePreviousDraft() {
    if (!archivedDraft.current && boot.resume) {
      writeBrowserDraft(localStorage, PREVIOUS_DRAFT_KEY, boot.resume);
      archivedDraft.current = true;
      setPreviousDraft(boot.resume);
    }
  }
  useEffect(() => {
    if (!draftTouched.current) return;
    const timer = setTimeout(() => {
      try {
        archivePreviousDraft();
        writeBrowserDraft(localStorage, DRAFT_KEY, {
          project,
          revision: revision.current,
        });
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
    if (modal === "projects") setDraftRecoveries(recoverableDrafts());
  }, [modal]);
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
    if (!canLeaveWorkingDraft()) return;
    const previous = undoStack.current.pop();
    if (previous) {
      redoStack.current.push(current.current);
      draftTouched.current = true;
      setProject(retainConnectorLabelHistory(retainHingeLabelHistory(retainFastenerLabelHistory(retainPartLabelHistory(previous, current.current), current.current), current.current), current.current));
      setSaved(false);
      force((n) => n + 1);
      setSelected(null);
      setSelectedSectionId(null);
      setStage(null);
      setEntrancePick(null);
      setPickedEntrance(null);
      if (mode === "fastener") setMode("select");
    }
  };
  const redo = () => {
    if (!canLeaveWorkingDraft()) return;
    const next = redoStack.current.pop();
    if (next) {
      undoStack.current.push(current.current);
      draftTouched.current = true;
      setProject(retainConnectorLabelHistory(retainHingeLabelHistory(retainFastenerLabelHistory(retainPartLabelHistory(next, current.current), current.current), current.current), current.current));
      setSaved(false);
      force((n) => n + 1);
      setSelected(null);
      setSelectedSectionId(null);
      setStage(null);
      setEntrancePick(null);
      setPickedEntrance(null);
      if (mode === "fastener") setMode("select");
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // The mounted inspector owns its keyboard while focused. Its Escape handler
      // closes only the overlay, preserving measurement/tool state underneath.
      if (inspectorFocus.active.current) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        setModal(null);
        setMode("select");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        setTimeout(() => document.getElementById("save-project")?.click(), 0);
      }
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if ((e.metaKey || e.ctrlKey) && ["c","v","d"].includes(e.key.toLowerCase())) {
        const action=e.key.toLowerCase()==="c"?objectActions.current.copy:e.key.toLowerCase()==="v"?objectActions.current.paste:objectActions.current.duplicate;
        if(action&&!window.getSelection()?.toString()){e.preventDefault();action();}return;
      }
      if(e.altKey&&["ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();objectActions.current.nudge?.(e.key==="ArrowUp"?1:-1);return;}
      if(e.key.toLowerCase()==="l")setMode("lift");
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key.toLowerCase() === "v") {
        setMode("select");
        setSelectionScope("part");
        setSelectedSectionId(null);
      }
      if (e.key.toLowerCase() === "m") setMode("move");
      if (e.key.toLowerCase() === "r") setMode("rotate");
      if (e.key.toLowerCase() === "d") {
        setMode("measure");
        setStage(null);
        setExplode(false);
      }
      if (e.key.toLowerCase() === "c")
        document.querySelector<HTMLButtonElement>("[data-cut-part]")?.click();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const woodSupport = useMemo(() => reviewWoodSupport(project), [project]);
  const piece = project.pieces.find((p) => p.id === selected),
    selectedOffcut = piece?.offcut ? piece : null,
    offcutCount = project.pieces.filter((part) => part.offcut).length,
    currentStep =
      project.steps.find((s) => s.id === stepId) ?? project.steps[0],
    findings = useMemo(() => validate(project, woodSupport), [project, inventoryTick, woodSupport]),
    rows = useMemo(() => bom(project), [project, inventoryTick]),
    supplyPurchases = useMemo(
      () => supplyRows(project),
      [project, inventoryTick],
    );
  const cutSequences = useMemo(() => stockCutSequences(project, rows), [project, rows]);
  const snapshotExport = useMemo(
    () => modal === "export" ? storeSnapshotFile(project) : null,
    [modal, project, inventoryTick],
  );
  const pricing = useMemo(
    () => projectPricingCoverage(project, rows, supplyPurchases),
    [project, rows, supplyPurchases],
  );
  const glazingEstimate = useMemo(() => sunliteTakeoff(project), [project]);
  const glazingTape = useMemo(() => reviewSunliteTape(project, glazingEstimate), [project, glazingEstimate]);
  const bandingGuide = useMemo(() => reviewEdgeBanding(project), [project]);
  const shownBandingEdge = panel === "materials" && bandingMark?.project === project ? bandingMark.edge : null;
  const glazingThermal = useMemo(() => sunliteThermalReview(project), [project]);
  const glazingMounts = useMemo(() => reviewSunliteMounts(project), [project]);
  const roofBacking = useMemo(() => reviewSunliteRoofBacking(project), [project]);
  const printRoofBacking = roofBacking.flatMap(roofBackingGuideLines);
  const ventBacking = useMemo(() => reviewGreenhouseVentBacking(project), [project]);
  const printVentBacking = ventBacking.flatMap((review) => ventBackingGuideLines(project, review));
  const panelReviews = useMemo(() => reviewPanelBearing(project), [project]);
  const printPanelBearing = useMemo(() => panelBearingGuideLines(project, panelReviews, woodSupport), [project, panelReviews, woodSupport]);
  const printShelfSag = useMemo(() => shelfSagGuideLines(project, panelReviews), [project, panelReviews]);
  const sagPanel = useMemo(() => {
    if (panel !== "part" || !piece) return null;
    const known = panelReviews.find((row) => row.piece.id === piece.id);
    const row = known ?? (isHorizontalPanel(piece) ? reviewPanelBearing(project, undefined, piece.id).find((item) => item.piece.id === piece.id) : undefined);
    return row?.role === "shelf" || project.shelfSagPlans?.some(({ pieceId }) => pieceId === piece.id)
      ? { row, pieceId: piece.id } : null;
  }, [panel, piece, panelReviews, project]);
  const printWoodSupport = useMemo(() => woodSupportGuideLines(project, woodSupport), [project, woodSupport]);
  const roofBearing = useMemo(() => reviewGreenhouseRafterBearing(project), [project]);
  const printRafterBearing = rafterBearingGuideLines(project, roofBearing);
  const glazingProfiles = useMemo(() => reviewSunliteProfiles(project, glazingEstimate), [project, glazingEstimate]);
  const shownProfileRun = panel === "materials" ? glazingEstimate?.profileRuns.find((run) => run.id === shownProfileRunId) : undefined;
  function showGlazingRun(id: string | null) {
    setShownProfileRunId(id);
    if (!id) return;
    setBandingMark(null);
    setStage(null);
    setPlaying(false);
    setExplode(false);
    inspectWorkspace();
  }
  const rodBrackets = useMemo(() => rodBracketPurchases(project), [project]);
  const everbiltRodBrackets = useMemo(() => everbiltRodBracketPurchases(project), [project]);
  const rodFlanges = useMemo(() => rodFlangePurchases(project), [project]);
  const rodSockets = useMemo(() => rodSocketPurchases(project), [project]);
  const saunaSourcing = project.retailer === "home-depot" ? harviaKit : steel6;
  const saunaHeaterStock = useMemo(() => saunaHeaterPurchases(project, saunaSourcing.productId), [project, saunaSourcing]);
  const printSaunaHeater = useMemo(() => saunaHeaterGuideLines(project), [project]);
  const printSaunaVentilation = useMemo(() => saunaVentilationGuideLines(project), [project]);
  const printSaunaBench = useMemo(() => saunaBenchGuideLines(project), [project]);
  const printCaseworkTipUp = useMemo(() => caseworkTipUpGuideLines(project), [project]);
  const printSaunaBenchTravel = useMemo(() => saunaBenchTravelGuideLines(project), [project]);
  const printSaunaWalls = useMemo(() => saunaWallGuideLines(project), [project]);
  const printSaunaCeiling = useMemo(() => saunaCeilingGuideLines(project), [project]);
  const liningBackingLines = useMemo(() => saunaLiningGuideLines(project), [project]);
  const liningBackingContent = liningBackingLines.length > 0 && (
    <>
      <ul>{liningBackingLines.map((line) => <li key={line}>{line}</li>)}</ul>
      <p>{saunaLiningScope}</p>
      <p>{saunaLiningTools}</p>
      <ul>{saunaLiningSources.map(([name, url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{name}</a></li>)}</ul>
    </>
  );
  const eaveBlock = panel === "checks" && eaveBlockDraft?.project === project ? eaveBlockDraft.fit : null;
  const eaveBlockArea = useMemo(() => eaveBlock?.outlines.length ? {
    kind: "eave-block-preview" as const,
    outlines: eaveBlock.outlines,
    label: "fits" in eaveBlock
      ? `Eave block preview · ${eaveBlock.fits.length} fitted`
      : `Eave block preview · ${partLabel(project, eaveBlock.rafterId)}`,
    labelPoint: eaveBlock.point,
  } : undefined, [eaveBlock, project]);
  const shelfDivider = panel === "part" && shelfDividerDraft?.project === project && shelfDividerDraft.fit.shelfId === selected
    ? shelfDividerDraft.fit : null;
  const shelfDividerArea = useMemo(() => shelfDivider ? {
    kind: "shelf-divider-preview" as const,
    outlines: shelfDivider.outlines,
    label: "Center divider preview",
    labelPoint: shelfDivider.divider.position,
  } : undefined, [shelfDivider]);
  const areaFinding = panel === "checks" && shownAreaFinding?.project === project
    ? findings.find((finding) => finding.id === shownAreaFinding.id) : undefined;
  const supportTargets = useMemo(() => {
    if (areaFinding?.area?.kind !== "panel-floor-bearing" || areaFinding.severity !== "warning") return [];
    const row = panelReviews.find(({ piece }) => piece.id === areaFinding.pieceId);
    const floor = row && panelFloorBearing(row, woodSupport);
    return stationarySupportStops(project, floor?.stops ?? [], woodSupport);
  }, [areaFinding, panelReviews, project, woodSupport]);
  const supportBlock = supportTargets.length && supportBlockDraft?.project === project &&
    supportBlockDraft.fit.panelId === areaFinding?.pieceId ? supportBlockDraft.fit : null;
  const supportBlockArea = useMemo(() => supportBlock ? {
    kind: "support-block-preview" as const,
    outlines: supportBlock.outlines,
    label: supportBlock.motionConflicts.length ? "Support block · motion conflict" : "Support block preview",
    labelPoint: supportBlock.block.position,
    tone: supportBlock.motionConflicts.length ? undefined : "reference" as const,
  } : undefined, [supportBlock]);
  const shownCheckArea = shelfDividerArea ?? eaveBlockArea ?? supportBlockArea ?? areaFinding?.area;
  const activeGuidePart = panel === "step" && guidePartFocus?.project === project &&
    stage !== null && project.steps[stage]?.id === guidePartFocus.row.stepId && currentStep.id === guidePartFocus.row.stepId
    ? guidePartFocus : null;
  const workspaceReviewActive = travelPreviewActive || !!shownCheckArea || !!activeGuidePart;
  useEffect(() => {
    if (guidePartFocus?.project && guidePartFocus.project !== project) {
      setGuidePartFocus(null);
      setStage(null);
    }
  }, [project, guidePartFocus]);
  const shownSaunaHeater = useMemo(() =>
    panel === "sections" && shownSaunaHeaterId ? saunaHeaterReview(project, shownSaunaHeaterId) : null,
  [panel, project, shownSaunaHeaterId]);
  const shownSaunaVentilation = useMemo(() => {
    const plan = project.saunaVentilationPlans?.find((row) => row.roomId === shownSaunaVentilationId);
    return panel === "sections" && plan ? saunaVentilationReview(project, plan) : null;
  }, [panel, project, shownSaunaVentilationId]);
  const reviewScenarios = panel === "prep" || modal === "export" || printingGuide;
  const motionReviews = useMemo(
    () => projectMotionReviews(project, reviewScenarios),
    [project, reviewScenarios],
  );
  const reviewLids = hasOpeningLid &&
    (panel === "prep" || panel === "lid-travel" || modal === "export" || printingGuide);
  const lidTravelChecks = useMemo(
    () => reviewLids ? projectLidTravelChecks(project) : [],
    [project, reviewLids],
  );
  const printMotions = useMemo(() => motionReviewLines(project, motionReviews), [project, motionReviews]);
  const printGreenhouseLatch = useMemo(() => greenhouseLatchGuideLines(project), [project]);
  const printDoorStops = useMemo(() => greenhouseDoorStopGuideLines(project), [project]);
  const printDoorSeals = useMemo(() => greenhouseDoorSealGuideLines(project), [project]);
  const printRodFits = useMemo(() => rodFitGuideLines(project), [project]);
  const toolsReview = useMemo(
    () => toolChecklist(project, selectedToolsForProject(project).tools),
    [project],
  );
  const guideReady = guideIsCurrent(project);
  const connectionReview = useMemo(() => connectionCoverage(project), [project]);
  const woodJointDetails = useMemo(() => woodJointDecisionEntries(project), [project]);
  const sillGasketReview = useMemo(() => reviewSillGaskets(project), [project]);
  const openingFlashingReview = useMemo(() => reviewOpeningFlashings(project), [project]);
  const shownSillGasket = sillGasketReview.rows.find(({ plan }) => plan.partId === shownSillGasketId);
  const bearingReview = useMemo(() => bearingConnections(project, woodSupport, connectionReview), [project, woodSupport, connectionReview]);
  const needsWoodContacts = panel === "prep" || modal === "export" || printingGuide ||
    (panel === "connections" && !!liveConnectionContext?.scope.modeledContactList);
  const modeledContacts = useMemo(() => needsWoodContacts
    ? reviewModeledWoodContacts(project, connectionReview, bearingReview, woodJointDetails) : undefined,
  [project, connectionReview, bearingReview, woodJointDetails, needsWoodContacts]);
  const preparation = useMemo(() => buildPreparation(project, {
    stock: rows,
    supplies: supplyPurchases,
    sequences: cutSequences,
    connections: connectionReview,
    woodContacts: modeledContacts,
    findings,
    motions: motionReviews,
    lids: lidTravelChecks,
    handoff: project.retailer === "lowes" ? undefined : homeDepotShoppingList(project, rows, supplyPurchases),
  }).filter(({ id }) => guideReady || id !== "order"), [project, rows, supplyPurchases, cutSequences, connectionReview, modeledContacts, findings, motionReviews, lidTravelChecks, guideReady]);
  const selectedTreatment = panel === "part"
    ? preparation.find(({ id }) => id === "treated-wood")?.items.find(({ id }) => id === selected)
    : undefined;
  const activeRemovalContact = activeRemoval
    ? bearingReview.pairs.find(({ top, base }) => top.id === activeRemoval.topId && base.id === activeRemoval.baseId)
    : undefined;
  const printBearingConnections = useMemo(() => bearingConnectionGuideLines(project, bearingReview, connectionReview), [project, bearingReview, connectionReview]);
  const canReviewConnections = !!(connectionReview.parts.length || connectionReview.intents.length || bearingReview.withoutContact.length);
  const printRoofAttachments = useMemo(() => greenhouseRoofAttachmentLines(
    project, greenhouseRoofAttachments(project, connectionReview.intents, roofBearing),
  ), [project, connectionReview, roofBearing]);
  const shownFoundation = useMemo(() => shownFoundationId
    ? greenhouseFoundationReviews(project).find(({ site }) => site.entryId === shownFoundationId)
    : undefined, [project, shownFoundationId]);
  const printFoundations = useMemo(() => greenhouseFoundationGuide(project), [project]);
  const printBaseCorners = useMemo(() => greenhouseBaseGuideLines(
    project, greenhouseBaseConnections(project, connectionReview.intents),
  ), [project, connectionReview]);
  const printFloorBaseJoints = useMemo(() => floorBaseConnectionGuideLines(
    project, floorBaseConnections(project, connectionReview.intents),
  ), [project, connectionReview]);
  const printFloorHangers = useMemo(() => floorHangerGuideLines(project, connectionReview.intents), [project, connectionReview]);
  const guideExport = useMemo(() => {
    try {
      return {
        project: guideReady ? project : generateBuildGuide(project),
        error: null,
      };
    } catch (error) {
      return {
        project,
        error:
          error instanceof Error
            ? error.message
            : "The guide could not be generated.",
      };
    }
  }, [project, guideReady]);
  const exportGuide = guideExport.project;
  const printWaterSupport = useMemo(() => exportGuide.waterRuns?.length
    ? waterSupportGuideLines(waterSupportNetwork(exportGuide))
    : [], [exportGuide]);
  const printPreparation = useMemo(() => exportGuide === project ? preparation : [
    ...assemblyOrderPreparation(reviewAssemblyOrder(exportGuide)),
    ...preparation.filter(({ id }) => id !== "order"),
  ], [exportGuide, preparation, project]);
  const printStockReferences = useMemo(() => new Map(guideHomeDepotStock(exportGuide, rows).map(({ id, offer }) => [id, offer])), [exportGuide, rows]);
  function printPartLabels(source: Project, stepId?: string) {
    const labels = assemblyPartLabels(source).filter((row) => !stepId || row.stepId === stepId);
    if (!labels.length) return;
    setModal(null);
    setLabelPrint({ title: source.name, labels });
  }
  function locateGuidePart(row: AssemblyPartLabel) {
    const index = project.steps.findIndex((step) => step.id === row.stepId);
    if (index < 0) return;
    setGuidePartFocus({ project, row, isolated: true });
    setStepId(row.stepId);
    setStage(index);
    setPlaying(false); setExplode(false); setMode("select");
    setSelectionScope("part"); setSelected(null); setSelectedSectionId(null);
    inspectWorkspace();
  }
  function openPartStockPlan(id: string) {
    setStockPlanPartId(id);
    setModal("part-stock");
  }
  function openOffcutReleaseReview(id: string) {
    try {
      setOffcutReleasePreview({ plan: planOffcutRelease(current.current, id) });
    } catch (error) {
      setOffcutReleasePreview({
        error: error instanceof Error ? error.message : "This offcut assignment could not be reviewed.",
      });
    }
    setModal("offcut-release");
  }
  function saveStockCutLoss(layout: StockCutLayout) {
    safe(() => {
      change(saveTubeCutLoss(current.current, layout));
      notify(layout.tubeKerf === undefined
        ? "Stock cut order uses the modeled loss."
        : "Cutting loss saved for the build guide.");
    });
  }
  function applyWoodStockKerf(source: Project, next: Project) {
    safe(() => {
      if (current.current !== source)
        throw Error("The project changed. Preview the stock layout again before applying.");
      change(next);
      notify("Stock cut order and shopping quantities updated.");
    });
  }
  function recordStockUnits(layouts: StockCutLayout[], onHand: boolean) {
    safe(() => {
      const recorded = recordStockCutLayouts(current.current, layouts, onHand);
      change(recorded.project);
      const units = layouts.length === 1 ? "Stock unit recorded." : `${layouts.length} stock units recorded.`;
      notify(recorded.offcuts
        ? `${units} ${recorded.offcuts} ${recorded.offcuts === 1 ? "offcut added" : "offcuts added"} to the Cut pool.`
        : units);
    });
  }
  function recordStockUnit(layout: StockCutLayout, onHand: boolean) {
    recordStockUnits([layout], onHand);
  }
  function markStockOnHand(sourceId: string, onHand: boolean) {
    safe(() => change((p) => setCutSourceOnHand(p, sourceId, onHand)));
  }
  function completeStockCuts(sourceId: string) {
    safe(() => {
      change((p) => completePlannedCutSource(p, sourceId));
      notify("Cuts marked complete. The stock is on hand and the offcuts are ready to reuse.");
    });
  }
  function releaseStockCuts(sourceId: string) {
    safe(() => {
      change((p) => releasePlannedCutSources(p, [sourceId]).project);
      notify("Uncut stock plan released. Parts can use a new cut layout.");
    });
  }
  const printCutSequences = useMemo(
    () => exportGuide === project ? cutSequences : stockCutSequences(exportGuide, bom(exportGuide)),
    [cutSequences, exportGuide, project],
  );
  const lidSiteSchedule = useMemo(() => lidSiteGuideRows(exportGuide), [exportGuide]);
  const lidWeightSchedule = useMemo(() => lidWeightGuideRows(exportGuide), [exportGuide]);
  const lidStayFitSchedule = useMemo(() => lidStayFitGuideRows(exportGuide), [exportGuide]);
  const exportConnectionReview = useMemo(() => connectionCoverage(exportGuide), [exportGuide]);
  const exportWoodJointDetails = useMemo(() => woodJointDecisionEntries(exportGuide), [exportGuide]);
  const printTrimBacking = useMemo(() => trimBackerRodCutPlan(exportGuide, exportWoodJointDetails), [exportGuide, exportWoodJointDetails]);
  const printSillGaskets = useMemo(() => sillGasketGuideLines(reviewSillGaskets(exportGuide)), [exportGuide]);
  const printOpeningFlashing = useMemo(() => openingFlashingGuideLines(reviewOpeningFlashings(exportGuide)), [exportGuide]);
  const printWindowWalls = useMemo(() => reviewGeneratedWindowWalls(exportGuide), [exportGuide]);
  const printCutSources = useMemo(
    () => inspectCutStock(exportGuide),
    [exportGuide],
  );
  const printOffcutCuts = useMemo(
    () => offcutCutRows(exportGuide, printCutSources),
    [exportGuide, printCutSources],
  );
  const currentCutSources = useMemo(() => inspectCutStock(project), [project]);
  const focusedGuidePiece = activeGuidePart && project.pieces.find(({ id }) => id === activeGuidePart.row.pieceId);
  const stockPlanPiece = modal === "part-stock" && project.pieces.find(({ id }) => id === stockPlanPartId);
  const sourceIdsByMaterial = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const [sourceId, pieces] of currentCutSources.groups) {
      const id = pieces[0]?.material;
      if (id) grouped.set(id, [...(grouped.get(id) ?? []), sourceId]);
    }
    return grouped;
  }, [currentCutSources]);
  const recordedSourceMarkdown = useMemo(() => {
    const sources = [...printCutSources.groups.keys()];
    return sources.length
      ? "\n\n## Recorded cut-source layouts\n\nSaved blank regions and offcuts share their original physical source. These coordinates do not reconstruct a chronological cutting sequence.\n\n" +
        sources.map((sourceId) => cutStockLayoutMarkdown(exportGuide, sourceId, printCutSources)).join("\n\n")
      : "";
  }, [exportGuide, printCutSources]);
  const printCuts = (x: Piece) =>
    material(x.material).cuttable || pieceThroughOpenings(x).length
      ? cutInstructionsText(
          cutInstructions(x, {
            kerf: pieceCutKerf(x),
            lineageStatus:
              x.cutStock && printCutSources.valid.has(x.cutStock.id)
                ? "validated"
                : "unverified",
          }),
        )
      : "";
  function generateGuide() {
    safe(() => {
      const next = generateBuildGuide(project);
      change(next);
      setStepId(next.steps[0].id);
      setStage(null);
      setPanel("step");
      notify(
        "Build guide generated from your layout. Review the inferred assembly order.",
      );
    });
  }
  const preview = useMemo(() => {
    if (!proposal) return null;
    try {
      if (proposal.command.doorOpening) {
        const door = previewDoorway(project, proposal.command, proposal.targetSectionId, proposal.reuseWindowOffcuts);
        return { impact: door.impact, error: door.blockers.length ? `The doorway intersects ${door.blockers.slice(0, 3).join(", ")}.` :
          door.impact.wallCuts.some(({ oversize }) => oversize > 0) ? "Some doorway cuts exceed the selected framing stock." : null };
      }
      return {
        impact: previewSectionCommand(
          project,
          proposal.command,
          proposal.targetSectionId,
          proposal.reuseWindowOffcuts,
        ),
        error: null,
      };
    } catch (e) {
      return {
        impact: null,
        error: e instanceof ZodError ? e.issues[0]?.message ?? "Invalid proposal"
          : e instanceof Error ? e.message : "Invalid proposal",
      };
    }
  }, [proposal, project]);
  const plannedPinPurchases = useMemo(
    () => attachmentPurchaseSummaries(project),
    [project],
  );
  const plannedFastenerPurchases = useMemo(() => fastenerPurchaseSummary(project), [project]);
  const plannedConnectorPurchases = useMemo(() => connectorPurchaseSummary(project), [project]);
  const plannedRestraintPurchases = useMemo(
    () => restraintPurchaseSummary(project),
    [project],
  );
  const warnings = findings.filter((f) => f.severity !== "info"),
    completed = project.steps.filter((s) => s.complete).length;
  const activeStepId = currentStep.id;
  const activeStepOrder = preparation.find(({ id }) => id === "order")?.items.find(({ id }) => id === activeStepId);
  const baseName =
    project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
    "yardwork-project";
  const updatePart = (patch: Partial<Piece>) => safe(() => {
    if(!piece)return;
    const candidate={...piece,...patch};
    if (patch.size) {
      const problem = throughOpeningProblem(candidate.size, pieceThroughOpenings(candidate));
      if (problem) throw Error(problem);
    }
    if(!candidate.offcut&&(patch.position||patch.rotation||patch.size)) {
      const axes=patch.position?[0,1,2].filter((i)=>Math.abs(patch.position![i]-piece.position[i])>1e-7):[];
      const clear=placeWood(current.current,candidate,candidate.position,candidate.rotation,axes.length===1?axes[0] as 0|1|2:undefined);
      if(clear.blocked)throw Error("This position overlaps wood. Choose an open position.");
      candidate.position=clear.position;
      if(clear.adjusted)notify("Adjusted to a clear face; solid wood cannot overlap.");
    }
    change((p)=>({...p,pieces:p.pieces.map((x)=>x.id===piece.id?candidate:x)}));
  });
  function move(id: string, position: V3, rotation: V3, previewed = false) {
    safe(() => {
      const p = current.current.pieces.find((p) => p.id === id);
      if (!p) return;
      const requestedAxes=[0,1,2].filter((i)=>Math.abs(position[i]-p.position[i])>1e-7);
      if (snap && !previewed && requestedAxes.length !== 1)
        position = snapPlacement(
          current.current,
          p,
          position,
          rotation,
        ).position;
      const clear=placeWood(current.current,p,position,rotation,requestedAxes.length===1?requestedAxes[0] as 0|1|2:undefined);
      if(clear.blocked)throw Error("This move is blocked by solid wood.");
      position=clear.position;
      if (position.every((value, axis) => Math.abs(value - p.position[axis]) < 1e-7) &&
          rotation.every((value, axis) => Math.abs(value - p.rotation[axis]) < 1e-7)) return;
      change((pr) => ({
        ...pr,
        pieces: pr.pieces.map((x) =>
          x.id === id ? { ...x, position, rotation } : x,
        ),
      }));
    });
  }
  function rotatePart(delta: V3) {
    if (!piece) return;
    const rotation = composeRotation(delta, piece.rotation),
      position = [...piece.position] as V3;
    const wasGrounded = Math.abs(bounds(piece).min[1]) < 0.8;
    if (wasGrounded)
      position[1] -= bounds({ ...piece, position, rotation }).min[1];
    move(piece.id, position, rotation);
  }
  function selectSection(id: string | null) {
    setSelectedSectionId(id);
    setSelected(null);
    setPanel("sections");
    setSelectionScope("section");
    setStage(null);
  }
  function configureBase(targetId?: string) {
    const existing = project.sections.find((s) => s.id === targetId)?.generator;
    const command: SectionCommand = existing?.type === "foundation"
      ? existing
      : { type: "foundation", width: 72, depth: 48, height: 48, spacing: 16 };
    setProposal({
      command: !existing && project.retailer === "home-depot"
        ? { ...command, baseStock: fittingBaseBoards(command) }
        : command,
      targetSectionId: targetId,
      provider: "Local base template",
      message: "Review the site, supports and connections for this layout.",
    });
    setModal("base");
  }
  function reviseSection(id: string) {
    const section = current.current.sections.find((s) => s.id === id);
    if (!section?.generator) return;
    if (section.generator.type === "foundation") {
      configureBase(id);
      return;
    }
    setAssistantTarget(id);
    setPrompt(
      section.generator.type === "wall"
        ? `Make this wall ${section.generator.width} inches wide and ${section.generator.height} inches tall, ${section.generator.spacing} inches on center`
        : `Make this base ${section.generator.width} inches wide and ${section.generator.depth} inches deep, ${section.generator.spacing} inches on center`,
    );
    setProposal(null);
    setModal("assistant");
  }
  function configureWindowWall(command?: Command) {
    setAssistantTarget("");
    setPrompt(windowWallExample);
    const dimensions: Command = command ?? {
      type: "wall", width: 96, height: 96, depth: 48, spacing: 16,
      windowOpening: { width: 36, height: 48, sill: 32 },
    };
    setProposal({
      command: suggestWindowWallStock(dimensions),
      provider: "Window wall template",
      message: "Review the rough opening and cuts before adding the wall.",
    });
    setModal("assistant");
  }
  function suggestWindowWallStock(command: Command, retainedStock?: SectionCommand["wallStock"]): Command {
    if (!command.windowOpening || command.windowOpening.stock) return command;
    if (retainedStock) return { ...command, windowOpening: { ...command.windowOpening, stock: retainedStock } };
    if (project.retailer !== "home-depot") return command;
    const length = Math.max(command.width, command.height - 3);
    const { stud, stud10, stud12 } = homeDepotFraming;
    const stock = [stud, stud10, stud12].find(({ stockSize }) => stockSize[1] >= length) ?? stud12;
    return { ...command, windowOpening: { ...command.windowOpening, stock: stock.materialId } };
  }
  function select(id: string) {
    if (!id) {
      setSelectedSectionId(null);
      setSelected(null);
      return;
    }
    if (selectionScope === "section" && mode !== "screw") {
      const section = current.current.sections.find((s) =>
        s.pieceIds.includes(id),
      );
      if (section) selectSection(section.id);
      else
        notify(
          "This part is ungrouped. Use Sections to group its assembly first.",
        );
      return;
    }
    setSelectedSectionId(null);
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
            hardware === "nail" || material(hardware).fastenerType === "nail"
              ? "nail"
              : hardware === "bracket"
                ? "bracket"
                : "screw",
            hardware,
          ),
        );
        notify(`Connection recorded: ${screws} × ${material(hardware).name}`);
      });
      return;
    }
    setSelected(id);
    setPanel("part");
  }
  function add(id: MaterialId, position: V3 = [0, 0, 0]) {
    safe(() => {
      const next = addMaterial(project, id, position, activeStepId);
      const added = next.pieces.at(-1)!;
      // Repeated + additions form an adjacent row rather than occupying the same volume.
      if (arguments.length < 2 && project.pieces.some((p) => !p.offcut)) {
        const right = Math.max(
          ...project.pieces
            .filter((p) => !p.offcut)
            .map((p) => bounds(p).max[0]),
        );
        added.position[0] = right + added.size[0] / 2;
      }
      if (snap)
        added.position = snapPlacement(
          next,
          added,
          added.position,
          added.rotation,
        ).position;
      const clear=placeWood(next,added,added.position,added.rotation);
      if(clear.blocked)throw Error("No clear position was found for this stock.");
      added.position=clear.position;
      change(next);
      setSelectionScope("part");
      setSelectedSectionId(null);
      setSelected(next.pieces.at(-1)!.id);
      setPanel("part");
      setMode("select");
      setStage(null);
      notify(
        `${material(id).name} added. Drag to move, or Shift-drag to rotate.`,
      );
    });
  }
  function replace(p: Project, rev = 0) {
    if (!canLeaveWorkingDraft()) return false;
    p = ensurePartLabels(projectSchema.parse(p));
    if (p.id !== current.current.id && draftTouched.current) {
      // Keep the draft being left, including edits waiting for the autosave timer.
      const previous = { project: current.current, revision: revision.current };
      try {
        writeBrowserDraft(localStorage, PREVIOUS_DRAFT_KEY, previous);
        archivedDraft.current = true;
        setPreviousDraft(previous);
      } catch {
        notify(
          "Browser storage is full. Save or export this draft before opening another project.",
          true,
        );
        return false;
      }
    }
    setMeasurement({ a: null, b: null });
    setSelectedAttachmentPlanId(null);
    setMode("select");
    draftTouched.current = true;
    revision.current = rev;
    undoStack.current = [];
    redoStack.current = [];
    setProject(p);
    setStepId(p.steps[0].id);
    setSelected(null);
    setSelectedSectionId(null);
    setAssistantTarget("");
    setSelectionScope("part");
    setStage(null);
    setSaved(rev > 0);
    setModal(null);
    setView((v) => ({ preset: "iso", nonce: v.nonce + 1 }));
    return true;
  }
  async function save() {
    if (!canLeaveWorkingDraft()) return;
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
      if (current.current.id !== snapshot.id) {
        notify(`Saved ${snapshot.name} to the project library.`);
        return;
      }
      revision.current = record.revision;
      setSaved(current.current === snapshot);
      const savedDraft =
        current.current === snapshot
          ? projectSchema.parse(record.project)
          : current.current;
      if (current.current === snapshot) setProject(savedDraft);
      try {
        archivePreviousDraft();
        writeBrowserDraft(localStorage, DRAFT_KEY, {
          project: savedDraft,
          revision: revision.current,
        });
      } catch {}
      notify(browserWorkshop ? "Saved to this browser’s project library" : "Saved to your self-hosted project library");
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
  async function downloadLibraryFile(url: string, name: string) {
    try {
      const response = await workshopRequest(url);
      if (!response.ok) throw Error((await response.json()).error);
      const file = await response.blob();
      download(name, file, file.type);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The library file could not be downloaded.", true);
    }
  }
  async function openEarlierSave(id: string, number: number) {
    earlierSaveRequest.current?.abort();
    const controller = new AbortController();
    earlierSaveRequest.current = controller;
    const previousId = current.current.id;
    try {
      const data = await api(`/api/projects/${id}/revisions/${number}`, { signal: controller.signal });
      if (controller.signal.aborted || current.current.id !== previousId) return;
      if (data.revision !== number || data.project?.id !== id)
        throw Error("The earlier save did not match this project and revision.");
      const copy = copySavedRevision(projectSchema.parse(data.project), number);
      if (replace(copy)) notify("Earlier save opened as a new project copy.");
    } catch (error) {
      if (!controller.signal.aborted)
        notify(error instanceof Error ? error.message : "The earlier save could not be opened.", true);
    } finally {
      if (earlierSaveRequest.current === controller) earlierSaveRequest.current = null;
    }
  }
  async function generate() {
    setBusy(true);
    setProposal(null);
    try {
      const p = await api("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          context: project.sections.find((s) => s.id === assistantTarget)
            ? sectionContext(
                project.sections.find((s) => s.id === assistantTarget)!,
              )
            : undefined,
        }),
      });
      if ((p.targetSectionId ?? "") !== assistantTarget)
        throw Error("The proposal target changed. Preview it again.");
      const command = commandSchema.parse(p.command);
      const target = project.sections.find((s) => s.id === assistantTarget);
      if (target?.generator && target.generator.type !== command.type)
        throw Error("A targeted proposal must preserve the section type.");
      const baseStock = command.type === "foundation"
        ? target?.generator?.baseStock ??
          (!target && project.retailer === "home-depot" ? fittingBaseBoards(command) : undefined)
        : undefined;
      setProposal({ ...p, command: baseStock ? { ...command, baseStock } : suggestWindowWallStock(command, target?.generator?.wallStock) });
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function saveDrawingReference(drawing: DrawingReference) {
    change((current) => ({ ...current, drawingReference: drawing }));
    setModal(null);
    if (drawing.calibration.visible) {
      setMode("select");
      setView((previous) => ({ preset: "drawing", nonce: previous.nonce + 1 }));
    }
    notify("Drawing reference saved in this project.");
  }
  function removeDrawingReference() {
    change((current) => ({ ...current, drawingReference: undefined }));
    setModal(null);
    if (readingOutline && outlineTrace?.source === "pdf") setMode("select");
    if (view.preset === "drawing") setView((previous) => ({ preset: "top", nonce: previous.nonce + 1 }));
    notify("Drawing reference removed. Undo is available.");
  }
  function startWallTrace(kind: "wall" | "outline" = "wall") {
    if (!canLeaveWorkingDraft()) return;
    setPanel("sections");
    setStage(null);
    setPlaying(false);
    setExplode(false);
    setSelected(null);
    setSelectedSectionId(null);
    setSelectionScope("part");
    setMode("trace-wall");
    setWallTrace(emptyWallTrace());
    const source = hasPdfLines && (project.drawingReference?.calibration.visible || !hasDxfLines) ? "pdf" : "dxf";
    setOutlineTrace(kind === "outline" ? { index: -1, face: "center", source } : null);
    setView(({ nonce }) => ({ preset: kind === "outline" ? source === "pdf" ? "drawing" : "plan"
      : project.drawingReference?.calibration.visible ? "drawing" : project.planLines.length ? "plan" : "top", nonce: nonce + 1 }));
    inspectWorkspace();
  }
  function pickWallTracePoint([x, , z]: V3) {
    if (outlineTrace) {
      const index = outlineAtPoint(planOutlines.entries, [x, z]);
      if (index >= 0) setOutlineTrace({ ...outlineTrace, index });
      return;
    }
    const point = snapWallTracePoint([x, z], project.drawingReference?.calibration.visible && hasPdfLines ? pdfPlanLines : project.planLines, snap);
    const completePoint = (value: WallTracePoint | null) => value?.every(Number.isFinite);
    setWallTrace((previous) => !completePoint(previous.a) || completePoint(previous.b)
      ? { ...previous, a: point, b: null }
      : { ...previous, b: point });
  }
  function addTracedWall() {
    safe(() => {
      const preview = wallTraceReview.value;
      if (!preview || preview.obstructions.length || preview.hasInternalOverlap || preview.row?.oversize) return;
      if (current.current !== project) throw Error("The project changed. Review the wall preview again.");
      const next = change(preview.candidate);
      const first = next.sections[project.sections.length];
      setSelectedSectionId(first.id);
      setSelectionScope("section");
      setStepId(preview.added[0].stepId);
      setMode("select");
      const description = outlineTrace ? `${preview.runLengths.length} room walls` : preview.lengths.length === 1 ? "one wall panel" : `${preview.lengths.length} wall panels`;
      notify(`Added ${description}. The guide and cut list are ready to review.`);
    });
  }

  async function importFile(f: File) {
    const targetId = current.current.id;
    try {
      if (f.size > 4 * 1024 * 1024)
        throw Error("Use a file smaller than 4 MB.");
      const text = await f.text();
      if (importKind === "project") {
        const p = projectSchema.parse(JSON.parse(text));
        const clone = {
          ...rekeyGuidePlacements(p, uid()),
          name: `${p.name.slice(0, 108)} · imported`,
        };
        replace(clone);
        notify("Plan imported as a new project");
      } else if (importKind === "inventory") {
        const target = current.current;
        if (target.id !== targetId) throw Error("The project changed while reading the snapshot file. Import it again.");
        const imported = mergeStoreSnapshots(target, readStoreSnapshotFile(text));
        if (imported.changed) change(imported.project);
        setModal(null);
        notify(
          `${imported.changed} store ${imported.changed === 1 ? "snapshot" : "snapshots"} imported.${imported.skipped ? ` Skipped ${imported.skipped} duplicate or older rows.` : ""}`,
        );
      } else {
        const lines = parseDxf(text, dxfScale);
        change((p) => ({ ...p, planLines: lines }));
        setModal(null);
        setView((v) => ({ preset: "plan", nonce: v.nonce + 1 }));
        notify(
          `${lines.length} DXF reference lines imported.`,
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
        throw Error(
          "Enter an exact store number for the selected retailer first.",
        );
      const entries = parseInventory(
        JSON.stringify(
          await api(
            `/api/catalog?zip=${project.zip}&store=${encodeURIComponent(project.store)}&retailer=${project.retailer ?? "home-depot"}`,
          ),
        ),
      );
      const target = current.current;
      if (target.id !== project.id) throw Error("The project changed during the store refresh.");
      const imported = mergeStoreSnapshots(target, { materials: entries });
      if (imported.changed) change(imported.project);
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
    const point = surfacePlacement(
      project,
      ray.ray.origin.toArray().map((v) => v * 12) as V3,
      ray.ray.direction.toArray() as V3,
    );
    if (point) {
      const round = (v: number) => (snap ? Math.round(v) : v);
      add(id, [round(point[0]), point[1], round(point[2])]);
    }
  }
  function copySelection() {
    objectClipboard.current=copyObjects(current.current,selected,selectedSectionId);
    if(objectClipboard.current){setHasObjectClipboard(true);notify(`Copied ${objectClipboard.current.pieces.length} part(s). Paste creates independent parts; source allocations and connection plans stay with the originals.`);}
  }
  function pasteSelection(snapshot=objectClipboard.current) {
    if(!snapshot||!canLeaveWorkingDraft())return;
    safe(()=>{const result=pasteObjects(current.current,snapshot,activeStepId);change(result.project);setSelected(result.sectionId?null:result.pieceId);setSelectedSectionId(result.sectionId);setSelectionScope(result.sectionId?"section":"part");setPanel(result.sectionId?"sections":"part");setMode("move");setStage(null);});
  }
  const clonePiece=()=>pasteSelection(copyObjects(current.current,selected,selectedSectionId));
  function moveWholeSection(id: string, origin: V3, rotation: V3) {
    const project = current.current;
    const section = project.sections.find((row) => row.id === id);
    if (!section) return;
    const candidate = transformSection(project, id, origin, rotation);
    const ids = new Set(section.pieceIds);
    const clear = separateWood(candidate, candidate.pieces.filter((part) => ids.has(part.id)));
    if (clear.blocked) throw Error("This section cannot overlap the existing wood.");
    const position = origin.map((value, i) => value + clear.offset[i]) as V3;
    if (position.every((value, i) => Math.abs(value - section.origin[i]) < 1e-7) &&
      rotation.every((value, i) => Math.abs(value - section.rotation[i]) < 1e-7)) return;
    change(clear.adjusted ? transformSection(project, id, position, rotation) : candidate);
  }
  function nudgeSelection(direction:number) {
    if(!canLeaveWorkingDraft())return;
    if (piece) {
      const position = [...piece.position] as V3;
      position[1] += direction * moveIncrement;
      const placed = createWoodSlide(current.current, piece)?.(position);
      if (placed) {
        move(piece.id, placed.position, piece.rotation, true);
        if (placed.stop) notify(woodSlideStopLabel(current.current, placed.stop));
      } else updatePart({ position });
    }
    else if (selectedSectionId) safe(() => {
      const active = current.current;
      const section = active.sections.find((row) => row.id === selectedSectionId);
      if (!section) return;
      const target: V3 = [section.origin[0], section.origin[1] + direction * moveIncrement, section.origin[2]];
      const ids = new Set(section.pieceIds);
      const placed = createWoodGroupSlide(active, active.pieces.filter((part) => ids.has(part.id)), section.origin)?.(target);
      moveWholeSection(section.id, placed?.position ?? target, section.rotation);
      if (placed?.stop) notify(woodSlideStopLabel(active, placed.stop));
    });
  }
  function inspectStock(id:string){setSelectionScope("part");setSelectedSectionId(null);setSelected(id);setPanel("part");inspectWorkspace();}
  function reuseOffcut(id:string){safe(()=>{const old=current.current.pieces.find((p)=>p.id===id&&p.offcut);if(!old)return;const candidate={...old,offcut:false,name:old.name.replace(/^Offcut · /,"Reused · ")};const clear=placeWood(current.current,candidate,candidate.position);if(clear.blocked)throw Error("Choose a clear position for this offcut.");candidate.position=clear.position;change((p)=>({...p,pieces:p.pieces.map((row)=>row.id===id?candidate:row)}));inspectStock(id);notify("Offcut reused. Its original stock source is preserved.");});}
  objectActions.current={copy:copySelection,paste:()=>pasteSelection(),duplicate:clonePiece,nudge:nudgeSelection};
  const movementTools=<ObjectMovement onMove={()=>setMode("move")} onLift={()=>setMode("lift")} onNudge={nudgeSelection} onCopy={copySelection} onPaste={()=>pasteSelection()} onDuplicate={clonePiece} hasClipboard={hasObjectClipboard} increment={moveIncrement} onIncrement={setMoveIncrement} bottom={piece?bounds(piece).min[1]:undefined} lifting={mode==="lift"}/>;
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
    <div className={`app-shell${labelPrint ? " printing-part-labels" : ""}`}>
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
          <button
            className="button secondary open-projects"
            onClick={openProjects}
          >
            <FolderOpen size={15} />
            Open project
          </button>
          {hasObjectClipboard&&<button className="button secondary" onClick={()=>pasteSelection()}>Paste object</button>}
          <span className={`save-state ${saved && !connectorDraftDirty && !fittedDraftDirty ? "saved" : ""}`}>
            <span />
            {connectorDraftDirty ? "Connector draft" : fittedDraftDirty ? "Fitted-stock draft" : saved ? "Saved to library" : "Browser draft"}
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
          <button className={library === "cuts" ? "active" : ""} onClick={() => setLibrary("cuts")}><Scissors size={14}/>Cut pool ({offcutCount})</button>
        </div>
        {library === "cuts" ? <CutPool project={project} onInspect={inspectStock} onReuse={reuseOffcut}
          onAdd={() => setModal("measured-offcut")}
          onReviewReuse={() => safe(() => {
            const plan = planOffcutReuse(current.current);
            setOffcutReusePlan(plan);
            setModal("offcut-reuse");
          })} /> : library === "parts" ? (
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
              {[
                "All",
                "Lumber",
                "Panels",
                "Roof & wire",
                "Fasteners",
                "Brackets",
                "Rods",
              ].map((c) => (
                <button
                  key={c}
                  className={filter === c ? "active" : ""}
                  onClick={() => setFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <MaterialLibrary category={filter} search={search} onAdd={add} />
            <div className="drag-hint">
              <MousePointer2 size={15} />
              <span>
                Drag a material onto the ground.
                <br />
                Add as many design parts as you need; stock is checked
                separately.
              </span>
            </div>
          </>
        ) : (
          <div className="assembly-list">
            <button
              className="assembly-card"
              onClick={() => {
                setAssistantTarget("");
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
                Width, height, spacing, and optional window opening.
                <br />
                Every board stays editable.
              </small>
              <span>
                Configure wall <ArrowRight size={14} />
              </span>
            </button>
            <button
              className="assembly-card"
              onClick={() => configureBase()}
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
            <button
              className="button secondary full"
              onClick={() => setModal("studies")}
            >
              <Layers3 size={16} />
              Explore whole builds
            </button>
            <button className="text-button" onClick={() => setModal("new")}>
              <Plus size={15} />
              Start a new project
            </button>
          </div>
        )}
        <div className="store-card">
          <div className="store-logo">
            {project.retailer === "lowes" ? "L" : "HD"}
          </div>
          <div>
            <strong>{retailerName(project.retailer)} sourcing</strong>
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
            <p>Big ideas start with the first piece.</p>
          </div>
          <div className="design-actions">
            <button
              className="button secondary zone-button"
              onClick={() => setModal("zone")}
            >
              <Ruler size={14} />
              {project.workZone
                ? `${format(project.workZone.width)} W × ${format(project.workZone.depth)} D × ${format(project.workZone.height)} H`
                : "Set work zone"}
            </button>
            <button className="button ai-button" onClick={() => openIdea()}>
              <Sparkles size={16} />
              Plan an idea
            </button>
          </div>
        </div>
          {activeFastenerLayoutPreview && (
            <div className="lid-preview-banner" data-testid="layout-preview-banner">
              <span>
                {centeredEntryPreview
                  ? "Centered entry preview · direction only"
                  : contactRowPreview
                  ? `Screw row preview · ${activeFastenerLayoutPreview.candidateIds.length} marks`
                  : `Layout preview · ${activeFastenerLayoutPreview.candidateIds.length} new positions · ${activeFastenerLayoutPreview.selectedCandidateIds.length} selected`}
              </span>
              <button type="button" onClick={() => {
                inspectorFocus.expand();
                const section = centeredEntryPreview ? ".fastener-centered-preview" : contactRowPreview ? ".fastener-strip-preview" : ".fastener-layout-panel";
                requestAnimationFrame(() => document.querySelector(section)?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}>
                {centeredEntryPreview ? "Return to entry preview" : contactRowPreview ? "Return to screw row" : "Return to layout"}
              </button>
            </div>
          )}
          {activeConnectorPreview && <div className="lid-preview-banner" data-testid="connector-preview-banner">
            <span>{activeConnectorPreview.plan.label} draft · entered wood paths · connector fit pending</span>
            <button type="button" onClick={() => { inspectorFocus.expand(); requestAnimationFrame(() => document.querySelector(".connectors-panel")?.scrollIntoView({behavior:"smooth",block:"start"})); }}>Return to connector plan</button>
          </div>}
          {panel === "fit-stock" && <div className="lid-preview-banner" data-testid="fitted-stock-preview-banner">
            <span>{fittedFacePick ? `Pick ${fittedFacePick.which} face on ${partLabel(project, fittedFacePick.pieceId)}` : activeFittedPreview ? `Fitted-stock preview · ${formatPreciseInches(activeFittedPreview.cutLength)} cut · not added` : "Fit stock between actual faces"}</span>
            <button type="button" onClick={() => {
              inspectorFocus.expand();
              requestAnimationFrame(() => {
                const target = document.querySelector<HTMLElement>(".fitted-stock-results") ?? document.querySelector<HTMLElement>(".fitted-stock-panel");
                target?.focus({preventScroll:true});
                target?.scrollIntoView({behavior:"smooth",block:"start"});
              });
            }}>Return to fitted stock</button>
          </div>}
          {(showOffcuts || selectedOffcut) && !workspaceReviewActive && !["fit-stock","fasteners","connectors","hinges","attachments","restraints"].includes(panel) && <div className="lid-preview-banner" data-testid="offcut-view-status">
            <span>{showOffcuts ? `${offcutCount} offcut stock records visible` : `Inspecting ${partLabel(project, selectedOffcut!.id)} · offcut stock`}</span>
            <button type="button" onClick={() => {
              setShowOffcuts(false);
              if (selectedOffcut) select(assemblyPartForOffcut(project, selectedOffcut.id) ?? "");
              setView((previous) => ({...previous,nonce:previous.nonce + 1}));
            }}>Back to assembly</button>
          </div>}
          {activeLidPreview && (
            <div className={`lid-preview-banner${activeLidPreview.focusPair ? " motion-pair-banner" : ""}`} role="status">
              <span data-testid="lid-preview-label" data-lid-id={activeLidPreview.piece.id} data-angle={activeLidPreview.angle} data-position={JSON.stringify(activeLidPreview.piece.position)} data-rotation={JSON.stringify(activeLidPreview.piece.rotation)} data-stay-arms={activeLidPreview.stayLinks?.reduce((n, link) => n + (link.arms?.length ?? 0), 0)}>
                Lid travel preview · {lidSiteAngle(activeLidPreview.angle)}
                {activeLidPreview.siteFaceHits?.length ? activeLidPreview.atLimit ? " · Reached measured clearance limit" : " · lid clearance shortfall" : ""}
                {activeLidPreview.interferenceIds?.length
                  ? activeLidPreview.envelopeOnly
                    ? " · Possible contact · Part envelope in red"
                    : activeLidPreview.atLimit ? " · Contact ahead · Parts in red" : ` · ${activeLidPreview.interferenceIds.length} overlapping part(s) in red`
                  : ""}
                {activeLidPreview.stayArmHitIds?.length
                  ? activeLidPreview.stayArmContactAhead ? " · Stay arm contact ahead" : " · Stay arm overlap in red"
                  : ""}
                {activeLidPreview.outsideZoneFaces?.length ? ` · ${activeLidPreview.atLimit ? "Reached" : "outside"} ${activeLidPreview.outsideZoneFaces.join(", ")}${activeLidPreview.atLimit ? " work-zone limit" : ""}` : ""}
                {activeLidPreview.focusPair && ` · Focused on ${activeLidPreview.focusPair.map((id) => partLabel(project, id)).join(" and ")}`}
              </span>
              {activeLidPreview.focusPair && (
                <button type="button" onClick={() => setLidMotionPreview({ project, value: { ...activeLidPreview, focusPair: undefined } })}>
                  Show full project
                </button>
              )}
              {activeLidPreview.focusPair && (
                <button type="button" onClick={() => editClearanceObstruction(activeLidPreview.focusPair![1], {
                  kind: "lid", sectionId: activeLidPreview.sectionId,
                })}>
                  Edit obstruction
                </button>
              )}
              {(panel === "lid-travel" || panel === "hinges" || panel === "sections") && (
                <button type="button" onClick={() => inspectorFocus.expand()}>Return to lid controls</button>
              )}
              <button className="button" onClick={() => setLidMotionPreview(null)}>Exit preview</button>
            </div>
          )}
          {activeDriverPreview && (
            <div className="lid-preview-banner">
              <span>{activeDriverPreview.label} · {activeDriverPreview.detail}</span>
              <button type="button" className="button" onClick={() => setDriverPreview(null)}>Hide driver approach</button>
            </div>
          )}
          {shownDryerDuct && (
            <div className="lid-preview-banner">
              <span>Dryer duct layout · straight-run envelopes</span>
              <button type="button" onClick={() => inspectorFocus.expand()}>Return to duct layout</button>
              <button type="button" onClick={() => setDryerDuctProjectId(null)}>Hide dryer duct layout</button>
            </div>
          )}
          {activeMotionPreview && (
            <div className={`lid-preview-banner${activeMotionPreview.focusPair ? " motion-pair-banner" : ""}`}>
              <span data-testid="motion-preview-label" data-pose={activeMotionPreview.travel}>
                {activeMotionPreview.label} · {activeMotionPreview.positionText ?? motionDistance(activeMotionPreview.travel, activeMotionPreview.kind)}
                {activeMotionPreview.interferenceIds.length > 0 && (activeMotionPreview.envelopeOnly
                  ? " · Possible contact · Part envelope in red"
                  : activeMotionPreview.atLimit ? " · Contact ahead · Parts in red" : " · Interfering parts in red")}
                {activeMotionPreview.obstacleNames.length > 0 && ` · ${activeMotionPreview.obstacleNames[0]}${activeMotionPreview.obstacleNames.length > 1 ? ` +${activeMotionPreview.obstacleNames.length - 1}` : ""}`}
                {activeMotionPreview.outsideZoneFaces.length > 0 && ` · ${activeMotionPreview.atLimit ? "Reached" : "Outside"} ${activeMotionPreview.outsideZoneFaces.join(", ")} work-zone limit`}
                {activeMotionPreview.siteFaceNames.length > 0 && ` · ${activeMotionPreview.atLimit ? "Reached measured clearance limit" : "Measured clearance shortfall"} · ${activeMotionPreview.siteFaceNames.join(", ")}`}
                {activeMotionPreview.uncertainLimit && " · Stopped where clearance needs review"}
                {activeMotionPreview.focusPair && ` · Focused on ${activeMotionPreview.focusPair.map((id) => partLabel(project, id)).join(" and ")}`}
              </span>
              {activeMotionPreview.focusPair && (
                <button type="button" onClick={() => setMotionPreview({ project, value: { ...activeMotionPreview, focusPair: undefined } })}>
                  Show full project
                </button>
              )}
              {activeMotionPreview.focusPair && activeMotionPreview.focusTest && (
                <button type="button" onClick={() => editClearanceObstruction(activeMotionPreview.focusPair![1], {
                  kind: "motion", ...activeMotionPreview.focusTest!,
                })}>
                  Edit obstruction
                </button>
              )}
              {panel === "motion" && !activeRemoval && (
                <button type="button" onClick={() => inspectorFocus.expand()}>Return to motion controls</button>
              )}
              {activeRemoval && <button type="button" onClick={() => inspectorFocus.expand()}>Return to removal controls</button>}
              {activeSectionMotion && <button type="button" onClick={() => {
                inspectorFocus.expand();
                const id = activeSectionMotion.target === "bench" ? "sauna-bench-carry-in" : "casework-tip-up";
                requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}>{activeSectionMotion.target === "bench" ? "Return to bench carry-in" : "Return to casework tip-up"}</button>}
              <button type="button" className="button" onClick={() => {
                setMotionPreview(null);
                setSectionMotionPreview(null);
              }}>Exit preview</button>
            </div>
          )}
          {activeGuidePart && (
            <section className="lid-preview-banner guide-part-view" aria-label="Guide part view">
              <span role="status">{activeGuidePart.row.label} · {activeGuidePart.row.name} · Step {activeGuidePart.row.step.number}</span>
              <div className="guide-part-view-actions">
                <button type="button" className="button" onClick={() => setGuidePartFocus((value) =>
                  value && { ...value, isolated: !value.isolated })}>
                  {activeGuidePart.isolated ? "Show step context" : "Isolate part"}
                </button>
                {focusedGuidePiece && material(focusedGuidePiece.material).cuttable && (
                  <button type="button" className="button" onClick={() => openPartStockPlan(focusedGuidePiece.id)}>
                    View stock cut plan
                  </button>
                )}
                <button type="button" className="button" onClick={exitGuidePartView}>Exit part view</button>
              </div>
            </section>
          )}
          {shownCheckArea && (
            <div className="lid-preview-banner" role="status">
              <span>{shownCheckArea.label}</span>
              {eaveBlock ? <button className="button" onClick={() => {
                inspectorFocus.expand();
                requestAnimationFrame(() => document.querySelector(".eave-fit")?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}>Return to eave block</button> : (
                <button className="button" onClick={() => {
                  setShelfDividerDraft(null);
                  setSupportBlockDraft(null);
                  setShownAreaFinding(null);
                }}>Hide highlighted area</button>
              )}
            </div>
          )}
        <div
          className={`canvas-wrap${workspaceReviewActive ? " motion-preview" : ""}${activeFastenerLayoutPreview || activeConnectorPreview || panel === "fit-stock" ? " layout-preview" : ""}`}
          ref={viewport}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(event) => {
            if (workspaceReviewActive) event.preventDefault();
            else drop(event);
          }}
        >
          <SceneBoundary>
            <Scene
              project={project}
              showOffcuts={!shownCheckArea && showOffcuts}
              readOnly={!!shownCheckArea || !!activeGuidePart || !!activeFastenerLayoutPreview || !!activeConnectorPreview || !!baseRailPreview || (panel === "fit-stock" && mode !== "fit-face")}
              guidePartFocus={activeGuidePart ? {
                pieceId: activeGuidePart.row.pieceId, label: activeGuidePart.row.label, isolated: activeGuidePart.isolated,
              } : undefined}
              fittedStockPreview={activeFittedPreview}
              fittedStockFaces={activeFittedFaces}
              baseRailPreview={baseRailPreview}
              onPickFittedFace={(id, point, outward) => safe(() => {
                if (!fittedFacePick || fittedFacePick.project !== project || panel !== "fit-stock") return;
                if (id !== fittedFacePick.pieceId) throw Error(`Click a retained face of ${partLabel(project, fittedFacePick.pieceId)}.`);
                const ref = pickRenderedFittedStockFace(project, id, point, outward);
                setPickedFittedFace({which:fittedFacePick.which,pieceId:id,ref,nonce:++fittedPickNonce.current});
                setFittedFacePick(null); setMode("select");
              })}
              lidPreview={activeLidPreview}
              motionPreview={activeMotionPreview}
              fitToView
              animateView
              shownProfileRun={shownProfileRun}
              shownBandingEdge={shownBandingEdge}
              shownSaunaHeater={shownSaunaHeater}
              shownSaunaVentilation={shownSaunaVentilation}
              shownDrawerMountId={panel === "motion" && !activeMotionPreview ? shownDrawerMountId : null}
              shownLatchId={panel === "motion" && !activeMotionPreview ? shownLatchId : null}
              shownRodSupportId={panel === "sections" ? shownRodSupportId : null}
              shownSiteClearanceId={panel === "site-clearances" ? shownSiteClearanceId : null}
              shownFoundation={panel === "site-clearances" ? shownFoundation : undefined}
              shownTrimSeam={panel === "connections" && shownTrimSeam?.project === project &&
                shownTrimSeam.pair === liveConnectionContext?.scope.focusPair?.slice().sort().join("/")
                ? shownTrimSeam.marker : undefined}
              shownSillGasket={panel === "sections" && shownSillGasket?.outline
                ? { points: shownSillGasket.outline, needsReview: !!shownSillGasket.issues.length }
                : undefined}
              shownOpeningFlashing={panel === "opening-flashing" && openingFlashingPreview?.project === project
                ? openingFlashingPreview.value : undefined}
              shownPlumbingVentLayout={shownVentDatums}
              shownDryerDuctLayout={shownDryerDuct}
              shownCheckArea={shownCheckArea}
              showAttachments={panel === "attachments"}
              showRestraints={panel === "restraints"}
              driverAccessPreview={activeDriverPreview}
              showFasteners={panel === "fasteners" && !explode && stage === null}
              fastenerLayoutPreview={activeFastenerLayoutPreview}
              focusedFastenerLocationId={focusedFastenerLocation?.projectId === project.id && focusedFastenerLocation.planId === selectedFastenerPlanId ? focusedFastenerLocation.locationId : null}
              selectedFastenerPlanId={project.fastenerPlans.some((plan) => plan.id === selectedFastenerPlanId) ? selectedFastenerPlanId : null}
              showHinges={(panel === "sections" || panel === "hinges") && !activeLidPreview}
              showConnectors={panel === "connectors" && !explode && stage === null}
              selectedConnectorPlanId={selectedConnectorPlanId}
              connectorPreview={activeConnectorPreview}
              focusedConnectorEntryId={focusedConnectorEntryId}
              onPickFastenerEntrance={(id, point, inward) => safe(() => {
                if (!entrancePick || entrancePick.projectId !== project.id) return;
                if (id !== entrancePick.headPieceId) throw Error("Click the selected member's retained face.");
                const target = project.pieces.find((p) => p.id === id)!;
                const picked = pickFastenerSurface(target, point, inward);
                setPickedEntrance({ ...picked, projectId: project.id, panel:entrancePick.panel, planId: entrancePick.planId, locationId: entrancePick.locationId, nonce: ++entrancePickNonce.current });
                setEntrancePick(null);
                setMode("select");
                notify("Entrance picked. Review the draft location and save the plan.");
              })}
              selectedAttachmentPlanId={selectedAttachmentPlanId}
              onSelectAttachmentPlan={setSelectedAttachmentPlanId}
              onSelectAttachmentPart={(id) => {
                setSelected(id);
                setSelectedSectionId(null);
                setSelectionScope("part");
              }}
              selected={activeGuidePart?.row.pieceId ?? (shownCheckArea ? null : selected)}
              selectedSectionId={shownCheckArea ? null : selectedSectionId}
              onSectionMove={(id, origin, delta, previewed) => safe(() => {
                const active = current.current;
                const section = active.sections.find((row) => row.id === id);
                if (!section) return;
                const rotation = delta.every((value) => value === 0) ? section.rotation : composeRotation(delta, section.rotation);
                moveWholeSection(id, snap && !previewed ? snapSectionOrigin(active, id, origin, rotation) : origin, rotation);
              })}
              onSelect={select}
              onMove={(id, position, rotation) => move(id, position, rotation, true)}
              interferenceIds={activeDriverPreview?.blockerIds ?? findings.find((finding)=>finding.id==="collision")?.pieceIds}
              mode={mode}
              wallTrace={mode === "trace-wall" ? {
                a: wallTrace.a?.every(Number.isFinite) ? wallTrace.a : null,
                b: wallTrace.b?.every(Number.isFinite) ? wallTrace.b : null,
                outline: selectedOutline?.points,
                footprints: wallTraceReview.value?.footprints ?? [],
                blocked: !!wallTraceReview.value?.obstructions.length || !!wallTraceReview.value?.hasInternalOverlap || !!wallTraceReview.value?.row?.oversize,
              } : undefined}
              outlineReferenceLines={readingOutline && outlineTrace.source === "pdf" ? pdfPlanLines : undefined}
              onWallTracePoint={pickWallTracePoint}
              measurement={measurement}
              onMeasurePoint={(point) =>
                setMeasurement((previous) =>
                  !previous.a || previous.b
                    ? { a: point, b: null }
                    : { ...previous, b: point },
                )
              }
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
                { id: "measure", icon: Ruler, label: "Measure (D)" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                aria-label={t.label}
                title={t.label}
                className={mode === t.id ? "active" : ""}
                onClick={() => {
                  setMode(t.id);
                  if (t.id === "measure") {
                    setStage(null);
                    setExplode(false);
                  }
                  if (t.id === "select" || t.id === "screw") {
                    setSelectionScope("part");
                    setSelectedSectionId(null);
                  }
                  if (t.id === "screw")
                    setTimeout(
                      () =>
                        document
                          .querySelector<HTMLDetailsElement>(
                            ".connection-settings",
                          )
                          ?.setAttribute("open", ""),
                      30,
                    );
                  if (t.id === "screw")
                    notify(
                      "Select a first part, then click a touching second part to connect them.",
                    );
                }}
              >
                <t.icon size={18} />
              </button>
            ))}
            <button
              aria-label="Select whole sections"
              title="Select and transform an entire section"
              className={selectionScope === "section" ? "active" : ""}
              onClick={() => {
                setSelectionScope("section");
                setPanel("sections");
                setSelected(null);
                setMode("select");
              }}
            >
              <Cuboid size={18} />
            </button>
            <button type="button" aria-label="Test movement" title="Test door, lid or drawer movement"
              className={panel === "motion" ? "active" : ""}
              onClick={() => { if (activeRemoval) setMotionPreview(null); setRemovalTarget(null); setPanel("motion"); setStage(null); setPlaying(false); setExplode(false); }}>
              <DoorOpen size={18} />
            </button>
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
            <button type="button" aria-label="Trace a wall" title="Frame a wall along two points"
              className={mode === "trace-wall" && !readingOutline ? "active" : ""}
              aria-pressed={mode === "trace-wall" && !readingOutline}
              onClick={() => mode === "trace-wall" && !readingOutline ? setMode("select") : startWallTrace()}><Ruler size={16} /></button>
            {canFrameOutline && <button type="button" aria-label={`Frame a ${outlineSourceName} outline`} title="Frame a closed room outline"
              className={readingOutline ? "active" : ""} aria-pressed={readingOutline}
              onClick={() => readingOutline ? setMode("select") : startWallTrace("outline")}><Square size={16} /></button>}
            {project.drawingReference && (
              <button type="button" aria-label="Edit drawing reference" title="Scale, move or hide the drawing"
                onClick={() => setModal("drawing")}>Drawing</button>
            )}
            {offcutCount > 0 && <button type="button"
              className={showOffcuts ? "active" : ""} aria-pressed={showOffcuts}
              aria-label={showOffcuts ? "Hide offcut stock" : "Show offcut stock"}
              title="Show virtual offcut stock without changing the build or material list"
              disabled={workspaceReviewActive || ["fit-stock","fasteners","connectors","hinges","attachments","restraints"].includes(panel)}
              onClick={() => setShowOffcuts((shown) => !shown)}><Package size={16} /></button>}
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
              disabled={workspaceReviewActive}
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
                  className={view.preset === v || ((view.preset === "drawing" || view.preset === "plan") && v === "top") ? "active" : ""}
                  onClick={() =>
                    setView((s) => ({ preset: v === "top" && readingOutline ? outlineTrace.source === "pdf" ? "drawing" : "plan"
                      : v === "top" && project.drawingReference?.calibration.visible ? "drawing"
                        : v === "top" && project.planLines.length ? "plan" : v, nonce: s.nonce + 1 }))
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
              {fittedFacePick ? `Click a retained face of ${partLabel(project, fittedFacePick.pieceId)}. Escape cancels.` : workspaceReviewActive || activeFastenerLayoutPreview || activeConnectorPreview || panel === "fit-stock" ? "Drag to orbit · Scroll to zoom" : entrancePick ? `Click a retained face of ${partLabel(project, entrancePick.headPieceId)}. Escape cancels.` : mode === "lift" ? "Drag a part up/down to lift · Alt + ↑/↓ to nudge" : mode === "trace-wall" ? "Right-drag to orbit · Scroll to zoom" : "Drag to move · Alt-drag to lift · Shift-drag to rotate · Right-drag to orbit"}
            </span>
            {entrancePick && (
              <button className="button secondary" style={{padding:"5px 8px",fontSize:11}} aria-label="Cancel entrance pick" onClick={() => { setEntrancePick(null); setMode("select"); }}>
                Pick {partLabel(project, entrancePick.headPieceId)} · Cancel
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Workspace help"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={17} />
            </button>
          </div>
          {!project.pieces.length && !project.workZone && !project.planLines.length && !project.drawingReference?.calibration.visible && !shownVentDatums && !shownDryerDuct && mode !== "trace-wall" && (
            <div className="empty-workspace">
              <Box size={30} />
              <h2>A space for your next idea.</h2>
              <p>
                Set your available space, drag in materials, or describe what
                you want to build.
              </p>
              <div className="inline">
                <button
                  className="button secondary"
                  onClick={() => setModal("zone")}
                >
                  Set work zone
                </button>
                <button className="button primary" onClick={() => openIdea()}>
                  Plan an idea
                </button>
              </div>
            </div>
          )}
          {mode === "trace-wall" && (
            <div className="wall-trace-hint">
              <span role="status">{readingOutline ? selectedOutline ? "Outline selected. Review the wall settings or click inside another room."
                : planOutlines.entries.length ? "Click inside a closed outline to select it." : "Review the plan in Wall settings."
                : !wallTrace.a?.every(Number.isFinite)
                ? "Click point A on the floor or drawing."
                : !wallTrace.b?.every(Number.isFinite) ? "Click point B to finish the run."
                  : "Wall run marked. Click again to start a different run."}</span>
              {inspectorFocus.compact && <button type="button" className="text-button" onClick={inspectorFocus.expand}>Wall settings</button>}
            </div>
          )}
          {!workspaceReviewActive && piece && mode !== "measure" && mode !== "fastener" && (
            <div className="part-quick-tools">
              <strong>{piece.name}</strong>
              <button onClick={()=>setMode("move")}><Move3D size={15}/>Move XYZ</button>
              <button aria-pressed={mode==="lift"} onClick={()=>setMode("lift")}>↕ Lift</button>
              <button onClick={copySelection}><Copy size={15}/>Copy</button>
              <button
                title="Turn around Y by 90 degrees"
                onClick={() => rotatePart([0, Math.PI / 2, 0])}
              >
                <RotateCw size={15} />
                Turn 90°
              </button>
              <button
                title="Lay down or tip up around Z"
                onClick={() => rotatePart([0, 0, Math.PI / 2])}
              >
                <RotateCcw size={15} />
                Tip 90°
              </button>
              {(material(piece.material).cuttable || canEditThroughOpenings(piece)) && (
                <button data-cut-part onClick={() => setModal("cut")}>
                  <Scissors size={15} />
                  Cut part
                </button>
              )}
            </div>
          )}
          {!workspaceReviewActive && mode === "measure" && (
            <div className="measurement-panel" aria-label="Measurement">
              <strong>
                <Ruler size={14} /> Measure distances
              </strong>
              <p>
                {!measurement.a
                  ? "Click the first surface or floor point."
                  : !measurement.b
                    ? "Click the second point."
                    : "Click again to start a new measurement."}
              </p>
              {measured && (
                <>
                  <output aria-label="Measured distance">
                    {formatMeasurement(measured.distance)}{" "}
                    <small>({measured.distance.toFixed(3)} in)</small>
                  </output>
                  <p className="measurement-deltas">
                    X {formatMeasurement(measured.delta[0])} · Y{" "}
                    {formatMeasurement(measured.delta[1])} · Z{" "}
                    {formatMeasurement(measured.delta[2])}
                  </p>
                </>
              )}
              {(["a", "b"] as const).map(
                (end) =>
                  measurement[end] && (
                    <details key={end}>
                      <summary>
                        Point {end.toUpperCase()} · exact coordinates
                      </summary>
                      <div className="number-row">
                        {["X", "Y", "Z"].map((axis, i) => (
                          <Num
                            key={axis}
                            label={`Point ${end.toUpperCase()} ${axis}`}
                            value={measurement[end]![i]}
                            onChange={(value) =>
                              setMeasurement((previous) => {
                                const point = [...previous[end]!] as V3;
                                point[i] = value;
                                return { ...previous, [end]: point };
                              })
                            }
                          />
                        ))}
                      </div>
                    </details>
                  ),
              )}
              <div className="inline">
                <button
                  className="text-button"
                  onClick={() => setMeasurement({ a: null, b: null })}
                >
                  Clear measurement
                </button>
                <button
                  className="text-button"
                  onClick={() => setMode("select")}
                >
                  Done measuring
                </button>
              </div>
            </div>
          )}
          {!workspaceReviewActive && mode === "screw" && (
            <div className="mode-banner">
              <Wrench size={15} />
              {selected
                ? "Now choose a touching second part"
                : "Choose the first part to connect"}
            </div>
          )}
          {!workspaceReviewActive && stage !== null && (
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
              <span className="eyebrow">DESIGN FIRST · GUIDE WHEN READY</span>
              <h3>
                {guideReady
                  ? "Your generated build guide"
                  : "Build it your way."}
              </h3>
              <p className="muted">
                {guideReady
                  ? "Stages follow the saved assembly. Review order and connections."
                  : project.guideFingerprint
                    ? "Your layout changed. Regenerate the guide to include your latest design."
                    : "Place, rotate, cut and connect parts. Your steps are generated from the finished layout."}
              </p>
            </div>
            <button
              className="button primary small"
              disabled={!project.pieces.some((p) => !p.offcut)}
              onClick={generateGuide}
            >
              <Layers3 size={15} />
              {guideReady ? "Regenerate guide" : "Generate build guide"}
            </button>
          </div>
          {guideReady && (
            <>
              <div className="step-track">
                {project.steps.map((s, i) => (
                  <button
                    key={s.id}
                    className={`step-chip ${s.id === activeStepId ? "active" : ""}`}
                    onClick={() => {
                      if (guidePartFocus) exitGuidePartView();
                      setStepId(s.id);
                      setPanel("step");
                    }}
                  >
                    <span className="step-number">{i + 1}</span>
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
                  </button>
                ))}
              </div>
              <div className="timeline-foot">
                <span>{completed} steps reviewed</span>
                <button
                  onClick={() => {
                    setGuidePartFocus(null);
                    setStage(-1);
                    setPlaying(true);
                  }}
                >
                  Preview build
                </button>
                <button onClick={() => setModal("export")}>Export guide</button>
              </div>
            </>
          )}
        </section>
      </main>
      <aside
        id="workshop-inspector"
        ref={inspectorFocus.inspectorRef}
        className={`inspector${inspectorFocus.focused ? " inspector-focused" : ""}`}
        role={inspectorFocus.focused ? "dialog" : undefined}
        aria-modal={inspectorFocus.focused ? true : undefined}
        aria-label="Inspector"
        tabIndex={-1}
        data-inspector-focused={String(inspectorFocus.focused)}
        data-inspector-returnable={String(inspectorFocus.returnable)}
      >
        <div className="inspector-focus-heading">
          <strong>Inspector</strong>
          <button type="button" className="button secondary" data-inspector-close onClick={inspectorFocus.close}><ArrowLeft size={15} />Back to workspace</button>
        </div>
        <div className="inspector-tabs">
          {(
            [
              { id: "part", icon: Settings2, label: "Part" },
              { id: "checks", icon: ShieldCheck, label: "Checks" },
              { id: "materials", icon: ClipboardList, label: "List" },
              { id: "step", icon: Layers3, label: "Guide" },
              { id: "sections", icon: Cuboid, label: "Sections" },
              { id: "tools", icon: Wrench, label: "Tools" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={panel === t.id ? "active" : ""}
              onClick={() => {
                setReturnToConnections(false);
                setReturnToPreparation(false);
                setPanel(t.id);
                if (t.id === "part") {
                  setSelectionScope("part");
                  setSelectedSectionId(null);
                }
              }}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
              {t.id === "checks" && warnings.length > 0 && (
                <b>{warnings.length}</b>
              )}
            </button>
          ))}
        </div>
        <div className="inspector-scroll" ref={inspectorFocus.scrollRef}>
          {returnToConnections && liveConnectionContext && !activeRemoval && !["connections","fasteners","attachments","restraints","hinges","connectors","fit-stock","site-clearances"].includes(panel) && (
            <button type="button" className="text-button" onClick={backToConnectionReview}>← Back to connections</button>
          )}
          {panel === "connections" && liveConnectionContext && (
            <>
              <ConnectionReviewPanel project={project} scope={liveConnectionContext.scope} bearingReview={bearingReview} onBack={backFromConnectionReview}
                onSaveHangers={(id, plan) => safe(() => change((p) => saveFloorHangerPlan(p, id, plan)))}
                onSaveBearingDecision={(topId, baseId, note) => safe(() => change((p) => saveBearingDecision(p, topId, baseId, note)))}
                onClearBearingDecision={(topId, baseId) => safe(() => change((p) => clearBearingDecision(p, topId, baseId)))}
                onTestRemoval={openRemovalTest}
                constructionEntryId={liveConnectionContext.constructionEntryId}
                onConstructionEntryChange={(id) => setConnectionContext((value) => value?.projectId === project.id ? {...value,constructionEntryId:id} : value)}
                backLabel={liveConnectionContext.backPanel === "prep" ? "Back to build preparation" : liveConnectionContext.backPanel === "step" ? "Back to guide" : liveConnectionContext.backPanel === "part" ? "Back to part" : liveConnectionContext.backPanel === "sections" ? "Back to sections" : "Back to checks"}
                onInspectPiece={inspectConnectionPiece} onPlanPair={(a,b,compareSides) => safe(() => planConnectionPair(a,b,compareSides))} onPlanConnectorPair={(a,b) => safe(() => planConnectorPair(a,b))} onReviewIntent={reviewConnectionIntent}
                modeledContacts={modeledContacts}
                woodJointDetails={woodJointDetails}
                onSaveWoodJointDetail={(firstId, secondId, method, note) => safe(() =>
                  change((p) => saveWoodJointDecision(p, firstId, secondId, method, note)))}
                onSaveTrimSeam={(firstId, secondId, input) =>
                  change((p) => saveTrimSeam(p, firstId, secondId, input))}
                onShowTrimSeam={(marker) => {
                  const pair = liveConnectionContext.scope.focusPair;
                  if (!marker || !pair) { setShownTrimSeam(null); return; }
                  setStage(null); setPlaying(false); setExplode(false); setMode("select");
                  setShownTrimSeam({ project, pair: [...pair].sort().join("/"), marker });
                  inspectWorkspace();
                }}
                onClearWoodJointDetail={(firstId, secondId) => safe(() =>
                  change((p) => clearWoodJointDecision(p, firstId, secondId)))}
                onFocusModeledContact={({ title, memberIds }) => openConnectionReview(
                  { title, memberIds, focusPair: memberIds },
                  liveConnectionContext.backPanel,
                )}
                seatSpanActions={new Map(findings.flatMap((finding) => finding.area?.kind === "seat-span" && finding.pieceId
                  ? [[finding.pieceId, () => showFindingArea(finding)] as const] : []))}
                onMeasureFoundation={() => openSiteClearances("connections")}
                baseRailAdjustment={{
                  draft: activeBaseRailDraft,
                  preview: (entryId, sideId) => {
                    const fit = previewGreenhouseRailFit(project, entryId, sideId);
                    setMode("select"); setStage(null); setPlaying(false); setExplode(false);
                    setSelected(sideId); setSelectedSectionId(null);
                    setBaseRailDraft({ project, entryId, sideId, fit });
                  },
                  cancel: () => setBaseRailDraft(null),
                  apply: () => safe(() => {
                    if (!baseRailPreview || activeBaseRailDraft?.project !== current.current)
                      throw Error("The project changed. Preview the rail adjustment again.");
                    change((p) => ({ ...p, pieces: p.pieces.map((item) =>
                      item.id === baseRailPreview.id ? baseRailPreview : item) }));
                    setBaseRailDraft(null);
                    notify("Rail adjusted. Both corners meet and align.");
                  }),
                }}
                onFitStockBetween={openFittedStock}
                fittedBlock={fittedConnectionEnds?.projectId === project.id ? fittedConnectionEnds : null} />
              {!guideReady && <div className="field-section"><p className="small-note">Keep editing connection details here. Regenerate the build guide when you finish these decisions.</p><button type="button" className="button secondary full" onClick={generateGuide}>Regenerate build guide</button></div>}
            </>
          )}
          {panel === "hinges" && (
            <>
              <button type="button" className="text-button" onClick={returnToConnections && liveConnectionContext ? backToConnectionReview : () => setPanel("sections")}>← {returnToConnections && liveConnectionContext ? "Back to connections" : "Back to sections"}</button>
              {displayedHingeSection && <LidMotionPanel project={project} section={displayedHingeSection} onPreview={showLidMotion} onChange={(next) => safe(() => change(next))} previewActive={activeLidPreview?.sectionId === displayedHingeSection.id} />}
              <LidHingesPanel project={project} sectionId={null} initialPlanId={hingeRequest?.planId} onSelectPlan={setDisplayedHingePlanId}
                onChange={(next) => safe(() => change(next))} onPreview={(value) => setLidMotionPreview(value ? {project,value} : null)} />
            </>
          )}
          {panel === "fasteners" && (
            <FastenersPanel
              project={project}
              selectedPieceId={piece?.id ?? null}
              selectedPlanId={selectedFastenerPlanId}
              onSelectPlan={setSelectedFastenerPlanId}
              focusedLocationId={focusedFastenerLocation?.projectId === project.id && focusedFastenerLocation.planId === selectedFastenerPlanId ? focusedFastenerLocation.locationId : null}
              onFocusLocation={onFocusFastenerLocation}
              onLayoutPreview={onFastenerLayoutPreview}
              onDriverPreview={(value) => {
                setDriverPreview(value ? { project, value } : null);
                if (value) {
                  setFastenerLayoutPreview(null);
                  setStage(null);
                  setPlaying(false);
                  setExplode(false);
                  setMode("select");
                  inspectWorkspace();
                }
              }}
              onInspectLayout={inspectWorkspace}
              initialPair={initialFastenerPair?.projectId === project.id ? initialFastenerPair : undefined}
              backLabel={returnToConnections && liveConnectionContext ? "Back to connections" : "Back to part"}
              onBack={returnToConnections && liveConnectionContext ? backToConnectionReview : () => setPanel("part")}
              onOpenTools={() => setPanel("tools")}
              onChange={(next) => safe(() => change(next))}
              pickingLocationId={entrancePick?.locationId ?? null}
              pickedEntrance={pickedEntrance?.projectId === project.id && pickedEntrance.panel === "fasteners" ? pickedEntrance : null}
              onRequestEntrancePick={(request) => {
                setDriverPreview(null);
                setPickedEntrance(null);
                setEntrancePick({...request, projectId: project.id, panel:"fasteners"});
                setMode("fastener");
                setStage(null);
                setPlaying(false);
                setExplode(false);
                inspectWorkspace();
              }}
              onCancelEntrancePick={() => { setEntrancePick(null); setPickedEntrance(null); setMode("select"); }}
            />
          )}
          {panel === "connectors" && <ConnectorsPanel
            project={project} selectedPieceId={piece?.id ?? null} selectedPlanId={selectedConnectorPlanId} onSelectPlan={setSelectedConnectorPlanId}
            initialPair={initialConnectorPair?.projectId === project.id ? initialConnectorPair : undefined}
            onPreview={onConnectorPreview}
            onFocusEntry={setFocusedConnectorEntryId}
            onDirtyChange={onConnectorDirtyChange}
            onChange={(next) => safe(() => change(next))}
            backLabel={returnToConnections && liveConnectionContext ? "Back to connections" : "Back to part"}
            onBack={returnToConnections && liveConnectionContext ? backToConnectionReview : () => setPanel("part")}
            onInspectPiece={(id) => { setEntrancePick(null); setPickedEntrance(null); inspectConnectionPiece(id); }}
            onOpenSupplies={() => setPanel("materials")} onOpenTools={() => setPanel("tools")}
            pickingEntryId={entrancePick?.panel === "connectors" ? entrancePick.locationId : null}
            pickedEntrance={pickedEntrance?.projectId === project.id && pickedEntrance.panel === "connectors" ? {
              planId:pickedEntrance.planId,entryId:pickedEntrance.locationId,entranceLocal:pickedEntrance.entranceLocal,driveLocal:pickedEntrance.driveLocal,nonce:pickedEntrance.nonce,
            } : null}
            onRequestEntrancePick={(request) => {
              setPickedEntrance(null); setEntrancePick({projectId:project.id,panel:"connectors",planId:request.planId,locationId:request.entryId,headPieceId:request.memberId});
              setMode("fastener"); setStage(null); setPlaying(false); setExplode(false); inspectWorkspace();
            }}
            onCancelEntrancePick={() => { setEntrancePick(null); setPickedEntrance(null); setMode("select"); }}
          />}
          {panel === "fit-stock" && <FittedStockPanel
            project={project}
            initialPair={initialFittedPair?.projectId === project.id ? initialFittedPair : undefined}
            onBack={liveConnectionContext ? backToConnectionReview : () => setPanel("part")}
            onPreview={onFittedPreview} onFacesChange={onFittedFacesChange} onDirtyChange={onFittedDirtyChange}
            pickingFace={fittedFacePick?.which ?? null} pickedFace={pickedFittedFace}
            onCancelPick={cancelFittedPick}
            onInspectPreview={inspectWorkspace}
            onRequestFacePick={({which,pieceId}) => {
              setPickedFittedFace(null); setFittedFacePick({project,which,pieceId});
              setMode("fit-face"); setStage(null); setPlaying(false); setExplode(false);
              inspectWorkspace();
            }}
            onApply={(preview) => {
              const next = commitFittedStock(project, preview.spec, preview);
              onFittedDirtyChange(false); cancelFittedPick(); setFittedPreview(null); setFittedFaces(null);
              change(next); setSelected(preview.blockId); setSelectedSectionId(null); setSelectionScope("part");
              setFittedConnectionEnds({projectId:next.id,blockId:preview.blockId,endpoints:[preview.spec.first.pieceId,preview.spec.second.pieceId]});
              setConnectionContext({projectId:next.id,scope:{title:`Connect ${partLabel(next, preview.blockId)}`,memberIds:[preview.spec.first.pieceId,preview.blockId,preview.spec.second.pieceId]},backPanel:"part"});
              setReturnToConnections(true); setPanel("connections"); setMode("select");
              notify(`${partLabel(next, preview.blockId)} added with its stock cut. Plan the connections at both ends.`);
            }}
          />}
          {panel === "restraints" && (
            <RestraintsPanel
              project={project}
              onChange={(next) => safe(() => change(next))}
              onBack={returnToConnections && liveConnectionContext ? backToConnectionReview : () => setPanel("sections")}
              backLabel={returnToConnections && liveConnectionContext ? "Back to connections" : "Back to sections"}
              initialPlanId={reviewedRestraintPlanId}
            />
          )}
          {panel === "attachments" && (
            <>
              <button
                className="text-button"
                onClick={returnToConnections && liveConnectionContext ? backToConnectionReview : () => setPanel("sections")}
              >
                ← {returnToConnections && liveConnectionContext ? "Back to connections" : "Back to sections"}
              </button>
              <AttachmentsPanel
                project={project}
                selectedPlanId={selectedAttachmentPlanId}
                onSelectPlan={setSelectedAttachmentPlanId}
                onChange={(next) => safe(() => change(next))}
                onSelectPart={(id) => {
                  setSelected(id);
                  setSelectedSectionId(null);
                  setSelectionScope("part");
                  setStage(null);
                }}
                onOpenTools={() => setPanel("tools")}
              />
            </>
          )}
          {panel === "tools" && (
            <ToolsPanel
              project={project}
              onChange={(next) => safe(() => change(next))}
            />
          )}
          {activeRemoval && (
            <RemovalMotionPanel key={`${activeRemoval.topId}/${activeRemoval.baseId}`} project={project}
              contact={activeRemovalContact}
              preview={activeMotionPreview}
              onPreview={(value) => {
                setMotionPreview(value ? { project, value } : null);
                if (value && !activeMotionPreview) inspectWorkspace();
              }}
              onBack={backToConnectionReview}
              onSavePath={(legs) => change((p) => saveBearingRemovalPath(p, activeRemoval.topId, activeRemoval.baseId, legs))}
              onClearPath={() => change((p) => clearBearingRemovalPath(p, activeRemoval.topId, activeRemoval.baseId))}
            />
          )}
          {panel === "motion" && !activeRemoval && (
            <>
              {returnToPreparation && (
                <button type="button" className="text-button" onClick={() => {
                  setReturnToPreparation(false);
                  setPanel("prep");
                }}>← Back to build preparation</button>
              )}
              <button type="button" className="text-button" onClick={() => openSiteClearances("motion")}>Measured site clearances</button>
              <MotionPanel key={project.id} project={project}
              drawerRequest={drawerBoxRequest?.projectId === project.id ? drawerBoxRequest : undefined}
              onDrawerRequestHandled={() => setDrawerBoxRequest(null)}
              onEditDoorway={(id) => { setSelectedSectionId(id); setModal("doorway"); }}
              initialTest={motionTestSelection?.project === project ? motionTestSelection : undefined}
              ventBacking={ventBacking}
              shownDrawerMountId={shownDrawerMountId}
              onShowDrawerMount={(id) => {
                setShownDrawerMountId(id);
                if (id) {
                  setStage(null);
                  setPlaying(false);
                  setExplode(false);
                  inspectWorkspace();
                }
              }}
              shownLatchId={shownLatchId}
              onShowLatch={(id) => {
                setShownLatchId(id);
                if (id) {
                  setStage(null);
                  setPlaying(false);
                  setExplode(false);
                  inspectWorkspace();
                }
              }}
              onShowSashGaps={(entryId) => {
                const row = findings.find(({ id }) => id === `sunlite-vent-backing-${entryId}`);
                if (row) showFindingArea(row);
              }}
              selectedIds={selectedSectionId ? project.sections.find((row) => row.id === selectedSectionId)?.pieceIds ?? [] : selected ? [selected] : []}
              preview={activeMotionPreview}
              onPreview={(value, source = project) => {
                if (value) { setShownLatchId(null); setShownDrawerMountId(null); }
                setMotionPreview(value ? { project: source, value } : null);
                if (value && (!activeMotionPreview || value.focusPair)) inspectWorkspace();
              }}
              onChange={change}
              />
            </>
          )}
          {panel === "lid-travel" && (
            <>
              <button type="button" className="text-button" onClick={() => {
                setReturnToPreparation(false);
                setPanel(returnToPreparation ? "prep" : "sections");
              }}>← {returnToPreparation ? "Back to build preparation" : "Back to sections"}</button>
              {inspectedLidSection ? (
                <>
                  <h2>{inspectedLidSection.name}</h2>
                  <LidMotionPanel project={project} section={inspectedLidSection}
                    initialInspection={lidTravelInspection?.project === project ? lidTravelInspection : undefined}
                    onPreview={showLidMotion}
                    onChange={change}
                    previewActive={activeLidPreview?.sectionId === inspectedLidSection.id} />
                </>
              ) : <p className="small-note">This lid’s section has been removed.</p>}
            </>
          )}
          {panel === "site-clearances" && (
            <>
              <button type="button" className="text-button" onClick={() => setPanel(siteReturnPanel)}>
                ← {siteReturnPanel === "motion" ? "Back to movement" : siteReturnPanel === "sections" ? "Back to sections" : siteReturnPanel === "connections" ? "Back to connections" : "Back to checks"}
              </button>
              <GreenhouseFoundationsPanel key={`foundation-${project.id}`} project={project} onChange={change}
                shownId={shownFoundationId}
                onShow={(id) => {
                  setShownFoundationId(id);
                  if (id) { setShownSiteClearanceId(null); inspectWorkspace(); }
                }}
              />
              <SiteClearancesPanel key={project.id} project={project} onChange={change}
                shownId={shownSiteClearanceId}
                onShow={(id) => { setShownSiteClearanceId(id); if (id) { setShownFoundationId(null); inspectWorkspace(); } }}
              />
            </>
          )}
          {panel === "opening-flashing" && (
            <>
              <button type="button" className="text-button" onClick={() => setPanel("sections")}>← Back to sections</button>
              <OpeningFlashingPanel key={JSON.stringify([project.id, openingFlashingTarget])}
                project={project} review={openingFlashingReview} onChange={change}
                initialSillId={openingFlashingTarget?.projectId === project.id ? openingFlashingTarget.sillId : undefined}
                onShow={(value) => {
                  setOpeningFlashingPreview(value ? { project, value } : null);
                  if (value) {
                    setStage(null);
                    setExplode(false);
                    setPlaying(false);
                    setMode("select");
                    inspectWorkspace();
                  }
                }} />
            </>
          )}
          {panel === "sections" && (
            <>
              {mode === "trace-wall" ? (
                <WallTracePanel trace={wallTrace} onChange={setWallTrace} review={wallTraceReview.value} error={wallTraceReview.error}
                  onAdd={addTracedWall} onClose={() => setMode("select")} onPick={inspectWorkspace}
                  outline={outlineTrace ? { ...planOutlines, index: outlineIndex, face: outlineTrace.face,
                    source: outlineTrace.source, hasDxfLines, hasPdfLines,
                    onSource: (source) => {
                      setOutlineTrace({ ...outlineTrace, source, index: -1 });
                      setView(({ nonce }) => ({ preset: source === "pdf" ? "drawing" : "plan", nonce: nonce + 1 }));
                    },
                    onSelect: (index) => setOutlineTrace({ ...outlineTrace, index }),
                    onFace: (face) => setOutlineTrace({ ...outlineTrace, face }),
                    onManual: () => startWallTrace(),
                  } : undefined} />
              ) : <>
                <button className="button secondary full attachment-entry" onClick={() => startWallTrace()}>Trace an interior wall</button>
                {canFrameOutline && <button className="button secondary full attachment-entry" onClick={() => startWallTrace("outline")}>Frame a room from {outlineSourceName === "plan" ? "a plan" : outlineSourceName}</button>}
              </>}
              <button className="button secondary full attachment-entry" onClick={() => setPanel("motion")}>Test door or drawer movement</button>
              <button className="button secondary full attachment-entry" onClick={() => openConnectors()}>Plan A21Z connector</button>
              <button className="button secondary full attachment-entry" onClick={() => openFasteners()}>
                Plan wood-fastener locations
              </button>
              <button
                className="button secondary full attachment-entry"
                onClick={() => openAttachments()}
              >
                Plan shelf supports
              </button>
              <button className="text-button" onClick={openRestraints}>
                Plan furniture anti-tip restraints
              </button>
              <AppliedDesignsPanel
                project={project}
                onRevise={(bindingId, entryIds) =>
                  openIdea({ bindingId, entryIds })
                }
                onDetach={(bindingId) =>
                  safe(() => {
                    change(detachIdeaBinding(project, bindingId));
                    notify(
                      "Saved design controls removed. Its parts, cuts and connections are retained; Undo is available.",
                    );
                  })
                }
                onAdopt={(sectionId) =>
                  safe(() => {
                    change(adoptLegacyRecipe(project, sectionId));
                    notify(
                      "This furniture section now supports saved design revisions.",
                    );
                  })
                }
              />
              <button type="button" className="button secondary full" onClick={() => openSiteClearances("sections")}>Measured site clearances</button>
              <button type="button" className="button secondary full" onClick={() => setModal("doorway")}>Plan an interior doorway</button>
              <button type="button" className="button secondary full" onClick={() => { setWaterRunTarget(undefined); setModal("wall-water"); }}>Plan a wall water line</button>
              {((project.waterRuns?.length ?? 0) >= 2 || !!project.waterFittings?.length) &&
                <button type="button" className="button secondary full" onClick={() => { setWaterFittingTarget(undefined); setWaterFittingTee(false); setModal("water-fitting"); }}>Connect PEX runs</button>}
              {!!(project.waterRuns?.some(({ materialId }) => materialId === waterStop.pipe) || project.waterStops?.length) &&
                <button type="button" className="button secondary full" onClick={() => { setWaterStopTarget(undefined); setModal("water-stop"); }}>Fit a fixture shutoff</button>}
              <button type="button" className="button secondary full" onClick={() => { setSinkDrainTarget(undefined); setModal("sink-drain"); }}>Fit a sink drain</button>
              {!!(project.waterRuns?.length || project.waterPressureTests?.length) &&
                <button type="button" className="button secondary full" onClick={() => { setWaterPressureTarget(undefined); setModal("water-pressure"); }}>Water pressure test</button>}
              {!!project.waterRuns?.length &&
                <button type="button" className="button secondary full" onClick={() => setModal("water-support")}>Review PEX support spacing</button>}
              <button type="button" className="button secondary full" onClick={() => configureWindowWall()}>Plan a window wall</button>
              <button type="button" className="button secondary full" onClick={() => openOpeningFlashing()}>Plan opening flashing</button>
              <SillGasketPanel key={`sill-gaskets-${project.id}`} project={project} review={sillGasketReview}
                shownId={shownSillGasketId} onChange={change} onShow={(id) => {
                  setShownSillGasketId(id);
                  if (id) {
                    if (guidePartFocus) exitGuidePartView();
                    setStage(null);
                    setPlaying(false);
                    setExplode(false);
                    setMotionPreview(null);
                    setLidMotionPreview(null);
                    setSectionMotionPreview(null);
                    inspectWorkspace();
                  }
                }} />
              <CaseworkTipUpPanel key={`casework-tip-up-${project.id}`} project={project}
                onChange={change} previewActive={activeSectionMotion?.target === "casework"}
                onStartPreview={startSectionMotionPreview}
                onPreview={(value) => setSectionMotionPreview((current) => value
                  ? { project, value, target: "casework" }
                  : current?.target === "casework" ? null : current)}
              />
              <SaunaBenchTravelPanel key={`bench-carry-${project.id}`} project={project}
                onChange={change} previewActive={activeSectionMotion?.target === "bench"}
                onStartPreview={startSectionMotionPreview}
                onPreview={(value) => setSectionMotionPreview((current) => value
                  ? { project, value, target: "bench" }
                  : current?.target === "bench" ? null : current)}
              />
              <SaunaHeaterPanel key={project.id} project={project} onChange={change} shownId={shownSaunaHeaterId}
                onShow={(id) => {
                  setShownSaunaHeaterId(id);
                  if (id) setShownSaunaVentilationId(null);
                  if (id) { setStage(null); setPlaying(false); setExplode(false); inspectWorkspace(); }
                }}
              />
              <SaunaVentilationPanel key={`sauna-vents-${project.id}`} project={project} onChange={change} shownId={shownSaunaVentilationId}
                onShow={(id) => {
                  setShownSaunaVentilationId(id);
                  if (id) {
                    setShownSaunaHeaterId(null);
                    setStage(null);
                    setPlaying(false);
                    setExplode(false);
                    inspectWorkspace();
                  }
                }}
              />
              <RodFitsPanel key={project.id} project={project} onChange={change} shownId={shownRodSupportId}
                onShow={(id) => {
                  setShownRodSupportId(id);
                  if (id) { setStage(null); setPlaying(false); setExplode(false); inspectWorkspace(); }
                }}
              />
              {selectedSectionId && movementTools}
              <SectionsPanel
                project={project}
                selectedId={selectedSectionId}
                onSelect={selectSection}
                onChange={(next) => safe(() => {
                  const edited=next.sections.find((row)=>!project.sections.some((old)=>old.id===row.id))??next.sections.find((row)=>row.id===selectedSectionId);
                  if(!edited){change(next);return;}
                  const clear=separateWood(next,next.pieces.filter((part)=>edited.pieceIds.includes(part.id)));
                  if(clear.blocked)throw Error("This section would overlap existing wood.");
                  change(clear.adjusted?transformSection(next,edited.id,edited.origin.map((n,i)=>n+clear.offset[i]) as V3,edited.rotation):next);
                })}
                onLidPreview={showLidMotion}
                lidPreviewSectionId={activeLidPreview?.sectionId ?? null}
                onGenerate={reviseSection}
                onReviewWindowOpening={(section) => {
                  const members = generatedWindowMembers(project, section);
                  if (!members) { notify("Restore the modeled sill, two jack studs and flat head before planning flashing.", true); return; }
                  openOpeningFlashing(members.sill);
                }}
                onReviewFloorBase={(section) => openConnectionReview({
                  title: `${section.name} connections`, ownerId: section.id, memberIds: section.pieceIds,
                })}
                onMoveTool={() => setMode("move")}
                onPartTool={() => {
                  setSelectionScope("part");
                  setSelectedSectionId(null);
                  setMode("select");
                  setPanel("part");
                }}
              />
            </>
          )}
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
              <ProjectCodePanel
                key={project.id}
                project={project}
                measurement={measurement}
                measuredDistance={measured?.distance ?? null}
                onChange={change}
                onWaterPressure={() => { setWaterPressureTarget(undefined); setModal("water-pressure"); }}
                shownDryerDuct={!!shownDryerDuct}
                onShowDryerDuct={(show) => {
                  setDryerDuctProjectId(show ? project.id : null);
                  if (show) {
                    setVentDatumProjectId(null);
                    setStage(null);
                    setPlaying(false);
                    setExplode(false);
                    setView((previous) => ({ preset: "iso", nonce: previous.nonce + 1 }));
                    inspectWorkspace();
                  }
                }}
                shownVentDatums={!!shownVentDatums}
                onShowVentDatums={(show) => {
                  setVentDatumProjectId(show ? project.id : null);
                  if (show) {
                    setDryerDuctProjectId(null);
                    setStage(null);
                    setExplode(false);
                    setView((previous) => ({ preset: "iso", nonce: previous.nonce + 1 }));
                  }
                }}
              />
              <button type="button" className="button secondary full" onClick={() => openSiteClearances("checks")}>Measured site clearances</button>
              {!!project.waterRuns?.length &&
                <button type="button" className="button secondary full" onClick={() => setModal("water-support")}>Review PEX support spacing</button>}
              <div className="check-summary">
                <span className="warning-dot" />
                {warnings.length} things to review<span>Concept plan</span>
              </div>
              <button type="button" className="button secondary full" disabled={!canReviewConnections} onClick={() => openConnectionReview({title:"Connections in this project",memberIds:connectionReview.parts.map((part) => part.pieceId),ownerId:project.id,stageKey:"all-connections"})}>Review connection decisions</button>
              {liningBackingContent && <details className="field-section">
                <summary>Sauna lining backing</summary>
                {liningBackingContent}
              </details>}
              <button type="button" className="button secondary full" onClick={() => openConnectors()}>Plan A21Z connector</button>
              <button type="button" className="button secondary full" onClick={() => openFittedStock()}>Fit stock between faces</button>
              <EaveBlockPanel
                project={project}
                preview={eaveBlock}
                onPreview={(fit) => {
                  setEaveBlockDraft(fit ? { project, fit } : null);
                  if (!fit?.outlines.length) return;
                  setShownAreaFinding(null);
                  setStage(null);
                  setPlaying(false);
                  setExplode(false);
                  setView((previous) => ({ preset: "iso", nonce: previous.nonce + 1 }));
                  inspectWorkspace();
                }}
                onAdd={(fit) => safe(() => {
                  if (eaveBlockDraft?.project !== current.current || eaveBlockDraft.fit !== fit)
                    throw Error("The project or joint changed. Preview the fit again.");
                  change(fit.project);
                  setEaveBlockDraft(null);
                  const added = "fits" in fit ? fit.fits.length : 1;
                  const pending = "fits" in fit ? fit.skipped.length : 0;
                  const label = added === 1 ? "Eave block added" : `${added} eave blocks added`;
                  notify(pending
                    ? `${label}. ${pending === 1 ? "One joint still needs" : `${pending} joints still need`} a fit review.`
                    : `${label}. Review both sides under greenhouse roof attachments.`);
                })}
              />
              <div className="findings">
                {findings.map((f) => (
                  <Fragment key={f.id}>
                  <button
                    className={`finding ${f.severity}`}
                    aria-pressed={f.area ? areaFinding === f : undefined}
                    onClick={() => openWorkspaceFinding(f)}
                  >
                    {f.severity === "info" ? (
                      <Info size={16} />
                    ) : (
                      <AlertTriangle size={16} />
                    )}
                    <div>
                      <strong>{f.title}</strong>
                      <p>{f.detail}</p>
                      {f.area && <small>{f.area.kind === "panel-bearing"
                        ? shownCheckArea === f.area ? "Hide bearing" : "Show bearing in 3D"
                        : f.area.kind === "panel-floor-bearing"
                          ? shownCheckArea === f.area ? "Hide contacts" : "Show contacts in 3D"
                        : f.area.kind === "roof-plane"
                          ? shownCheckArea === f.area ? "Hide roof area" : "Show roof area in 3D"
                        : f.area.kind === "seat-span" || f.area.kind === "shelf-span"
                          ? shownCheckArea === f.area ? "Hide spans" : "Show spans in 3D"
                          : f.area.kind === "rafter-eave" || f.area.kind === "rafter-ridge"
                            ? shownCheckArea === f.area ? "Hide joints" : "Show joints in 3D"
                            : shownCheckArea === f.area ? "Hide gap" : "Show gap in 3D"}</small>}
                    </div>
                    {(f.pieceId || f.area || f.openingFlashingSillId) && <ChevronRight size={13} />}
                  </button>
                  {f === areaFinding && f.pieceId && supportTargets.length > 0 && (
                    <PanelSupportBlockFields
                      project={project}
                      panelId={f.pieceId}
                      stops={supportTargets}
                      preview={supportBlock}
                      onPreview={(fit) => {
                        setSupportBlockDraft(fit ? { project, fit } : null);
                        if (!fit) return;
                        setStage(null);
                        setPlaying(false);
                        setExplode(false);
                        setView((previous) => ({ preset: "iso", nonce: previous.nonce + 1 }));
                      }}
                      onAdd={(fit) => safe(() => {
                        if (supportBlockDraft?.project !== current.current || supportBlockDraft.fit !== fit)
                          throw Error("The build changed. Preview the support block again.");
                        if (fit.motionConflicts.length) throw Error("Resolve the modeled movement conflict before adding this block.");
                        change(fit.project);
                        setSupportBlockDraft(null);
                        notify("Support block added. Review its connections in the build guide.");
                      })}
                    />
                  )}
                  </Fragment>
                ))}
              </div>
            </>
          )}
          {panel === "part" && clearanceRetest?.projectId === project.id && (
            <div className="field-section">
              <p className="small-note">Retest from the closed position with your current layout.</p>
              <div className="inline">
                <button type="button" className="button secondary" onClick={retestClearance}>Retest clearance</button>
                <button type="button" className="text-button" onClick={() => setClearanceRetest(null)}>Dismiss</button>
              </div>
            </div>
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
                    setAssistantTarget("");
                    openIdea();
                  }}
                >
                  <Plus size={15} />
                  Plan an idea
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
                {project.waterStops?.some(({ pieceId }) => pieceId === piece.id) &&
                  <button type="button" className="button secondary full" onClick={() => {
                    setWaterStopTarget(project.waterStops?.find(({ pieceId }) => pieceId === piece.id)?.id);
                    setModal("water-stop");
                  }}>Review fixture shutoff</button>}
                {project.sinkDrains?.some(({ bodyId, tubeId }) => bodyId === piece.id || tubeId === piece.id) &&
                  <button type="button" className="button secondary full" onClick={() => {
                    setSinkDrainTarget(project.sinkDrains?.find(({ bodyId, tubeId }) => bodyId === piece.id || tubeId === piece.id)?.id);
                    setModal("sink-drain");
                  }}>Review sink drain</button>}
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
                {selectedTreatment && (
                  <div className="field-section">
                    <h4>Field treatment</h4>
                    <p className="small-note">{selectedTreatment.detail}</p>
                  </div>
                )}
                {movementTools}
                {findings.find((finding)=>finding.id==="collision")?.pieceIds?.includes(piece.id)&&<div className="placement-warning" role="status">This wood overlaps another part. <button className="button secondary" onClick={()=>move(piece.id,piece.position,piece.rotation)}>Separate overlapping wood</button></div>}
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
                        disabled={
                          ["fastener", "connector", "equipment"].includes(
                            material(piece.material).stockKind,
                          ) ||
                          (isBatt(piece.material) && i === stockAxes(piece).thickness) ||
                          (material(piece.material).orderRollWidth !== undefined && i === 2) ||
                          (material(piece.material).shape === "tube-envelope" &&
                            i !== 1)
                        }
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
                    {material(piece.material).shape === "tube-envelope"
                      ? "Outside diameter is fixed by this product; tube wall thickness and support capacity remain unverified. Use Cut part to shorten it."
                      : isBatt(piece.material)
                        ? "Keep the stock thickness. Use Cut part to trim the length or width and keep the offcut."
                      : material(piece.material).shape === "door-leaf-envelope"
                        ? "The prehung leaf has fixed dimensions. Position it in its rough opening and use Test movement to check the swing."
                      : material(piece.material).shape === "pedestal-bench-envelope"
                        ? "Move or rotate the assembled kit. Measurements and clearance checks use its documented outer dimensions."
                      : material(piece.material).orderRollWidth
                        ? "Edit the visible face. The foil thickness is a drawing convention, and cut sizes include the folds below."
                      : ["fastener", "connector"].includes(
                            material(piece.material).stockKind,
                          )
                        ? "Product dimensions are fixed. Select a different hardware size from the library."
                        : piece.cutPlanes.length
                          ? "Stock blank dimensions. The rendered cut profile and measuring tool show the retained geometry."
                          : "Actual dimensions in inches; nominal lumber names are shown in the library."}
                  </small>
                  {material(piece.material).orderRollWidth && (
                    <>
                      <p className="small-note">Flat cut blank · {foilBlankSize(piece).slice(0, 2).map(formatPreciseInches).join(" × ")}</p>
                      <div className="number-row">
                        {([["xStart", "Fold at X start"], ["xEnd", "Fold at X end"],
                          ["yStart", "Fold at Y start"], ["yEnd", "Fold at Y end"]] as const).map(([key, label]) => (
                          <Num key={key} label={label} min={0} max={12}
                            value={piece.foilReturns?.[key] ?? 0}
                            onChange={(value) => safe(() => updatePart({
                              foilReturns: {
                                xStart: 0, xEnd: 0, yStart: 0, yEnd: 0,
                                ...piece.foilReturns,
                                [key]: value,
                              },
                            }))} />
                        ))}
                      </div>
                    </>
                  )}
                  {material(piece.material).cuttable &&
                    !isBatt(piece.material) &&
                    material(piece.material).shape !== "tube-envelope" && (
                      <label className="field">
                        Stock length / grain or flute axis
                        <select
                          aria-label="Stock length axis"
                          value={piece.cutStock?.sourceAxes?.[2] ?? piece.stockLengthAxis ?? ""}
                          disabled={!!piece.cutStock?.sourceAxes}
                          onChange={(e) =>
                            safe(() =>
                              updatePart({
                                stockLengthAxis:
                                  e.target.value === ""
                                    ? null
                                    : (Number(e.target.value) as 0 | 1 | 2),
                              }),
                            )
                          }
                        >
                          <option value="">Infer from blank dimensions</option>
                          <option value="0">Local X</option>
                          <option value="1">Local Y</option>
                          <option value="2">Local Z</option>
                        </select>
                        <small>
                          Keep stock length aligned with grain or flutes, even
                          when a cut blank is wider than it is long. Rotation
                          moves these local axes with the part.
                        </small>
                      </label>
                    )}
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
                {!piece.offcut && <GuidePlacementEditor project={project} pieceId={piece.id} onChange={(next) => safe(() => change(next))}
                  onOpenStage={guideReady ? (id) => { setStepId(id); setPanel("step"); } : undefined}
                  onRegenerateGuide={!guideReady ? () => safe(() => {
                    const next = generateBuildGuide(project);
                    change(next); setStepId(next.pieces.find((part) => part.id === piece.id)!.stepId); setPanel("step");
                  }) : undefined} />}
                {guideReady && !piece.offcut && (
                  <details className="field-section">
                    <summary>Initial step assignment</summary>
                    <label className="field">
                      Initial display step
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
                    <p className="small-note">Build stage above controls regenerated guides. This selector changes the current editing timeline.</p>
                  </details>
                )}
                {(material(piece.material).cuttable || canEditThroughOpenings(piece)) && (
                  <div className="field-section cut-section">
                    <h4>
                      <Scissors size={15} />
                      Shape this stock
                    </h4>
                    <p>
                      {canEditThroughOpenings(piece) && !material(piece.material).cuttable
                        ? "Preview through-cuts in the retained face."
                        : canEditThroughOpenings(piece)
                          ? "Preview trims, through-cuts, and reusable offcuts."
                          : "Preview the retained dimensions and reusable offcuts."}
                    </p>
                    <button
                      className="button primary full"
                      onClick={() => setModal("cut")}
                    >
                      Cut / resize stock
                    </button>
                    {material(piece.material).cuttable && (
                      <button type="button" className="button secondary full" onClick={() => openPartStockPlan(piece.id)}>
                        View stock cut plan
                      </button>
                    )}
                  </div>
                )}
                {piece.offcut && <button className="button secondary full" onClick={()=>reuseOffcut(piece.id)}>Use offcut in build</button>}
                <WoodSupportPanel project={project} review={woodSupport} pieceId={piece.id} onInspect={inspectStock}
                  onReviewBearing={bearingReview.pairs.some(({ top, base }) => piece.id === top.id || piece.id === base.id)
                    || bearingReview.withoutContact.some(({ topId, baseId }) => piece.id === topId || piece.id === baseId)
                    ? () => openConnectionReview({ title: `Bearing joints for ${partLabel(project, piece.id)}`, memberIds: [piece.id], bearingPartId: piece.id })
                    : undefined} />
                {sagPanel && <ShelfSagPanel key={sagPanel.pieceId} project={project} {...sagPanel} onChange={change}
                  divider={shelfDivider}
                  onPreviewDivider={(fit) => {
                    setShelfDividerDraft(fit ? { project, fit } : null);
                    if (!fit) return;
                    setStage(null);
                    setPlaying(false);
                    setExplode(false);
                    setView((previous) => ({ preset: "iso", nonce: previous.nonce + 1 }));
                  }}
                  onCommitDivider={(fit) => safe(() => {
                    if (shelfDividerDraft?.project !== current.current || shelfDividerDraft.fit !== fit)
                      throw Error("The shelf or its supports changed. Preview the center divider again.");
                    change(fit.project);
                    setShelfDividerDraft(null);
                    notify("Center divider added to the build.");
                  })}
                />}
                <details className="connection-settings">
                  <summary>Connect parts</summary>
                  <div className="field-section">
                    {connectionReview.parts.some((part) => part.pieceId === piece.id) && <button type="button" className="button secondary full" onClick={() => openConnectionReview({title:`${partLabel(project,piece.id)} · ${piece.name}`,memberIds:[piece.id]})}>Review nearby connections</button>}
                    <button className="button secondary full" onClick={() => openFasteners()}>
                      Plan wood-fastener locations
                    </button>
                    <button className="button secondary full" onClick={() => openConnectors()}>Plan A21Z connector</button>
                    <p>Set actual entrance points and drive directions for wood screws, with measured seating and pilot data.</p>
                    <h4>
                      <Link2 size={14} />
                      Specify a connection
                    </h4>
                    <p>
                      Connections require two parts within ½ inch. Set quantity
                      and hardware type.
                    </p>
                    <label className="field">
                      Connection hardware
                      <select
                        aria-label="Connection hardware"
                        value={hardware}
                        onChange={(e) => {
                          const id = e.target.value as MaterialId;
                          setHardware(id);
                          setScrewLength(material(id).fastenerLength ?? 3);
                        }}
                      >
                        {catalog
                          .filter((m) =>
                            ["fastener", "connector"].includes(m.stockKind),
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.subtitle}
                            </option>
                          ))}
                      </select>
                    </label>
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
                        label="Hardware count"
                        value={screws}
                        min={1}
                        max={100}
                        unit="pcs"
                        onChange={(n) => setScrews(Math.round(n))}
                      />
                      <div className="field">
                        <span>Stock size</span>
                        <strong>{material(hardware).subtitle}</strong>
                      </div>
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
                              hardware === "nail" ||
                                material(hardware).fastenerType === "nail"
                                ? "nail"
                                : material(hardware).stockKind === "connector"
                                  ? "bracket"
                                  : "screw",
                              hardware,
                            ),
                          );
                          notify("Connection added to the build guide");
                        })
                      }
                    >
                      <Wrench size={14} />
                      Add connection
                    </button>
                    {project.joints
                      .filter((j) => j.a === piece.id || j.b === piece.id)
                      .map((j) => (
                        <div className="joint-row" key={j.id}>
                          <span>
                            {j.quantity} × {j.kind}
                            {j.kind === "bracket" ? "s" : ` · ${j.length} in`}
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
                </details>
                <div className="inline part-actions">
                  <button
                    className="button secondary"
                    onClick={() => safe(clonePiece)}
                  >
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
                  onClick={() => {
                    setInventoryTarget(undefined);
                    setModal("inventory");
                  }}
                >
                  <Plus size={14} />
                  Record store snapshot
                </button>
                <p>
                  Cuts retain their physical source stock. Untracked boards use
                  length packing. Sheet blanks share proposed layouts with ⅛ in
                  kerf; existing cut sources are reserved separately.
                </p>
              </div>
              <button
                className="button secondary full"
                onClick={() => setModal("catalog")}
              >
                Review product references
              </button>
              <PricingSummary coverage={pricing} />
              {project.fastenerPlans.length > 0 && (
                <details className="field-section">
                  <summary>Planned wood-fastener purchases</summary>
                  {plannedFastenerPurchases.products.filter((row) => row.plannedScrews || row.selectedPacks || row.excludedLocations).map((row) => (
                    <p key={row.productId}>{row.productName}: {row.plannedScrews} provisional screws · {row.requiredPacks} required packs · {row.selectedPacks} selected · {row.shortfallPacks} missing. {row.excludedLocations} locations excluded.</p>
                  ))}
                  <p>Supply rows alone purchase complete packs. Review pending geometry, exact fasteners and any legacy connection quantities.</p>
                  <button className="button secondary full" onClick={() => openFasteners()}>Review wood-fastener locations</button>
                </details>
              )}
              {project.connectorPlans.length > 0 && <details className="field-section">
                <summary>Planned A21Z connector purchases</summary>
                {plannedConnectorPurchases.products.filter((row) => row.requiredUnits || row.selectedPacks || row.excludedUnits).map((row) => <p key={row.productId}>{row.productName}: {row.requiredUnits} provisional units · {row.requiredPacks} required packs · {row.selectedPacks} selected · {row.shortfallPacks} missing. {row.excludedUnits} units excluded.</p>)}
                <p>One complete screw or nail reference per angle. Manual supply rows alone purchase packs; entered wood paths do not establish connector fit.</p>
                <button className="button secondary full" onClick={() => openConnectors()}>Review A21Z connector plans</button>
              </details>}
              {plannedPinPurchases.length > 0 && (
                <div className="notice attachment-purchase-notice">
                  <div>
                    <strong>Planned shelf-pin purchases</strong>
                    {plannedPinPurchases.map((pins) => (
                      <div key={pins.productId}>
                        <p>{pins.productName}</p>
                        <p>
                          {pins.plannedPins} planned pins · Required packs:{" "}
                          {pins.requiredPacks} · Selected packs:{" "}
                          {pins.selectedPacks} · Missing packs: {pins.shortfallPacks}.
                        </p>
                        {!pins.retailerSupported && (
                          <p className="small-note">
                            The exact pin pack has no reviewed offer at this
                            retailer. Review its source before choosing a purchase.
                          </p>
                        )}
                        {pins.canAddMissing && (
                          <button
                            className="button secondary full"
                            aria-label={`Add missing pin packs for ${pins.productName}`}
                            onClick={() =>
                              safe(() =>
                                change(addMissingAttachmentPinPacks(project, pins.productId)),
                              )
                            }
                          >
                            Add missing pin packs
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="text-button"
                      onClick={() => openAttachments()}
                    >
                      Review shelf support purchases
                    </button>
                  </div>
                </div>
              )}
              {project.restraintPlans.length > 0 && (
                <div className="notice attachment-purchase-notice">
                  <div>
                    <strong>Planned restraint-kit purchases</strong>
                    <p>
                      {plannedRestraintPurchases.plannedKits} provisional
                      locations · Selected kits:{" "}
                      {plannedRestraintPurchases.selectedKits} · Missing kits:{" "}
                      {plannedRestraintPurchases.shortfallKits}.
                    </p>
                    <p className="small-note">
                      Each complete kit is counted once. The location count is a
                      design choice; fitting, joinery and installation remain
                      under review.
                    </p>
                    <button className="text-button" onClick={openRestraints}>
                      Review restraint purchases
                    </button>
                    {plannedRestraintPurchases.canAddMissing && (
                      <button
                        className="button secondary full"
                        onClick={() =>
                          safe(() => change(addMissingRestraintKits(project)))
                        }
                      >
                        Add missing restraint kits
                      </button>
                    )}
                  </div>
                </div>
              )}
              {glazingProfiles && (
                <SunliteProfilePanel key={`glazing-profiles-${project.id}`} project={project} review={glazingProfiles}
                  onChange={change} shownId={shownProfileRun?.id ?? null}
                  onShow={(run) => showGlazingRun(run?.id ?? null)}
                />
              )}
              {glazingTape && (
                <SunliteTapePanel key={`glazing-tape-${project.id}`} project={project} review={glazingTape}
                  onChange={change} onShow={showGlazingRun} shownId={shownProfileRun?.id ?? null} />
              )}
              {(bandingGuide.length > 0 || project.pieces.some(isBandingPanel)) && (
                <EdgeBandingPanel key={`edge-banding-${project.id}`} project={project} shown={shownBandingEdge} onChange={change}
                  onShow={(edge) => {
                    setBandingMark(edge ? { project, edge } : null);
                    if (edge) {
                      setShownProfileRunId(null);
                      setStage(null);
                      setPlaying(false);
                      setExplode(false);
                      inspectWorkspace();
                    }
                  }} />
              )}
              {glazingEstimate && (
                <SunliteTakeoffPanel
                  estimate={glazingEstimate}
                  backingNotes={[
                    ...roofBacking.map((review) => `${review.title} · ${roofBackingSummary(review)} See Checks for the gap locations.`),
                    ...ventBacking.map((review) => `${review.title} · ${ventBackingSummary(review)}`),
                  ]}
                  onAdd={() => safe(() => change(addEstimatedSunlitePurchases(project)))}
                />
              )}
              {glazingEstimate && (
                <SunliteThermalPanel key={`glazing-thermal-${project.id}`} project={project} review={glazingThermal} onChange={change} />
              )}
              {(glazingEstimate || glazingMounts.length > 0) && (
                <SunliteMountPanel key={`glazing-mounts-${project.id}`} project={project} reviews={glazingMounts} panelId={sunliteMountPanelId} onSelectPanel={setSunliteMountPanelId} onChange={change}
                  onShow={(id) => {
                    const finding = findings.find((row) => row.id === `sunlite-mount-${id}`);
                    if (finding) showFindingArea(finding);
                  }}
                />
              )}
              {!!project.saunaHeaterPlans?.length && (
                <details className="field-section">
                  <summary>Sauna heater sourcing</summary>
                  {project.saunaHeaterPlans.some((plan) => plan.productId === saunaSourcing.productId) ? (
                    <>
                      <p className="small-note">
                        {saunaSourcing === harviaKit ? "Package candidates" : "Modeled layouts within reviewed ranges"} {saunaHeaterStock.needed} · Selected {saunaHeaterStock.selected}.
                      </p>
                      <p className="small-note">
                        <a href={saunaSourcing.listing} target="_blank" rel="noreferrer">
                          {saunaSourcing === harviaKit ? "Home Depot · KITJH60-HD" : "Bathing Brands on Lowe’s marketplace"}
                        </a>
                      </p>
                      {saunaSourcing === harviaKit && <p className="small-note">{harviaKit.installationReview}</p>}
                    </>
                  ) : (
                    <p className="small-note">The saved heater has no verified package reference at the selected retailer.</p>
                  )}
                  {saunaHeaterStock.missing > 0 && (
                    <button type="button" className="button secondary full"
                      onClick={() => safe(() => change(addMissingSaunaHeaters(project, saunaSourcing.productId)))}>
                      Add sauna heater package reference
                    </button>
                  )}
                </details>
              )}
              {liningBackingLines.length > 0 && project.retailer === "home-depot" && (
                <SaunaLiningPurchasePanel key={`sauna-lining-purchases-${project.id}`} project={project} onChange={change} />
              )}
              {(rodSockets.needed > 0 || rodSockets.selected > 0) && (
                <details className="field-section">
                  <summary>Everbilt rod sockets · {rodSockets.missing ? `${rodSockets.missing} to add` : `${rodSockets.selected} selected`}</summary>
                  <p className="small-note">
                    Everbilt 311V · {rodSockets.needed} pairs planned · {rodSockets.selected} selected.
                    Each pair has one open and one closed socket. Dry-fit the delivered pieces.
                  </p>
                  {rodSockets.missing > 0 && project.retailer === "home-depot" && (
                    <button className="button secondary full"
                      onClick={() => safe(() => change(addMissingRodSockets(project)))}>
                      Add missing Everbilt socket pairs
                    </button>
                  )}
                </details>
              )}
              {project.rodFitPlans?.some((plan) => !plan.rodMaterial) && (
                <details className="field-section">
                  <summary>Closet rod flange pairs · {rodFlanges.needed} measured</summary>
                  <p className="small-note">
                    Project Source 23723PHSLG · {rodFlanges.needed} pairs planned · {rodFlanges.selected} selected.
                    Each pair contains one open and one closed flange.
                  </p>
                  {rodFlanges.missing > 0 && project.retailer === "lowes" && (
                    <button className="button secondary full"
                      onClick={() => safe(() => change(addMissingRodFlanges(project)))}>
                      Add missing closet flange pairs
                    </button>
                  )}
                  {rodFlanges.missing > 0 && project.retailer !== "lowes" && (
                    <p className="small-note">The reviewed 23723PHSLG pair is listed at Lowe’s.</p>
                  )}
                </details>
              )}
              {(rodBrackets.needed > 0 || rodBrackets.selected > 0) && (
                <details className="field-section">
                  <summary>Intermediate rod brackets · {rodBrackets.needed} planned</summary>
                  <p className="small-note">
                    Project Source 27587PHLLG · Planned positions {rodBrackets.needed} · Selected {rodBrackets.selected}.
                    The bracket includes the rod clip. Fasteners are separate.
                  </p>
                  {rodBrackets.missing > 0 && project.retailer === "lowes" && (
                    <button className="button secondary full"
                      onClick={() => safe(() => change(addMissingRodBrackets(project)))}>
                      Add missing rod brackets
                    </button>
                  )}
                  {rodBrackets.missing > 0 && project.retailer !== "lowes" && (
                    <p className="small-note">The reviewed 27587PHLLG bracket is listed at Lowe’s.</p>
                  )}
                </details>
              )}
              {(everbiltRodBrackets.needed > 0 || everbiltRodBrackets.selected > 0) && (
                <details className="attachment-purchases">
                  <summary>Everbilt 14317 closet rod brackets</summary>
                  <p>Measured positions {everbiltRodBrackets.needed} · Selected {everbiltRodBrackets.selected}.</p>
                  {everbiltRodBrackets.missing > 0 && project.retailer === "home-depot" && (
                    <button className="button secondary full" onClick={() => safe(() => change(addMissingEverbiltRodBrackets(project)))}>
                      Add missing Everbilt rod brackets
                    </button>
                  )}
                </details>
              )}
              {project.retailer === "home-depot" && (
                <>
                  <TrimSealantPanel key={`trim-sealant-${project.id}`} project={project} onChange={change} />
                  <WoodGluePanel key={`wood-glue-${project.id}`} project={project} joints={woodJointDetails} onChange={change} />
                </>
              )}
              <SuppliesPanel
                project={project}
                onChange={(next) => safe(() => change(next))}
              />
              {supplyPurchases.some((row) => row.isTool) && (
                <SuppliesPanel project={project} kind="tools" onChange={(next) => safe(() => change(next))} />
              )}
              {rows.map((r) => (
                <div className="bom-row" key={r.id} data-stock-material={r.id} tabIndex={-1}>
                  <div>
                    <strong>{material(r.id).name}</strong>
                    <span>
                      {r.quantity} {purchaseUnitLabel(material(r.id).unit, r.quantity)}{r.onHandStockUnits > 0 && " to buy"}{" "}
                      · {r.pieces} {r.pieces === 1 ? "part" : "parts"}
                    </span>
                  </div>
                  <b>{r.unpriced && r.quantity > 0 ? "Unpriced" : money(r.total)}</b>
                  {r.onHandStockUnits > 0 && (
                    <small>{r.onHandStockUnits} stock {r.onHandStockUnits === 1 ? "source" : "sources"} on hand</small>
                  )}
                  {r.packCount > 1 && (
                    <small>
                      {r.physicalStockUnits} individual items needed ·{" "}
                      {r.purchasedStockUnits} supplied in {r.quantity} purchase{" "}
                      {r.quantity === 1 ? "unit" : "units"} ·{" "}
                      {r.surplusStockUnits} spare
                    </small>
                  )}
                  {(r.quantity > 0 || !r.onHandStockUnits) && <small>
                    {r.verified
                      ? `Snapshot · ${r.inventory!.available} available`
                      : r.supplier ? "Direct supplier · price and availability to confirm" : "Availability unverified"}
                  </small>}
                  {r.oversize > 0 && (
                    <em>{r.oversize} oversized · excluded from estimate</em>
                  )}
                  {(r.quantity > 0 || !r.onHandStockUnits) && <a
                    href={
                      r.inventory?.url ??
                      shoppingOfferForMaterial(
                        material(r.id),
                        project.retailer ?? "home-depot",
                      )?.offer.url ??
                      r.supplier?.url ??
                      retailerSearch(
                        project.retailer ?? "home-depot",
                        material(r.id).search,
                      )
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.supplier ? `View at ${r.supplier.seller}` : `Find at ${retailerName(project.retailer)}`}{" "}
                    <ExternalLink size={11} />
                  </a>}
                  {project.retailer === "home-depot" && r.pieces >= 2 && (
                    <StockGroupComparison
                      key={project.id}
                      project={project}
                      source={r.id}
                      inventoryTick={inventoryTick}
                      onRecordSnapshot={(stock) => {
                        setInventoryTarget(stock);
                        setModal("inventory");
                      }}
                      onReplace={(source, replacement) => safe(() => {
                        change((p) => {
                          if (p !== project) throw Error("The project changed. Review the updated stock comparison.");
                          return previewGroupStockReplacement(p, source, replacement).project;
                        });
                        notify("Stock updated for the compared parts.");
                      })}
                    />
                  )}
                  <SheetLayouts row={r} project={project} />
                  {(sourceIdsByMaterial.get(r.id) ?? []).map((sourceId, index) => (
                    <details className="recorded-source-layout" key={sourceId}>
                      <summary>Recorded cut source {index + 1} · {
                        project.plannedCutSources?.some((plan) => plan.sourceId === sourceId) ? "cuts planned" : "parts and offcuts"
                      }</summary>
                      <CutStockLayout project={project} sourceId={sourceId} inspection={currentCutSources}
                        onStockOnHand={(onHand) => markStockOnHand(sourceId, onHand)}
                        onCompleteCut={() => completeStockCuts(sourceId)}
                        onReleaseCut={() => releaseStockCuts(sourceId)}
                        onSelectPart={(id) => {
                          setSelected(id); setSelectedSectionId(null); setSelectionScope("part");
                          setPanel("part"); setStage(null); setPlaying(false); setMode("select");
                        }} />
                    </details>
                  ))}
                  {r.rolls.length > 0 && (
                    <details className="roll-layout">
                      <summary>{material(r.id).orderRollWidth ? "Foil roll cut layout" : `Roll layout · ${r.rolls.length} rolls`}</summary>
                      <p>
                        {material(r.id).orderRollWidth
                          ? `${material(r.id).orderRollWidth} in wide · ${r.quantity} linear ft for the quote. Confirm supplied lengths and flat cuts, including folds.`
                          : "24 in × 25 ft stock. Feasible shelf layout; snip cuts use zero kerf. Not a global waste optimum."}
                      </p>
                      {r.rolls.map((roll, i) => (
                        <div className="roll-plan" key={i}>
                          <strong>
                            {material(r.id).orderRollWidth ? "Requested length" : `Roll ${i + 1}`} ·{" "}
                            {format(roll.length - roll.usedLength)} uncut tail
                          </strong>
                          <div
                            className="roll-strip"
                            role="img"
                            aria-label={`Roll ${i + 1} cutting layout`}
                          >
                            {roll.placements.map((cut) => (
                              <span
                                key={cut.id}
                                title={`${partLabel(project, cut.id)} · ${cut.name}: ${formatPreciseInches(cut.width)} × ${formatPreciseInches(cut.length)}`}
                                style={{
                                  left: `${(cut.y / roll.length) * 100}%`,
                                  top: `${(cut.x / roll.width) * 100}%`,
                                  width: `${(cut.length / roll.length) * 100}%`,
                                  height: `${(cut.width / roll.width) * 100}%`,
                                }}
                              >
                                {partLabel(project, cut.id)}
                              </span>
                            ))}
                          </div>
                          <ol>
                            {roll.placements.map((cut) => {
                              const folds = material(r.id).orderRollWidth
                                ? foilReturnText(project.pieces.find((piece) => piece.id === cut.id)?.foilReturns) : "";
                              return <li key={cut.id}>
                                {partLabel(project, cut.id)} · {cut.name} ·{" "}
                                {formatPreciseInches(cut.width)} ×{" "}
                                {formatPreciseInches(cut.length)}
                                {folds && ` · Folds ${folds}`}
                              </li>;
                            })}
                          </ol>
                        </div>
                      ))}
                    </details>
                  )}
                  {r.bins.some((bin) => !bin.sourceId) && (
                    <details>
                      <summary>
                        {material(r.id).shape === "tube-envelope"
                          ? `Tube stock estimate · ${r.bins.filter((bin) => !bin.sourceId).length}`
                          : `Cut layout · ${r.bins.filter((bin) => !bin.sourceId).length} boards`}
                      </summary>
                      {r.bins.filter((bin) => !bin.sourceId).map((b, i) => (
                        <div className="cut-board" key={i}>
                          <small>
                            {material(r.id).shape === "tube-envelope" ? "Tube" : "Board"}{" "}
                            {i + 1} · {format(b.remaining)} remaining
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
                  <StockCutSequenceList project={project} row={r} sequences={cutSequences.get(r.id) ?? []}
                    onRecordMany={recordStockUnits}
                    onSaveLoss={saveStockCutLoss} onRecord={recordStockUnit} />
                  <WoodStockKerf project={project} row={r} onApply={applyWoodStockKerf} />
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
              <button
                className="button secondary full"
                onClick={() => setModal("handoff")}
              >
                <ExternalLink size={14} />
                Prepare {retailerName(project.retailer)} list
              </button>
              <p className="small-note">
                This CSV is a shopping handoff. Direct import into Home Depot
                Project Planning is not connected.
              </p>
            </>
          )}
          {returnToPreparation && ["part", "materials", "tools", "checks"].includes(panel) && (
            <button type="button" className="text-button" onClick={() => {
              setReturnToPreparation(false);
              setPanel("prep");
            }}>← Back to build preparation</button>
          )}
          {panel === "step" && (preparation.length > 0 || hasOpeningLid) && (
            <button type="button" className="button secondary full" onClick={() => setPanel("prep")}>
              Review build preparation
            </button>
          )}
          {panel === "prep" && (
            <BuildPreparationPanel groups={preparation} onOpen={openBuildPreparationItem} onBack={() => setPanel("step")} />
          )}
          {panel === "step" && !guideReady && (
            <>
              <div className="panel-intro">
                <Layers3 size={28} />
                <h2>Your guide comes last.</h2>
                <p>
                  Build your layout first. Generate the sequence when you are
                  ready; no manual steps are required.
                </p>
                <button
                  className="button primary full"
                  disabled={!project.pieces.length}
                  onClick={generateGuide}
                >
                  Generate build guide
                </button>
              </div>
              <button type="button" className="button secondary full" disabled={!canReviewConnections} onClick={() => openConnectionReview({title:"Connections in this project",memberIds:connectionReview.parts.map((part) => part.pieceId),ownerId:project.id,stageKey:"all-connections"})}>Review connection decisions</button>
              <div className="field-section">
                <h4>Parts in your design</h4>
                {project.pieces.map((x) => (
                  <button
                    key={x.id}
                    className="step-part"
                    data-part-id={x.id}
                    aria-label={`${partLabel(project, x.id)} · ${x.name}`}
                    onClick={() => select(x.id)}
                  >
                    <Box size={14} />
                    <span>
                      {partLabel(project, x.id)} · {x.name}
                    </span>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "step" && guideReady && (
            <>
              <GuidePartLabels project={project} stepId={activeStepId}
                focusedId={activeGuidePart?.row.pieceId} onLocate={locateGuidePart}
                onPrint={(id) => printPartLabels(project, id)} />
              <div className="part-title">
                <span className="eyebrow">
                  STEP{" "}
                  {project.steps.findIndex((s) => s.id === activeStepId) + 1} OF{" "}
                  {project.steps.length}
                </span>
                <h2>{currentStep.title}</h2>
              </div>
              {activeStepOrder && <p className="placement-warning" role="status">{activeStepOrder.detail}</p>}
              {liningBackingContent && currentStep.generated?.kind === "assembly-stage" &&
                currentStep.generated.stageKey === "cedar-lining" && (
                  <details className="field-section">
                    <summary>Sauna lining backing</summary>
                    {liningBackingContent}
                  </details>
                )}
              {currentStep.generated?.kind === "wood-fastener-preparation" && (
                <button className="button secondary full" onClick={() => openFasteners(currentStep.generated?.planId ?? null)}>
                  Edit wood-fastener locations
                </button>
              )}
              {currentStep.generated?.kind === "connector-preparation" && <button className="button secondary full" onClick={() => openConnectors(currentStep.generated?.planId ?? null)}>Edit A21Z connector plan</button>}
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
              <GuideConnectionSchedule
                project={project}
                stepId={activeStepId}
                coverage={connectionReview}
                onOpenConnections={openConnectionReview}
                onInspectPiece={inspectConnectionPiece}
                onReviewIntent={(intent) => reviewConnectionIntent(intent,scopeForGuideIntent(intent))}
              />
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
                  setGuidePartFocus(null);
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
                      data-part-id={x.id}
                      aria-label={`${partLabel(project, x.id)} · ${x.name}`}
                      key={x.id}
                      onClick={() => {
                        setSelectionScope("part");
                        setSelectedSectionId(null);
                        setSelected(x.id);
                        setPanel("part");
                      }}
                    >
                      <Box size={14} />
                      <span>
                        {partLabel(project, x.id)} · {x.name}
                      </span>
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
                      <p key={h.id}>{h.offcutCut?.releasedAt && <strong>Released · </strong>}{h.message}</p>
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
      <button
        type="button"
        className="button primary inspector-focus-toggle"
        hidden={inspectorFocus.focused}
        aria-controls="workshop-inspector"
        aria-expanded={inspectorFocus.focused}
        onClick={inspectorFocus.expand}
      ><Expand size={16} />{inspectorFocus.returnable ? "Return to inspector" : "Expand inspector"}</button>
      <footer className="statusbar">
        <span>
          <span className="green-dot" />
          {project.pieces.filter((p) => !p.offcut).length} parts <b>·</b>{" "}
          <ConnectionSummary coverage={connectionReview} onReview={() => openConnectionReview({title:"Connections in this project",memberIds:connectionReview.parts.map((part) => part.pieceId),ownerId:project.id,stageKey:"all-connections"})} /> <b>·</b>{" "}
          {project.pieces.filter((p) => p.offcut).length} offcuts
        </span>
        <span>Concept workspace · engineering review required</span>
        <button onClick={() => setModal("help")}>
          Made for the making <ArrowRight size={12} />
        </button>
      </footer>
      {toast && (modal !== "cut" || toast.error) && (
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
            className={`modal ${modal === "assistant" || modal === "idea" || modal === "drawing" || modal === "doorway" || modal === "wall-water" || modal === "water-fitting" || modal === "water-stop" || modal === "sink-drain" || modal === "water-pressure" || modal === "water-support" || (modal === "import" && importKind === "drawing") || modal === "cut" || modal === "part-stock" || modal === "offcut-reuse" || modal === "offcut-release" || modal === "handoff" || modal === "studies" ? "wide" : ""}`}
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
            {modal === "idea" && (
              <IdeaPlanner
                project={project}
                initialTarget={ideaTarget}
                onConnectionAction={(action) => safe(() => openAskedConnection(action))}
                findings={findings}
                onBuildQuestionAction={(action) => safe(() => openAskedBuildReview(action))}
                onApply={(next, source) => {
                  safe(() => {
                    change((live) => {
                      if (live !== source) throw Error("The workspace changed. Review the current proposal before applying it.");
                      return next;
                    });
                    setStage(null);
                    setSelected(null);
                    setSelectedSectionId(null);
                    setView((v) => ({ preset: "iso", nonce: v.nonce + 1 }));
                    setModal(null);
                    notify(
                      "Design saved as editable parts. Review assumptions and checks before building.",
                    );
                  });
                }}
                onClose={() => setModal(null)}
              />
            )}
            {modal === "doorway" && <DoorwayPanel project={project} initialSectionId={selectedSectionId} onApply={(draft) => safe(() => {
              if (current.current !== project) throw Error("The project changed. Preview the doorway again.");
              const next = change(draft.impact.candidate);
              const plan = next.motionPlans?.find(({ id }) => id === draft.plan?.id);
              setSelectedSectionId(draft.section.id);
              setSelected(null);
              setSelectionScope("section");
              setStage(null);
              setPlaying(false);
              setExplode(false);
              setMode("select");
              setModal(null);
              if (plan) {
                const result = runMotionTest(next, plan, plan.testSetup);
                setPanel("motion");
                setMotionTestSelection({ project: next, plan, setup: plan.testSetup, result });
                setMotionPreview(result.review ? { project: next, value: result.review.preview(0) } : null);
              } else setPanel("sections");
              notify(plan ? "Doorway and swing saved. Review the opening before building." : "Doorway framing saved. Review the cuts and build guide.");
            })} />}
            {modal === "wall-water" && <WallWaterPanel project={project} initialWall={selectedSectionId} initialRun={waterRunTarget}
              onApply={(draft) => safe(() => {
                if (current.current !== project) throw Error("The workspace changed. Preview the water line again.");
                change(draft.project);
                setStage(null);
                setPlaying(false);
                setExplode(false);
                setMode("select");
                setSelected(draft.run.pipeId);
                setSelectedSectionId(null);
                setSelectionScope("part");
                setPanel("part");
                setModal(null);
                notify("Water line added with its bores, shields and cut length.");
              })}
              onRemove={(run) => safe(() => {
                change((live) => removeWaterRun(live, run));
                setSelected(null);
                setStage(null);
                setPanel("sections");
                setModal(null);
                notify("Planned water line removed.");
              })} />}
            {modal === "water-fitting" && <WaterFittingPanel project={project} initialFitting={waterFittingTarget} startWithTee={waterFittingTee}
              onApply={(draft) => safe(() => {
                if (current.current !== project) throw Error("The workspace changed. Preview the connection again.");
                change(draft.project);
                setStage(null);
                setPlaying(false);
                setExplode(false);
                setMode("select");
                setSelected(draft.fitting.pieceId);
                setSelectedSectionId(null);
                setSelectionScope("part");
                setPanel("part");
                setModal(null);
                notify("PEX connection and pipe cuts updated.");
              })}
              onRemove={(fitting) => safe(() => {
                change((live) => removeWaterFitting(live, fitting));
                setSelected(null);
                setStage(null);
                setPanel("sections");
                setModal(null);
                notify("Fitting removed. The pipe cuts stay in the plan.");
              })} />}
            {modal === "sink-drain" && <SinkDrainPanel project={project} measurement={measurement} initialDrain={sinkDrainTarget}
              onApply={(draft) => safe(() => {
                if (current.current !== project) throw Error("The workspace changed. Preview the sink drain again.");
                change(draft.project);
                setStage(null);
                setPlaying(false);
                setExplode(false);
                setMode("select");
                inspectStock(draft.record.bodyId);
                setModal(null);
                notify("Sink drain and wall-tube cut added.");
              })}
              onRemove={(record) => safe(() => {
                change((live) => removeSinkDrain(live, record));
                setSelected(null);
                setStage(null);
                setPanel("sections");
                setModal(null);
                notify("Sink drain removed. The usable tube stays in the Cut pool.");
              })} />}
            {modal === "water-stop" && <WaterStopPanel project={project} initialStop={waterStopTarget}
              onApply={(draft) => safe(() => {
                if (current.current !== project) throw Error("The workspace changed. Preview the shutoff again.");
                change(draft.project);
                setStage(null);
                setPlaying(false);
                setExplode(false);
                setMode("select");
                inspectStock(draft.stop.pieceId);
                setModal(null);
                notify("Fixture shutoff and pipe cut added.");
              })}
              onRemove={(stop) => safe(() => {
                change((live) => removeWaterStop(live, stop));
                setSelected(null);
                setStage(null);
                setPanel("sections");
                setModal(null);
                notify("Shutoff removed. The pipe cut stays in the plan.");
              })} />}
            {modal === "water-pressure" && <WaterPressurePanel project={project} initialRecord={waterPressureTarget}
              onChange={(next) => { change(next); notify("Water test record added to the guide."); }} />}
            {modal === "water-support" && <WaterSupportPanel project={project}
              onPlanRun={(runId) => { setWaterRunTarget(runId); setModal("wall-water"); }}
              onInspect={(pieceId) => {
                setModal(null); setStage(null); setPlaying(false); setExplode(false); setMode("select");
                inspectStock(pieceId);
              }} />}
            {modal === "catalog" && <CatalogReferences />}
            {modal === "studies" && (
              <BuildStudies
                project={project}
                onOpen={(next) => {
                  if (replace(next))
                    notify(
                      "Study opened as an editable project. The draft you left is available under Open project.",
                    );
                }}
                onClose={() => setModal(null)}
              />
            )}
            {modal === "cut" && piece && (
              <CutStudio
                project={project}
                pieceId={piece.id}
                onApply={(next, kind) =>
                  safe(() => {
                    change(next);
                    setModal(null);
                    notify(
                      kind === "round"
                        ? "Round opening updated."
                        : kind === "rectangle"
                          ? "Rectangular cut updated."
                          : kind === "trim-reuse"
                            ? "Cuts and offcut assignments saved to the build guide."
                            : "Cuts applied. The retained part stays selected; offcuts are available for reuse.",
                    );
                  })
                }
                onClose={() => setModal(null)}
              />
            )}
            {modal === "part-stock" && stockPlanPiece && (
              <PartStockPlan
                project={project}
                piece={stockPlanPiece}
                row={rows.find(({ id }) => id === stockPlanPiece.material)}
                sequences={cutSequences.get(stockPlanPiece.material)}
                inspection={currentCutSources}
                onSaveLoss={saveStockCutLoss}
                onApplyWoodKerf={applyWoodStockKerf}
                onRecord={recordStockUnit}
                onStockOnHand={markStockOnHand}
                onCompleteCut={completeStockCuts}
                onReleaseCut={releaseStockCuts}
                onReviewOffcut={openOffcutReleaseReview}
                onReplaceStock={(pieceId, stockId) => safe(() => {
                  change((p) => previewPartStockReplacement(p, pieceId, stockId).project);
                  notify("Part stock updated. The finished blank stays in place.");
                })}
                onAssignOffcut={(pieceId, offcutId) => safe(() => {
                  change((p) => assignOffcutToPart(p, pieceId, offcutId));
                  notify("Offcut assigned. Check the updated cut source and shopping list.");
                })}
              />
            )}
            {modal === "measured-offcut" && (
              <MeasuredOffcutForm onAdd={(id, dimensions, name) => {
                change((p) => addMeasuredOffcut(p, activeStepId, id, dimensions, name));
                setModal(null);
                notify("Measured stock added to the Cut pool.");
              }} />
            )}
            {modal === "offcut-reuse" && offcutReusePlan && (
              <OffcutReuseReview plan={offcutReusePlan} onApply={() => safe(() => {
                if (current.current !== offcutReusePlan.source)
                  throw Error("The project changed. Reopen the Cut pool review for updated assignments.");
                change(offcutReusePlan.project);
                setModal(null);
                notify("Offcut plan applied. The Cut pool and shopping list are updated.");
              })} />
            )}
            {modal === "offcut-release" && offcutReleasePreview && (
              <OffcutReleaseReview preview={offcutReleasePreview} onApply={(plan) => safe(() => {
                if (current.current !== plan.source)
                  throw Error("The project changed. Reopen the offcut assignment to review the current stock.");
                change(plan.project);
                setModal(null);
                notify("Uncut stock returned to the Cut pool. The affected parts can be planned again.");
              })} />
            )}
            {modal === "zone" && (
              <WorkZoneForm
                project={project}
                onApply={(workZone) => {
                  change((p) => ({ ...p, workZone }));
                  setView((v) => ({ preset: "iso", nonce: v.nonce + 1 }));
                }}
                onClose={() => setModal(null)}
              />
            )}
            {(modal === "assistant" || modal === "base") && (
              <>
                {modal === "base" && (
                  <h2 id="modal-title">{proposal?.targetSectionId ? "Revise floor base" : "Configure a floor base"}</h2>
                )}
                {modal === "assistant" && <>
                  <div className="modal-icon">
                    <Sparkles size={25} />
                  </div>
                  <span className="eyebrow">
                  FROM AN IDEA TO INDIVIDUAL PIECES
                </span>
                <h2 id="modal-title">What are we building?</h2>
                <p>
                  Revise a wall or base using dimensions. For furniture and
                  broader ideas, use Plan an idea.
                </p>
                <div className="provider-pill">
                  <span className="green-dot" />
                  {health?.ai === "ollama"
                    ? "AI configured · Ollama"
                    : "Local dimensioned templates · no AI model connected"}
                </div>
                <label className="field target-section-field">
                  Apply to
                  <select
                    aria-label="Prompt target"
                    value={assistantTarget}
                    onChange={(e) => {
                      setAssistantTarget(e.target.value);
                      setProposal(null);
                    }}
                  >
                    <option value="">Add a new wall or base</option>
                    {project.sections
                      .filter((s) => s.generator)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          Revise {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                {assistantTarget && (
                  <div className="notice">
                    <Info size={16} />
                    <p>
                      Revise only{" "}
                      {
                        project.sections.find((s) => s.id === assistantTarget)
                          ?.name
                      }
                      . Placement and its build step are retained. New parts
                      replace the existing section parts and remove their screw
                      connections. Undo is available. Custom instructions are
                      retained; recheck dimensions in your notes.
                    </p>
                  </div>
                )}
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
                  {["Wall 8 ft wide, 6 ft tall", "Base 6 by 4 ft"].map((s) => (
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
                  <button type="button" onClick={() => {
                    setPrompt(windowWallExample);
                    setProposal(null);
                  }}>Wall with a window</button>
                  {!!assistantTarget && <button type="button" onClick={() => {
                    setPrompt(doorwayExample);
                    setProposal(null);
                  }}>Add a doorway</button>}
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
                </>}
                {proposal && (
                  <div className="proposal">
                    {modal === "base" && proposal.targetSectionId && (
                      <p>Rebuilding replaces the parts in this base at its current placement. Undo is available.</p>
                    )}
                    {modal === "assistant" && <div>
                      <CheckCircle2 size={19} />
                      <strong>
                        {proposal.command.type === "coop"
                          ? "Backyard coop concept"
                          : proposal.command.type === "wall"
                            ? "Framed wall assembly"
                            : "Floor base assembly"}
                      </strong>
                    </div>}
                    {proposal.command.type === "foundation" ? (
                      <FloorBaseFields
                        command={proposal.command}
                        canSuggestStock={project.retailer === "home-depot"}
                        onChange={(command) => setProposal({ ...proposal, command })}
                      />
                    ) : <p>
                      {proposal.command.type === "coop"
                        ? "Fixed 6 × 4 ft footprint · elevated coop concept. This replaces the current canvas; undo is available."
                        : `${format(proposal.command.width)} wide × ${format(proposal.command.height)} tall · ${proposal.command.spacing} in spacing. ${proposal.targetSectionId ? "Replaces the selected section at its current placement." : "Added beside existing parts."}`}
                    </p>}
                    {proposal.command.type === "wall" && !proposal.command.doorOpening && <WindowWallFields
                      command={proposal.command} onChange={(command) => setProposal({ ...proposal, command })} />}
                    {proposal.command.doorOpening && <DoorOpeningFields opening={proposal.command.doorOpening}
                      onChange={(doorOpening) => setProposal({ ...proposal, command: { ...proposal.command, doorOpening } })} />}
                    {(proposal.command.windowOpening || proposal.command.doorOpening) && (
                      <details className="field-section">
                        <summary>{proposal.command.doorOpening ? "Doorway cuts and scraps" : "Window wall cuts and scraps"}</summary>
                        <label className="checkbox-field">
                          <input type="checkbox" checked={proposal.reuseWindowOffcuts ?? false}
                            onChange={({ currentTarget }) => setProposal({ ...proposal, reuseWindowOffcuts: currentTarget.checked })} />
                          Use matching Cut pool scraps for new members
                        </label>
                        {preview?.impact?.offcuts && (
                          <ul aria-label={proposal.command.doorOpening ? "Matching doorway scraps" : "Matching window wall scraps"}>
                            {preview.impact.offcuts.assignments.length ? preview.impact.offcuts.assignments.map(({ partId, target, from }) =>
                              <li key={partId}>{target} from {from}</li>) : <li>There are no matching scraps for these cuts.</li>}
                          </ul>
                        )}
                        {preview?.impact?.wallCuts.map(({ id, quantity, bins, oversizedParts }) => (
                          <div key={id}>
                            <p>{quantity} {quantity === 1 ? "board" : "boards"} of {material(id).name} for unassigned members</p>
                            <ol aria-label={proposal.command.doorOpening ? "Doorway board cuts" : "Window wall board cuts"}>
                              {bins.map(({ cuts, remaining }, index) => (
                                <li key={index}>{cuts.map(({ name, length }) =>
                                  `${name.replace(/^.*? · /, "")}, ${formatStockLength(length)}`).join(" / ")}
                                {" · "}{remaining ? `Keep ${formatStockLength(remaining)}` : "Full board used"}</li>
                              ))}
                            </ol>
                            {oversizedParts.length > 0 && <p className="small-note">
                              {oversizedParts.length} {oversizedParts.length === 1 ? "member exceeds" : "members exceed"} this stock length.
                            </p>}
                          </div>
                        ))}
                      </details>
                    )}
                    {preview?.impact && (
                      <div className="proposal-impact">
                        <p>
                          {preview.impact.removed
                            ? `Replace ${preview.impact.removed} parts with ${preview.impact.added} new parts.`
                            : `Add ${preview.impact.added} individual parts.`}{" "}
                          {preview.impact.removedConnections
                            ? `Remove ${preview.impact.removedConnections} screw connection(s).`
                            : ""}
                        </p>
                        {preview.impact.basePurchase.length > 0 && (
                          <ul className="floor-base-stock-estimate" aria-label="Floor base stock estimate">
                            {preview.impact.basePurchase.map(({ id, quantity, oversize }) => {
                              const stock = material(id);
                              const link = shoppingOfferForMaterial(stock, project.retailer)?.offer;
                              return <li key={id}>
                                {quantity} {quantity === 1 ? "board" : "boards"} · {stock.name}
                                {oversize > 0 && ` · ${oversize} cuts exceed this stock`}
                                {link && <> · <a href={link.url} target="_blank" rel="noreferrer">Product #{link.productId}</a></>}
                              </li>;
                            })}
                          </ul>
                        )}
                        <p>
                          {preview.impact.incompleteEstimate
                            ? "Stock subtotal incomplete: some materials are unpriced or parts exceed the modeled stock."
                            : `Priced stock subtotal: ${money(preview.impact.costBefore)} → ${money(preview.impact.costAfter)} (example/snapshot prices; supplies and other costs excluded)`}
                        </p>
                        {preview.impact.findings.slice(0, 3).map((f) => (
                          <p key={f.id}>
                            <AlertTriangle size={12} />
                            {f.title}
                          </p>
                        ))}
                      </div>
                    )}
                    {preview?.error && (
                      <p className="form-error" role="alert">{preview.error}</p>
                    )}
                    <small>
                      {modal === "assistant" && `${proposal.provider} · `}
                      {proposal.message}
                    </small>
                    <button
                      className="button primary full"
                      disabled={!!preview?.error}
                      onClick={() =>
                        safe(() => {
                          const next = (proposal.command.windowOpening || proposal.command.doorOpening) && preview?.impact
                            ? preview.impact.candidate : applyCommand(
                            project,
                            proposal.command,
                            proposal.targetSectionId,
                          );
                          change(next);
                          const section = proposal.targetSectionId
                            ? next.sections.find(
                                (s) => s.id === proposal.targetSectionId,
                              )
                            : next.sections.at(-1);
                          setStepId(
                            section
                              ? next.pieces.find((p) =>
                                  section.pieceIds.includes(p.id),
                                )!.stepId
                              : next.steps.at(-1)!.id,
                          );
                          setSelectedSectionId(section?.id ?? null);
                          setStage(null);
                          setSelected(null);
                          setView((v) => ({
                            preset: "iso",
                            nonce: v.nonce + 1,
                          }));
                          setModal(null);
                          if (section) {
                            setPanel("sections");
                            setSelectionScope("section");
                          }
                          notify(
                            proposal.targetSectionId
                              ? proposal.command.windowOpening
                                ? "Window wall updated. Review any changed cuts or flashing."
                                : "Section regenerated. The rest of your project is preserved."
                              : "Assembly created. Each part and step is editable.",
                          );
                        })
                      }
                    >
                      <Plus size={15} />
                      {proposal.targetSectionId
                        ? "Replace selected section"
                        : "Add to workspace"}
                    </button>
                  </div>
                )}
                {modal === "assistant" && <p className="small-note">
                  Ollama can be configured on your server for natural-language
                  interpretation. All proposals pass through the same dimension
                  checks; they do not certify structure.
                </p>}
              </>
            )}
            {modal === "settings" && (
              <>
                <h2 id="modal-title">Make it your project.</h2>
                <label className="field">
                  Retailer
                  <select
                    aria-label="Project retailer"
                    value={project.retailer ?? "home-depot"}
                    onChange={(e) =>
                      change((p) => ({
                        ...p,
                        retailer: e.target.value as Retailer,
                        store: "",
                      }))
                    }
                  >
                    <option value="home-depot">Home Depot</option>
                    <option value="lowes">Lowe's</option>
                  </select>
                </label>
                <button
                  className="button secondary full"
                  onClick={() => setModal("zone")}
                >
                  Configure work zone
                </button>
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
                      aria-label="Exact store number"
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
                      : "Live retailer inventory is not connected. Use verified inventory snapshots, or configure an authorized provider in the server environment."}
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
                target={inventoryTarget}
                onSave={(entry) => {
                  change((p) => ({
                    ...recordMaterialObservation(p, entry),
                    zip: entry.zip,
                    retailer: entry.retailer ?? "home-depot",
                    store: entry.store,
                  }));
                  setModal(null);
                  if (!inventoryTarget) setPanel("materials");
                  notify("Snapshot recorded. It is valid for this store and ZIP for 24 hours.");
                }}
              />
            )}
            {modal === "projects" && (
              <>
                <h2 id="modal-title">Your workshop.</h2>
                <p>
                  {browserWorkshop
                    ? "Projects and drafts are saved in this browser. Export an editable project to move it to another device."
                    : "Projects saved on this server. Browser drafts stay on this device until you save or export them."}
                </p>
                <div className="inline">
                  <button
                    className="button primary"
                    onClick={() => setModal("new")}
                  >
                    <Plus size={15} />
                    New project
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setImportKind("project");
                      setModal("import");
                    }}
                  >
                    <ArrowDownToLine size={15} /> Import a plan
                  </button>
                  {browserWorkshop ? (
                    <button className="button secondary" onClick={() => void downloadLibraryFile("/api/workshop-backup", "yardwork-browser-workshop.yardwork-backup.gz")}>
                      <Download size={15} /> Download workshop backup
                    </button>
                  ) : (
                    <a className="button secondary" href="/api/workshop-backup" download>
                      <Download size={15} /> Download workshop backup
                    </a>
                  )}
                </div>
                {resumeDraft && (
                  <button
                    className="template-choice"
                    onClick={() => {
                      replace(resumeDraft.project, resumeDraft.revision);
                      setResumeDraft(null);
                    }}
                  >
                    <FolderOpen size={22} />
                    <div>
                      <strong>Resume previous browser draft</strong>
                      <small>
                        {resumeDraft.project.name} ·{" "}
                        {resumeDraft.project.pieces.length} parts
                      </small>
                    </div>
                  </button>
                )}
                {previousDraft &&
                  previousDraft.project.id !== resumeDraft?.project.id && (
                    <button
                      className="template-choice"
                      onClick={() => {
                        setPreviousDraft(null);
                        replace(previousDraft.project, previousDraft.revision);
                      }}
                    >
                      <FolderOpen size={22} />
                      <div>
                        <strong>Open earlier browser draft</strong>
                        <small>
                          {previousDraft.project.name} ·{" "}
                          {previousDraft.project.pieces.length} parts
                        </small>
                      </div>
                    </button>
                  )}
                {draftRecoveries.length > 0 && (
                  <details className="draft-recovery">
                    <summary>
                      Preserved browser drafts · {draftRecoveries.length}
                    </summary>
                    {draftRecoveries.map((draft) => (
                      <div className="section-description" key={draft.key}>
                        <p>{draft.problem}</p>
                        <button
                          className="text-button"
                          onClick={() =>
                            download(
                              "yardwork-original-browser-draft.json",
                              draft.raw,
                              "application/json",
                            )
                          }
                        >
                          Download original browser draft
                        </button>
                      </div>
                    ))}
                  </details>
                )}
                <div className="project-list">
                  {projects.length ? (
                    projects.map((p) =>
                      p.loadError ? (
                        <div
                          className="project-recovery"
                          role="group"
                          aria-label={`Recover ${p.name}`}
                          key={p.id}
                        >
                          <strong>{p.name}</strong>
                          <p>{p.loadError}</p>
                          {browserWorkshop ? (
                            <button className="text-button" onClick={() => void downloadLibraryFile(`/api/projects/${p.id}/original`, `yardwork-original-${p.id}.json`)}>
                              Download original saved file
                            </button>
                          ) : p.originalAvailable !== false && (
                            <a className="text-button" href={`/api/projects/${p.id}/original`} download>
                              Download original saved file
                            </a>
                          )}
                          <EarlierProjectSaves
                            project={p}
                            onOpen={(number) => void openEarlierSave(p.id, number)}
                          />
                        </div>
                      ) : (
                        <Fragment key={p.id}>
                          <button
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
                          <EarlierProjectSaves
                            project={p}
                            onOpen={(number) => void openEarlierSave(p.id, number)}
                          />
                        </Fragment>
                      ),
                    )
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
                  onClick={() => replace(blank())}
                >
                  <Square size={27} />
                  <div>
                    <strong>A blank canvas</strong>
                    <small>Your materials. Your dimensions. Your idea.</small>
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
            {modal === "drawing" && (
              <>
                <h2 id="modal-title">Drawing reference</h2>
                <DrawingReferencePanel key={project.id} initial={project.drawingReference}
                  onSave={saveDrawingReference} onRemove={removeDrawingReference} />
              </>
            )}
            {modal === "import" && (
              <>
                <h2 id="modal-title">Bring a plan along.</h2>
                <p>
                  Open a saved Yardwork project or add a scaled drawing to the workspace.
                </p>
                <label className="field">
                  Import format
                  <select
                    value={importKind}
                    onChange={(e) => setImportKind(e.target.value)}
                  >
                    <option value="project">Yardwork project · JSON</option>
                    <option value="dxf">
                      2D plan reference · ASCII DXF linework
                    </option>
                    <option value="drawing">Drawing reference · PDF or image</option>
                    <option value="inventory">
                      Store inventory snapshot · JSON
                    </option>
                  </select>
                </label>
                {importKind === "drawing" ? (
                  <DrawingReferencePanel key={project.id} initial={project.drawingReference}
                    onSave={saveDrawingReference} onRemove={removeDrawingReference} />
                ) : importKind === "dxf" ? (
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
                      Import model-space lines or straight 2D polylines near the origin. Closed right-angle outlines can be framed together.
                    </p>
                    <a
                      className="download-example"
                      href={workshopAsset("/examples/base-plan.dxf")}
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
                        Import a Yardwork snapshot file with materials, hardware
                        and tools, or a material snapshot array. The file keeps
                        its original check times. Newer observations update
                        matching products and locations.
                      </p>
                    </div>
                    <a
                      className="download-example"
                      href={workshopAsset("/examples/inventory.json")}
                      download
                    >
                      Download inventory format example <Download size={13} />
                    </a>
                  </>
                ) : (
                  <p className="small-note">
                    Formats 1–{PROJECT_FORMAT_VERSION} import as new copies,
                    including parts, connections, build steps, store settings
                    and plan references. New exports use format {PROJECT_FORMAT_VERSION};
                    older apps reject unsupported versions to preserve saved data.
                  </p>
                )}
                {importKind !== "drawing" && <>
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
                </>}
              </>
            )}
            {modal === "handoff" && (
              <HomeDepotHandoff
                project={project}
                inventoryTick={inventoryTick}
                onRecordSnapshots={(batch) => change((p) => recordHomeDepotStoreSnapshots(p, batch))}
                onPick={(target, quantity) => {
                  const prior = current.current;
                  const next = recordHomeDepotPickup(prior, target, quantity);
                  if (next !== prior) change(next);
                }}
                onDownloadStoreChecklist={(text) => download(`${baseName}-home-depot-store.txt`, text, "text/plain")}
                onAddPurchase={(id) => safe(() => {
                  const next = addHomeDepotPurchaseNeed(current.current, id);
                  if (next === current.current) return;
                  change(next);
                  notify("Added the missing quantity to the Home Depot list.");
                })}
                onReview={(area) => {
                  setModal(null);
                  setPanel(area === "tools" ? "tools" : area === "assembly" ? "prep" : "materials");
                  inspectorFocus.expand();
                }}
                onDownload={(text) =>
                  download(
                    `${baseName}-${project.retailer ?? "home-depot"}.txt`,
                    text,
                    "text/plain",
                  )
                }
              />
            )}
            {modal === "export" && (
              <>
                <h2 id="modal-title">From screen to workbench.</h2>
                {guideExport.error && (
                  <p className="form-error" role="alert">
                    {guideExport.error} JSON and shopping exports remain
                    available.
                  </p>
                )}
                <p>
                  Keep an editable plan, take a shopping list, or print your
                  build steps.
                </p>
                {[
                  {
                    title: "Editable project",
                    description:
                      `${connectorDraftDirty ? "Save the connector draft to include its edits; this export contains the current project. " : ""}Format ${PROJECT_FORMAT_VERSION} JSON · labeled parts, cuts, assembly stages, measured hinges, fastener history, A21Z connector references and wood entries, supports, restraints, steps and inventory. Opens in Yardwork with format ${PROJECT_FORMAT_VERSION} support.`,
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
                  ...(snapshotExport ? [{
                    title: "Store snapshots",
                    description: `JSON · ${snapshotExport.count} observations at the selected Home Depot store${snapshotExport.excluded ? ` · ${snapshotExport.excluded} unusable observations excluded` : ""}`,
                    icon: Download,
                    action: () => download(`${baseName}-store-snapshots.json`, snapshotExport.text, "application/json"),
                  }] : []),
                  {
                    title: `Prepare ${retailerName(project.retailer)} list`,
                    description:
                      "Copy/paste handoff · stock quantities and product matches",
                    icon: ExternalLink,
                    action: () => setModal("handoff"),
                  },
                  {
                    title: "Build guide",
                    description:
                      "Markdown · ordered instructions and part dimensions",
                    icon: Layers3,
                    action: () =>
                      download(
                        `${baseName}-guide.md`,
                        guideMarkdown(exportGuide) +
                          toolGuideMarkdown(exportGuide) +
                          sheetPlansMarkdown(bom(exportGuide), exportGuide) +
                          recordedSourceMarkdown,
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
                  ...(exportGuide.pieces.some((piece) => !piece.offcut) && !guideExport.error ? [{
                    title: "Print part labels",
                    description: "Cut-out tags with part IDs, dimensions, and build steps",
                    icon: Download,
                    action: () => printPartLabels(exportGuide),
                  }] : []),
                  ...(project.attachmentPlans.length
                    ? [
                        {
                          title: "Shelf support schedule CSV",
                          description:
                            "Planned target coordinates and user measurements · unresolved drill coordinates stay pending",
                          icon: Ruler,
                          action: () =>
                            download(
                              `${baseName}-shelf-supports.csv`,
                              attachmentScheduleCsv(project),
                              "text/csv",
                            ),
                        },
                      ]
                    : []),
                  ...(connectionReview.parts.length || connectionReview.intents.length ? [{
                    title: "Connection review CSV",
                    description: "Actual members, assembly stages and saved connection states · separate from shopping quantities and drill schedules",
                    icon: ClipboardList,
                    action: () => download(`${baseName}-connection-review.csv`, connectionCoverageCsv(project, connectionReview), "text/csv"),
                  }] : []),
                  ...(project.fastenerPlans.length ? [{
                    title: "Wood-fastener schedule CSV",
                    description: "Explicit local entrances and candidate drive paths · pending or excluded values remain blank",
                    icon: Ruler,
                    action: () => download(`${baseName}-wood-fasteners.csv`, fastenerScheduleCsv(project), "text/csv"),
                  }] : []),
                  ...(project.connectorPlans.length ? [{
                    title: "Connector wood-entry CSV",
                    description: "Assigned wood entries and alternative schedule references · no inferred manufactured hole pattern",
                    icon: Ruler,
                    action: () => download(`${baseName}-connectors.csv`, connectorScheduleCsv(project), "text/csv"),
                  }] : []),
                  ...(project.lidHingePlans.length || project.hingeStockSources.length ? [{
                    title: "Measured hinge schedule CSV",
                    description: "Physical source cuts, retained intervals and entered mounting datums · stale or conflicting drill coordinates remain blank",
                    icon: Ruler,
                    action: () => download(`${baseName}-hinges.csv`, hingeScheduleCsv(project), "text/csv"),
                  }] : []),
                ].map((item) => (
                  <button
                    className="export-choice"
                    disabled={
                      !!guideExport.error &&
                      ["Build guide", "Print / save guide as PDF"].includes(
                        item.title,
                      )
                    }
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
                      Generate steps from your finished layout, then review the
                      sequence and export a guide.
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
      {labelPrint && <PrintAssemblyPartLabels title={labelPrint.title} labels={labelPrint.labels} />}
      <article className="print-guide">
        <h1>{project.name}</h1>
        <p>
          Concept build guide · {project.zip} ·{" "}
          {new Date().toLocaleDateString()}
        </p>
        {project.notes.trim() && (
          <section className="saved-project-notes">
            <h2>{SAVED_PROJECT_NOTES_TITLE}</h2>
            <p className="saved-notes-context">{SAVED_PROJECT_NOTES_CONTEXT}</p>
            <p className="saved-notes-text">{project.notes}</p>
          </section>
        )}
        <strong>
          Planning only. Verify site, code, engineering, and connections before
          construction.
        </strong>
        {exportGuide.drawingReference?.calibration.visible && <section className="drawing-reference-print">
          <h2>Drawing reference</h2>
          <p>{drawingReferenceDescription(exportGuide.drawingReference)}. Use the stated dimensions when measuring the printed sheet.</p>
          <img src={exportGuide.drawingReference.image} alt="Imported drawing sheet" />
        </section>}
        <PrintBuildPreparation groups={printPreparation} />
        <PrintOffcutCutOrder rows={printOffcutCuts} />
        {exportGuide.ideaBindings.map((binding) => (
          <section key={binding.id}>
            <h2>Saved design review · {binding.title}</h2>
            <p>
              Revision {binding.revision}. Actual part dimensions and cuts
              follow in the build sequence.
            </p>
            <ul>
              {binding.assumptions.map((text, i) => (
                <li key={`a${i}`}>Assumption: {text}</li>
              ))}
              {binding.questions.map((text, i) => (
                <li key={`q${i}`}>Open decision: {text}</li>
              ))}
              {binding.suggestions.map((text, i) => (
                <li key={`s${i}`}>Review: {text}</li>
              ))}
            </ul>
          </section>
        ))}
        {exportGuide.steps.map((s, i) => (
          <section key={s.id}>
            <h2>
              {i + 1}. {s.title}
            </h2>
            <p>{s.notes}</p>
            <ul>
              {exportGuide.pieces
                .filter((x) => x.stepId === s.id && !x.offcut)
                .map((x) => (
                  <li key={x.id}>
                    {partLabel(exportGuide, x.id)} · {x.name} ·{" "}
                    {x.size.map(formatPreciseInches).join(" × ")} ·{" "}
                    {material(x.material).name}
                    {(x.cutPlanes.length > 0 || x.cutStock || pieceThroughOpenings(x).length > 0) && (
                      <pre className="print-cut-details">{printCuts(x)}</pre>
                    )}
                  </li>
                ))}
            </ul>
            <GuideConnectionSchedule
              project={exportGuide}
              stepId={s.id}
              printable
              coverage={exportConnectionReview}
            />
            {exportGuide.history
              .filter((h) => h.stepId === s.id)
              .map((h) => (
                <p key={h.id}>{h.offcutCut?.releasedAt ? "Released plan" : "Operation"}: {h.message}</p>
              ))}
          </section>
        ))}
        {exportGuide.pieces.some((piece) => piece.offcut) && (
          <section>
            <h2>Recorded offcuts</h2>
            {exportGuide.pieces
              .filter((piece) => piece.offcut)
              .map((piece) => (
                <div key={piece.id}>
                  <strong>
                    {partLabel(exportGuide, piece.id)} · {piece.name}
                    {exportGuide.plannedCutSources?.some(({ sourceId }) => sourceId === piece.cutStock?.id) && " · Expected after cutting"}
                  </strong>
                  <pre className="print-cut-details">{printCuts(piece)}</pre>
                </div>
              ))}
          </section>
        )}
        {exportGuide.attachmentPlans.length > 0 && (
          <section>
            <h2>Planned shelf attachments</h2>
            <pre className="print-cut-details attachment-print">
              {attachmentGuideText(exportGuide, false)}
            </pre>
          </section>
        )}
        {exportGuide.restraintPlans.length > 0 && (
          <section>
            <h2>Furniture anti-tip review</h2>
            <pre className="print-cut-details attachment-print">
              {restraintGuideText(exportGuide, false)}
            </pre>
          </section>
        )}
        {exportGuide.fastenerPlans.length > 0 && (
          <section>
            <h2>Wood-fastener locations</h2>
            <pre className="print-cut-details attachment-print">{fastenerGuideText(exportGuide, false)}</pre>
          </section>
        )}
        {(exportGuide.lidHingePlans.length > 0 || exportGuide.hingeStockSources.length > 0) && (
          <section><h2>Measured lid hinge plans</h2><pre className="print-cut-details attachment-print">{hingeGuideText(exportGuide, false)}</pre></section>
        )}
        {!!printFoundations.length && (
          <section className="greenhouse-foundation-print">
            <h2>Greenhouse foundation footprint</h2>
            <p>{greenhouseFoundationScope}</p>
            {printFoundations.map(({ entryId, title, summary, rails, anchors }) => (
              <div key={entryId}>
                <p><strong>{title}</strong> · {summary}</p>
                <ul>{rails.map((rail) => <li key={rail}>{rail}</li>)}</ul>
                {anchors && (
                  <>
                    <h3>Concrete anchor layout</h3>
                    <p>{concreteAnchor.label} · {anchors.detail}</p>
                    <ul>{anchors.marks.map((mark) => <li key={mark}>{mark}</li>)}</ul>
                    <p>{concreteAnchorScope} <a href={concreteAnchor.instructions}>Manufacturer instructions</a> · <a href={concreteAnchor.evaluation}>Evaluation table</a></p>
                  </>
                )}
              </div>
            ))}
          </section>
        )}
        {!!exportGuide.siteClearances?.length && (
          <section>
            <h2>Measured site clearances</h2>
            {exportGuide.siteClearances.map((plane) => (
              <p key={plane.id}><strong>{plane.label}</strong> · {siteClearanceText(exportGuide, reviewSiteClearance(exportGuide, plane))}</p>
            ))}
          </section>
        )}
        {!!lidSiteSchedule.length && (
          <section>
            <h2>Lid swing at measured site faces</h2>
            {lidSiteSchedule.map((row) => <p key={row.id}><strong>{row.label}</strong> · {row.text}</p>)}
          </section>
        )}
        {!!lidWeightSchedule.length && (
          <section>
            <h2>Lid weight and gravity torque</h2>
            {lidWeightSchedule.map((row) => <p key={row.id}><strong>{row.label}</strong> · {row.text}</p>)}
            <p>{lidWeightScope} <a href={lidMomentReference}>Manufacturer lid moment reference</a></p>
            <h2>Lid stay torque comparison</h2>
            {lidWeightSchedule.map((row) => <p key={row.id}><strong>{row.label}</strong> · {row.stayText}</p>)}
            <p>{lidStayScope} <a href={springLidStay.manual}>Sugatsune installation manual</a></p>
            <p>Everbilt {everbiltLidSupport.model} · {everbiltLidSupport.scope} <a href={everbiltLidSupport.listing}>Home Depot listing</a></p>
          </section>
        )}
        {!!lidStayFitSchedule.length && (
          <section>
            <h2>Folding lid stay fit</h2>
            {lidStayFitSchedule.map((row) => (
              <div key={row.id}>
                <p><strong>{row.label}</strong> · {row.result}</p>
                <p>{row.settings}</p>
                {row.sourceNote && <p>{row.sourceNote}</p>}
                {row.source && <p><a href={row.source.listing}>Home Depot reference</a> · <a href={row.source.manual}>Installation drawing</a></p>}
              </div>
            ))}
            <p>{lidStayFitScope}</p>
          </section>
        )}
        {exportGuide.connectorPlans.length > 0 && <section><h2>A21Z connector plans</h2><pre className="print-cut-details attachment-print">{connectorGuideText(exportGuide, false)}</pre></section>}
        <BanquetteConstructionAppendix project={exportGuide} />
        <h2>Tools and setup checklist</h2>
        <p>
          Documented selections support capabilities, not safe operation,
          ownership or current stock. Check the actual tool, blade/bit,
          instructions and work setup.
        </p>
        <ul>
          {toolsReview.requirements.map((row) => (
            <li key={row.capability}>
              {row.name} · {row.necessity} ·{" "}
              {row.status === "supported"
                ? "documented selection reviewed"
                : "tool selection unresolved"}
              {row.condition ? ` · ${row.condition}` : ""}
            </li>
          ))}
        </ul>
        <h2>Shopping list</h2>
        <PricingSummary coverage={pricing} printable />
        <ul>
          {rows.map((r) => {
            const offer = printStockReferences.get(r.id);
            return (
              <li key={r.id}>
                {r.quantity} {purchaseUnitLabel(material(r.id).unit, r.quantity)} × {material(r.id).name} ·{" "}
                {r.unpriced && r.quantity > 0 ? "UNPRICED" : money(r.total)} ·{" "}
                {r.quantity === 0 && r.onHandStockUnits > 0 ? "stock on hand" : r.verified
                  ? `${r.inventory!.available} stock units reported · ${r.inventory!.available >= r.quantity ? "quantity covered by snapshot" : "snapshot quantity short"}`
                  : r.supplier ? (
                    <a href={r.supplier.url}>{r.supplier.seller} {r.supplier.productCode} · quote needed</a>
                  ) : "stock unverified"}
                {offer && <>{" · "}<a href={offer.url}>Internet #{offer.productId}</a></>}
                {r.onHandStockUnits > 0 && ` · ${r.onHandStockUnits} ${r.onHandStockUnits === 1 ? "source" : "sources"} on hand`}
                {r.packCount > 1
                  ? ` · ${r.physicalStockUnits} individual items needed; ${r.packCount} per purchase unit; ${r.surplusStockUnits} spare`
                  : ""}
              </li>
            );
          })}
        </ul>
        {rows.map((row) => (
          <SheetLayouts
            key={row.id}
            row={row}
            project={exportGuide}
            printable
          />
        ))}
        <PrintStockCutSequences groups={printCutSequences} />
        {printCutSources.groups.size > 0 && <section className="recorded-source-print">
          <h2>Recorded cut-source layouts</h2>
          <p>Saved blank regions and offcuts share their original physical source. Review these coordinates alongside each part's retained cut profile; no chronological cutting sequence is inferred.</p>
          {[...printCutSources.groups.keys()].map((sourceId) => <CutStockLayout key={sourceId} project={exportGuide} sourceId={sourceId} inspection={printCutSources} printable />)}
        </section>}
        {glazingProfiles && <PrintSunliteProfiles review={glazingProfiles} />}
        {glazingTape && <PrintSunliteTape review={glazingTape} />}
        <PrintEdgeBanding groups={bandingGuide} />
        {glazingEstimate && <SunliteTakeoffPanel estimate={glazingEstimate} />}
        {glazingThermal && glazingEstimate && <PrintSunliteThermal review={glazingThermal} />}
        {glazingMounts.length > 0 && <PrintSunliteMounts project={project} reviews={glazingMounts} />}
        {printRoofBacking.length > 0 && (
          <section>
            <h2>SUNLITE roof seam backing</h2>
            <p>{roofBackingScope}</p>
            <ul>{printRoofBacking.map((line) => <li key={line}>{line}</li>)}</ul>
            <p><a href={sunliteRoofDetail}>Palram roof connector detail</a></p>
          </section>
        )}
        {printVentBacking.length > 0 && (
          <section className="vent-backing-print">
            <h2>Roof vent sash backing</h2>
            <p>{ventBackingScope}</p>
            <ul>{printVentBacking.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p><a href={ventBackingSource}>Palram SUNLITE installation resources</a></p>
          </section>
        )}
        {printPanelBearing.length > 0 && (
          <section>
            <h2>Shelf and seat bearing</h2>
            <p>{panelBearingScope}</p>
            <ul>{printPanelBearing.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printShelfSag.length > 0 && (
          <section>
            <h2>Shelf sag estimates</h2>
            <p>{shelfSagScope}</p>
            <ul>{printShelfSag.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p><a href={stiffnessSource}>Panel stiffness reference</a> · <a href={beamSource}>Bending formula</a></p>
          </section>
        )}
        {printWoodSupport.length > 0 && (
          <section className="wood-support-print">
            <h2>Wood contact to floor</h2>
            <p>{woodSupportScope}</p>
            <ul>{printWoodSupport.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printBearingConnections.length > 0 && (
          <section className="bearing-connections-print">
            <h2>Bearing joints</h2>
            <p>{bearingConnectionScope}</p>
            <ul>{printBearingConnections.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printSillGaskets.length > 0 && (
          <section className="sill-gaskets-print">
            <h2>Sill gasket cut plan</h2>
            <p>{sillGasketScope}</p>
            <ul>{printSillGaskets.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printWindowWalls.length > 0 && (
          <section className="window-wall-print">
            <h2>Window rough framing</h2>
            <p>{windowWallScope} <a href={windowFramingSource}>PNNL window framing</a></p>
            <ul>{printWindowWalls.map(({ section, detail }) => <li key={section.id}>{section.name} · {detail}</li>)}</ul>
          </section>
        )}
        {!!exportGuide.waterRuns?.length && (
          <section className="water-run-print">
            <h2>Wall water-line schedule</h2>
            <ul>{exportGuide.waterRuns.flatMap((run) => waterRunGuide(exportGuide, run)).map((line, i) => <li key={i}>{line}</li>)}</ul>
            <p><a href={studBoreSource}>Stud boring</a>{" · "}<a href={pipeProtectionSource}>Pipe protection</a>{" · "}<a href={pexInstallation}>SharkBite installation</a></p>
          </section>
        )}
        {!!exportGuide.waterFittings?.length && (
          <section className="water-fitting-print">
            <h2>PEX fittings and insertion marks</h2>
            <ul>{exportGuide.waterFittings.flatMap((fitting) => waterFittingGuide(exportGuide, fitting)).map((line, i) => <li key={i}>{line}</li>)}</ul>
            <p><a href={maxInsertionChart}>Insertion chart</a>{" · "}<a href={maxFittingInstructions}>SharkBite installation</a></p>
          </section>
        )}
        {!!exportGuide.sinkDrains?.length && (
          <section className="sink-drain-print">
            <h2>Sink drains</h2>
            <ul>{exportGuide.sinkDrains.flatMap((record) => sinkDrainGuide(exportGuide, record)).map((line, i) => <li key={i}>{line}</li>)}</ul>
            <p><a href={sinkTrap.drawing}>Oatey kit drawing</a>{" · "}<a href={sinkTrap.installation}>Installation</a></p>
          </section>
        )}
        {!!exportGuide.waterStops?.length && (
          <section className="water-stop-print">
            <h2>Fixture shutoffs</h2>
            <ul>{exportGuide.waterStops.flatMap((stop) => waterStopGuide(exportGuide, stop)).map((line, i) => <li key={i}>{line}</li>)}</ul>
            <p><a href={waterStop.spec}>SharkBite Max stop specifications</a>{" · "}
              <a href={waterStop.instructions}>Installation</a>{" · "}<a href={waterStop.code}>IRC fixture access reference</a></p>
          </section>
        )}
        {!!exportGuide.waterPressureTests?.length && (
          <section className="water-pressure-print">
            <h2>Water pressure test records</h2>
            <p>{waterPressureGuideStep}</p>
            {exportGuide.waterPressureTests.map((record) => <div key={record.id}>
              <h3>{record.name}</h3>
              <ul>{waterPressureObservations(record).map((line, index) => <li key={index}>{line}</li>)}</ul>
              <ProjectCodeRows rows={reviewWaterPressure(exportGuide, record).rows} />
            </div>)}
          </section>
        )}
        {!!printWaterSupport.length && (
          <section className="water-support-print">
            <h2>PEX support spacing</h2>
            <ul>{printWaterSupport.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p><a href={pexInstallation}>RWC PEX support guidance</a>{" · "}
              <a href={waterSupportReference.code}>IRC piping support</a>{" · "}
              <a href={waterSupportReference.instructions}>HoldRite installation</a></p>
          </section>
        )}
        {printOpeningFlashing.length > 0 && (
          <section className="opening-flashing-print">
            <h2>Opening flashing and drainage</h2>
            <p>{openingFlashingScope}</p>
            <ul>{printOpeningFlashing.map((line, i) => <li key={i}>{line}</li>)}</ul>
            <p><a href={flexWrap.instructions}>DuPont installation guide</a>{" · "}<a href={openingAirSealGuide}>PNNL interior air seal</a></p>
          </section>
        )}
        {exportWoodJointDetails.length > 0 && (
          <section className="wood-joint-details-print">
            <h2>Recorded wood joint details</h2>
            <p>{woodJointDecisionScope}</p>
            <ul>{exportWoodJointDetails.map((entry) =>
              <li key={entry.id}>{woodJointDecisionLine(entry)}</li>)}</ul>
          </section>
        )}
        {printTrimBacking.length > 0 && (
          <section className="trim-backer-rod-print">
            <h2>{printTrimBacking.some(({ hasAirSeal }) => hasAirSeal) ? "Backer rod cut plan" : "Trim backer rod cut plan"}</h2>
            <p>{trimBackerRodScope}{" "}<a href={trimBackerRodInstructions}>Frost King instructions</a></p>
            <ul>{trimBackerRodGuideLines(printTrimBacking).map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printRafterBearing.length > 0 && (
          <section>
            <h2>Greenhouse rafter joints</h2>
            <p>{rafterBearingScope}</p>
            <ul>{printRafterBearing.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printRoofAttachments.length > 0 && (
          <section>
            <h2>Greenhouse roof attachments</h2>
            <p>{greenhouseAttachmentScope}</p>
            <ul>{printRoofAttachments.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printBaseCorners.length > 0 && (
          <section className="greenhouse-base-print">
            <h2>Greenhouse base corners</h2>
            <p>{greenhouseBaseScope}</p>
            <ul>{printBaseCorners.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printFloorBaseJoints.length > 0 && (
          <section>
            <h2>Floor base joist ends</h2>
            <p>{floorBaseConnectionScope}</p>
            <ul>{printFloorBaseJoints.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printFloorHangers.length > 0 && (
          <section>
            <h2>Floor base hanger plan</h2>
            <p>{floorHangerScope} <a href={floorHangerReport}>ESR-3096 Table 20</a></p>
            <ul>{printFloorHangers.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {exportGuide.projectCode && (
          <section>
            <h2>Project code references</h2>
            <p>Verify applicability with the local authority.</p>
            {exportGuide.projectCode.trades.includes("plumbing") && exportGuide.projectCode.wallVent.inScope === "yes" && exportGuide.projectCode.wallVent.layout && (
              <ul>{ventLayoutGuideLines(exportGuide.projectCode.wallVent.layout).map((line) => <li key={line}>{line}</li>)}</ul>
            )}
            {exportGuide.projectCode.trades.includes("hvac") && exportGuide.projectCode.dryerExhaust?.appliance === "ducted" && (
              <ul>{dryerExhaustGuideLines(exportGuide.projectCode.dryerExhaust).map((line) => <li key={line}>{line}</li>)}</ul>
            )}
            {exportGuide.projectCode.trades.includes("roofing") && exportGuide.projectCode.shingleRoof && (
              <ul>{shingleRoofGuideLines(exportGuide).map((line, index) => <li key={index}>{line}</li>)}</ul>
            )}
            <ProjectCodeRows rows={reviewProjectCode(exportGuide.projectCode, exportGuide).rows} />
          </section>
        )}
        {printSaunaHeater.length > 0 && (
          <section>
            <h2>Sauna heater layout review</h2>
            <p>{saunaHeaterScope}</p>
            <ul>{printSaunaHeater.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p>{saunaHeaterGuideSources(exportGuide).map(({ label, url }, index) => (
              <span key={url}>{index > 0 && " · "}<a href={url}>{label}</a></span>
            ))}</p>
          </section>
        )}
        {printSaunaVentilation.length > 0 && (
          <section>
            <h2>Sauna ventilation layout</h2>
            <p>{saunaVentScope} <a href={saunaVentReference.url}>U.S. STEEL manual, pp. 10–11</a></p>
            <ul>{printSaunaVentilation.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printSaunaBench.length > 0 && (
          <section>
            <h2>Sauna seating layout</h2>
            <ul>{printSaunaBench.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p><a href={cedarbrookBenchInstructions}>Cedarbrook pedestal bench assembly instructions</a></p>
          </section>
        )}
        {printCaseworkTipUp.length > 0 && (
          <section>
            <h2>Casework tip-up and placement</h2>
            <ul>{printCaseworkTipUp.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printSaunaBenchTravel.length > 0 && (
          <section>
            <h2>Sauna bench carry-in</h2>
            <ul>{printSaunaBenchTravel.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printSaunaWalls.length > 0 && (
          <section>
            <h2>Sauna wall insulation coverage</h2>
            <ul>{printSaunaWalls.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p>{saunaWallCoverageScope}</p>
          </section>
        )}
        {printSaunaCeiling.length > 0 && (
          <section>
            <h2>Sauna ceiling coverage</h2>
            <p>Check these modeled dimensions against the actual ceiling assembly, supports and services.</p>
            <ul>{printSaunaCeiling.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {liningBackingContent && (
          <section>
            <h2>Sauna lining backing</h2>
            {liningBackingContent}
          </section>
        )}
        {printMotions.length > 0 && (
          <section>
            <h2>Motion and clearance</h2>
            <ul>{printMotions.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printGreenhouseLatch.length > 0 && (
          <section>
            <h2>Greenhouse door latch layout</h2>
            <ul>{printGreenhouseLatch.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p><a href={everbiltLatch.instructions}>Everbilt 24417 installation instructions</a></p>
          </section>
        )}
        {printDoorSeals.length > 0 && (
          <section>
            <h2>Greenhouse door weatherseal</h2>
            <ul>{printDoorSeals.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <p><a href={doorSeal.instructions}>Frost King installation instructions</a>
              {" · "}<a href={doorSeal.listing}>Home Depot weatherseal</a></p>
          </section>
        )}
        {printDoorStops.length > 0 && (
          <section>
            <h2>Fitted greenhouse door stops</h2>
            <ul>{printDoorStops.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {printRodFits.length > 0 && (
          <section>
            <h2>Closet rod fits</h2>
            <ul>{printRodFits.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </section>
        )}
        {[false, true].map((isTool) => {
          const purchases = supplyPurchases.filter((row) => row.isTool === isTool);
          return purchases.length > 0 && (
          <section key={isTool ? "tools" : "supplies"}>
            <h2>{isTool ? "Tools to buy" : "Hardware and supplies to purchase"}</h2>
            <p>
              {isTool ? "User-chosen tool purchases have a separate cost and capability review." : "User-chosen purchase packs. Verify installation and attachment separately."}
            </p>
            {purchases.map((r) => (
              <div key={r.productId}>
                <h3>
                  {r.quantity} × {r.purchaseUnit} · {r.name}
                </h3>
                <p>
                  {isTool ? "Package highlights: " : "Each pack: "}
                  {r.contents
                    .map(formatSupplyContent)
                    .join("; ") || "contents unresolved"}
                  .
                </p>
                <p>
                  {r.total === null ? "UNPRICED" : money(r.total)} ·{" "}
                  {r.inventory
                    ? `User-recorded ${r.inventory.available} purchase packs at store ${r.inventory.store}, ZIP ${r.inventory.zip}; checked ${r.inventory.checkedAt}`
                    : "Stock unverified"}
                </p>
                {r.offer && (
                  <p>
                    {retailerName(project.retailer)} {r.offer.productId} ·
                    seller {r.offer.seller} · {r.offer.url}
                  </p>
                )}
                <ul>
                  {r.selections.map((s) => (
                    <li key={s.id}>
                      {s.quantity} packs · {s.purpose} · {s.note}
                    </li>
                  ))}
                </ul>
                <ul>
                  {[...r.requirements, ...r.issues].map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          );
        })}
        {rows.some((r) => r.rolls.length > 0) && (
          <section>
            <h2>Roll cutting layouts</h2>
            <p>
              Dimensions are inches. X is across the roll; Y is along its length
              from the starting edge. Snip cuts use zero kerf. This is a
              feasible layout, not a minimum-waste guarantee.
            </p>
            {rows.flatMap((r) =>
              r.rolls.map((roll, i) => (
                <div key={`${r.id}-${i}`}>
                  <h3>
                    {material(r.id).name} · Roll {i + 1} · {roll.width} ×{" "}
                    {roll.length} in
                  </h3>
                  <table className="roll-print-table">
                    <thead>
                      <tr>
                        <th>Cut piece</th>
                        <th>Width × length</th>
                        <th>Start X</th>
                        <th>Start Y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roll.placements.map((c) => (
                        <tr key={c.id}>
                          <td>
                            {partLabel(exportGuide, c.id)} · {c.name}
                          </td>
                          <td>
                            {c.width} × {c.length} in
                          </td>
                          <td>{c.x} in</td>
                          <td>{c.y} in</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )),
            )}
          </section>
        )}
      </article>
    </div>
  );
}
