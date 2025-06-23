<script>
fluid.def("fluid.editor.menu", {
    elideParent: false,
    menuItemsData: {
        File: [{
            text: "Export..."
        }, {
            text: "Export without editing..."
        }, {
            text: "Export packed build..."
        }],
        Settings: [{
            text: "Filter framework layers",
            layers: "fluid.editor.menu.filterLayers"
        }]
    },
    menuOpen: null,
    itemChosen: {
        $method: {
            func: (self, menuRecord) => {
                self.menuOpen = null;
                console.log("Record ", menuRecord, "clicked");
            },
            args: ["{self}", "{0}:menuRecord"]
        }
    },
    clickDismiss: {
        $effect: {
            func: self => self.menuOpen = null,
            args: ["{self}", fluid.globalDismissalSignal]
        }
    },
    inspect: {
        $component: {
            $layers: "fluid.editor.menu.inspect"
        }
    },
    menuItems: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $for: {
                source: "{menu}.menuItemsData",
                value: "menuRecords",
                key: "itemName"
            },
            isOpen: {
                $compute: {
                    func: (itemName, menuOpen) => itemName === menuOpen,
                    args: ["{itemName}", "{menu}.menuOpen"]
                }
            },
            elideParent: false,
            template: `
            <div class="fl-menu-item-holder">
                <div class="fl-menu-item fl-clickable fl-no-dismiss"
                    @onclick="{menu}.menuOpen = {itemName}"
                    @onmouseover="fluid.editor.menu.mouseOver({menu}, {itemName})">@{{itemName}}
                </div>
                <div class="fl-menu-body fl-no-dismiss" @class="active:@{{self}.isOpen}">
                    <div class="fl-menu-body-item" @id="menuBodyItems"></div>
                </div>
            </div>`,
            menuBodyItems: {
                $component: {
                    $layers: ["fluid.templateViewComponent", "{menuRecord}.layers"],
                    $for: {
                        source: "{menuRecords}",
                        value: "menuRecord"

                    },
                    elideParent: false,
                    template: `<div class="fl-menu-body-inner fl-clickable" @onclick="{menu}.itemChosen({menuRecord})">@{{menuRecord}.text}</div>`
                }
            }
        }
    },
    $variety: "frameworkAux"
});

fluid.editor.menu.mouseOver = function (menu, itemName) {
    if (itemName && menu.menuOpen && itemName !== menu.menuOpen) {
        menu.menuOpen = itemName;
    }
};

fluid.def("fluid.editor.menu.filterLayers", {
    $layers: "fluid.templateViewComponent",
    value: "{editorRoot}.showUserLayersOnly",
    template: `<div class="fl-menu-body-inner"><input type="checkbox" checked="@{value}" @onchange="{self}.updateChecked({0})"/>Filter framework layers</div>`,
    $variety: "frameworkAux",
    updateChecked: {
        $method: {
            func: (editorRoot, e) => {
                // TODO: Follow fish upstream
                editorRoot.showUserLayersOnly = e.target.checked
            },
            args: ["{editorRoot}", "{0}:event"]
        }
    }
});

fluid.def("fluid.editor.menu.inspect", {
    $layers: "fluid.templateViewComponent",
    inspecting: false,
    elideParent: false,
    template: `

<div class="fl-inspect" @class="fl-inspecting:@{inspecting}" @onclick="{self}.inspecting = !{self}.inspecting" title="Select an element on the page to inspect it">
    <svg viewBox="146 124 16 16" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
        <g fill="none">
            <path d="M146 124h16v16h-16z" opacity=".5"/>
            <path d="M152 138h-2.5c-1 0-1.5-.5-1.5-1.5v-9c0-1 .5-1.5 1.5-1.5h9c1.5 0 1.5 1.468 1.5 1.5v2.5h-1v-3h-10v10h3zm9-5l-3 2 3 3-1 1-3-3-2 3-2-8z" fill="currentcolor" shape-rendering="geometricPrecision"/>
        </g>
</div>`,
    inspectEffect: "$effect:fluid.inspect.effect({self}, {self}.inspecting)",
    mouseMove: "$method:fluid.inspect.mouseMove({self}, {0}:event, {editorRoot})",

    $variety: "frameworkAux"
});

fluid.registerNamespace("fluid.inspect");

fluid.inspect.mouseMove = function (self, event, editorRoot) {
    const shadow = fluid.findViewComponentContainer(event);
    const useShadow = shadow && (!editorRoot.showUserLayersOnly || fluid.shadowHasUserLayer(shadow)) ? shadow : null;
    editorRoot.inspectingSite = useShadow ? {shadow: useShadow} : null;
};

fluid.inspect.effect = function (self, inspecting) {
    const listener = self.mouseMove;
    if (inspecting) {
        document.addEventListener("mousemove", listener);
    } else {
        self.inspectTarget = null;
        document.removeEventListener("mousemove", listener);
    }
};

</script>

<template>
    <div class="fl-menubar">
        <div @id="inspect"></div>
        <div class="fl-menu-items"><div @id="menuItems"></div></div>
        <div class="fl-editor-close fl-clickable" @onclick="{fullPageEditor}.editorVisible = false">
            <span class="mdi mdi-close"></span>
        </div>
    </div>
</template>

<style>

.fl-inspect {
    color: #888;
    display: flex;
    align-items: center;
    margin-left: 4px;
}

.fl-inspect:hover {
    color: #000;
}

.fl-inspect.fl-inspecting {
    color: #1a73e8
}

.fl-editor-close {
    font-size: 20px;
    border-radius: 10px;
    display: flex;
    align-items: center;
}

.fl-menubar {
    border-bottom: 1px solid rgba(100, 100, 100, 0.1);
    display: flex;
    justify-content: space-between;
    flex: 0 0 auto;
}

.fl-menubar {
    font-size: 18px;
}

.fl-menu-items {
    display: flex;
    margin-right: auto;
}

.fl-menu-item {
    margin-right: 0.5em;
    padding-left: 5px;
    padding-right: 5px;
}

.fl-menu-body {
    display: none;
    position: absolute;
    background: white;
    border: 1px solid #ccc;
    padding: 2px 4px;
}

.fl-menu-body input {
    margin: 0 4px 0 2px;
}

.fl-menu-body.active {
    display: block;
}

</style>
