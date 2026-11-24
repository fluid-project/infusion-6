<script>
// Hugo's index.html, plus the {{ if .IsHome }} branches of header.html. Adaptation layers are listed after the base
// layer they adapt, since a later entry in $layers beats an earlier one.
fluid.def("beautifulWend.kind.home", {
    header: {
        $component: {
            $layers: ["beautifulWend.header", "beautifulWend.header.home"]
        }
    },
    main: {
        $component: {
            $layers: "beautifulWend.main.home"
        }
    }
});
</script>
