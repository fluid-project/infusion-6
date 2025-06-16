<script>
fluid.def("fluid.demos.blogApp", {
    post: {
        $component: {
            $layers: "fluid.demos.fullPost",
            postLayer: "{postLayer}",
            $for: {
                source: "{blogApp}.postData",
                value: "postLayer"
            }
        }
    },
    postData: {
        $reactiveRoot: [
            "fluid.demos.substratePost",
            "fluid.demos.divergencePost"
        ]
    }
})
</script>
<template>
    <div class="fl-multipost">
        <div @id="post" class="fl-post-outer"></div>
    </div>
</template>
