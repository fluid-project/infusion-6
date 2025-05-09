<script>
fluid.def("fluid.editor.layerList", {
    layerList: {
        $compute: {
            func: store =>
                Object.entries(store).map( ([layerName, rec]) => ({
                    layerName,
                    layerDef: rec.value.raw,
                    sfcDef: fluid.readSFC(layerName).textSignal
                })),
            args: [fluid.layerStore]
        }
    },
    template: `<div @id="layers" class="fl-layerlist"></div>`,
    layers: {
        $component: {
            $layers: "fluid.templateViewComponent",
            layerName: "{layerRec}.layerName",
            template: `<div class="fl-layer fl-clickable" @ondblclick="{fluid.editorRoot}.openLayerTab({self}.layerName)">@{layerName}</div>`,
            $for: {
                source: "{layerList}.layerList",
                value: "layerRec"
            }
        }
    }
});
</script>

<style>
.fl-layerlist {
    border: 1px solid #cccccc;
    margin-left: 1em;
    display: flex;
    flex-direction: column;
}

.fl-layer {
    white-space: nowrap;
    overflow: hidden !important;
    text-overflow: ellipsis;
    padding: 0px 4px;
}


</style>
