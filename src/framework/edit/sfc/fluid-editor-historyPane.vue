<script>
fluid.def("fluid.editor.historyPane", {
    historyList: {
        $component: {
            $layers: "fluid.editor.historyList"
        }
    },
    $variety: "frameworkAux"
});

fluid.layerFromHistoryRec = {
    updateLayer: (rec) => rec.newValue,
    newLayer: (rec, layerName) => rec.newStore[layerName].peek(),
    deleteLayer: (rec, layerName) => rec.oldStore[layerName].peek()
};

fluid.def("fluid.editor.historyList", {
    $layers: "fluid.templateViewComponent",
    records: {
        $compute: {
            func: "fluid.editor.historyList.fromStore",
            args: [fluid.layerHistory, fluid.layerHistoryIndex, "{editorRoot}.showUserLayersOnly", "{colourManager}.layerColours"]
        }
    },
    template: `<div @id="history" class="fl-history-pane"></div>`,
    history: {
        $component: {
            $layers: "fluid.templateViewComponent",
            layerName: "{historyRec}.layerName",
            template: `
<div class="fl-history-rec" @class="current:@{{historyRec}.current}" style="background-color: @{{historyRec}.colour}" title="@{layerName}">
    <div class="fl-history-layer">@{layerName}</div>
    <div class="fl-history-type>">@{{historyRec}.type}</div>
</div>`,
            $for: {
                source: "{historyList}.records",
                value: "historyRec"
            }
        }
    },
    $variety: "frameworkAux"
});

fluid.editor.historyList.fromStore = function (layerHistory, layerHistoryIndex, userOnly, layerColours) {
    const records = fluid.map(layerHistory, rec => {
        const layerDef = rec.raw;
        const togo = {
            layerName: rec.layerName,
            layerDef: fluid.layerFromHistoryRec[rec.type](rec, rec.layerName).raw,
            type: rec.type
        };
        const isLive = togo.layerName.startsWith("{");
        // Similar logic in EditorRoot.resolveLayerDef
        togo.colour = isLive ? layerColours.$live : layerColours[togo.layerName];
        // TODO: Assume that if it is live it must be a user layer since updates currently only come from $reactiveRoot layers
        togo.frameworkStatus = isLive ? 0 : fluid.layerFrameworkStatus(togo.layerDef);
        return togo;
    });
    // A deferred layer will show up here faultily without filtering layerDef
    //    const filteredRecords = records.filter(layer => !fluid.isUnavailable(layer.layerDef) && (userOnly ? layer.frameworkStatus === 0 : true));

    // For now, history just stores user records otherwise navigation will become incoherent
    const filteredRecords = records;
    if (layerHistoryIndex > 0) { // TODO: Highlight 0th record
        filteredRecords[layerHistoryIndex - 1].current = true;
    }

    return filteredRecords;
};

</script>

<template>
    <div @id="historyList" class="fl-history-pane">
    </div>
</template>

<style>
.fl-history-pane {
    padding: 4px;
    margin: 0 4px;
    display: flex;
    flex-direction: column;
    border: 1px solid #ccc;
    overflow-y: scroll;
    cursor: default;
    min-height: 50%;
}

.fl-history-rec {
    position: relative;
    margin-left: 20px;
}

.fl-history-rec.current::before {
    content: "\25B6"; /* Unicode character for ▶ */
    position: absolute;
    left: -20px;
    bottom: -15px;
    font-size: 26px;
    color: #444;
}

</style>
