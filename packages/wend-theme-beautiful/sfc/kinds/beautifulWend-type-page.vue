<script>
// The {{ if eq .Type "page" }} branches of Hugo's header.html, footer.html (page_meta.html) and single.html (no pager).
// The document's `pageMeta`, removed by default, is restored with a complete record, and the pager is removed from
// `main` by a contribution which adjusts the record supplied by beautifulWend.kind.page.
fluid.def("beautifulWend.type.page", {
    header: {
        $component: {
            $layers: ["beautifulWend.header", "beautifulWend.header.page"]
        }
    },
    pageMeta: {
        $component: {
            $layers: "beautifulWend.pageMeta"
        }
    },
    main: {
        $component: {
            pager: null
        }
    }
});
</script>
