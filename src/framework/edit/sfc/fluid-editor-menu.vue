<script>
fluid.def("fluid.editor.menu", {
    menuItemsData: {
        File: [{
            text: "Export...",
            layers: []
        }, {
            text: "Export without editing...",
            layers: []
        }, {
            text: "Export packed build...",
            layers: []
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
    selfEdit: {
        $component: {
            $layers: "fluid.editor.menu.selfEdit"
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
    active: false,
    template: `
<div class="fl-magic-button" @class="fl-active:@{active}" @onclick="{self}.click()" title="Select an element on the page to open its layer in the editor">
    <svg viewBox="146 124 16 16" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
        <g fill="none">
            <path d="M146 124h16v16h-16z" opacity=".5"/>
            <path d="M152 138h-2.5c-1 0-1.5-.5-1.5-1.5v-9c0-1 .5-1.5 1.5-1.5h9c1.5 0 1.5 1.468 1.5 1.5v2.5h-1v-3h-10v10h3zm9-5l-3 2 3 3-1 1-3-3-2 3-2-8z" fill="currentcolor" shape-rendering="geometricPrecision"/>
        </g>
    </svg>
</div>`,
    inspectEffect: "$effect:fluid.inspect.effect({self}, {self}.active, {global}.document)",
    mouseMove: "$method:fluid.inspect.mouseMove({self}, {0}:event, {editorRoot})",
    click: "$method:fluid.clickMagic({inspect}, {selfEdit}, 0)",

    $variety: "frameworkAux"
});

fluid.clickMagic = function (inspectButton, selfEditButton, which) {
    const buttons = [inspectButton, selfEditButton];
    buttons[1 - which].active = false;
    buttons[which].active = !buttons[which].active;
};

fluid.registerNamespace("fluid.inspect");

fluid.inspect.mouseMove = function (self, event, editorRoot) {
    const shadow = fluid.shadowForMouseEvent(event);
    const useShadow = shadow && (!editorRoot.showUserLayersOnly || fluid.shadowHasUserLayer(shadow)) ? shadow : null;
    // Some nice tool will in future show up this distant write access
    editorRoot.inspectingSite = useShadow ? {shadow: useShadow} : null;
};

fluid.inspect.effect = function (self, inspecting, document) {
    const listener = self.mouseMove;
    if (inspecting) {
        document.addEventListener("mousemove", listener);
    } else {
        // TODO: Not bound to anything
        self.inspectTarget = null;
        document.removeEventListener("mousemove", listener);
    }
};

fluid.def("fluid.editor.menu.selfEdit", {
    $layers: "fluid.templateViewComponent",
    active: false,
    template: `
<div class="fl-magic-button" @class="fl-active:@{active}" @onclick="{self}.click()" title="Select an element on the page to edit it directly">
    <svg viewBox="0 0 24 24" width="19" height="19" xmlns="http://www.w3.org/2000/svg">
        <g fill="none">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M9 1C9 0.4 8.6 0 8 0C7.4 0 7 0.4 7 1V1.5C7 2.1 7.4 2.5 8 2.5C8.6 2.5 9 2.1 9
                1.5V1ZM3.7 2.3C3.3 1.9 2.7 1.9 2.3 2.3C1.9 2.7 1.9 3.3 2.3 3.7L3.3 4.7C3.7 5.1 4.3 5.1 4.7 4.7C5.1 4.3 5.1 3.7 4.7 3.3L3.7
                2.3ZM13.7 3.7C14.1 3.3 14.1 2.7 13.7 2.3C13.3 1.9 12.7 1.9 12.3 2.3L11.3 3.3C10.9 3.7 10.9 4.3 11.3
                4.7C11.7 5.1 12.3 5.1 12.7 4.7L13.7 3.7ZM1 7C0.4 7 0 7.4 0 8C0 8.6 0.4 9 1 9H1.5C2.1 9 2.5 8.6 2.5 8C2.5 7.4 2.1 7 1.5
                7H1ZM15 7C14.4 7 14 7.4 14 8C14 8.6 14.4 9 15 9H15.5C16.1 9 16.5 8.6 16.5 8C16.5 7.4 16.1 7 15.5
                7H15ZM4.7 12.7C5.1 12.3 5.1 11.7 4.7 11.3C4.3 10.9 3.7 10.9 3.3 11.3L2.3 12.3C1.9 12.7 1.9 13.3 2.3 13.7C2.7 14.1 3.3 14.1 3.7 13.7L4.7
                12.7ZM9 15C9 14.4 8.6 14 8 14C7.4 14 7 14.4 7 15V15.5C7 16.1 7.4 16.5 8 16.5C8.6 16.5 9 16.1 9 15.5V15ZM9.4
                5C8.6 4.2 7.4 4.2 6.6 5L5 6.6C4.2 7.4 4.2 8.6 5 9.4L7.3 11.7L18.6 23C19.4 23.8 20.6 23.8 21.4 23L23 21.4C23.8
                20.6 23.8 19.4 23 18.6L11.7 7.3L9.4 5ZM6.4 8L8 6.4L9.6 8L8 9.6L6.4 8ZM9.4 11L11 9.4L21.6 20L20 21.6L9.4 11Z" fill="currentcolor"/>
         </g>
    </svg>
</div>`,
    click: "$method:fluid.clickMagic({inspect}, {selfEdit}, 1)",
    editEffect: "$effect:fluid.selfEdit.effect({self}, {self}.active, {editorRoot})",

    $variety: "frameworkAux"
});

fluid.registerNamespace("fluid.selfEdit");

fluid.selfEdit.effect = function (self, selfEditing, editorRoot) {
    editorRoot.selfEditing = selfEditing;
};

</script>

<template>
    <div class="fl-menubar">
        <div @id="inspect"></div>
        <div @id="selfEdit"></div>
        <div class="fl-menu-items" @id="menuItems"></div>
        <div class="fl-editor-close fl-clickable" @onclick="{fullPageEditor}.editorVisible = false">
            <span class="mdi mdi-close"></span>
        </div>
    </div>
</template>

<style>

.fl-magic-button {
    color: #888;
    display: flex;
    align-items: center;
    margin-left: 4px;
}

.fl-magic-button:hover {
    color: #000;
}

.fl-magic-button.fl-active {
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
    font-size: 18px;
}

.fl-menubar .fl-editor-close {
    line-height: 1;
}


.fl-menu-items {
    display: flex;
    margin-right: auto;
    margin-left: 2px;
}

.fl-menu-item {
    margin-right: 2px;
    padding-left: 5px;
    padding-right: 5px;
}

.fl-menu-body {
    display: none;
    position: absolute;
    background: white;
    border: 1px solid #ccc;
    padding: 2px 4px;
    z-index: 1; /* So doesn't pop under CodeMirror */
}

.fl-menu-body input {
    margin: 0 4px 0 2px;
}

.fl-menu-body.active {
    display: block;
}

</style>
