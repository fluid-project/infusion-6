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
                    args: "{todo}.assignee"
                }
            },
            optionValues: {
                $compute: {
                    func: assignees => ["<none>", ...assignees],
                    args: "{assignees}.assignees"
                },
            },
            selectEffect: {
                $effect: {
                    func: (selection, itemIndex, assignItem) => assignItem(itemIndex, selection === "<none>" ? null : selection),
                    args: ["{self}.selection", "{itemIndex}", "{todoList}.assignItem"]
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
