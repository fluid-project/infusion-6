<script>
fluid.def("fluid.editorRoot", {
    openLayerTabs: {
        $reactiveRoot: []
    },
    showUserLayersOnly: true,
    selectedLayerTab: null,
    inspectingSite: null,

    animateInspectOverlay: "$effect:fluid.animateInspectOverlay({self}, {self}.inspectingSite, {colourManager}.layerColours)",

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
            func: (editorsPane, layerName) => {
                const $m = fluid.metadataSymbol;
                // TODO: ILCSS syntax for locating things
                const children = Object.values(editorsPane.editorHolders[$m].childComponents);
                const found = children.find(childShadow => childShadow.that.layerRec.value.layerName === layerName);
                return found && found.shadowMap[$m].proxy;
            },
            args: ["{editorsPane}", "{0}:layerName"]
        }
    },
    goToLayerRef: {
        $method: {
            func: (self, layerRef) => {
                // TODO: At some point deal with the fact that one editor might handle more than one layer - in the case
                // it is a multiplexed SFC - do we really want to support that?
                const holder = self.editorHolderForLayer(layerRef.context);
                holder.goToRef(layerRef);
            }
        },
        args: ["{self}", "{0}:layerRef"]
    },
    focusLayerEditor: {
        $method: {
            func: (self, layerName) => {
                self.selectedLayerTab = layerName;
                const holder = self.editorHolderForLayer(layerName);
                holder.editor.instance.focus();
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
    $variety: "frameworkAux"
});

fluid.shadowHasUserLayer = function (shadow) {
    return fluid.deSignal(shadow.that.$layers).some(layer => fluid.isUserLayer(layer));
};

/**
 * Calculates the clipped bounds of a target element by traversing all its ancestors
 * up to the document root and ensuring the bounds lie within each ancestor's bounds.
 * Only the top, left, width, and height properties are returned.
 *
 * @param {HTMLElement} target - The target element whose bounds are to be clipped.
 * @return {Object} The clipped bounds containing top, left, width, and height.
 */
fluid.getClippedBounds = function (target) {
    let { top, left, right, bottom } = target.getBoundingClientRect();
    let current = target.parentNode;

    while (current && current !== document) {
        if (current instanceof HTMLElement) {
            const parentRect = current.getBoundingClientRect();
            top = Math.max(top, parentRect.top);
            left = Math.max(left, parentRect.left);
            right = Math.min(right, parentRect.right);
            bottom = Math.min(bottom, parentRect.bottom);
        }
        current = current.parentNode;
    }
    return {top, left,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
    };
};

fluid.applyOverlay = function (overlays, target, colour) {
    if (target && !fluid.isUnavailable(target)) {
        const bounds = fluid.getClippedBounds(target);

        const targetInBody = target.closest("body");
        const overlay = targetInBody ? overlays.overlay : overlays.selfOverlay;

        let relLeft = 0;
        if (!targetInBody) {
            const relative = document.querySelector(".fl-editor-root");
            const relBounds = relative.getBoundingClientRect();
            relLeft = relBounds.left + 2; // Somehow we are off by a little ....
        }

        overlay.style.top = `${bounds.top + window.scrollY}px`;
        overlay.style.left = `${bounds.left + window.scrollX - relLeft}px`;
        overlay.style.width = `${bounds.width}px`;
        overlay.style.height = `${bounds.height}px`;

        // Set the overlay's background color and border
        overlay.style.backgroundColor = colour;
        overlay.style.border = `1px solid ${fluid.darkenColour(colour)}`;
        overlay.style.display = "block";
    } else {
        Object.values(overlays).map(overlay => overlay.style.display = "none");
    }
}

fluid.animateInspectOverlay = function (self, inspectingSite, layerColours) {
    // We need two overlays, one for the app, and another lying outside <body> for self-inspection of the IDE
    const overlays = {
        overlay: document.getElementById("fl-inspect-overlay"),
        selfOverlay: document.getElementById("fl-self-inspect-overlay")
    };
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

// Hack this using pseudo-globals for now - in time we perhaps want some kind of auto-mount using live query?
fluid.activeLayerLink = null;

fluid.editorRoot.mouseOver = function (editorRoot) {
    const layerElem = event.target.closest(".fl-layer-link");
    if (layerElem) {
        fluid.activeLayerLink = layerElem;
        layerElem.addEventListener("click", () => {
            console.log("Layer element clicked");
        });
        layerElem.classList.add("active");
    }
};

fluid.editorRoot.mouseOut = function (editorRoot) {
    const layerElem = event.target.closest(".fl-layer-link");
    if (layerElem && fluid.activeLayerLink) {
        fluid.activeLayerLink.classList.remove("active");
        fluid.activeLayerLink = null;
    }
};

fluid.editorRoot.click = function (editorRoot) {
    const layerElem = event.target.closest(".fl-layer-link");
    if (layerElem) {
        const layerName = layerElem.getAttribute("data-fl-layer-name");
        const layerRef = layerElem.getAttribute("data-fl-layer-element");
        const parsedLayerRef = layerRef && fluid.parseContextReference(layerRef);

        const openLayer = layerName || parsedLayerRef.context;
        editorRoot.openLayerTab(openLayer);
        if (parsedLayerRef) {
            editorRoot.goToLayerRef(parsedLayerRef);
        }
    }
};

document.addEventListener("keydown", function (evt) {
    evt.stopImmediatePropagation();
    if (evt.key === "z" && (evt.ctrlKey || evt.metaKey)) {
        console.log("Undo");
        fluid.historyBack();
    } else if (evt.key === "y" && (evt.ctrlKey || evt.metaKey)) {
        fluid.historyForward();
    }
});

</script>

<script src="@{editUrlBase}/js/layerColourManager.js"></script>

<template>
    <div class="fl-editor-root fl-docking-area-component" data-fl-key="editorRoot" style="width: 600px">
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
}

.fl-layer-browser {
    display: flex;
    flex-direction: column;
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

#fl-editor-inspect-overlay {
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

#svg-defs {
   height: 0;
}

</style>
