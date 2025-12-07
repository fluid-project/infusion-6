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
            $layers: ["fluid.demos.post", "{fullPost}.postLayer"]
        }
    },
    footer: {
        $component: {
            $layers: ["fluid.demos.footer"]
        }
    }
})
</script>
<template>
    <div class="fl-fullpost">
        <div @id="navbar"></div>
        <div @id="header"></div>
        <div @id="post"></div>
        <div @id="footer"></div>
    </div>
</template>
