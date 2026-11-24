<script>
fluid.def("beautifulWend.footer.disclaimer", {
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "before: .ponder-credits-row"
        }
    }
});
</script>

<template>
    <div class="row">
        <div class="disclaimer">
            <b>Disclaimer:</b> @{{site}.config.params.disclaimerText}
        </div>
    </div>
</template>
