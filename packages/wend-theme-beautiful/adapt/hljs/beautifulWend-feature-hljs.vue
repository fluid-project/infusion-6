<script>
// highlight.js - replaces the {{ if .Site.Params.useHLJS }} blocks of Hugo's head.html and footer.html
fluid.def("beautifulWend.feature.hljs", {
    $layers: "fluid.component",
    hljsLinkage: {
        $linkage: {
            inputLayers: ["beautifulWend.document"],
            outputLayers: ["beautifulWend.document.hljs"]
        }
    }
});
</script>
