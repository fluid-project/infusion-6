<script>
// Multilingual support - replaces the {{ if .Site.IsMultiLingual }} block of Hugo's nav.html and the
// {{ if .IsTranslated }} block of post_meta.html. The *language* of the site is not an adaptation - it selects the
// i18n layer of beautifulWend.site and binds <html lang> directly.
// Sketch only: the site model does not yet build per-language page trees or `translations`.
fluid.def("beautifulWend.feature.multilingual", {
    $layers: "fluid.component",
    multilingualLinkage: {
        $linkage: [{
            inputLayers: ["beautifulWend.navbar"],
            outputLayers: ["beautifulWend.navbar.multilingual"]
        }, {
            inputLayers: ["beautifulWend.postMeta"],
            outputLayers: ["beautifulWend.postMeta.translations"]
        }]
    }
});
</script>
