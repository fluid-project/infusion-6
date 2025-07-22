<script>

fluid.def("fluid.UISelect", {
    $layers: "fluid.viewComponent",
    optionValues: {
        $reactiveRoot: []
    },
    optionNames: {
        $reactiveRoot: []
    },
    updateSelection: {
        $method: {
            func: (self, e) => {
                self.selection = e.target.value
            },
            args: ["{self}", "{0}:event"]
        }
    },
    elideParent: false,
    templateTree: {
        $compute: {
            func: (selection, optionValues, optionNames) => ({
                tag: "select",
                attrs: {
                    "@onchange": "{self}.updateSelection({0})"
                },
                children: optionValues.map((value, i) => ({
                    tag: "option",
                    attrs: {
                        value,
                        ...(selection === value && {selected: "selected"})
                    },
                    children: [{
                        text: optionNames[i] === undefined ? value : optionNames[i]
                    }]
                }))

            }),
            args: ["{self}.selection", "{self}.optionValues", "{self}.optionNames"]
        }
    }
});

</script>
