<script>
// The header of a post - the {{ if eq .Type "post" }} branches of Hugo's header.html: post metadata follows the
// title, and there is no horizontal rule.
fluid.def("beautifulWend.header.post", {
    showRule: false,
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            // Hugo places the metadata *inside* the <h1>, at its end
            relativeContainer: "last: .ponder-title"
        }
    },
    postMeta: {
        $component: {
            $layers: "beautifulWend.postMeta",
            page: "{document}.page"
        }
    }
});
</script>

<template>
    <span @id="postMeta"></span>
</template>
