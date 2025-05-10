<script>
fluid.def("fluid.editorRoot", {
    openLayerTabs: {
        $reactiveRoot: []
    },
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
            func: (self, layerName, layerList, openLayerTabs) => {
                const isOpen = openLayerTabs.find(layerRec => layerRec.layerName === layerName);
                if (!isOpen) {
                    const rec = layerList.find(layerRec => layerRec.layerName === layerName);
                    openLayerTabs.push(rec);
                }
                self.selectedLayerTab = layerName;
            },
            args: ["{self}", "{0}:layerName", "{layerList}.layerList", "{self}.openLayerTabs"]
        }
    },
    closeLayerTab: {
        $method: {
            func: (self, layerName, openLayerTabs) => {
                const index = openLayerTabs.findIndex(layerRec => layerRec.layerName === layerName);
                if (index !== -1) {
                    openLayerTabs.splice(index, 1); // Remove the matching element
                    if (openLayerTabs.length > 0) {
                        self.selectedLayerTab = index > 0 ? openLayerTabs[index - 1].layerName : openLayerTabs[0].layerName;
                    } else {
                        self.selectedLayerTab = null; // No tabs are open
                    }
                }
            },
            args: ["{self}", "{0}:layerName", "{self}.openLayerTabs"]
        }
    }
});
</script>

<template>
    <div class="fl-editor-root fl-docking-area-component" data-fl-key="editorRoot" style="width: 600px">
        <link rel="stylesheet" href="https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css">
        <div @id="menu">
        </div>
        <div class="fl-editor-main-pane">
            <div class="fl-layer-browser">
                <div class="fl-layers-label">Layers</div>
                <div @id="layerList"></div>
            </div>
            <div @id="editorsPane" class="fl-editors-pane">
            </div>
        </div>
    </div>
</template>

<style>

.fl-layers-label {
    margin: 4px;
}

.fl-editor-root {
    border: 1px solid #cccccc;
    /* Lifted from bulma.css */
    font-family: BlinkMacSystemFont, -apple-system, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell",
       "Fira Sans", "Droid Sans", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
    display: flex;
    flex-direction: column;
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

.fl-editors-pane {
    width: 75%;
    display: flex;
    flex-direction: column;
}

</style>
