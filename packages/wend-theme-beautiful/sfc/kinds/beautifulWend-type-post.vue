<script>
// The {{ if eq .Type "post" }} branches of Hugo's header.html, applied to a single page of content type "post"
fluid.def("beautifulWend.type.post", {
    header: {
        $component: {
            $layers: ["beautifulWend.header", "beautifulWend.header.post"]
        }
    }
});
</script>
