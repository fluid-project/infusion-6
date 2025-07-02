<script>
fluid.def("fluid.demos.facets", {
    assigneeControl: {
        $component: {
            $layers: "fluid.demos.assigneeControl"
        }
    }
});
</script>

<template>
    <div class="fl-controls">
        <h3>Facets</h3>
        <div @id="assigneeControl" class="fl-filter-outer">
        </div>
    </div>
</template>

<style>

</style>
