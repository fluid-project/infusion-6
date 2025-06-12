<script>
fluid.def("fluid.demos.fullPost", {
    navbar: {
        $component: {
            $layers: "fluid.demos.navbar"
        }
    },
    header: {
        $component: {
            $layers: "fluid.demos.header"
        }
    },
    post: {
        $component: {
            $layers: ["fluid.demos.post", "{substratePost}.postLayer"]
        }
    }
})
</script>
<template>
    <div @id="navbar"></div>
    <div @id="header"></div>
    <div @id="post"></div>
</template>
