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
    instance: "$eagerCompute:fluid.codemirror.construct({self}, {fluid.editor}, {self}.renderedContainer, {$oldValue})",
    refreshOnActive: {
        $effect: {
            func: instance => instance.refresh(),
            args: ["{self}.instance", "{fluid.editor}.isActive"]
        }
    },
    readEffect: {
        $effect: {
            func: (text, instance) => {
                console.log("Codemirror readText update ", text);
                // Appalling kludge to avoid updating on our own writes - thankfully currently there is no other source of them
                if (!instance.selfWrite) {
                    instance.inReadUpdate = true;
                    fluid.codemirror.updateText(instance, text);
                    instance.inReadUpdate = false;
                    // CodeMirror 5 is a bit rubbish: https://stackoverflow.com/questions/8349571/codemirror-editor-is-not-loading-content-until-clicked
                    fluid.invokeLater(() => instance.refresh());
                }
                instance.selfWrite = false;
            },
            args: ["{self}.text", "{self}.instance"]
        }
    },

    $variety: "frameworkAux"
});

fluid.codemirror.updateText = function (instance, text) {
    const oldText = instance.getValue();

    // Find the longest common prefix
    let start = 0;
    const minLength = Math.min(oldText.length, text.length);
    while (start < minLength && oldText[start] === text[start]) {
        start++;
    }

    // Find the longest common suffix
    let endOld = oldText.length;
    let endNew = text.length;
    while (
        endOld > start &&
        endNew > start &&
        oldText[endOld - 1] === text[endNew - 1]
        ) {
        endOld--;
        endNew--;
    }

    // If no common prefix/suffix could be found, fall back to full replace
    if (start === 0 && endOld === oldText.length && endNew === text.length) {
        instance.setValue(text);
    } else {
        const doc = instance.getDoc();
        const from = doc.posFromIndex(start);
        const to = doc.posFromIndex(endOld);
        const replacement = text.slice(start, endNew);
        doc.replaceRange(replacement, from, to);
    }
};

fluid.codemirror.construct = function (self, holder, container, oldInstance) {
    // Ensure we just construct exactly one component on our first render, regardless of whether we re-render
    if (oldInstance) {
        return oldInstance;
    } else {
        const validText = signal(fluid.unavailable("Text not validated"));
        const options = {...self.codemirrorOptions, ...holder.codemirrorOptions, mode: holder.mode, validText, tooltipRoot: ".fl-editor-root"};
        const textarea = container.firstElementChild;
        const instance = CodeMirror.fromTextArea(textarea, options);
        instance.firstValid = false; // Ignore the first validation update from initial editor contents
        console.log("Constructing from textArea ", textarea, " ", textarea.innerText);
        instance.writeEffect = fluid.effect(validText => {
            if (instance.firstValid && holder.writeText && !instance.inReadUpdate) {
                // instance.selfWrite = true;
                holder.writeText(validText);
            }
            instance.firstValid = true;
        }, [validText]);
        validText.$variety = "codeMirror-validText";
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

<!-- The core linting implementations -->
<script src="@{libUrlBase}/codemirror/js/jshint.js"></script>
<script src="@{libUrlBase}/codemirror/js/jsonlint.js"></script>
<script src="@{libUrlBase}/codemirror/js/csslint.js"></script>
<script src="@{libUrlBase}/codemirror/js/htmlhint.js"></script>

<!-- CodeMirror's integrations for linting modes -->
<script src="@{libUrlBase}/codemirror/js/forked-lint.js"></script>
<script src="@{libUrlBase}/codemirror/js/javascript-lint.js"></script>
<script src="@{libUrlBase}/codemirror/js/json-lint.js"></script>
<script src="@{libUrlBase}/codemirror/js/css-lint.js"></script>

<script src="@{editUrlBase}/js/sfcLinter.js"></script>

<style src="@{libUrlBase}/codemirror/css/codemirror.css"></style>
<style src="@{libUrlBase}/codemirror/css/lint.css"></style>

<style>
.CodeMirror {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    font-size: 12px;
    height: 100%;
}

.CodeMirror-lint-tooltip {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    transition: opacity 0s;
}

.CodeMirror-lint-marker-error {
    color: #bb0000;
}

.CodeMirror-lint-marker-warning {
    color: #ffbb00;
}

</style>
