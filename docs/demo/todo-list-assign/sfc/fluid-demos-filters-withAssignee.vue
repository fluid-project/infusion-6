<script>
fluid.def("fluid.demos.filters.withAssignee", {
    $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
    relativeContainer: "after: .fl-filter-completed",
    filterAssignee: {
        $component: {
            $layers: "fluid.demos.filterAssignee"
        }
    }
});
</script>

<template>
    <div @id="filterAssignee" class="fl-filter-outer fl-filter-assignee"></div>
</template>

<style>

</style>
