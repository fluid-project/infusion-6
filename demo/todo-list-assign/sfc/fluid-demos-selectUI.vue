<script>

fluid.def("fluid.demos.selectUI", {
    $layers: "fluid.viewComponent",
    updateSelection: {
        $method: {
            func: (self, e) => {
                self.selection = e.target.value
            },
            args: ["{self}", "{0}:event"]
        }
    }
});

</script>
