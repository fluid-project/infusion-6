<script>
fluid.def("fluid.codemirror", {
    // User configurable options here:
    mode: "$compute:fluid.unavailable(Codemirror mode has not been configured)",
    codemirrorOptions: {
        lineNumbers: true,
        matchBrackets: true,
        lineWrapping: true,
        gutters: ["CodeMirror-lint-markers"],
    },
    text: "",
    // The editor's text once it has passed validation, which is asynchronous - see fluid.codemirror.construct
    validText: null,
    view: {
        $component: {
            elideParent: false,
            template: "<textarea>@{text}</textarea>"
        }
    },
    instance: {
        $bindable: {
            bind: "fluid.codemirror.construct({self}, {fluid.editor}, {self}.view.renderedContainer, {global}.CodeMirror)",
            unbind: "fluid.codemirror.destroy({boundValue})",
            // CodeMirror 5 cannot respond to changes in most of its configuration without being reconstructed, which
            // would lose its undo history, selection and scroll position - construct it exactly once in our lifetime
            onceOnly: true
        }
    },
    refreshOnActive: {
        $effect: {
            func: self => self.refresh(),
            args: ["{self}", "{fluid.editor}.isActive"]
        }
    },
    refresh: {
        $method: {
            func: instance => {
                console.log("Refreshing CodeMirror instance");
                console.log(new Error().stack);
                instance.refresh()
            },
            args: ["{self}.instance"]
        }
    },
    readEffect: {
        $effect: {
            func: "fluid.codemirror.readText",
            args: ["{self}.text", "{self}.instance"],
            // Text which we wrote ourselves is not read back, since the user may have edited further whilst it was
            // validated - any other editor, e.g. one rendering a layer redefined by our edit, still receives it
            excludeSource: "self"
        }
    },
    writeEffect: {
        $effect: {
            func: "fluid.codemirror.writeText",
            // The instance is an argument so that nothing is written before the editor is constructed
            args: ["{self}", "{fluid.editor}", "{self}.validText", "{self}.instance"],
            // Marked as originated by us, so that it is not read back by readEffect
            source: "self"
        }
    },

    $variety: "frameworkAux"
});

/**
 * Bring the editor's contents up to date with text supplied from outside
 * @param {String} text - The text to be displayed
 * @param {CodeMirror} instance - The CodeMirror instance
 */
fluid.codemirror.readText = function (text, instance) {
    if (instance.getValue() !== text) {
        fluid.codemirror.updateText(instance, text);
    }
    // CodeMirror 5 is a bit rubbish: https://stackoverflow.com/questions/8349571/codemirror-editor-is-not-loading-content-until-clicked
    fluid.invokeLater(() => instance.refresh());
};

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

fluid.codemirror.construct = function (self, holder, container, CodeMirror) {
    // The linter reports each text which passes validation, possibly after the editor has been destroyed
    const onValidText = text => {
        if (!fluid.isDestroyed(self)) {
            self.validText = text;
        }
    };
    const options = {...self.codemirrorOptions, ...holder.codemirrorOptions, mode: holder.mode, onValidText, tooltipRoot: ".fl-editor-root"};
    const textarea = container.firstElementChild;
    const instance = CodeMirror.fromTextArea(textarea, options);
    console.log("Constructing from textArea ", textarea, " ", textarea.innerText);
    // Validation is asynchronous and so the reactive source of an edit cannot be followed through it - instead, the
    // origin which CodeMirror records for each change distinguishes the user's edits, e.g. "+input", "paste" or
    // "undo", from our own via readText, which have none, or "setValue". Only text the user has edited is written back -
    // in particular not the editor's initial contents, which may be validated before readText has supplied them.
    instance.hasUserEdits = false;
    instance.on("change", (cm, change) => {
        if (change.origin !== undefined && change.origin !== "setValue") {
            instance.hasUserEdits = true;
        }
    });
    fluid.disableRendering(self);
    return instance;
};

/**
 * Write text which the user has edited, once it has passed validation, back to the editor holding this CodeMirror
 * @param {fluid.codemirror} self - The CodeMirror component
 * @param {fluid.editor} holder - The editor holding it, which may write the text back with its `writeText` method
 * @param {String|null} validText - The editor's text as last validated, or `null` if none has been
 * @param {CodeMirror} instance - The CodeMirror instance
 */
fluid.codemirror.writeText = function (self, holder, validText, instance) {
    // The current text and the holder's writer are consulted rather than depended upon
    fluid.cell.untracked(() => {
        // Text agreeing with what we are being supplied, e.g. after the user reverts an edit, has nothing to contribute
        if (validText !== null && holder.writeText && instance.hasUserEdits && validText !== self.text) {
            holder.writeText(validText);
        }
    });
};

/**
 * Release a CodeMirror instance constructed by fluid.codemirror.construct, restoring the textarea it was built from
 * @param {CodeMirror} instance - The CodeMirror instance
 */
fluid.codemirror.destroy = function (instance) {
    if (instance.getWrapperElement().parentNode) {
        instance.toTextArea();
    }
};
</script>

<!-- What if someone wants to intercede on any of these imports? -->

<script src="%infusion-6/src/lib/codemirror/js/codemirror.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/css.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/javascript.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/markdown.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/xml.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/overlay.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/htmlmixed.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/vue.js" data-fl-scope="global"></script>

<!-- The core linting implementations -->
<script src="%infusion-6/src/lib/codemirror/js/jshint.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/jsonlint.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/csslint.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/htmlhint.js" data-fl-scope="global"></script>

<!-- CodeMirror's integrations for linting modes -->
<script src="%infusion-6/src/lib/codemirror/js/forked-lint.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/javascript-lint.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/json-lint.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/lib/codemirror/js/css-lint.js" data-fl-scope="global"></script>

<script src="%fluid-edit/js/sfcLinter.js"></script>

<style src="%infusion-6/src/lib/codemirror/css/codemirror.css"></style>
<style src="%infusion-6/src/lib/codemirror/css/lint.css"></style>


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
