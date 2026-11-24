<script>
// Rendered page content - Hugo's {{ .Content }} and {{ .Summary }}, which are HTML produced by the content pipeline
// (see packages/wend/js/siteModel.js).
//
// A templateViewComponent whose `template` is the content would *parse it as a template*, so that any "@{...}" in the
// content - of which content/docs/fluid-view.md has 25, in its code samples - would be taken as a live binding. The
// `verbatim` view option reconciles the markup into the DOM but never scans it for bindings, and renders any element
// within it bearing fluid-layers - a shortcode - as a component island.
fluid.def("wend.content", {
    html: "",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            verbatim: true,
            template: "{$parent}.html"
        }
    }
});
</script>
