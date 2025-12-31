<script>
fluid.def("fluid.editorRoot", {
    $layers: ["fluid.sfcTemplateViewComponent", "fluid.resolveRoot"],
    openLayerTabs: {
        $reactiveRoot: []
    },
    showUserLayersOnly: true,
    selectedLayerTab: null,
    inspectingSite: null,
    selfEditing: false,

    animateInspectOverlay: {
        $effect: {
            func: "fluid.animateInspectOverlay",
            args: ["{self}", "{self}.inspectingSite", "{colourManager}.layerColours", "{global}.document"]
        }
    },

    colourManager: {
        $component: {
            $layers: "fluid.layerColourManager"
        }
    },
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
    resolveLayerDef: {
        $method: {
            func: (layerList, layerColours, layerName) => {
                return layerName.startsWith("{") ? {
                    layerName,
                    layerDef: fluid.fetchWriteableLiveSignal(layerName),
                    colour: layerColours.$live,
                    editorModeLayer: "fluid.editor.json"
                } : layerList.find(layerRec => layerRec.layerName === layerName);
            },
            args: ["{layerList}.layerList", "{colourManager}.layerColours", "{0}:layerName"]
        }
    },
    editorHolderForLayer: {
        $method: {
            func: async (editorsPane, layerName) => {
                const children = fluid.liveQueryILSelector(editorsPane, "fluid.editor");

                await(fluid.signalToPromise(children));

                return children.value.find(child => child.layerRec.layerName === layerName);
            },
            args: ["{editorsPane}", "{0}:layerName"]
        }
    },
    goToLayerRef: {
        $method: {
            func: async (self, layerRef) => {
                // TODO: At some point deal with the fact that one editor might handle more than one layer - in the case
                // it is a multiplexed SFC - do we really want to support that?
                const holder = await(self.editorHolderForLayer(layerRef.context));
                holder.goToRef(layerRef);
            }
        },
        args: ["{self}", "{0}:layerRef"]
    },
    focusLayerEditor: {
        $method: {
            func: async (self, layerName) => {
                self.selectedLayerTab = layerName;
                const holder = await(self.editorHolderForLayer(layerName));
                const instance = await(fluid.signalToPromise(holder.editor.instance));
                instance.focus();
            },
            args: ["{self}", "{0}:layerName"]
        }
    },
    openLayerTab: {
        $method: {
            func: (self, layerName, layerList, openLayerTabs) => {
                const isOpen = openLayerTabs.find(layerRec => layerRec.layerName === layerName);
                if (!isOpen) {
                    const rec = self.resolveLayerDef(layerName);
                    if (!rec) {
                        console.log("Received request for nonexistent layer " + layerName);
                        return;
                    }
                    openLayerTabs.push(rec);
                }
                self.focusLayerEditor(layerName);
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
    overlayClick: {
        $method: {
            func: (self) => {
                if (self.inspectingSite) {
                    const that = self.inspectingSite.shadow.that;
                    const layerName = fluid.peek(that.$layers);
                    self.menu.inspect.inspecting = false;
                    self.inspectingSite = null;
                    // In time go direct to part of definition
                    self.openLayerTab(layerName);
                }
            },
            args: ["{self}", "{self}.inspectingSite"]
        }
    },
    filterForSelfEditing: {
        $method: {
            func: "fluid.filterForSelfEditing",
            args: ["{0}:vTree", "{1}:component", "{self}", "{colourManager}.layerColours"]
        }
    },
    editUpdateListener: {
        $bindable: {
            bind: {
                func: "fluid.editorRoot.editUpdateListener",
                args: ["{self}", "{global}.MutationObserver"]
            },
            unbind: observer => observer.disconnect()
        }
    },
    $variety: "frameworkAux"
});

// TODO: We have to list these here since otherwise they are not available when the layer loads - need some clear way
// to inject code synchronously or else reactively.

fluid.editorRoot.editUpdateListener = function (editorRoot, MutationObserver) {
    const observer = new MutationObserver((mutationList) => {
        const targets = [...new Set(mutationList.map(m => m.target))];
        targets.forEach(target => {
            const searcher = target.nodeType === 1 ? target : target.parentElement;
            const editRoot = searcher && searcher.closest(".fl-edit-root");
            if (editRoot) {
                const {shadow, container} = fluid.shadowForElementParent(editRoot);
                console.log("Found mutation of target ", target, " within root ", editRoot, " within container ", container);
                const path = fluid.pathToNode(editRoot, container);
                console.log("Path from editRoot to parent ", path.join(""));
                const vTree = shadow.that.vTree.peek();
                const vNode = fluid.navigatePath(vTree, path);
                console.log("Found corresponding vNode ", vNode);
                if (fluid.textDiff(vNode, editRoot)) {
                    console.log("Text content identical, skipping")
                } else {
                    const templateLayer = vNode.attrs["fl-template-layer"];
                    const sfcRec = fluid.sfcStore[templateLayer];
                    const origText = sfcRec.textSignal.value;
                    const from = vNode.children[0].start;
                    const to = fluid.peek(vNode.children).end;
                    const newText = origText.slice(0, from) + editRoot.innerHTML + origText.slice(to);
                    console.log(`Proposing updating text from\n${origText} to \n${newText}`);
                    sfcRec.textSignal.value = newText;
                }
            }
        });
    });

    observer.observe(document, {
        childList: true,
        subtree: true,
        characterData: true
    });
    return observer;
};

fluid.animateInspectOverlay = function (self, inspectingSite, layerColours, document) {
    // We need two overlays, one for the app, and another lying outside <body> for self-inspection of the IDE
    const overlays = {
        overlay: document.getElementById("fl-inspect-overlay"),
        selfOverlay: document.getElementById("fl-self-inspect-overlay")
    };
    if (overlays.overlay && overlays.selfOverlay) {
        let target, colour;
        if (inspectingSite) {
            const that = inspectingSite.shadow.that;
            const layerName = fluid.peek(that.$layers);
            colour = layerColours[layerName] || "transparent";
            Object.values(overlays).map(overlay => overlay.querySelector(".fl-inspect-layer").innerText = layerName);
            target = fluid.deSignal(that.renderedContainer);
        }
        fluid.applyOverlay(overlays, target, colour);
    }
};

</script>

<script src="%fluid-edit/js/editorRoot.js"></script>
<script src="%fluid-edit/js/layerColourManager.js"></script>

<template>
    <div class="fl-editor-root fl-docking-area-component" data-fl-key="editorRoot" style="max-width: 700px; min-width: 700px">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@6.1.95/css/materialdesignicons.min.css">
        <svg id="svg-defs">
            <defs>
                <symbol id="fl-recursion" viewBox="0 0 100 100" version="1.1" preserveAspectRatio="none">
                    <g>
                        <rect class="fl-recursion-outline" x="8" y="8" width="84" height="84" vector-effect="non-scaling-stroke"/>
                        <rect class="fl-recursion-outline" x="13" y="13" width="74" height="74" vector-effect="non-scaling-stroke"/>
                        <rect class="fl-recursion-outline" x="25" y="25" width="50" height="50" vector-effect="non-scaling-stroke"/>
                        <rect class="fl-recursion-outline" x="41" y="41" width="19" height="19" vector-effect="non-scaling-stroke"/>
                    </g>
                </symbol>
            </defs>
        </svg>
        <div @id="menu">
        </div>
        <div class="fl-editor-main-pane"
             @onmouseover="fluid.editorRoot.mouseOver({self})"
             @onmouseout="fluid.editorRoot.mouseOut({self})"
             @onclick="fluid.editorRoot.click({self})">
            <div class="fl-editor-pane-top">
                <div class="fl-layer-browser">
                    <div class="fl-layers-header">
                        <div class="fl-layers-label fl-pane-label">Layers</div>
                        <div class="fl-new-layer fl-clickable" @onclick="{layerList}.newLayer()">
                            <span class="mdi mdi-plus"></span>
                        </div>
                    </div>
                    <div @id="layerList"></div>
                </div>
                <div class="fl-resizer"></div>
                <div @id="editorsPane" class="fl-editors-pane">
                </div>
            </div>
            <div class="fl-editor-pane-bottom">
                <div class="fl-substrate-browser">
                    <div class="fl-substrate-label fl-pane-label">Substrate</div>
                    <div @id="substratePane"></div>
                </div>
                <div class="fl-history-browser">
                    <div class="fl-history-pane-top">
                        <div class="fl-history-label fl-pane-label">History</div>
                        <span class="mdi mdi-arrow-u-left-top fl-clickable" @onclick="fluid.historyBack()"></span>
                        <span class="mdi mdi-arrow-u-right-top fl-clickable" @onclick="fluid.historyForward()"></span>
                    </div>
                    <div @id="historyPane"></div>
                </div>
            </div>
        </div>
        <div id="fl-editor-inspect-overlay" class="fl-inspect-overlay"></div>
        <div id="fl-self-inspect-overlay" class="fl-inspect-overlay" @onclick="{editorRoot}.overlayClick()"><div class="fl-inspect-layer"></div></div>
    </div>
</template>

<style>


.fl-pane-label {
    font-size: 18px;
    margin: 4px;
}

.fl-layers-label {
    flex-grow: 1;
}

.fl-new-layer {
    font-size: 20px;
    border-radius: 10px;
    margin-right: 0.55em;
    line-height: 1;
}

.fl-layers-header {
    display: flex;
    align-items: center;
}

.fl-editor-root {
    border: 1px solid #cccccc;
    /* Lifted from bulma.css */
    font-family: BlinkMacSystemFont, -apple-system, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell",
       "Fira Sans", "Droid Sans", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 99.5vh; /* 100 will produce tiny scroll jank when we hit the bottom */
}

.fl-layer-browser {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    margin: 0 5px;
}

.fl-editor-main-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.fl-layer-browser {
    width: 35%;
}

.fl-editors-pane {
    width: 65%;
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
    display: flex;
    flex-direction: column;
}

.fl-history-browser {
    width: 30%;
    display: flex;
    flex-direction: column;
}

.fl-history-pane-top {
    display: flex;
    align-items: center;
    padding-right: 4px;
}

.fl-history-label {
    flex-grow: 1;
}

.fl-inspect-overlay {
    display: none;
    opacity: 0.5;
    position: absolute;
    cursor: pointer;
}

#fl-inspect-overlay {
    pointer-events: none;
    cursor: default;
}

.fl-inspect-layer {
    position: absolute;
    bottom: 3px;
    right: 3px;
}

.fl-layer-link {
    cursor: pointer;
}

.fl-layer-link.active {
    text-decoration-line: underline;
    text-decoration-thickness: 1px;
}

.fl-recursion-outline {
    fill: none;
    stroke: #545454;
    stroke-width: 1;
}

:root {
    --fl-layer-colour: grey;
}

.fl-edit-root {
    border-width: 1px;
    border-style: solid;
    border-color: transparent;
    border-radius: 5px;

    background-image: linear-gradient(90deg, var(--fl-layer-colour) 50%, transparent 50%),
        linear-gradient(90deg, var(--fl-layer-colour) 50%, transparent 50%),
        linear-gradient(0deg, var(--fl-layer-colour) 50%, transparent 50%),
        linear-gradient(0deg, var(--fl-layer-colour) 50%, transparent 50%);
    background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
    background-size: 10px 2px, 10px 2px, 2px 10px, 2px 10px;
    background-position: left top, right bottom, left bottom, right top;
    animation: border-dance 1s infinite linear;
    padding: 5px;
}

@keyframes border-dance {
    0% {
        background-position: left top, right bottom, left bottom, right top;
    }
    100% {
        background-position: left 10px top, right 10px bottom, left bottom 10px, right top 10px;
    }
}

#svg-defs {
   height: 0;
}

</style>
