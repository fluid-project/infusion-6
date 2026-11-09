<fluid-import src="fluid-tests-rt-item.vue"></fluid-import>
<script src="../../lib/shared.js"></script>
<script>
"use strict";

fluid.def("fluid.tests.rt.list", {
    items: {
        $component: {
            $layers: "fluid.tests.rt.item",
            $for: {
                source: "{list}.records",
                valueAs: "record",
                keyAs: "index"
            }
        }
    }
});
</script>
<template>
    <ul class="rt-list" @id="items"></ul>
</template>
