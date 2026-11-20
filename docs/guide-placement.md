# Part placement and build order

Generate the build guide when the design is ready. Yardwork groups actual parts into assembly tasks automatically; initial manual steps are optional.

To schedule a custom block before closing a storage seat, select the block, open **Part → Build stage**, and choose the actual frame task. Choose **Update build guide** to apply the change. **Open selected build stage** opens its task. **Use automatic stage** returns the part to the design's normal grouping.

The fitted-stock editor offers the same **Build stage** choice before Preview. Its result shows the chosen task beside **Add fitted block**. Destination section and build stage are separate choices: one controls physical grouping, the other controls when the part is handled.

**Earlier** and **Later** in the guide change the saved task order. Rebuilding the guide preserves the relative order of surviving task IDs, custom titles/notes, and unchanged review marks. New tasks are inserted near their generated neighbors. Review the sequence for access, temporary support and dependencies; a manually chosen order does not establish a feasible construction method.

An active part is assigned once. Only active parts belong to assembly-stage membership; the guide can link related offcuts as cut records. The choice does not move a part, change its physical role, or create a joint. If the exact chosen owner/task disappears, its raw choice remains visible as unavailable and the part appears in **Review parts with unavailable guide placement**. Select a current task or clear the choice; a same-name task in another assembly is not a replacement.

Cuts keep the retained part's choice and clear it on new offcuts. Saving/reopening and editable JSON preserve both the choice and actual step order. Deliberate JSON imports create a new project ID and update only guide choices addressed to that replaced outer ID; child assembly and physical-source IDs stay unchanged. Format 9 records this feature. Older files upgrade in memory and remain untouched until explicitly saved.

## Inspecting stock

The default canvas shows the assembly. **Show offcut stock** includes retained remnants and frames them with the build. Selecting an O-labeled remnant from the guide or part list reveals that stock deliberately. **Back to assembly** hides it and returns to a surviving active part from the same recorded source when available.

Hiding a remnant changes only the display. Every cut, source, retained dimension, purchase quantity and export remains present. Face picking and lid-motion review keep virtual loose stock out of the assembly inspection.
