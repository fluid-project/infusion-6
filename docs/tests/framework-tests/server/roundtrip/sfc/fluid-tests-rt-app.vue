<fluid-import src="parts/fluid-tests-rt-list.vue"></fluid-import>
<fluid-import src="parts/fluid-tests-rt-panel.vue"></fluid-import>
<script src="../lib/shared.js"></script>
<script>
"use strict";

// The root of the round trip fixture - it fetches its records, relative to the page, in place of which a static
// rendering fetches their placeholder, a short file of the same shape
fluid.def("fluid.tests.rt.app", {
    title: fluid.tests.rt.title,
    recordsReader: {
        $component: {
            $layers: ["fluid.jsonReader", "fluid.withPlaceholder"],
            url: "data/records.json",
            placeholderUrl: "data/placeholder/records.json"
        }
    },
    records: "{self}.recordsReader.data",
    // A rendering from placeholders shows itself as loading
    loadingClass: "$compute:fluid.tests.rt.app.loadingClass({self}.records, {self}.recordsReader.isPlaceholder)",
    list: {
        $component: {
            $layers: "fluid.tests.rt.list",
            records: "{app}.records"
        }
    },
    panel: {
        $component: {
            $layers: "fluid.tests.rt.panel",
            count: "{app}.records.length"
        }
    }
});

fluid.tests.rt.app.loadingClass = (records, isPlaceholder) => isPlaceholder ? "rt-loading" : "rt-loaded";
</script>
<template>
    <div class="rt-app @{loadingClass}">
        <h1><svg width="12" height="12"><use href="#rt-star"/></svg>@{title}</h1>
        <div class="rt-panel-slot" @id="panel"></div>
        <ul class="rt-list-slot" @id="list"></ul>
    </div>
</template>
<symbols>
    <symbol id="rt-star" viewBox="0 0 16 16"><path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z"/></symbol>
</symbols>
