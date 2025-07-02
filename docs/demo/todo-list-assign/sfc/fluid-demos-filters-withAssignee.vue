<script>
fluid.def("fluid.demos.filters.withAssignee", {
    filterAssignee: {
        $component: {
            $layers: "fluid.demos.filterAssignee"
        }
    }
});
</script>

<template>
    <div class="fl-controls">
        <h3>Filter</h3>
        <div @id="filterCompleted" class="fl-filter-outer"></div>
        <div @id="filterAssignee" class="fl-filter-outer"></div>
    </div>
</template>

<style>

</style>
