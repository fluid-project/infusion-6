<script>
// Self-hosted assets - replaces the {{ if .Site.Params.selfHosted }} ... {{ else }} ... blocks of Hugo's head.html and
// footer.html, which choose between local and CDN copies of KaTeX and Font Awesome
fluid.def("beautifulWend.feature.selfHosted", {
    $layers: "fluid.component",
    selfHostedLinkage: {
        $linkage: {
            inputLayers: ["beautifulWend.document"],
            outputLayers: ["beautifulWend.document.selfHosted"]
        }
    }
});
</script>
