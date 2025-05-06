<script>
fluid.def("fluid.editor.menu", {
    $layers: "fluid.templateViewComponent",
    menuItemsData: {
        File: [{
            text: "Export ..."
        }, {
            text: "Export Read-only ..."
        }],
        Settings: []
    },
    menuItems: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $for: {
                source: "{menu}.menuItemsData",
                value: "menuRecords",
                key: "itemName"
            },
            template: `<div class="fl-menu-item fl-clickable">@{{itemName}}</div>`
        }
    }

});
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

</style>
