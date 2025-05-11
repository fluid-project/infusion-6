<script>
fluid.def("fluid.editor.menu", {
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
            args: ["{self}", "{fluid.globalDismissal}.clicked"]
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

fluid.def("fluid.editor.menu.filterLayers", {
    layers: "fluid.templateViewComponent",
    value: "{layerList}.frameworkOnly",
    template: `<div class="fl-menu-body-inner"><input type="checkbox" checked="@{value}" @onchange="{self}.updateChecked({0})"/>Filter framework layers</div>`,
    $variety: "frameworkAux",
    updateChecked: {
        $method: {
            func: (layerList, e) => {
                layerList.frameworkOnly = e.target.checked
            },
            args: ["{layerList}", "{0}:e"]
        }
    }
});

fluid.editor.menu.mouseOver = function (menu, itemName) {
    if (itemName && menu.menuOpen && itemName !== menu.menuOpen) {
        menu.menuOpen = itemName;
    }
};

</script>

<template>
    <div class="fl-menubar">
        <div class="fl-menu-items" @id="menuItems"></div>
        <div class="fl-editor-close fl-clickable" @onclick="{fullPageEditor}.editorVisible = false">
            <span class="mdi mdi-close"></span>
        </div>
    </div>
</template>

<style>

.fl-editor-close {
    font-size: 20px;
    border-radius: 10px;
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
