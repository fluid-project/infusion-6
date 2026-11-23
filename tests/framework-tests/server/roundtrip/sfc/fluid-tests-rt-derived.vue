<fluid-import src="fluid-tests-rt-app.vue"></fluid-import>
<script>
"use strict";

// A Single File Component with no template of its own, deriving from the root of the round trip fixture, whose file
// only it imports - so that a page importing just this one renders through the template of a layer which only this
// file declares. In a hydrated page this layer is defined by the scripts in the markup, and its file must be loaded
// nonetheless, since the template it renders through is otherwise never found
fluid.def("fluid.tests.rt.derived", {
    $layers: "fluid.tests.rt.app"
});
</script>
