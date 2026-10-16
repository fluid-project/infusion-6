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
            // Rather than updating its own selection, write the choice straight back through the projection of the
            // todo to the source data - the selection above will then update from it
            updateSelection: {
                $method: {
                    func: (todoItem, e) => {
                        const value = e.target.value;
                        todoItem.todo.assignee = value === "<none>" ? null : value;
                    },
                    args: ["{todoItem}", "{0}:event"]
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
