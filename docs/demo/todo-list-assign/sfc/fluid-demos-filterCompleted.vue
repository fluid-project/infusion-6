<script>
fluid.def("fluid.demos.filterCompleted", {
    $layers: "fluid.demos.filter",
    view: {
        $component: {
            $layers: "fluid.sfcTemplateViewComponent"
        }
    },
    $importMap: {
        "fluid.UISelect": "%todoApp/sfc/fluid-UISelect.vue"
    },
    select: {
        $component: {
            $layers: "fluid.UISelect",
            view: {
                $component: {
                    $layers: "fluid.selfTemplateViewComponent"
                }
            },
            selection: "all"
        }
    },
    acceptor: {
        $compute: {
            func: (selection) => todo => (selection === "all" || !selection) ? true
                : selection === "true" ? todo.completed === true
                    : todo.completed === false,
            args: ["{select}.selection"]
        }
    }
});
</script>

<template>
    <div class="fl-control-holder">
        <label class="fl-control-label">Filter Completed:</label>
        <select class="fl-control" @id="select" @onchange="{self}.updateSelection({0})">
            <option value="all">all</option>
            <option value="true">true</option>
            <option value="false">false</option>
        </select>
    </div>
</template>
