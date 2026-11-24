<script>
// A disclaimer above the footer credits - replaces the {{ if .Site.Params.disclaimerText }} block of Hugo's
// footer.html
fluid.def("beautifulWend.feature.disclaimer", {
    $layers: "fluid.component",
    disclaimerLinkage: {
        $linkage: {
            inputLayers: ["beautifulWend.footer"],
            outputLayers: ["beautifulWend.footer.disclaimer"]
        }
    }
});
</script>
