<script>
fluid.def("fluid.fluidEditor", {
    $layers: "fluid.templateViewComponent"

});
</script>

<template>
    <div class="fl-editor" data-fl-key="fluidEditor">
        <link rel="stylesheet" href="https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css">
        <div class="fl-menubar">
            <div class="fl-menu-items"></div>
            <div class="fl-editor-close" @onclick="{fluidEdit}.toggleEditorVisible()">
                <span class="mdi mdi-close"></span>
            </div>

        </div>
        <div class="fl-editor-layout">
            <div class="fl-layer-browser">
            </div>
        </div>
    </div>
</template>

<style>
.fl-menubar {
    border-bottom: 1px solid rgba(100, 100, 100, 0.1);
    display: flex;
    justify-content: space-between;
    flex: 0 0 auto;
}
</style>
