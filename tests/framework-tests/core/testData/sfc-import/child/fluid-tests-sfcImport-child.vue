<script src="../shared-lib.js"></script>
<script>
// The shared script, injected for the parent, has executed before this one
fluid.def("fluid.tests.sfcImport.child", {
    text: "Child text " + fluid.tests.sfcImport.sharedValue
});
</script>
<template><span class="sfc-import-child">@{text}</span></template>
<style src="child.css"></style>
