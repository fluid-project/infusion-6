<script>
fluid.def("fluid.editorRoot", {
    openLayerTabs: {
        $reactiveRoot: []
    },
    colourManager: {
        $component: {
            $layers: "fluid.layerColourManager"
        }
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
    substratePane: {
        $component: {
            $layers: "fluid.editor.substratePane"
        }
    },
    historyPane: {
        $component: {
            $layers: "fluid.editor.historyPane"
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
    },
    $variety: "frameworkAux"
});
</script>

<script src="@{editUrlBase}/js/layerColourManager.js"></script>

<template>
    <div class="fl-editor-root fl-docking-area-component" data-fl-key="editorRoot" style="width: 600px">
        <link rel="stylesheet" href="https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css">
        <svg class="fl-inline-svg">
            <defs>
                <symbol id="command-pick" viewBox="0 0 16 16" fill="context-fill #0c0c0d">
                    <path d="M3 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.6a1 1 0 1 1 0 2H3a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.6a1 1 0 1 1-2 0V4a1 1 0 0 0-1-1H3z"/>
                    <path d="M12.87 14.6c.3.36.85.4 1.2.1.36-.31.4-.86.1-1.22l-1.82-2.13 2.42-1a.3.3 0 0 0 .01-.56L7.43 6.43a.3.3 0 0 0-.42.35l2.13 7.89a.3.3 0 0 0 .55.07l1.35-2.28 1.83 2.14z"/>
                </symbol>
            </defs>
        </svg>
        <div @id="menu">
        </div>
        <div class="fl-editor-main-pane">
            <div class="fl-editor-pane-top">
                <div class="fl-layer-browser">
                    <div class="fl-layers-label">Layers</div>
                    <div @id="layerList"></div>
                </div>
                <div class="fl-resizer"></div>
                <div @id="editorsPane" class="fl-editors-pane">
                </div>
            </div>
            <div class="fl-editor-pane-bottom">
                <div class="fl-substrate-browser">
                    <div class="fl-layers-label">Substrate</div>
                    <div @id="substratePane"></div>
                </div>
                <div class="fl-history-browser">
                    <div class="fl-layers-label">History</div>
                    <div @id="historyPane"></div>
                </div>
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
    flex-direction: column;
    flex: 1;
}

.fl-layer-browser {
    width: 25%;
}

.fl-editors-pane {
    width: 75%;
    display: flex;
    flex-direction: column;
}

.fl-editor-pane-top {
    height: 50%;
    display: flex;
}

.fl-editor-pane-bottom {
    height: 50%;
    display: flex;
}

.fl-substrate-browser {
    width: 70%;
}



</style>
