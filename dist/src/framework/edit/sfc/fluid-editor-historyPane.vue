<script>
fluid.def("fluid.editor.historyPane", {
    historyList: {
        $component: {
            $layers: "fluid.editor.historyList"
        }
    },
    $variety: "frameworkAux"
});

fluid.def("fluid.editor.historyList", {
    $layers: "fluid.component",
    records: {
        $compute: {
            func: "fluid.editor.historyList.fromMixedHistory",
            args: [fluid.history.mixed, "{colourManager}.layerColours"]
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
<div class="fl-history-rec" @class="current:@{historyRec.current}, start:@{historyRec.start}" style="background-color: @{historyRec.colour}" title="@{layerName}">
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

/**
 * Render the mixed history of live writes and layer redefinitions as the records shown by the history pane, in the order
 * in which they were made. A step of the live history, which may hold several writes if bursts of writes are coalesced,
 * is shown by the site of its first write. The most recently made record which is currently applied is marked current.
 * If no record is applied, since history has been moved back to its very start, the first record is marked start.
 * @param {MixedHistoryEntry[]} mixedHistory - The mixed history, as held by `fluid.history.mixed`
 * @param {Object<String, String>} layerColours - The colour allocated to each layer, with `$live` for live writes
 * @return {Object[]} A record to be shown for each entry, holding its `layerName`, `type`, `colour` and whether it is
 * `current` or at the `start`
 */
fluid.editor.historyList.fromMixedHistory = function (mixedHistory, layerColours) {
    const records = mixedHistory.map(({record}) => {
        const isLive = record.type === "group";
        const layerName = isLive ? record.records[0]?.site ?? record.key : record.layerName;
        return {
            layerName,
            type: isLive || record.newSource ? "updateLayer" : "deleteLayer",
            // Similar logic in EditorRoot.resolveLayerDef
            colour: isLive ? layerColours.$live : layerColours[layerName]
        };
    });
    const current = mixedHistory.reduce((latest, entry, i) => entry.applied ? i : latest, -1);
    if (current !== -1) {
        records[current].current = true;
    } else if (records.length > 0) {
        records[0].start = true;
    }
    return records;
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
    /* A single column as wide as the pane or its widest record, so that each record's colour extends across the
       whole of the pane's scrollable area */
    display: grid;
    grid-template-columns: auto;
    align-content: start;
    border: 1px solid #ccc;
    overflow-y: scroll;
    cursor: default;
    min-height: 50%;
}

.fl-history-rec {
    position: relative;
    margin-left: 20px;
    /* Records scroll rather than wrap, so that the width of the column is that of the widest record */
    white-space: nowrap;
}

/* Leave room for the arrow preceding the first record */
.fl-history-rec:first-child {
    margin-top: 12px;
}

/* The arrow marks the position in history, following the record most recently applied */
.fl-history-rec.current::before, .fl-history-rec.start::before {
    content: "\25B6"; /* Unicode character for ▶ */
    position: absolute;
    left: -20px;
    bottom: -15px;
    font-size: 26px;
    color: #444;
}

/* or preceding the first record if none is applied */
.fl-history-rec.start::before {
    bottom: auto;
    top: -15px;
}

</style>
