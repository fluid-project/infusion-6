<script>
// The layer a page's own layer derives from - see index.html beside this file
fluid.def("fluid.tests.earlyDemand", {
    $layers: "fluid.templateViewComponent",
    caption: "Rendered from the imported layer"
});
</script>

<template>
    <div class="early-demand-rendered">@{caption}</div>
</template>
