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
    newLayer: (rec, layerName) => rec.newStore[layerName]._value,
    deleteLayer: (rec, layerName) => rec.oldStore[layerName]._value
};

fluid.def("fluid.editor.historyList", {
    $layers: "fluid.component",
    records: {
        $compute: {
            func: "fluid.editor.historyList.fromStore",
            args: [fluid.layerHistory, fluid.layerHistoryIndex, "{editorRoot}.showUserLayersOnly", "{colourManager}.layerColours"]
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div @id="history" class="fl-history-pane"></div>`
        }
    },
    history: {
        $component: {
            $layers: "fluid.component",
            layerName: "{self}.historyRec.layerName",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `
<div class="fl-history-rec" @class="current:@{historyRec.current}" style="background-color: @{historyRec.colour}" title="@{layerName}">
    <div class="fl-history-layer">@{layerName}</div>
    <div class="fl-history-type">@{historyRec.type}</div>
</div>`
                }
            },
            $for: {
                source: "{historyList}.records",
                valueAs: "historyRec"
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

    // Hack for now: layerColourManager will not allocate a colour for a layer which is never actually demanded by any impl
    // const filteredRecords = records.filter(record => record.colour);

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
