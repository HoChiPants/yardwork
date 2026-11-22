# Move, copy and reuse stock

Select a part, then use **Lift** in its floating controls or **Lift / lower (L)** in the inspector. Drag the wood upward or downward to change its elevation; **Alt-drag** also lifts from the ordinary selection tool. Normal dragging preserves the starting elevation and can land on a higher supporting surface.

**Raise / Lower** use the selected increment: ⅛ in, ½ in, 1 in, 6 in or 1 ft. **Alt + ↑ / ↓** use the same increment. **Move XYZ** exposes the axis handles; exact coordinates remain in the inspector. Bottom elevation is shown separately from the part's center-Y coordinate. Position fields preserve precision when you tab through without editing.

When you move a single wood part with Lift or the axis handles, it stops at the first wood face in its path. The marker names the part it hit. To stack parts, raise one above the other, slide it over, then lower it to the top face. Contact also works with snapping turned off.

Select a section and choose **Move section in 3D** or **Lift** to move all its members together. The first member to contact external wood stops the section. Open spaces between members stay open, and offsets inside the section stay fixed. An eligible face snap uses the axes you moved along.

Use **Copy object / Paste object**, **⌘/Ctrl+C / V**, or **⌘/Ctrl+D** to duplicate. Text fields keep normal text shortcuts. Copies appear beside the build, get fresh part identities and can be moved independently. Whole-section copies retain a selectable group. Physical cut-source allocations and connection plans stay with their original parts; a copied shape does not create another reusable offcut.

The materials palette has one tile per stock family. Drag the picture or title into the workspace or choose **+** to start at the center. After you pick a location, the **2 × 4 framing lumber** tile offers 8, 10 and 12 ft stock. Enter a finished length, use a measured span, or use the available work zone clearance for a standing board. Yardwork compares shorter stock and matching offcuts. The **List** panel holds product references and the project cost estimate.

**Cut part** starts whole-foot dimensions in feet; other dimensions start in inches. Cut descriptions and the pool follow the same rule, so 72 in becomes 6 ft while 23.875 in remains inches. Choosing a unit manually remains possible. Stored dimensions keep their canonical inch values.

Open **Cut pool** in the materials sidebar to see reusable offcuts or used cut pieces. **Inspect** selects the actual part; **Reuse** returns the same offcut to the build and preserves its original stock source. The model never creates a second copy of that physical scrap merely by reusing it.

If you change a part after planning its cuts, open **Guide → Review build preparation → Stock and cuts** to see outdated assignments. **Return uncut offcut** restores the starting piece to the Cut pool with its original label and size. The preview lists every affected part, including parts that used remnants from that cut, and shows changes to the shopping list. Use it while the starting piece is still uncut. You can also open the same preview from the part’s stock cut plan.

Solid-wood placement resolves intersections during individual dragging and at committed movement, sizing, rotation, paste and section placement. It uses retained convex shapes, including rotations and saved cuts. Existing imported overlaps are highlighted in red; select one and use **Separate overlapping wood**. Unknown retained geometry blocks automatic placement rather than claiming clear space. These are geometric placement controls, not joint-strength calculations.
