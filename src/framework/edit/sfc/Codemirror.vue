<script>
fluid.def("fluid.codemirror", {
    // User configurable options here:
    mode: "$compute:unavailable(Codemirror mode has not been configured)",
    codemirrorOptions: {
        lineNumbers: true,
        matchBrackets: true,
        lineWrapping: true,
        gutters: ["CodeMirror-lint-markers"],
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
    },
    readEffect: {
        $effect: {
            func: (text, instance) => {
                console.log("Codemirror readText update ", text);
                if (!instance.inWrite) {
                    instance.inReadUpdate = true;
                    instance.setValue(text);
                    instance.inReadUpdate = false;
                    // CodeMirror 5 is a bit rubbish: https://stackoverflow.com/questions/8349571/codemirror-editor-is-not-loading-content-until-clicked
                    fluid.invokeLater(() => instance.refresh());
                }
            },
            args: ["{self}.text", "{self}.instance"]
        }
    },

    $variety: "frameworkAux"
});

fluid.codemirror.construct = function (self, container, oldInstance) {
    // Ensure we just construct exactly one component on our first render, regardless of whether we re-render
    if (oldInstance) {
        return oldInstance;
    } else {
        const options = {...self.codemirrorOptions, mode: self.mode};
        const instance = CodeMirror.fromTextArea(container, options);
        console.log("Constructing from textArea ", container, " ", container.innerText);
        instance.on("change", () => {
            if (self.writeText && !instance.inReadUpdate) {
                self.writeText(instance.getValue());
            }
        });
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
<script src="@{libUrlBase}/codemirror/js/overlay.js"></script>
<script src="@{libUrlBase}/codemirror/js/htmlmixed.js"></script>
<script src="@{libUrlBase}/codemirror/js/vue.js"></script>

<script src="@{libUrlBase}/codemirror/js/jshint.js"></script>
<script src="@{libUrlBase}/codemirror/js/jsonlint.js"></script>
<script src="@{libUrlBase}/codemirror/js/csslint.js"></script>

<script src="@{libUrlBase}/codemirror/js/lint.js"></script>
<script src="@{libUrlBase}/codemirror/js/javascript-lint.js"></script>
<script src="@{libUrlBase}/codemirror/js/json-lint.js"></script>
<script src="@{libUrlBase}/codemirror/js/css-lint.js"></script>

<style src="@{libUrlBase}/codemirror/css/codemirror.css"></style>
<style src="@{libUrlBase}/codemirror/css/lint.css"></style>

<style>
.CodeMirror {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    font-size: 12px;
    height: 100%;
}
</style>
