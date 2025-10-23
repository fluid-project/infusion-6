<script>
fluid.def("fluid.demos.filterCompleted", {
    $layers: ["fluid.demos.filter", "fluid.sfcTemplateViewComponent"],
    select: {
        $component: {
            $layers: ["fluid.UISelect", "fluid.selfTemplate"],
            selection: "all"
        }
    },
    accept: {
        $method: {
            func: (todo, selection) => (selection === "all" || !selection) ? true
                : selection === "true" ? todo.completed === true
                    : todo.completed === false,
            args: ["{0}:todos", "{select}.selection"]
        }
    }
});
</script>

<template>
    <fluid-import layer="fluid.UISelect" src="@{todoUrlBase}/sfc/fluid-UISelect.vue"></fluid-import>
    <div class="fl-control-holder">
        <label class="fl-control-label">Filter Completed:</label>
        <select class="fl-control" @id="select" @onchange="{self}.updateSelection({0})">
            <option value="all">all</option>
            <option value="true">true</option>
            <option value="false">false</option>
        </select>
    </div>
</template>
