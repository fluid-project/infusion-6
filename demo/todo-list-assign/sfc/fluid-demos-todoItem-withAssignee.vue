<script>
fluid.def("fluid.demos.todoItem.withAssignee", {
    $layers: "fluid.partialViewComponent",
    relativeContainer: "after: .item-text",
    select: {
        $component: {
            $layers: "fluid.UISelect",
            selection: {
                $compute: {
                    func: value => value || "<none>",
                    args: "{todoItem}.todo.assignee"
                }
            },
            optionValues: {
                $compute: {
                    func: assignees => ["<none>", ...assignees],
                    args: "{assignees}.assignees"
                },
            },
            selectEffect: {
                // Whole effect is an epicycle from the fact we can't yet simply assign straight back to the source data through the projection of it
                // Then we further need the "includeSource" to get around the fact that reference sliding amongst members of the list will activate this
                $effect: {
                    func: (selection, itemIndex, assignItem) => assignItem(itemIndex, selection === "<none>" ? null : selection),
                    args: ["{self}.selection", "{todoItem}.itemIndex", "{todoList}.assignItem"],
                    includeSource: "dom"
                }
            }
        }
    }
});
</script>

<template>
    <select @id="select" class="item-assignee-select">
    </select>
</template>

<style>

.item-assignee-select {
    margin-left: 0.5rem;
    margin-right: 0.5rem;
}

</style>
