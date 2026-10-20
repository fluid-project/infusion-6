<script>

fluid.def("fluid.UISelect", {
    $layers: "fluid.component",
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
    view: {
        $component: {
            $layers: "fluid.UISelectViewComponent"
        }
    }
});

// The view of a fluid.UISelect, which renders its options from its parent's configuration
fluid.def("fluid.UISelectViewComponent", {
    $layers: "fluid.viewComponent",
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
            args: ["{$parent}.selection", "{$parent}.optionValues", "{$parent}.optionNames"]
        }
    }
});

</script>
