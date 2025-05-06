<script>
fluid.def("fluid.editor", {
    $layers: "fluid.templateViewComponent",
    openLayerTabs: [],
    selectedLayerTab: null,
    menu: {
        $component: {
            $layers: "fluid.editor.menu"
        }
    },
    layerList: {
        $component: {
            $layers: "fluid.editor.layerList"
        }
    },
    editorsPane: {
        $component: {
            $layers: "fluid.editor.editorsPane"
        }
    },
    openLayerTab: {
        $method: {
            func: (layerName, layerList, openLayerTabs) => {
                const isOpen = openLayerTabs.find(layerRec => layerRec.layerName === layerName);
                if (!isOpen) {
                    const rec = layerList.find(layerRec => layerRec.layerName === layerName);
                    openLayerTabs.push(rec);
                }
            },
            args: ["{0}:layerName", "{layerList}.layerList", "{self}.openLayerTabs"]
        }
    }
});
</script>

<template>
    <div class="fl-editor" data-fl-key="fluidEditor" style="width: 600px">
        <link rel="stylesheet" href="https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css">
        <div @id="menu">
        </div>
        <div class="fl-editor-main-pane">
            <div class="fl-layer-browser">
                <div class="fl-layers-label">Layers</div>
                <div @id="layerList"></div>
            </div>
            <div @id="editorsPane"class="fl-editor-editors-pane">
                <div class="fl-editor-layer-tabs">fluid.demos.todoList</div>
                <div class="fl-editor-editor-holder">
                    Editor content here
                </div>
            </div>
        </div>
    </div>
</template>

<style>

.fl-layers-label {
    margin: 4px;
}

.fl-editor {
    border: 1px solid #cccccc;
    /* Lifted from bulma.css */
    font-family: BlinkMacSystemFont, -apple-system, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell",
       "Fira Sans", "Droid Sans", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
}

.fl-layer-browser {
    display: flex;
    flex-direction: column;
}

.fl-editor-main-pane {
    display: flex;
}

.fl-layer-browser {
    width: 25%;
}

.fl-editor-editors-pane {
    width: 75%;
    display: flex;
    flex-direction: column;
}

</style>
