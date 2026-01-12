<script>
fluid.def("fluid.editor.layerList", {
    layerList: {
        $compute: {
            func: "fluid.editor.layerList.fromStore",
            args: [fluid.layerStore, "{editorRoot}.showUserLayersOnly", "{colourManager}"]
        }
    },
    template: `<div @id="layers" class="fl-layerlist"></div>`,
    layers: {
        $component: {
            $layers: "fluid.templateViewComponent",
            layerName: "{layerRec}.layerName",
            template: `<div class="fl-layerlist-layer fl-for-layer" @ondblclick="{fluid.editorRoot}.openLayerTab({self}.layerName)"
                style="background-color: @{{layerRec}.colour}" title="@{layerName}">@{layerName}</div>`,
            $for: {
                source: "{layerList}.layerList",
                value: "layerRec"
            }
        }
    },
    newLayer: "$method:fluid.editor.layerList.newLayer({self})",
    $variety: "frameworkAux"
});

fluid.editor.layerList.newLayer = function (self) {
    alert("New layer");
};

/**
 * @typedef {Object} LayerRecord
 * @property {String} layerName - The name of the layer.
 * @property {Object} layerDef - The definition of the layer.
 * @property {String} colour - The allocated color for the layer.
 * @property {signal<String>} [sfcDef] - The signal containing the SFC definition text, if available.
 */

/**
 * @param {Object} store - The layer store containing signals for each layer.
 * @param {Boolean} userOnly - If true, filters the layers to include only user-defined layers.
 * @param {Object} colourManager - An object responsible for managing and allocating colors for layers.
 * @return {LayerRecord[]} An array of layer records.
 */
fluid.editor.layerList.fromStore = function (store, userOnly, colourManager) {
    const layers = fluid.map(Object.entries(store), ([layerName, recSignal]) => {
        const rec = recSignal.value;
        if (fluid.isUnavailable(rec) || fluid.isUnavailable(rec.raw)) {
            return recSignal.demanded ? {
                layerName,
                layerDef: rec,
                colour: colourManager.errorColour
            } : fluid.NoValue;
        } else if (!rec.demanded) {
            return fluid.NoValue;
        } else {
            const layerDef = rec.raw;
            return {
                layerName,
                layerDef,
                colour: colourManager.allocateColour(layerName, layerDef),
                editorModeLayer: "fluid.editor.sfc",
                sfcDef: fluid.readSFC(layerName).textSignal
            };
        }
    });

    const fs = layerRec => fluid.layerFrameworkStatus(layerRec.layerDef);

    const filteredLayers = layers.filter(layer => userOnly ? fs(layer) === 0 : true);

    filteredLayers.sort((a, b) => {
        return fs(a) - fs(b);
    });

    return filteredLayers;
};

</script>

<style>

.fl-layerlist {
    border: 1px solid #cccccc;
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
