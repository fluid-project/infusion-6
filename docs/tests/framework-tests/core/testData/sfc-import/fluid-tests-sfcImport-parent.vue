<fluid-import src="child/fluid-tests-sfcImport-child.vue"></fluid-import>
<script src="shared-lib.js"></script>
<script src="client-lib.js" fluid-client data-fl-scope="global"></script>
<script>
fluid.def("fluid.tests.sfcImport.parent", {
    child: {
        $component: {
            $layers: "fluid.tests.sfcImport.child"
        }
    }
});
</script>
<template><div class="sfc-import-parent"><div @id="child"></div></div></template>
