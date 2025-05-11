<script>
fluid.def("fluid.editor.viewEditor", {
    sfcEditor: {
        $component: {
            $layers: "fluid.codemirror",
            mode: "text/javascript",
            text: "{viewEditor}.layerRec.sfcDef"
        }
    },
    isActive: {
        $compute: {
            func: (layerName, selectedLayerTab) => layerName === selectedLayerTab,
            args: ["{self}.layerRec.layerName", "{fluid.editorRoot}.selectedLayerTab"]
        }
    },
    $variety: "frameworkAux"
});

</script>

<template>
    <div class="fl-editor" @id="sfcEditor" @class="active:@{isActive}">
    </div>
</template>

<style>
.fl-editor {
    display: none
}

.fl-editor.active {
    display: block
}
</style>
