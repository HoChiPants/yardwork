# Banquette construction review

Open **Checks → Review connection decisions** (or the connection count in the status bar). For a storage banquette, **Banquette construction** shows one actual module at a time. Choose another module from the selector; opening a screw or connector plan and returning keeps that module selected.

The seat review uses its current retained surfaces. Expand **Inspect seat contacts** to see the actual member labels, modeled gaps and face-overlap areas. Inspect exposes the selected support in the workspace; **Return to inspector** returns to the same review. A currently open or tilted seat is not silently closed for analysis. Missing or unavailable geometry and bounded searches remain incomplete, rather than becoming proof of absent support.

Open **Checks → Seat support to floor** to trace each wood contact beneath a seat through the modeled parts down to the floor. The same check runs for shelves with wood bearing. If a branch stops, the check names the last part and highlights the affected contact under the panel. Inspect below that part for a gap or check the fastening or hardware specified to carry the load. The shelf and seat bearing section of the printed and Markdown guides records these observations.

Choose **Fit a support block** on a warning to preview a square-ended block centered under a stationary wood part where the contact stops. The preview checks the full ends against the retained wood, looks for a clear fit down to a supported wood face or the modeled floor, and tests recorded movement for interference. Select a matching offcut or use new cuttable stock. Adding the block records the cut, keeps reusable remnants, and recomputes the panel’s contact paths. Verify the actual substrate, fasteners, block dimensions and load capacity before building.

If the center is blocked, choose **Find nearby fit** or enter X and Z distances under **Offset from center**. The preview marks the offset from the underside center and checks full contact at both ends and interference with saved movements. The guide lists the block’s center and current bearing, including any later edit that needs review.

Choose **Add and review joints** to open the touching wood pairs for the fitted block. Review screw locations or check connector fit where both parts are frame stock. **Guide → Review build preparation → Fitted support-block joints** returns to the block after saving. A block resting on the modeled floor keeps a separate site check for bearing and restraint. Follow the connector and fastener instructions for the actual connection. [Simpson Strong-Tie general connector notes](https://www.strongtie.com/products/connectors/wood-construction-connectors/technical-notes/general-notes)

The trace represents face contact. Verify fastener capacity, stability, the actual substrate, and the panel grade, strength axis and intended loads separately. APA's plywood guidance explains how support spacing and conditions, panel orientation and deflection affect capacity. WoodWorks illustrates how load transfer through horizontal wood members can require additional bearing or fastener checks. [APA plywood design guidance](https://www.apawood.org/engineered-wood-products/plywood-osb/plywood/) · [WoodWorks on bearing and load transfer](https://www.woodworks.org/resources/structural-design-considerations-for-bearing-wall-top-plates-that-support-concentrated-loads/)

Frame contact pairs appear first. The other shell contacts are expandable. These are current contact candidates plus authored pairs, not a required number of fasteners or a finished fastening schedule. A rail touching a leg does not join it. Hinges, purchases and a plan on a neighboring pair do not resolve that pair.

- **Plan screws** opens an unsaved plan for those exact two members. Choose the head side, product, actual entrance/direction and measurements before saving the locations you intend to use. No nominal screw length becomes a measured seating depth.
- **Review W… / C…** reopens the existing exact-pair record so it can be continued without creating a duplicate.
- **Plan A21Z** opens the existing connector editor for two actual frame members. Entered wood centerlines remain separate from unresolved connector leaf/hole fit and application suitability.
- Started, layout-pending, measurements-pending, mixed and excluded records stay distinct. None is called installed or structurally approved.

A saved pair remains reviewable when one endpoint moves, is cut, becomes an offcut or is removed. No same-name replacement is chosen automatically. Unplanned members without current frame contact are identified without inventing an intended counterpart. Generic loose/untyped work remains available through the ordinary nearby-face review.

The Markdown build guide and printed appendix include current seat observations, exact frame/authored pairs and findings. Viewing or exporting the report does not change parts, source stock, purchases, guide task IDs, custom notes or checklist state. Regenerate the guide after making actual design/connection changes.

The default 24-inch storage module currently has eight modeled lid contacts, twelve frame contact candidates and twenty-eight other shell contact candidates. These counts describe that particular geometry. They do not establish panel span, adequate bearing, joint strength, bracing, floor/wall anchorage, safe seating loads, lid hold-open/pinch protection, or code compliance. Complete construction details remain required.
