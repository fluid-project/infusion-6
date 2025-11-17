<script>
fluid.def("fluid.editor.editorsPane", {
    tabs: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $for: {
                source: "{fluid.editorRoot}.openLayerTabs",
                value: "layerRec"
            },
            layerName: "{layerRec}.layerName",
            colour: "{layerRec}.colour",
            isActive: {
                $compute: {
                    func: (layerName, selectedLayerTab) => layerName === selectedLayerTab,
                    args: ["{self}.layerName", "{fluid.editorRoot}.selectedLayerTab"]
                }
            },
            template: `
<div class="fl-editor-layer-tab fl-clickable" @class="active:@{isActive}"
    @onclick="{editorRoot}.selectedLayerTab = {self}.layerName"
    style="background-color: @{colour}">@{layerName}
        <span class="fl-editor-close fl-clickable" @onclick.stop="{editorRoot}.closeLayerTab({self}.layerName)">
            <span class="mdi mdi-close"></span>
        </span>
</div>`
        }
    },
    editorHolders: {
        $component: {
            $layers: ["fluid.editor", "{self}.layerRec.editorModeLayer"],
            $for: {
                source: "{fluid.editorRoot}.openLayerTabs",
                value: "layerRec"
            },
            layerRec: "{layerRec}"
        }
    },
    $variety: "frameworkAux"
});
</script>

<template>
    <div class="fl-editor-editors-pane">
        <div @id="tabs" class="fl-editor-layer-tabs"></div>
        <div @id="editorHolders" class="fl-editor-holder">
        </div>
    </div>
</template>

<style>
    .fl-editor-layer-tabs {
        display: flex;
        min-height: 48px;
        overflow-x: auto;
    }

    .fl-editor-layer-tab {
        padding: 4px 4px 3px;
        font-size: 14px;
        white-space: nowrap;
        height: 28px;
    }

    .fl-editor-layer-tab .fl-editor-close {
        font-size: 12px;
        margin-left: 4px;
        display: inline-block;
        width: 14px;
        height: 14px;
        position: relative;
    }

    .fl-editor-layer-tab .fl-editor-close .mdi {
        display: inline-block;
        position: relative;
        left: 1px;
        bottom: 1px;
    }


    .fl-editor-layer-tab .fl-editor-close:hover {
        background: #aaa;
    }

    .fl-editor-layer-tab.active {
        border-bottom: #747a80 solid 3px;
    }

    .fl-editor-editors-pane {
        display: flex;
        flex-direction: column;
        width: 75%;
    }

    .fl-editor-holder {
        min-height: 0;
        display: flex;
    }
</style>
