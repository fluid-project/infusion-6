<script>
fluid.def("fluid.codemirror", {
    // User configurable options here:
    mode: "$compute:unavailable(Codemirror mode has not been configured)",
    codemirrorOptions: {
        lineNumbers: true,
        matchBrackets: true,
        lineWrapping: true
    },
    text: "",
    elideParent: false,
    template: "<textarea>@{text}</textarea>",
    instance: "$eagerCompute:fluid.codemirror.construct({self}, {self}.renderedContainer, {$oldValue})",
    refreshOnActive: {
        $effect: {
            func: instance => instance.refresh(),
            args: ["{self}.instance", "{viewEditor}.isActive"]
        }
    }
});

fluid.codemirror.construct = function (self, container, oldInstance) {
    // Ensure we just construct exactly one component on our first render, regardless of whether we re-render
    if (oldInstance) {
        return oldInstance
    } else {
        const options = {...self.codemirrorOptions, mode: self.mode};
        const instance = CodeMirror.fromTextArea(container, options);
        fluid.disableRendering(self);
        return instance;
    }
};
</script>

<script src="@{libUrlBase}/codemirror/js/codemirror.js"></script>
<script src="@{libUrlBase}/codemirror/js/css.js"></script>
<script src="@{libUrlBase}/codemirror/js/javascript.js"></script>
<script src="@{libUrlBase}/codemirror/js/markdown.js"></script>
<script src="@{libUrlBase}/codemirror/js/xml.js"></script>
<script src="@{libUrlBase}/codemirror/js/vue.js"></script>

<style src="@{libUrlBase}/codemirror/css/codemirror.css"></style>

<style>
.CodeMirror {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    font-size: 12px;
    height: 100%;
}
</style>
