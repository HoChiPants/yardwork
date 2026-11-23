# Move, copy and reuse stock

Select a part, then use **Lift** below the workspace or **Lift / lower (L)** in the inspector. Drag the wood upward or downward to change its elevation. **Alt-drag** also lifts from the ordinary selection tool. Normal dragging preserves the starting elevation and can land on a higher supporting surface.

**Raise / Lower** and **Alt + ↑ / ↓** use the selected increment. To place the underside of a rotated board or an entire section at a measured elevation, enter **Bottom above floor** in inches or feet and choose **Set height**. The inspector also shows the top elevation. Setting the height stops at the first wood face along the way, just like Lift. **Move XYZ** exposes the axis handles, with exact center coordinates in the inspector. Position fields preserve precision when you tab through without editing.

In **Plan an idea**, try “Set the bottom of P001 to 2 ft above the floor.” Open **Review height in 3D** to see where the part would land. If wood blocks the move, you can move to the first contact or cancel the preview.

When you move a single wood part with Lift or the axis handles, it stops at the first wood face in its path. The marker names the part it hit. To stack parts, raise one above the other, slide it over, then lower it to the top face. Contact also works with snapping turned off.

To place a wood part exactly, choose **Part details → Place against another part**. Select a labeled target and side, then preview the placement. **Center across the face** lines up the two face centers. Clear it to keep the part's position along that face. Yardwork checks actual retained face contact, surrounding wood, the floor and the work zone before you apply the placement.

Use **Sections → Pick parts to group** to choose loose pieces in the 3D workspace or the list. **Create section** keeps their positions and opens the move handles for the new group. Use **Ungroup parts** under **Section anchor** to move them individually again. Their positions, labels, cuts and connections stay with the pieces. A custom guide assignment may need to be moved to a different task first.

Select a section and choose **Move section in 3D** or **Lift** to move all its members together. The first member to contact external wood stops the section. Open spaces between members stay open, and offsets inside the section stay fixed. An eligible face snap uses the axes you moved along.

Use **Section anchor → Check a section move** to enter exact offsets along X, Y or Z in feet or inches. The preview follows the straight path and shows the first wood-to-wood contact or work-zone boundary. Fitted parts such as casing and cabinet drawers travel with the section. Apply the requested move or choose **Move to stop** if the path is blocked. Cancel leaves the project as it was.

Use **Copy object / Paste object**, **⌘/Ctrl+C / V**, or **⌘/Ctrl+D** to duplicate. Text fields keep normal text shortcuts. Copies appear beside the build, get fresh part identities and can be moved independently. Whole-section copies retain a selectable group. Physical cut-source allocations and connection plans stay with their original parts; a copied shape does not create another reusable offcut.

The materials palette has one tile per stock family. Drag the picture or title onto the grid or a supporting face. The green marker shows the landing point and stays there while you choose a size. Press **Esc** to cancel a drag, or choose **+** to start at the center. The **2 × 4 framing lumber** tile offers 8, 10 and 12 ft stock. Choose **Stand up** for height, **Lay flat** for width, or **Lay front to back** for depth. Enter a finished length, use a measured span, or size the board to the work zone clearance in that direction. Yardwork compares shorter stock and matching offcuts. The **List** panel holds product references and the project cost estimate.

In **List → Compare stock**, use **Compare mixed lengths** for two to twelve parts on one lumber line without recorded stock sources. Review purchase changes, the cut order and expected offcuts before applying. Check the delivered grade and treatment for each selected board.

Ask **Plan an idea** “Which offcuts fit P001?” or open the part’s **View stock cut plan**. The review can offer remnants from compatible starting lengths and show the saved source cuts for an expected remnant. Applying the assignment keeps the part in place and records the remnant’s original stock. Returning it uncut restores the part’s previous stock selection.

**Cut part** starts whole-foot dimensions in feet; other dimensions start in inches. Cut descriptions and the pool follow the same rule, so 72 in becomes 6 ft while 23.875 in remains inches. Choosing a unit manually remains possible. Stored dimensions keep their canonical inch values.

Open **Cut pool** in the materials sidebar to see reusable offcuts or used cut pieces. **Inspect** selects the actual part; **Reuse** returns the same offcut to the build and preserves its original stock source. The model never creates a second copy of that physical scrap merely by reusing it.

**Review offcut reuse** compares cutting longer and shorter parts from a board first against the whole project’s purchase quantities. In the [board-saving practice plan](../public/examples/cut-pool/save-a-board.yardwork.json), cutting two shorter parts from the 76 in offcut reduces the new 2 × 4 stock from four boards to three. The guide preserves the two cuts in order and records the 12¾ in remnant.

Use **Find uses for** beside a labeled offcut to plan from that piece. Review the suggested sequence or choose one matching part. The preview lists the cuts, the scraps to keep, and any change to the shopping list before you apply it.

To turn a single scrap into matching spacers or setup blocks, choose **Split → Divide into equal blanks** or ask **“Split O001 into four equal blanks.”** Choose crosscuts for length or rips for width. The preview subtracts blade loss for every cut, shows the size of each labeled blank, and records the order in the build guide.

Choose **Cut pool → View offcut cut order** to see the saved sequence while you work. In the Guide, **Stock for this step → Open offcut cuts** opens the operations that supply that step. The on-screen, printed and Markdown guides tell you which remnants to set aside for a later cut or measurement.

After making a cut, use **Mark cuts complete** on that operation. The Cut pool lists future remnants as expected until their producing cuts are complete. You can plan ahead with expected offcuts. Answers about scraps on hand only use stock you can use now. Confirm earlier cuts before confirming an operation that depends on them.

If you change a part after planning its cuts, open **Guide → Review build preparation → Stock and cuts** to see outdated assignments. **Return uncut offcut** restores the starting piece to the Cut pool with its original label and size. The preview lists every affected part, including parts that used remnants from that cut, and shows changes to the shopping list. Use it while the starting piece is still uncut. You can also open the same preview from the part’s stock cut plan.

Solid-wood placement resolves intersections during individual dragging and at committed movement, sizing, rotation, paste and section placement. It uses retained convex shapes, including rotations and saved cuts. Existing imported overlaps are highlighted in red; select one and use **Separate overlapping wood**. Unknown retained geometry blocks automatic placement rather than claiming clear space. These are geometric placement controls, not joint-strength calculations.
