<script>
// The SFC whose script index.html beside this file holds in its markup, as a static build writes it
fluid.def("fluid.tests.hydratedTemplate", {
    $layers: "fluid.component",
    caption: "Rendered from the SFC's template"
});
</script>

<template>
    <div class="hydrated-template-rendered">@{caption}</div>
</template>
