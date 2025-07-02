<script>
fluid.def("fluid.demos.assigneeControl", {
    enabled: false,
    assigneeLinkage: {
        $component: {
            $if: "{assigneeControl}.enabled",
            $layers: "fluid.component",
            assigneeLinkage: {
                $linkage: [{
                    inputLayers: ["fluid.demos.filters"],
                    outputLayers: ["fluid.demos.filters.withAssignee"]
                }, /*{
                    inputLayers: ["fluid.demos.todoItem"],
                    outputLayers: ["fluid.demos.todoItem.withAssignee"]
                }*/]
            }
        }
    },
    updateEnabled: {
        $method: {
            func: (self, e) => {
                self.enabled = e.target.checked
            },
            args: ["{self}", "{0}:event"]
        }
    }
});
</script>

<template>
    <div class="fl-control-holder">
        <label class="fl-control-label">Assignee Facet:</label>
        <input type="checkbox" class="fl-control" @onchange="{self}.updateEnabled({0})"/>
    </div>
</template>
