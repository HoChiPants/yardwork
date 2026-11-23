# Recorded cut sources

Open **List → Recorded cut source** under the material to inspect a pending or completed board or panel. A recorded source is one physical blank shared by its retained pieces. It stays separate from the proposed packing layouts for stock that has no recorded cutting history.

After completing a saved cut order, select **Mark cuts complete**. The original numbered cuts stay under **Recorded stock cuts** in the guide, and its offcuts are available in the Cut pool. Later scrap cuts point back to that source order. The shop record keeps its original dimensions and instructions when you revise the assembly. [Practice plan](../public/examples/cut-pool/completed-shelf-rail-source.yardwork.json) · [Build guide](../public/examples/cut-pool/completed-shelf-rail-source-guide.md)

Use **Split O…** in the **Cut pool** to set aside two loose pieces from one wood offcut. Divide it evenly or set a custom cut. The finish sample option gives you a starting length to edit for your own project. Review the saw allowance and both new labels before saving. The guide places this cut before later cuts that use either piece. [Practice offcut](../public/examples/cut-pool/split-scrap.yardwork.json) · [Example guide](../public/examples/cut-pool/split-scrap-guide.md) · [Minwax guidance for matching stain samples](https://www.minwax.com/en/how-to-finish-wood/wood-preparation/frequently-asked-questions)

If a planned board or sheet is still uncut, choose **Release uncut stock plan**. The preview lists the original blanks and any parts that were assigned its expected offcuts. **Apply release** removes the pending cuts and their dependent assignments in one undoable action. An on-hand source goes back into the Cut pool at its full dimensions. Review the new shopping count and assign stock again after editing the parts. The build guide follows the revised assignments. [Two-source practice plan](../public/examples/cut-pool/two-scrap-rails.yardwork.json)

**Revise design** can release an untouched cut plan shared by parts of the same design. For example, when two seats share a sheet and you resize one seat, the surviving seat parts stay in the layout and their cuts return to planning. In **Cuts and stock**, use matching scraps to include any returned full blank you marked on hand. Sources shared outside the design and sources with downstream scrap assignments still have their own release review.

The diagram shows kept parts in green and recorded offcuts in tan. The legend identifies every P/O part, its rectangular blank dimensions and its starting position on the original stock. Select **Inspect P…** or **Inspect O…** to open that actual part. Inspecting an offcut reveals its loose stock in the canvas; **Back to assembly** returns to the build.

Starts are measured from the original blank's low edges along the named length and width directions. They stay fixed when the assembled parts move or rotate. Use the displayed actual source size: an exact panel's listed dimensions can differ from the nominal 4×8 label. For example, the modeled Plytanium reference is 47.938 × 95.938 in at 0.703 in thick.

Hatching marks unretained rectangular stock. The model's 1/8 in saw allowance is shown separately; a saved gap alone does not establish a saw kerf, a chronological cut sequence or the blade/setup allowance for a physical cut. Follow the actual part's cut/profile review before cutting. Profiled parts reserve rectangular blanks in this view; removed profile corners are not invented as reusable offcuts.

If the source divides its thickness, the view shows exact XYZ starts and blank sizes instead of flattening overlapping layers into one sheet. Very detailed sources also use the coordinate view. Invalid or conflicting source records withhold the diagram and derived gaps until reviewed.

These diagrams also appear in the generated Markdown and printed guide. They change no piece, cut, source, fastener, purchase quantity or price. One shortened 96 in board can therefore show a 19.594 in kept piece, a 0.125 in unretained band and a 76.281 in offcut while still counting as one board.

On a phone, the inspector scrolls separately; a tall panel diagram may require scrolling to see its full length. The current source view is a saved blank layout, not a complete workshop cutting sequence or material-optimization guarantee.
