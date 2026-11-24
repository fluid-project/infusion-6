<script>
// Staticman comments - replaces the {{ if .Site.Params.staticman }} blocks of Hugo's head.html, footer.html and
// post_meta.html
fluid.def("beautifulWend.feature.staticman", {
    $layers: "fluid.component",
    staticmanLinkage: {
        $linkage: [{
            inputLayers: ["beautifulWend.document"],
            outputLayers: ["beautifulWend.document.staticman"]
        }, {
            inputLayers: ["beautifulWend.postMeta"],
            outputLayers: ["beautifulWend.postMeta.staticman"]
        }]
    }
});
</script>
