# Lid travel and retained-solid overlap

Select a storage bench in **Sections**, then choose **Review lid travel**. **Play opening** and **Play closing** stop before a detected obstruction and highlight the parts involved. Use the slider, the 0° and 75° inspection buttons, or a named finding to examine either side of an obstruction. The camera frames the full swing. You can orbit freely and use **Fit project** to restore that framing. The blue line marks the hinge axis.

This is a temporary, read-only view. Exiting, changing section/tab or editing the project restores its saved pose. Saving or exporting while scrubbing saves the actual project, without the temporary angle. The separate **Preview lid open** checkbox retains the existing saved open/closed behavior. Cuts, source-stock lineage, names, IDs, quantities, notes and history survive the rigid lid movement. A generated `seat-lid` role identifies a renamed lid; legacy name matching must be unique.

The solver checks the retained part geometry along the swing and subdivides close passes. It reports confirmed interference, possible contact with exterior envelopes, and unresolved geometry or close passes. The work zone supplies room boundaries. Measured wall and baseboard faces include the requested minimum gap. The model treats contacts within 0.01 inches as touching for part-to-part checks. Use actual hardware and field measurements to determine fabrication tolerances.

Project checks now also compare rotated wood and saved convex cut profiles. They use the retained shape rather than only its enclosing box; resting face contact and removed cut-away stock are excluded. Corrugated sheet and multiwall glazing overlaps are reported separately as envelope reviews. Tubes and hardware are not silently turned into filled rectangular solids. The convex overlap method follows [David Eberly’s separating-axis treatment](https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf).

The opening uses the selected measured hinge axis when available and otherwise uses a provisional rear-edge pivot. Verify hinge geometry and mounting, lid supports, pinch points, and seat loads on the actual assembly. For custom doors, lids, and drawers, use **Test movement** to specify a hinge or slide and hold nearby mechanisms at different openings.

For a door or drawer in a rotated cabinet, use **Moving part axes**. Set the leaf or drawer box as the reference and include its handle and other moving parts in the same group. Preset hinge edges follow the reference part. **Workspace axes** and exact workspace pivot coordinates are available for hardware located from a room datum.

Playback and inspection use temporary poses. Saved projects retain their explicit open or closed design pose.

In **Test movement**, choose **Save test setup** to keep nearby held positions or a linked motion with the selected movement. Save the project to reopen the setup from the library. The printed and Markdown guides list the saved arrangement and the clearance findings for the current model. Held positions are percentages of each motion’s travel, so changing a motion’s range changes where it is held.

To compare several arrangements, run the test and open **Keep this test under a name**. Give each arrangement a name, such as “Open door first” or “Both drawers open.” Switch between them with **Clearance test**. Enter a different name when you want to keep the original arrangement and save a variation. In **Guide → Review build preparation**, choose a named result to reopen its test at the reported pose. Named tests use the current model each time they run.

Open **Guide → Review build preparation → Motion and clearance** to inspect a flagged test. Each row identifies the affected parts or measured site face and opens the relevant motion at the finding. A missing part or companion opens the setup with its error so you can revise it.

Each built-in storage lid also appears in that checklist when its swing has an obstruction, a measured clearance issue or an incomplete check. A row opens the affected seat at the relevant angle when one is available. Folding stay findings use the entered reach and arm dimensions.

With measured widths and thicknesses, Yardwork checks the two pin-to-pin arm rectangles throughout opening and closing. It uses the linkage's range of angles and pin positions to rule out intersections over each interval. Playback stops before a confirmed overlap or at the first interval that needs review. **Inspect arm clearance** shows uncertain parts and the affected stay in amber. Inspect the actual hardware for bracket, pivot, pinch and locking clearances. [Example folding stay installation drawing](https://images.thdstatic.com/catalog/pdfImages/ed/ed462be6-b1b6-4270-98f7-03390f006131.pdf)
