<script>
fluid.def("fluid.demos.filterAssignee", {
    $layers: ["fluid.demos.filter", "fluid.sfcTemplateViewComponent"],
    select: {
        $component: {
            $layers: ["fluid.demos.selectUI", "fluid.selfTemplate"]
        }
    },
    accept: {
        $method: {
            func: (todo, selection) => (selection === "$all" || !selection) ? true
                : todo.assignee === selection,
            args: ["{0}:todos", "{select}.selection"]
        }
    }
});
</script>

<template>
    <div class="fl-control-holder">
        <label class="fl-control-label">Filter Assignee:</label>
        <select class="fl-control" @id="select" @onchange="{self}.updateSelection({0})">
            <option value="$all">all</option>
            <option value="Ashiata Shiemash">Ashiata Shiemash</option>
            <option value="Gornahoor Harharkh">Gornahoor Harharkh</option>
            <option value="Makary Kronbernkzion">Makary Kronbernkzion</option>
        </select>
    </div>
</template>
