<script>
fluid.def("fluid.editor.layerList", {
    layerList: {
        $compute: {
            funcName: "fluid.editor.layerList.fromStore",
            args: [fluid.layerStore, "{self}.frameworkOnly", "{colourManager}"]
        }
    },
    frameworkOnly: true,
    template: `<div @id="layers" class="fl-layerlist"></div>`,
    layers: {
        $component: {
            $layers: "fluid.templateViewComponent",
            layerName: "{layerRec}.layerName",
            template: `<div class="fl-layerlist-layer fl-clickable fl-for-layer" @ondblclick="{fluid.editorRoot}.openLayerTab({self}.layerName)"
                style="background-color: @{{layerRec}.colour}">@{layerName}</div>`,
            $for: {
                source: "{layerList}.layerList",
                value: "layerRec"
            }
        }
    },
    $variety: "frameworkAux"
});

fluid.editor.layerList.frameworkStatus = layerRec => {
    const variety = layerRec.layerDef.$variety;
    return !variety ? 0 :
        variety === "frameworkAux" ? 1 :
            variety === "framework" ? 2 : -1
};

fluid.editor.layerList.fromStore = function (store, frameworkOnly, colourManager) {
    const layers = Object.entries(store).map( ([layerName, recSignal]) => {
        const rec = recSignal.value;
        if (fluid.isUnavailable(rec)) {
            return {
                layerName,
                layerDef: rec,
                colour: colourManager.errorColour
            }
        } else {
            const layerDef = rec.raw;
            return {
                layerName,
                layerDef,
                colour: colourManager.allocateColour(layerName, layerDef),
                sfcDef: fluid.readSFC(layerName).textSignal
            };
        }
    });

    const fs = fluid.editor.layerList.frameworkStatus;

    const filteredLayers = layers.filter(layer => frameworkOnly ? fs(layer) === 0 : true);

    filteredLayers.sort((a, b) => {
        return fs(a) - fs(b);
    });

    return filteredLayers;
};

</script>

<style>
.fl-layerlist {
    border: 1px solid #cccccc;
    margin: 0 0.55em;
    display: flex;
    flex-direction: column;
}

.fl-layerlist-layer {
    white-space: nowrap;
    overflow: hidden !important;
    text-overflow: ellipsis;
    padding: 0px 4px;
}


</style>
