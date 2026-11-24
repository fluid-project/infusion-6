<script>
// Piwik/Matomo analytics - replaces the {{ if .Site.Params.piwik }} block of Hugo's footer.html
fluid.def("beautifulWend.feature.piwik", {
    $layers: "fluid.component",
    piwikLinkage: {
        $linkage: {
            inputLayers: ["beautifulWend.document"],
            outputLayers: ["beautifulWend.document.piwik"]
        }
    }
});
</script>
