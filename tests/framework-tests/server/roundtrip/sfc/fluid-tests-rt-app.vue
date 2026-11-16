<fluid-import src="parts/fluid-tests-rt-list.vue"></fluid-import>
<fluid-import src="parts/fluid-tests-rt-panel.vue"></fluid-import>
<script src="../lib/shared.js"></script>
<script>
"use strict";

// The root of the round trip fixture - it fetches its records from `recordsUrl`, which is by default its placeholder,
// declared below, so that the layer renders as it is in a test fixture. A page which is a runnable application
// overrides it with the URL of its real data - see FLUID-7032
fluid.def("fluid.tests.rt.app", {
    title: fluid.tests.rt.title,
    recordsUrl: "placeholder://fluid.tests.rt.app/records",
    recordsReader: {
        $component: {
            $layers: ["fluid.jsonReader", "fluid.withPlaceholder"],
            url: "{app}.recordsUrl"
        }
    },
    records: "{self}.recordsReader.data",
    // A rendering from a placeholder shows itself as such
    sourceClass: "$compute:fluid.tests.rt.app.sourceClass({self}.records, {self}.recordsReader.isPlaceholder)",
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

fluid.tests.rt.app.sourceClass = (records, isPlaceholder) => isPlaceholder ? "rt-placeholder" : "rt-real";
</script>
<template>
    <div class="rt-app @{sourceClass}">
        <h1><svg width="12" height="12"><use href="#rt-star"/></svg>@{title}</h1>
        <div class="rt-panel-slot" @id="panel"></div>
        <ul class="rt-list-slot" @id="list"></ul>
    </div>
</template>
<symbols>
    <symbol id="rt-star" viewBox="0 0 16 16"><path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z"/></symbol>
</symbols>
<placeholder name="records" type="application/json">
    [{"name": "Placeholder"}]
</placeholder>
