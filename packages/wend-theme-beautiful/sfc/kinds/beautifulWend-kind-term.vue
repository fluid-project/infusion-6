<script>
// Hugo's _default/list.html for a single taxonomy term such as /tags/reactivity/, whose heading is prefixed with "#"
// - the {{ if .Data.Singular }}#{{ end }} of header.html
fluid.def("beautifulWend.kind.term", {
    header: {
        $component: {
            $layers: "beautifulWend.header",
            title: "$compute:beautifulWend.kind.term.title({document}.page.title)"
        }
    },
    main: {
        $component: {
            $layers: "beautifulWend.main.list"
        }
    }
});

/**
 * Prefix a taxonomy term's title with a hash
 * @param {String} title - The term's title
 * @return {String} The title as rendered in the header
 */
beautifulWend.kind.term.title = function (title) {
    return "#" + title;
};
</script>
