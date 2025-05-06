<script>
fluid.def("fluid.editor.editorsPane", {
    $layers: "fluid.templateViewComponent",
    tabs: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $for: {
                source: "{fluid.editor}.openLayerTabs",
                value: "layerName"
            },
            template: `<div class="fl-editor-layer-tab">@{{layerName}}</div>`
        }
    },
    editHolders: {
        $component: {
            $layers: "fluid.editorHolder",
            $for: {
                source: "{fluid.editor}.openLayerTabs",
                value: "layerAndDef"
            },
            template: `<textarea>@{{layerAndDef}.raw}</textarea>`
        }
    }
});
</script>

<template>
    <div @id="editorsPane" class="fl-editor-editors-pane">
        <div @id="tabs" class="fl-editor-layer-tabs"></div>
        <div @id="editorHolder" class="fl-editor-editor-holder">
        </div>
    </div>
</template>

<style>
    .fl-editor-layer-tabs {
        display: flex;
        height: 1em;
        min-height: 1em;
    }

    .fl-editor-editors-pane {
        display: flex;
        flex-direction: column;
    }

    .fl-editor-editor-holder {
        height: 100%;
    }
</style>
