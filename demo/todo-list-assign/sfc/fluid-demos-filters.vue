<script>
fluid.def("fluid.demos.filters", {
    filterCompleted: {
        $component: {
            $layers: "fluid.demos.filterCompleted"
        }
    }
});
</script>

<template>
    <div class="fl-controls">
        <h3>Filter</h3>
        <div @id="filterCompleted" class="fl-filter-outer">
        </div>
    </div>
</template>

<style>

</style>
