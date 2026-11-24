<script>
// Overrides the CDN URLs of the document's assets with local ones. Purely data: the keyed asset records merge member by
// member, so only `href`/`src` are replaced and each asset keeps its place in the order.
// Relies on a linkage's output layers being stronger than the layers that matched its input.
fluid.def("beautifulWend.document.selfHosted", {
    stylesheets: {
        katex: {href: "/css/katex.min.css"},
        fontawesome: {href: "/fontawesome/css/all.min.css"},
        bootstrap: {href: "/css/bootstrap.min.css"}
    },
    footerScripts: {
        katex: {src: "/js/katex.min.js"},
        katexAutoRender: {src: "/js/auto-render.min.js"}
    }
});
</script>
