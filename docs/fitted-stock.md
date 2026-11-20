# Fit stock between faces

Open **Checks → Fit stock between faces**, or choose a pair in **Review connection decisions** and fit stock between those members.

1. Choose two actual wood members and their opposed, parallel retained faces. Face menus also reach surfaces hidden inside a closed body. **Pick first face and datum in 3D** uses your clicked point; the second pick identifies the other face.
2. Choose the first face's cross-section-center datum. Enter its centered local X/Y/Z coordinates, pick it, or deliberately choose **Use face center**. Selecting a face alone leaves this point unknown.
3. Choose a catalog board, roll its cross-section and enter each end clearance with its own inches/feet selector. **Use exact modeled span** explicitly enters zero clearances. The selected stock fixes the cross-section and available source length.
4. Choose a destination section or **Loose custom part**. Optionally choose an actual **Build stage**; Automatic keeps normal design grouping. **Preview fitted stock** brings the result and Add/Cancel/Inspect actions into view. Review its contrasting ghost, selected task, fitted length, source length, kerf and reusable remnant. The whole end footprint must fit both faces; overlaps, short stock and an outside-zone fit prevent Add.
5. **Add fitted block** commits the exact preview and opens two end-connection actions. **Cancel** leaves the project unchanged. Ordinary Undo/Redo, Save project and editable JSON include the added geometry and cut source. Regenerate the build guide when ready; an explicit Build stage remains selected. The Part inspector can change or clear it later. [Part placement and build order](guide-placement.md).

The default scene hides virtual offcuts. **Show offcut stock** or select its O label to inspect a remnant, then **Back to assembly**. **Inspect in 3D** and the canvas return action preserve the exact preview; returning focuses its result controls.

One shortened board retains its full source dimensions and shares that source with its genuine offcut. It contributes one physical source to the material list. A full-length fit has no invented cut; a trim consuming the last small end as kerf/waste has no phantom remnant. For example, the software acceptance fixture divides one 96 in board into a 19.594 in block, 0.125 in modeled kerf loss and 76.281 in remnant. Confirm actual stock and blade allowance before cutting.

The first version fits square-ended fresh linear wood between opposed planar faces, including rotated assemblies and actual retained profile faces. It does not consume an existing offcut or create a persistent constraint: moving either parent later does not resize this piece. A member added to a generated design is custom work and participates in the existing rebuild acknowledgement.

The helper creates stock and cut records. Choose actual fastening details for both ends; no screw, bracket or purchase selection is created automatically. Physical joint suitability, access, material use and loads remain separate design decisions. Prices and store availability continue to come from configurable store/ZIP snapshots, default 84121.
