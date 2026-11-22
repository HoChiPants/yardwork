# Project format and recovery

New exports use **format 126**. Yardwork reads valid formats 1–125 and upgrades known data in memory. Geometry, cuts, source lineage, saved designs, guides, measurements, store settings and observations are preserved. Format-6 fastener baselines and review history remain exact. Earlier fastener references retain unknown baselines and initially empty history.

Format 126 adds a project-level `rimFoamOffcuts` pool of labeled, measured 2 in foam rectangles. Rim plans can reserve several of these sources by ID. Earlier inline offcut measurements remain attached to their original plans.

Format 125 adds the fixed-dimension Liberty bar-pull material. It can be an ordinary member of a saved drawer motion group. Earlier drawers and their cut and motion records retain their original parts.

Format 124 adds optional `edgeSeal` measurements to saved floor rim plans. It records the seal depth, usable cured run measured per can, and work session. Earlier rim plans open with their original cut lists.

Format 123 can store `topPlateSeals` for a modeled drywall-to-top-plate joint. Each record keeps the plate, side, measured gap and fill depth, bead, work session and reviewed geometry signature. Earlier projects open with their original cut and seal plans.

Format 122 adds exact 8 ft and 12 ft Sheetrock UltraLight material IDs. Straight score-and-snap cuts use the existing source coordinates, retain the ½ in panel thickness and model zero cutting loss. Earlier projects preserve their original material IDs and kerfs.

Format 121 optionally stores `roofVentFlashings` with the retained roof panel ID, measured pipe center and diameter, planned clearance, flange offsets, field confirmation and layout signature. Current geometry determines the cut envelope and shopping quantity. Earlier files keep their existing roof plans and open without a vent layout.

Format 120 optionally stores measured weather-barrier layouts in `roofValleys`. Each entry keeps the model panel IDs, centerline signature, measured downhill length, peak extension, lap and optional measured offcut. Opening the guide checks the current panel geometry before calculating strip lengths and roll purchases. Earlier roof projects retain their saved decking and covering.

Format 108 optionally saves `waterFittings` linking a distinct PEX run end on each side of a measured SharkBite Max elbow or coupling. The connection stores the exact material and fitted part ID and two center-to-socket distances in inches. Applying it updates both straight runs and their owned bores and hardware in one edit. Export recomputes clearances and the seating comparison against the retained model. Older straight runs remain editable and can extend beyond the panel ends to a measured service opening.

Format 107 can retain straight wall water lines. Each line connects the measured wall-local endpoints and bore dimensions to its pipe, stud IDs and shield faces. Bores owned by a water line carry `source.waterRunId`. The guide rechecks the current geometry before printing drilling coordinates. Moving the wall moves its linked pipe and shields. Earlier projects retain ordinary round cuts and existing sauna ventilation source records unchanged.

Format 106 optionally records a rough doorway and measured prehung assembly on a generated nonbearing wall. A fitted door has one linked hinge motion with its pin expressed relative to the closed leaf. Wall moves retain that local hinge. Swing findings are recalculated from the saved geometry, and earlier walls open with their original framing.

Format 105 optionally keeps visible straight PDF lines in coordinates relative to the saved sheet. Yardwork derives their workspace coordinates from the sheet’s current scale, rotation and center. Reimporting the source PDF reads its vectors and retains calibration when the rendered sheet matches the saved one exactly. Older saved sheets remain available for manual tracing.

Format 104 records the outline, wall and panel identities for framed rooms. These identities carry corner and panel order through guide regeneration.

Format 103 optionally saves the exact lumber stock of a generated solid wall. Individual traced panels retain their world placement and generated steps.

Format 102 can embed one calibrated drawing reference. It stores the selected PDF page or image as a bounded JPEG preview, its original filename and page number when available, two normalized scale points, the measured span in inches, the center in X and Z, rotation, opacity, and visibility. DXF line references remain independent. The embedded sheet round-trips through editable exports, project revisions and backups.

Format 101 can retain an interior air seal on each opening flashing plan. It records the four field gap widths, smallest available depth, planned seal depth, chosen material method, and optional work session. Stock and rod lengths are derived from current geometry. Earlier plans keep their original sill, flashing, and drainage measurements.

Format 100 lets a saved rectangular window flashing plan retain optional jamb and head tape measurements. It records the three flange widths and insets, tape width, and extensions beyond the sill apron and jambs. Older openings keep their saved pan and drainage without inferred tape dimensions.

Format 99 accepts an optional rough window opening on a generated wall. The opening records its width, height, sill elevation, offset, framing stock and optional backing. Existing solid wall layouts open with the same geometry. Compatible revisions retain the IDs and cut sources of members whose geometry and stock did not change.

Format 98 adds optional `openingFlashings` entries with four actual framing member IDs, field measurements and a local framing signature. Whole-roll cuts and preview lines derive from the latest checked geometry.

Format 97 adds optional `openSpans` and `backerRodId` to a measured trim seam. Ranges measure from the marked local start of a saved edge. Earlier measured seams still include their selected full edges.

Format 96 adds optional `greenhouseDoorSeals` entries by door and motion ID. They record the reviewed three-run layout signature, and resolve current cut lengths and clearance from the modeled wood faces and saved swing. Earlier door stops and swing plans retain their original measurements.

Format 95 adds optional `plannedCutSources` to distinguish proposal stock reserved for future cuts. Each entry references its source, original cut geometry and guide operations. Confirming the cuts keeps the source and records the stock on hand. Earlier sources retain their recorded geometry and ownership without an inferred completion state.

Format 94 adds optional screw sources to the cabinet and drawer portions of each measured rail layout. A source can record reserved counts from included or on-hand hardware, or a field-checked Everbilt 801582 pack choice and the measured depth between the seated head and the wood face. Earlier rail layouts open with their original drill paths and no screw source selected.

Format 93 saves measured drawer rail layouts in `drawerSlideMounts` by motion ID. Each layout stores cabinet and drawer rail measurements, optional separate right-side hole patterns, drill and screw depths, and a signature of the closed mounting panels. Earlier drawer motions open with their existing part IDs, slide selection and travel.

Format 92 can save `woodJointDecisions[].trimSeam` on a sealant joint. It records selected modeled edges, field bead measurements, any trial coverage and the measured fit signature. Earlier sealant joint notes still open and can take a measured plan later.

Format 91 accepts all six cataloged Accuride 3732 drawer slide pairs in `mechanism.drawerSlide.productId`. The selected product determines the maximum saved travel and matching shopping-list reference. Existing 22 in setups and custom slide motions retain their saved IDs and travel.

Format 90 can save ordered `hingePath` readings on an editable hinge motion. Each reading records its opening angle and the three inch offsets of the closed hinge datum in the moving part’s local coordinate system. The final reading defines the offset at maximum opening. Older swings continue to use their stored fixed pivot.

Format 89 can save `woodKerfs`, a map of material IDs to measured blade widths in inches. These values drive layouts and purchases for unrecorded wood stock. Each recorded source retains its own cutting loss. Earlier project files open with the modeled planning allowance and their existing source geometry.

Format 88 records measured saw loss in inches in `cutStock.woodKerf` on each fragment of a wood source. The value applies to straight and angled cuts and to later offcut assignments. Older files retain their recorded coordinates and modeled loss. Yardwork validates that the members of a shared source agree on the saved kerf.

Format 78 can record separate rim and joist material IDs on a generated floor-base section. Revising the dimensions preserves those selections until the user changes them. Earlier floor bases retain their generic stock and the absence of an explicit selection.

Format 77 adds the six Home Depot ground-contact 2 × 4 and 2 × 6 material IDs.

Format 76 can retain a dryer layout with straight-run endpoints and a clearance envelope width. The code comparison still uses the separately entered fixed-run length and fittings.

Format 75 can save a veneer product and end trim for each selected panel edge. The record references the actual part and retained local edge, so lengths and surrounding wood contact are rechecked when the project opens. Installed veneer thickness remains a field measurement.

Format 74 can save one glazing tape cut per retained SUNLITE edge, with its edge identity, geometry, upper or lower roll, measurement date and basis. Layout-derived lengths retain their source alongside manually entered lengths. Greenhouses with no saved tape cuts keep the nominal accessory estimate.

Format 73 adds the exact Everbilt 802064 and 802424 shelf support packs and allows a shelf support plan to save a user-confirmed test bore. Changing the planned product clears its measurement record and retains its bearing targets. Earlier projects keep their selected products and measurement behavior.

Format 72 can record which of two saved motions opens first. The second motion stays closed during the first step. Closing reverses the opening order. Earlier saved tests keep their simultaneous or fixed-position behavior.

Format 71 preserves the starting offcut name on new assignments and records when a planned assignment is released. Released entries stay in operation history and are omitted from the current cut order. Earlier assignments remain active and can be released with their original offcut labels.

Format 70 optionally records offcut assignment details alongside each operation. It saves the starting offcut, retained part, cut source, dimensions, ordered cuts and IDs of newly created remnants. Printed and Markdown guides check the source and part before showing the cut instructions. Earlier projects keep their operation notes.

Format 69 optionally saves which recorded cut sources are already on hand. The purchase estimate credits each validated source once before rounding to purchase packs. Parts and remnants share the same source mark. Format 68 and older projects retain their original purchase quantities when opened.

Format 68 optionally saves one clearance test setup per saved motion. It retains which other motion travels alongside it and which motions are held at a percentage of their own travel. Playback and guide findings are computed from the current geometry. Earlier projects open with their original motions.

Format 67 accepts the two Simpson SDWS Framing pack identities in fastener plans, history and supply records. Supported version validation and migration use the same range. Format 65 and 66 projects open with prior geometry, measurements and observations intact. Library reads preserve the original file bytes until an explicit save.

Format 66 recognizes separate Home Depot stock IDs for 10- and 12-foot SPF 2 × 4s, the 12-foot ground-contact 4 × 4 and 0.703-inch PureBond birch plywood. Each ID saves the selected stock profile and exact product reference. Older files retain their existing material IDs and store observations.

Format 65 can save optional casework tip-up plans by design entry. Each record contains the measured ceiling height, which carcass face starts down and the forward staging offset, with dimensions stored in inches. Clearance results are recalculated from retained geometry and site measurements. Older files open without a tip-up plan. Preview playback does not change saved part poses.

Format 64 recognizes the Home Depot full-length 2 × 4 and the 8- and 12-foot SPF 2 × 6 as distinct editable stock choices. The saved material IDs retain the selected lengths and listing identities. Earlier generic dimensions and store observations remain as recorded.

Format 63 optionally saves a measured driver setup on a wood-screw plan. It retains bit reach and width, tool body length and width, and the straight travel needed before seating. The clearance and stage review is calculated from the current geometry and matching guide order. Earlier plans open without a saved tool setup.

Format 62 optionally saves the measured Everbilt 24417 latch and keeper layout by door motion ID. Each layout retains the mounting members and latch side, center heights, plate footprints, hole centers, penetration measurements, physical clearance and alignment targets. Transfer marks recalculate against the current geometry. Earlier projects open without a latch layout.

Format 61 optionally saves one sauna bench carry-in test per room. It retains the selected bench and the original rough opening dimensions, the measured finished width and height, opening center offset, sill rise, passage depth, carry height, turning point and whether the heater body is in place. Playback and contact results are calculated from the current model. Earlier projects open without a carry-in test.

Format 60 optionally saves the explicit wood-screw plan IDs selected for a furniture restraint receiver. Existing joint records stay readable. The restraint review derives current connectivity and path state from the saved screw layouts and actual parts.

Format 59 optionally saves transferred Everbilt 14317 center-bracket mounting layouts with the rod support. The layout retains the selected backing face, plate dimensions and center offset, hole centers, and entered pilot and seated screw dimensions. Earlier reach-only records remain readable.

Format 58 recognizes the Home Depot cedar 1 × 2 board. Fitted greenhouse door stops save as normal parts in the fixed opening with marked jamb or head positions. Earlier doors retain their existing swing and open without fitted stops.

Format 57 adds a Home Depot Harvia package variant to sauna heater plans. It stores the room and exact package reference, mounting wall, wall-center offset, height of the body above the floor, and room screening inputs. Earlier floor-mounted heater records keep their existing position and manual reference.

Format 56 optionally stores shelf sag inputs by retained piece ID. Each estimate stores entered total distributed weight, sheet bending stiffness per foot and its source, the user's immediate-deflection target, and the material, thickness and axes that apply to the stiffness. Support positions are measured live and stay out of the saved inputs. Older projects start without sag estimates.

Format 55 optionally saves a drip edge review in the asphalt shingle plan. Saved facts include the selected flashing profile, lap, installed projections, maximum fastening interval and layer order at eaves and rakes. Each named run can carry a separate corner and trim allowance for the flashing. Geometry and stock allocations are derived from the current run dimensions. Earlier plans retain their existing edge runs and start without a drip edge review.

Format 54 optionally saves named eave, rake, hip, and ridge runs in the asphalt shingle review. Each stores a length along the edge and a separate cut allowance in inches. A copied 3D tape measurement is a saved dimension. Update it if the roof changes. Earlier reviews retain their roof areas and field-shingle inputs.

Format 42 optionally stores round through openings on rectangular parts. Each opening stores its local through-axis, center offsets in the next two cyclic axes, and diameter in inches. A ventilation opening may identify its saved room and role. Straight trims preserve surviving round geometry on both fragments. The 3D mesh, guide and movement checks use the same retained opening profile. Hardware or other items represented by envelopes keep their existing geometric limits.

Format 41 optionally stores sauna ventilation layouts. Each record identifies its room and regional manual revision and saves the selected ventilation type, wall opening measurements, duct inside diameters and after-use drying strategy.

Format 40 supports measured site faces that apply to the entire project. A site clearance with `bindingId: null` applies to all active project parts eligible for site clearance. Existing clearances keep their saved design IDs and scope.

Format 39 optionally saves lid weight in pounds and balance-point offsets in local inches. Each record identifies its lid part and retained geometry. Edited lid shape or material prompts measurements to be checked again.

Format 38 optionally stores the selected Everbilt 14317 bracket on an Everbilt rod support position. Earlier positions keep their existing measurements and no product is assigned on import.

Format 37 optionally adds per-axis cold retention measurements to each SUNLITE travel record. Format 36 records retain their measured growth travel and start with cold overlap pending.

Format 36 optionally stores SUNLITE sheet temperatures in Fahrenheit and per-panel measured travel in inches. Geometry and installation-temperature fingerprints keep entered travel from being reused when a panel moves, changes shape, or its installation temperature changes.

Format 35 can save planned Everbilt tube loss in `tubeCutPlans`, keyed by the actual rod IDs sharing each estimated stock unit. A saved plan affects the current cut order and guide while those rods share a tube. Recording the cuts transfers the allowance to the physical source and retires its pending plan.

Format 34 can store the measured loss per cut in `cutStock.tubeKerf` for each member of a recorded tube source. The value is in inches and can be zero. Its retained parts and offcuts share the source value and subsequent trims of that stock use the same allowance. Earlier tube records keep their existing modeled loss and coordinates.

Format 33 allows an Everbilt 802404 product reference in `attachmentPlans`. Existing Kreg plans retain their product, targets and measurements. An explicit change of product clears the old measurements so the new pin and drilling setup can be reviewed independently.

Format 32 records one packed board or sheet as a shared source for its kept parts and rectangular offcuts. Each packed member carries its local thickness, width and length axes in `cutStock.sourceAxes`. Source size and offset stay in the member’s local axes for later cutting. The source diagram and validation convert all members to the same stock frame. Earlier sources still use their recorded local coordinates.

Format 31 recognizes the Home Depot 194354 treated 4 × 4 stock ID and its optional selection for greenhouse perimeter rails. An earlier greenhouse opens with its saved base geometry.

Format 30 can save the tested direction, distance and modeled outcome for one or two removal movements on a removable contact. The build guide asks for a retest when parts, work-zone dimensions or the saved movements change. Earlier decisions reopen with their notes and no saved path.

Format 29 saves optional removable wood-contact decisions. Each note belongs to two directed part IDs and the retained shapes and relative pose at the time of review. Cuts, relative moves, or loss of contact retain the note for review. Earlier files open without a removal decision unless one is explicitly recorded.

Format 28 adds the Everbilt 320V stock identity and records that identity on its rod measurements. Existing closet rods and opening measurements retain their saved product and geometry.

Format 27 retains optional source-matched ceiling joist and batt selections in the sauna recipe. The framing and batts are editable parts. The batt's length and width are trimmable and its stock thickness stays fixed in the cut editor. Earlier sauna plans retain their saved ceiling framing when opened.

Format 26 retains the optional sauna foil selection and each panel’s local X/Y fold returns. The flat cut size includes those returns. The roll quote length derives from the current cut layout at the documented width. Foil Z thickness is a drawing convention.

Format 25 retains the optional pedestal kit selection and starting offsets for a sauna. The bench’s actual edited part pose drives layout and heater interference reviews. Earlier plans retain their saved seating reservation.

Format 24 retains the optional sauna door product and its modeled leaf, plus an optional outward-swing mechanism linked to the sauna design. Existing sauna projects keep their original rough openings and geometry on read.

Format 23 retains an optional source-matched wall and ceiling lining selection in the sauna recipe. Each course is an editable part. The direct supplier specification and sell unit come from the application catalog, and pricing and fulfillment remain open until checked with the supplier.

Format 22 can retain an optional roof vent selection in a bound greenhouse recipe and a separate hinge motion for the actual sash members. Existing greenhouse projects keep their original roof geometry when opened.

Format 21 allows a hinged motion to reference a bound greenhouse door, exterior hinge side, entered pivot offsets and an optional exact hardware kit. Closed model geometry remains the source for preview and the saved door swing. Earlier hinge plans keep their own axes, geometry and travel.

Format 20 allows a sliding motion to name an exact drawer slide pair and bind its four mounting panels. Fit results derive from current closed-part geometry. Format 19 motions reopen with their prior custom travel.

Format 19 adds optional project code reference inputs. It saves the build jurisdiction, dated scope, authority notes and entered facts separately from shopping settings. Reference versions and check results derive from these inputs. Earlier projects reopen with their code inputs unconfirmed.

Format 18 adds optional per-sauna heater layout reviews. A saved room ID binds its exact reviewed product/manual, offsets, sizing voltage, uninsulated wall area and user notes. Modeled checks and 3D envelopes derive from the current room and actual parts. Missing room or unsupported manual references remain visible for review. Earlier projects reopen without a heater unless they already have a compatible saved review.

Format 17 adds optional measured SUNLITE glazing profile schedules. Each cut keeps its exact product, actual modeled edge reference and geometry signature, finished length, and measurement notes and date. Stock setup holds usable material length and measured saw kerf per product. Stock layouts and estimated remnants derive from these inputs. A changed or missing edge stays in the project for review and drops out of active cut and measured stock totals. Earlier files retain their existing parts and selections.

Format 16 adds optional saved motion plans. A plan names the actual moving part IDs, a hinge axis and pivot or a slide direction, and the maximum travel. The first member supplies the local coordinate frame. The model positions are the closed pose. Temporary previews remain outside the saved geometry. Format 15 files retain their original project and rod data on read.

Format 15 adds optional intermediate-support records to a measured closet rod fit. Each record keeps the distance from the start face, a model-space location and direction, the measured fit reference, optional wall and delivered-bracket reach measurements, and backing notes. Layout changes retain old records for review. Earlier files reopen with the original end-fit data.

Format 14 adds optional `rodFitPlans`. Each record carries a rod ID, two mounting-face signatures, measured span and setbacks, flange orientation and measurement provenance. Reopening an older project leaves the fit records absent. Applying a measured fit updates the displayed tube and preserves the distinction between the model dimension and a recorded physical cut source.

Format 13 adds the closed material ID `jm-u1330-batt` and the optional saved sauna wall-insulation stock selection. Each batt remains an ordinary editable part with material-specific cut behavior. Explicit save updates the version. Opening an earlier project does not generate insulation or change existing physical stock.

Reading a saved format 1–31 file does not replace it. An explicit save writes the upgraded project atomically and advances its normal revision and update timestamp. Export a portable backup before changing applications or deleting a data volume. There is no lossy downgrade export.

## Saved library

Stored records are validated on read. Unsupported versions and damaged files remain visible in **Open project** with a recovery explanation. **Download original saved file** returns the original bytes, including its storage envelope, for recovery with a compatible application. It does not convert or repair the file. The read API returns an error for an unreadable project; saving over it is refused even if the caller supplies its revision. One unreadable record does not hide other library projects.

On a successful save over an existing project, Yardwork keeps the replaced file byte for byte in the project data volume. The library retains up to three earlier saves. Choose **Open project → Earlier saves** to open a revision under a new project ID, and save it if you want to keep that copy in the library. Earlier saves remain accessible if the latest file is damaged or missing. The current browser draft moves to **Open earlier browser draft** when you switch, and a copy leaves the original library record intact.

The original-file route is `GET /api/projects/:id/original`. It follows the same local service/access boundaries as the project library. Original files can contain project details and should be shared deliberately.

## Browser drafts

Current and previous drafts use `yardwork-draft-v27` and `yardwork-previous-draft-v27`. Version 1–26 keys remain untouched migration candidates. Use the current app to edit a format-27 draft.

Before replacing an unreadable current or previous draft, Yardwork stores and verifies a recovery copy. If that copy cannot be written, the overwrite is refused. **Open project → Preserved browser drafts** downloads those original bytes. Recovery does not claim the data is valid or repaired. Normal editing remains separate from server-library saves.

## Attachment records

`attachmentPlans` contains explicit planned connections, not installed hardware. Each shelf-pin plan retains selected shelf roles, actual part/section references, source-geometry fingerprints, local bearing targets, side faces, layout choices and user measurements with basis/date. Missing references are retained for review; they are not rebound by names. Tool reviews and supply purchases cannot promote these records into manufacturer or load approval.

Guide preparation phases retain their source plan and generated-text baseline so regeneration can preserve custom notes without reviving obsolete drilling instructions. Geometry/attachment edits stale the guide. Full numerical values persist in JSON; source-thickness captions and hole schedules use more precise decimal display than ordinary overview dimensions.

Future persisted feature changes must increment the format version and supply an explicit migration. Unknown versions and unknown top-level project fields are rejected. Do not repeat the earlier approach of silently extending format 1 with new feature data.

## Format 3 additions

`partLabels` is a persistent part-ID ledger. New active parts receive P001... and new offcuts O001...; a previously labeled part becoming an offcut keeps its label. Removed labels stay reserved. Labels are allocated on editing, opening into the workspace and guide generation, not by rewriting stored files on read. JSON and CSV retain full identifiers; printed guides use short labels and exact decimal-inch dimensions. The guide fingerprint version changed so previous generated guides require regeneration; custom instructions remain reviewable.

New generated closet panels carry explicit `designRole` metadata inside their existing carcass section. Existing closets keep their actual sections and boards. Support mapping is an explicit user action: exact geometric suggestions can be accepted or replaced, and names/order do not identify panels automatically.

`restraintPlans` stores an optional furniture design reference, actual receiver/source fingerprint, explicit recorded receiver connections, user provenance, and user-chosen restraint locations. A plan begins with zero locations. Eye centers, wall substrates and measured cable/penetration values remain unknown until entered. Purchase quantities count chosen kit locations provisionally; no universal restraint count is inferred. The review cannot reach an installation, capacity or code-approved state.

## Format 4 assembly guide records

`Step.generated` distinguishes project preparation/final review, shelf/restraint preparation and semantic `assembly-stage` records. Assembly records retain their stable owner (`planId`), stage key, exact member IDs, generated title/notes baseline and an input fingerprint. These records are user checklist history, not installation or engineering approval. Existing format 1–3 files migrate without adding/rebuilding stage metadata on read; generate the guide explicitly to derive it from actual owned roles. Legacy furniture with no explicit roles stays a whole-module review.

New furniture parts carry controlled `designRole` tags. Existing parts, cuts and sections are not relabeled or rebuilt during migration. Stage grouping uses actual section/part ownership; it does not infer structural identity from display names, array order or world height. Each active part appears once; offcuts remain separate.

Regeneration preserves exact generated phase identities, user titles/notes and history. Unambiguous legacy operation history follows the actual new stage; shared or removed instructions remain once for review. Standalone manual steps keep nearby retained phase anchors. Stage review marks survive unchanged inputs; changed owned assemblies reset them. Preparation freshness also tracks sourcing/tool inputs. Actual part/joint assignment edits and mismatched stage membership make a guide stale. Unknown fastener locations, pilot/engagement and unbuilt systems remain explicit.

## Format 5 wood-fastener records

`fastenerPlans` retains actual head-side and receiving part IDs, geometry/source fingerprints and baseline poses. It starts empty on legacy migration. Explicit locations retain local entrance coordinates, unit drive directions and durable F labels within each plan; no points or drilling patterns are inferred. User surface-to-tip, pilot diameter and deepest pilot-drill-tip measurements remain nullable, with basis/date. Trusted source conflicts, nominal length and length datums do not become entered installation depths.

Each plan has a W label reserved in `fastenerPlanLabels`. Deleted W labels and removed F numbers remain reserved through Undo/Redo; W001/F001 is unambiguous across plans. Labels do not establish a physical installation. Allocation-only reservations and bookkeeping timestamps do not stale otherwise unchanged guide reviews.

Shared rigid moves preserve local locations; relative changes, source edits, cuts or missing parts require review. Same-ID refresh is explicit and never picks a replacement by name. A removed member remains stale until explicitly reviewed and mapped under the format-6 workflow below. Centerline review is separate from holes, thread engagement, pilot/edge requirements, access, capacity and code approval.

`wood-fastener-preparation` phases preserve custom instructions/history. Guides and location CSVs distinguish candidates, unknown measurements and excluded stale/conflicting paths. Existing pairwise quantities remain unchanged; only explicit supply selections buy whole packs. No additional mesh, joint or drilled solid is created by choosing or purchasing screws. Format 4 readers must reject the new version rather than discard its locations.

## Format 6 reference baselines and reviewed replacements

Each fastener member reference adds nullable `baseline`: capture date, printed P label, actual material/dimensions, stock size/product identity, pose, retained planes, cut-source lineage and direction. New plans and reviewed changed references capture current facts. Older files retain null; a fingerprint or current same-name part cannot reconstruct an earlier physical solid. Captured project provenance remains distinct from manufacturer facts.

`referenceHistory` holds up to 50 explicit review events. Each retains exact previous head/receiver references, local locations, measured values/basis/date, product/evidence and label counter, plus the reviewed next references and reason/date. It is not a recursive project snapshot. Same-ID physical refresh and product-reference changes also preserve the earlier saved values. A physical/evidence refresh clears current measurements; a no-op refresh, including shared rigid motion, leaves the full plan unchanged.

Replacement preview requires actual active wood member IDs, distinct endpoints, at least one changed ID, a location treatment and a review basis. Nothing selects a replacement by name or role. Default treatment clears entrance/direction; explicit retain-local keeps raw numbers without scaling or translation. Both clear current seating/pilot measurements and their basis/date. The old values remain historical, and actual new cut/source/path checks run again. Preview binds saved intent and relevant current geometry/path context; changed previews and duplicate application are refused. Cancel does not mutate the project.

History is append-only for a retained saved plan, including whole-project API saves. A conflicting history prefix returns a revision conflict before touching the file. Explicit plan removal remains allowed. Undo/Redo restores active design state while retaining immutable review receipts and W/F reservations. Consequently the latest historical event need not describe the active mapping after Undo; history is never a current installation instruction.

Provenance-only additions do not change physical guide or AI-revision hashes. Current derived fastener preparation fingerprints also check source/measurement eligibility changes, so outdated review text regenerates without rewriting saved geometry. Changed scopes reset affected guide checks; unchanged neighboring work and custom instructions/history remain.

Portable JSON retains complete historical values. Human guides show concise labeled provenance; current schedules withhold stale/excluded depths and historical drilling values. CSV records historical review count/date/basis without importing old coordinates into current numeric columns. None of these records creates holes, installed screws, a pilot pattern, thread engagement, capacity or code approval.

## Format 7 measured lid hinges and physical stock

`lidHingePlans`, `hingeStockSources` and `hingePlanLabels` start empty when an earlier project is read. Migration does not select a mechanism, annotate old parts, copy a provisional pivot into a measured axis, or create stock, holes, cuts or purchases. The existing opening-lid preview remains provisional until a user explicitly selects a reviewed measured mechanism. New storage-banquette studies contain three pending plans referencing the actual generated lids and rear panels, plus one unmeasured planning source; they do not claim that one source supplies all lids or that installation is resolved.

A hinge plan retains actual moving/fixed part IDs, nullable source baselines, a closed relative pose, a product evidence revision and optional physical-stock allocation. H labels are reserved across removal and Undo/Redo. Explicit transferred-hole locations have durable L labels within their plan. Axis endpoints are paired local measurements on the actual moving and fixed members, with user basis/date. The nominal product length, linked pilot reference and provisional lid pivot never populate those fields automatically. Hardware observations and wood-entry seating/pilot values remain separate nullable user data.

Each physical stock source retains its identity, product evidence, optional manual-purchase link, entered usable length and explicit measured cut positions/metal kerfs. Deterministic retained-segment/end IDs distinguish original and cut ends; allocations identify one actual source segment, not an interchangeable nominal length. Missing, changed or duplicate claims remain reviewable and excluded where unresolved. A source record or allocation does not itself purchase a hinge or establish that all lids are covered. Wood-cut kerf and wood-saw capability do not supply metal-cut values or tool suitability.

Hinge `referenceHistory` records exact previous and reviewed next intent snapshots for refresh, member mapping, axis and allocation changes. Stock `referenceHistory` records exact previous/next physical-source inputs. Earlier axis points, locations, measurements, source/end references and basis/date remain historical. Refresh or replacement does not rebind by names; changed geometry/evidence must be reviewed explicitly. User-selected clear or retain-local treatment does not transform old measurements into an installation for new members.

For each retained saved plan/source, whole-project saves require the exact existing history prefix. Truncation or rewriting returns HTTP 409 after revision validation and before a temporary replacement file is written; stored bytes and revision remain unchanged. Explicit removal is allowed. Undo/Redo restores active values while merging immutable receipts and label reservations, so the last history row may describe another branch rather than the active mechanism. Current schedules suppress stale/excluded numerical instructions; full historical values remain in portable JSON.

An explicitly selected measured axis persists the exact world pivot/axis, moving part ID, and original closed/open poses in `Section.recordedLidMotion` while open. If the actual open pose is unchanged, closing restores the original pose numbers exactly so quaternion roundoff cannot reset checked guide phases. Edits made while open retain their geometry and reverse around the recorded axis instead. Section and saved-idea transforms move both pose snapshots with the axis; invalid/missing inputs remain reviewable. Motion, cut-interval and wood-entry centerline checks establish geometry only. Leaf/knuckle envelopes, fastener/edge suitability, pilot/engagement requirements, clamping and driver access, lid mass, hold-open/stay action, pinch protection, closed-seat support and capacity remain separate unresolved installation reviews.

## Observation retention and derived catalog/pricing fields

Stored material observations are validated structurally, including numeric bounds and official retailer URL/retailer consistency. They retain historical product identities when reviewed catalog offers change. New observation input/provider imports and active pricing use the stricter current-offer validator. An old SD306373352 record therefore stays readable/saveable while current SD pricing requires202071152. Raw originals remain non-destructive on read.

Trusted counted/mass purchase specifications and derived pricing coverage add no fields to saved selections, observations, geometry or guides and did not require a format change. Older apps preserve unrecognized supply IDs as unresolved purchases. Unknown price is distinct from a genuine observed zero; archived observations never become current merely because they remain in a file.

## Format 8 A21Z connector intent

`connectorPlans` and `connectorPlanLabels` start empty on reads of earlier formats. Existing physical pieces, W/H/source plans, snapshots, supplies, guide checks and old files are unchanged. At its introduction, exports used8; formats1–7 remained portable read inputs. Older clients must reject format8 rather than discard connector intent. The actual old future8 wrapper remains protected for its unrecognized `syntheticFutureGuard`; recognizing8 never permits dropping unknown data or overwriting that original.

A C plan records one A21Z reference choice, actual base/post wood members and captured source/relative-pose baselines. Four E entries represent the chosen two-plus-two alternative schedule, with no manufactured hole coordinates, thickness or installed angle mesh inferred. Each entry has its own member-local entrance/drive and nullable wood-entry-to-tip/pilot measurements with basis/date. A wood centerline is separate from the metal leaf, bend, hole/fastener fit and head seating.

Current source/reference-valid pending intent budgets one angle/four fasteners provisionally. Any entered path error, duplicate, obstruction or stale/global invalidity excludes the whole schedule; it never becomes a mixed or three-of-four set. Reviewed wood paths remain pending for actual connector fit. Manual supply rows alone purchase units; the 100-screw or120-nail packs are rounded once. Legacy quantities and W/H locations remain separate, with exact competing current entrances excluding the C intent rather than silently changing existing plans.

Same-ID reference refresh and complete schedule changes archive exact prior working intent in append-only `referenceHistory` and clear current entry coordinates/directions/measurements. A no-op or shared rigid refresh preserves the plan. Removed C labels remain reserved through Undo/Redo; earlier receipts survive restored active state. Whole-project saves reject truncated/rewritten retained history before touching stored bytes. Explicit plan removal remains possible. Missing imported baselines stay readable but stale until explicitly reviewed; no older C data exists to infer them from.

`connector-preparation` and affected assembly-stage fingerprints include actual current connector paths/source eligibility; guide regeneration preserves custom instructions and resets changed reviews. CSV/guide numerical fields stay blank for excluded/stale entries, while complete earlier values remain in editable JSON. No code, capacity or installation approval is produced.

## Format 9 explicit part guide placement

`Piece.guidePlacement` is optional `{ownerId: UUID, stageKey: string}` workflow intent. Absence remains absence on older pieces; migration neither assigns stages nor generates a guide. The target must identify one actual current base assembly stage when chosen. Physical roles, source geometry, section membership, fastener/hinge/connector history, purchases and measurements remain independent. A cross-owner choice includes its actual member geometry in the destination phase's freshness scope.

Generation assigns each active part once. New cuts retain the kept part's choice and clear it from newly created offcuts. An unavailable owner/stage remains in the saved annotation and places the active part once in a dedicated unresolved-review stage until explicitly changed or cleared. Names and matching stage keys in another owner never supply replacement identity. Existing dormant offcut data remains preserved but cannot act as an active assignment.

The saved step array expresses actual task order. Generation preserves relative order of surviving IDs and inserts genuinely new phases near generated neighbors; initial legacy setup lists do not establish a previously generated sequence. Stable identities, custom instructions and unchanged review marks remain; changed input scopes invalidate the affected marks. This workflow choice and manual order do not establish access, temporary support, a valid construction dependency graph or engineering approval.

Deliberate JSON import creates a new outer project ID and rekeys only guide choices whose owner was that exact old outer ID. Child assembly, part and physical-source IDs stay unchanged. Unsupported future12 files remain protected; recognizing an older version does not permit dropping unknown fields in it. Valid1–10 reads remain in memory until explicit Save writes11. See [the user workflow](guide-placement.md).

## Format 10 exact 3-inch wood-fastener choices

W plans and their immutable reference histories now accept the exact `simpson-csvz3r70` and `simpson-dsvt3r70` IDs. Older format9 readers have a closed product-ID set and must reject10 rather than discard these choices. No new plan fields or automatically populated measurements are introduced. Both original GRK product definitions, defaults and saved records stay unchanged.

Trusted product definitions can now have their own pack count and nominal length:70/3in for these two models, versus100/2.5in for the existing GRK choices. Purchasing rounds eligible locations once per exact product and compares only its selected manual boxes. Nominal3in and included-bit marketing do not supply entered tip/pilot geometry, tool ownership, an A21Z substitution or application approval. Product changes retain the existing review-history/reset semantics.

Recorded source layouts derive from existing `cutStock` blank reservations and add no persisted geometry or cut events. They never reconstruct an unrecorded saw sequence or infer that every gap is a kerf. Exact JSON values remain saved; the existing W CSV formatter uses up to six decimal places.

The migration regression uses an actual captured synthetic format9 wrapper with44 pieces, explicit P043 guide placement, custom task order and existing W/H/C histories. Its provenance/hash stays in `tests/fixtures/format9-guide-placement.provenance.json`; old raw bytes remain intact until explicit Save. Synthetic version-envelope cases remain labeled separately from provenance-backed originals.


## Format 11 short cabinet-screw choice

W plans and their immutable reference histories also accept `grk-cabinet-114069`: the exact GRK #8 × 1¼ in, T15, 100-count box. Format10 readers have a closed product-ID set and must reject11. Existing products, default choices, saved measurements and geometry stay unchanged. Nominal length does not fill surface-to-tip or pilot measurements. Product changes preserve previous inputs in review history and clear current measured fields. See [reviewed product sources](grk114069-materials.md).

The migration regression pins an authentic captured format10 wrapper containing 46 pieces, W/H/C histories, cut-source lineage, guide placement, checked/custom phases, supplies and snapshots. Reading changes only the in-memory version; original stored bytes and legacy browser keys remain intact. Explicit Save writes11 with the normal revision/time advance. A fresh synthetic format12 wrapper exercises forward protection; unknown fields remain rejected even in a recognized version.


## Format 12 measured site faces

Optional `siteClearances` records bind measured X or Z faces to a saved design. A face records its signed workspace coordinate, the minimum gap in inches, and either a full-height face or a measured height above the floor. Results derive from the current retained parts. Removing a saved design leaves its face available for review or removal. The 3D marker is display state. Earlier files migrate without inventing faces.

## Format 43 through-cuts

A part may carry rectangular through-cuts with its local through-axis, center and two spans. Rectangular and round cuts share one axis when both are present. Older files retain their round openings without creating new cuts. This format records full-thickness removals. Purchase blanks, physical source lineage and measured cutter setup remain separate.

## Format 44 folding lid stays

An optional folding stay fit saves its section, actual stationary and moving members, local mounting pins, measured arm lengths, fold direction and requested test angle. The baseline tracks the relative hinge and member geometry. Earlier projects open without inferred stay measurements. Preview poses are temporary. Product-linked quantities remain explicit purchase selections and can use the existing Home Depot snapshot workflow.

## Format 45 sidewall vent datums

A project code record can store an exterior wall datum and terminal coordinates, with optional measured lot-line and adjacent grade points and recorded site conditions. Coordinates are saved in workspace inches. The layout supplies the vent projection while present, and the prior manual projection remains available when a layout is removed. Earlier records open without inferred geometry.

## Format 46 closet rod backplates

A measured closet rod fit can save separate start and end backplate envelopes. Each stores four panel-local reaches from the rod center, the measured socket type, the actual mounting face and measurement notes. A change to the captured face or open/closed assignment calls for review. Earlier fits open without inferred backplate measurements.

## Format 47 greenhouse foundation footprints

Optional `greenhouseFoundations` records store the greenhouse design entry, width along X, depth along Z, center X and Z, and top elevation Y in workspace inches. Each design entry has at most one footprint. Rail fit and edge measurements derive from the current retained geometry. Earlier projects open without assumed site measurements.

## Format 48 concrete anchor marks

A greenhouse foundation footprint can carry an anchor layout for the reviewed Simpson Strong-Tie THD50600HMGF1 reference. It stores a specified detail, measured slab thickness, measured anchor under-head length, measured fixture and washer stack above the rail, the design's specified nominal embedment and minimum center-to-edge and spacing, and marks tied to actual rail IDs at workspace X and Z coordinates. All lengths are in inches. Earlier files open without assumed anchor details. The site's specified embedment is used for the bore comparison and is independent of the retail item's nominal length.

## Format 49 SUNLITE drill layouts

An optional `sunliteMounts` list binds an exact fastener reference and mounting detail to an actual panel. The detail stores the exterior thickness face, a panel-local stationary datum, measured shank and effective gasket diameters, and required radial cover. Each drill mark stores its center across and along the flutes relative to the panel center, diameter and receiving wood part. All dimensions are inches. Retained profile changes invalidate the datum baseline and preserve the marks for review. Editable files from earlier versions open without assumed drilling or fastener plans.
