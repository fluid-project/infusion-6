<script>
// Adds KaTeX's stylesheet, with which maths is shown - typeset as its markdown is rendered, by the build and by the
// editing client alike, e.g. \\( O(n^2) \\) - see `maths` in wend's js/markdown.js. Its URL is beautifulWend.document's
// `katexAssets`, which beautifulWend.document.selfHosted overrides, so that self-hosting adds no asset of KaTeX's to a
// site which doesn't use it
fluid.def("beautifulWend.document.katex", {
    stylesheets: {
        katex: {priority: 990, href: "{document}.katexAssets.css"}
    }
});
</script>
