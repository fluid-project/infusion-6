<script>
fluid.def("fluid.edit", {
    $layers: "fluid.viewComponent",
    $importMap: {
        "fluid.fullPageEditor": "%fluid-edit/sfc/fluid-fullPageEditor.vue"
    },
    pageEditor: {
        $component: {
            $layers: "fluid.fullPageEditor",
            html: {
                $compute: {
                    func: container => container.ownerDocument.firstElementChild,
                    args: "{fluid.edit}.container"
                }
            },
            container: {
                $compute: {
                    // We put in liveQuerySelector here, which although it was unnecessary, triggered endless
                    // reevaluation and then a batch count cycle failure
                    func: html => html.querySelector("body"),
                    args: "{pageEditor}.html"
                }
            }
        }
    },
    $variety: "frameworkAux"
});

</script>
