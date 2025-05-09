<script>
fluid.def("fluid.editor.holder", {
    $layers: "fluid.templateViewComponent",
    layerText: {
        $compute: {
            func: layerDef => JSON.stringify(layerDef, null, 4),
            args: "{self}.layerDef"
        }
    }
});
</script>

<template>
    <textarea>@{layerText}</textarea>
</template>
