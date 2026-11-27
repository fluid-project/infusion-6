<script>
// Overrides the CDN URLs of the document's assets with local ones. Purely data: the keyed asset records merge member by
// member, so only `href`/`src` are replaced and each asset keeps its place in the order.
// Relies on a linkage's output layers being stronger than the layers that matched its input.
fluid.def("beautifulWend.document.selfHosted", {
    stylesheets: {
        fontawesome: {href: "/fontawesome/css/all.min.css"},
        bootstrap: {href: "/css/bootstrap.min.css"}
    },
    // Read by beautifulWend.document.katex, if KaTeX is in use
    katexAssets: {
        css: "/css/katex.min.css",
        js: "/js/katex.min.js",
        autoRender: "/js/auto-render.min.js"
    }
});
</script>
