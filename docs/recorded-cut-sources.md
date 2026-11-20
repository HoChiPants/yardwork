# Recorded cut sources

After cutting a board or panel, open **List → Recorded cut source · parts and offcuts** under that material. A recorded source is one physical blank shared by its retained pieces. It stays separate from the proposed packing layouts for stock that has no recorded cutting history.

The diagram shows kept parts in green and recorded offcuts in tan. The legend identifies every P/O part, its rectangular blank dimensions and its starting position on the original stock. Select **Inspect P…** or **Inspect O…** to open that actual part. Inspecting an offcut reveals its loose stock in the canvas; **Back to assembly** returns to the build.

Starts are measured from the original blank's low edges along the named length and width directions. They stay fixed when the assembled parts move or rotate. Use the displayed actual source size: an exact panel's listed dimensions can differ from the nominal 4×8 label. For example, the modeled Plytanium reference is 47.938 × 95.938 in at 0.703 in thick.

Hatching marks unretained rectangular stock. The model's 1/8 in saw allowance is shown separately; a saved gap alone does not establish a saw kerf, a chronological cut sequence or the blade/setup allowance for a physical cut. Follow the actual part's cut/profile review before cutting. Profiled parts reserve rectangular blanks in this view; removed profile corners are not invented as reusable offcuts.

If the source divides its thickness, the view shows exact XYZ starts and blank sizes instead of flattening overlapping layers into one sheet. Very detailed sources also use the coordinate view. Invalid or conflicting source records withhold the diagram and derived gaps until reviewed.

These diagrams also appear in the generated Markdown and printed guide. They change no piece, cut, source, fastener, purchase quantity or price. One shortened 96 in board can therefore show a 19.594 in kept piece, a 0.125 in unretained band and a 76.281 in offcut while still counting as one board.

On a phone, the inspector scrolls separately; a tall panel diagram may require scrolling to see its full length. The current source view is a saved blank layout, not a complete workshop cutting sequence or material-optimization guarantee.
