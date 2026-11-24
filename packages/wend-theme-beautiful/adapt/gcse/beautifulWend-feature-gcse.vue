<script>
// Google Custom Search - replaces the three {{ if .Site.Params.gcse }} blocks of Hugo's nav.html (search entry, search
// modal) and footer.html (loader script). Instantiated by beautifulWend.site only while the `gcse` parameter is set; while it
// exists, its linkage broadcasts the adaptation layers below onto the theme's layers, none of which mention search.
fluid.def("beautifulWend.feature.gcse", {
    $layers: "fluid.component",
    gcseLinkage: {
        $linkage: [{
            inputLayers: ["beautifulWend.navbar"],
            outputLayers: ["beautifulWend.navbar.gcse"]
        }, {
            inputLayers: ["beautifulWend.document"],
            outputLayers: ["beautifulWend.document.gcse"]
        }]
    }
});
</script>
