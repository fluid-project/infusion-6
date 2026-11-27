<script>
// Adds KaTeX's stylesheet and scripts, which render the maths written in content, e.g. \\( O(n^2) \\), once each page has
// loaded. Their URLs are beautifulWend.document's `katexAssets`, which beautifulWend.document.selfHosted overrides, so
// that self-hosting adds no asset of KaTeX's to a site which doesn't use it
fluid.def("beautifulWend.document.katex", {
    stylesheets: {
        katex: {priority: 990, href: "{document}.katexAssets.css"}
    },
    footerScripts: {
        katex: {priority: 990, src: "{document}.katexAssets.js", defer: true},
        katexAutoRender: {
            priority: 980,
            src: "{document}.katexAssets.autoRender",
            defer: true,
            onload: "renderMathInElement(document.body);"
        }
    }
});
</script>
