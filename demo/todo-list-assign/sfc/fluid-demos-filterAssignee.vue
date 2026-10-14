<script>
fluid.def("fluid.demos.filterAssignee", {
    $layers: ["fluid.demos.filter", "fluid.sfcTemplateViewComponent"],
    $importMap: {
        "fluid.UISelect": "%todoApp/sfc/fluid-UISelect.vue"
    },
    select: {
        $component: {
            $layers: "fluid.UISelect",
            selection: "<all>",
            optionValues: {
                $compute: {
                    func: assignees => ["<all>", ...assignees],
                    args: "{assignees}.assignees"
                }
            }
        }
    },
    acceptor: {
        $compute: {
            func: (selection) => todo => (selection === "<all>" || !selection) ? true
                : todo.assignee === selection,
            args: ["{self}.select.selection"]
        }
    }
});
</script>

<template>
    <div class="fl-control-holder">
        <label class="fl-control-label">Filter Assignee:</label>
        <select class="fl-control" @id="select">
        </select>
    </div>
</template>
