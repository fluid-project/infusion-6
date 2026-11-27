<script>
// An editor of a layer's text within Infusion's editor, fluid.editor - a CodeMirror 6 editor from Infusion's one copy of
// CodeMirror 6, `fluid.codemirror6`, the bundle of fluid-lint in src/lib/fluid-lint/. Its text is linted as it is
// edited, by fluid-lint: errors - syntax, and records Infusion can't read - are marked red, and stylistic warnings,
// e.g. a String in single quotes, an empty CSS rule or an image without alt, orange. An edit of the user's is written
// back to the holding editor, by its `writeText`, once it lints free of errors.

fluid.def("fluid.codemirror", {
    // The editor's language, as its holder gives it - see fluid.codemirror.kinds
    mode: "$compute:fluid.unavailable(Codemirror mode has not been configured)",
    text: "",
    // The editor's text once it has linted free of errors, which happens a little after each edit - see
    // fluid.codemirror.construct
    validText: null,
    view: {
        $component: {
            elideParent: false,
            template: "<div class=\"fl-codemirror\"></div>"
        }
    },
    instance: {
        $bindable: {
            bind: "fluid.codemirror.construct({self}, {fluid.editor}, {self}.view.renderedContainer)",
            unbind: "fluid.codemirror.destroy({boundValue})",
            // Constructed exactly once in our lifetime, so that its undo history, selection and scroll position are kept
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
            // An editor shown after being hidden measures itself afresh
            func: instance => instance.requestMeasure(),
            args: ["{self}.instance"]
        }
    },
    readEffect: {
        $effect: {
            func: "fluid.codemirror.readText",
            args: ["{self}.text", "{self}.instance"],
            // Text which we wrote ourselves is not read back, since the user may have edited further whilst it was
            // linted - any other editor, e.g. one rendering a layer redefined by our edit, still receives it
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

// The kind of text fluid-lint lints, for each of the modes an editor's holder may give - see fluid.editor
fluid.codemirror.kinds = {
    "text/x-vue": "vue",
    "text/javascript": "js",
    "application/json": "json"
};

/**
 * Find the change turning one text into another - the span between their common prefix and suffix - so that replacing
 * a text keeps the cursor and history of what is unchanged
 * @param {String} from - The text before
 * @param {String} to - The text after
 * @return {Object} The change, `{from, to, insert}`
 */
fluid.codemirror.diff = function (from, to) {
    let start = 0;
    const minLength = Math.min(from.length, to.length);
    while (start < minLength && from[start] === to[start]) {
        start++;
    }
    let endFrom = from.length, endTo = to.length;
    while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) {
        endFrom--;
        endTo--;
    }
    return {from: start, to: endFrom, insert: to.slice(start, endTo)};
};

/**
 * Bring the editor's contents up to date with text supplied from outside
 * @param {String} text - The text to be displayed
 * @param {EditorView} instance - The CodeMirror view
 */
fluid.codemirror.readText = function (text, instance) {
    const current = instance.state.doc.toString();
    if (current !== text) {
        instance.dispatch({changes: fluid.codemirror.diff(current, text)});
    }
};

/**
 * Note the source positions of the definitions written by an SFC's script, read by fluid.editor's goToRef
 * @param {EditorView} instance - The CodeMirror view
 * @param {String} text - The SFC's text
 */
fluid.codemirror.noteDefMaps = function (instance, text) {
    const script = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(text);
    if (script) {
        const offset = script.index + script[0].indexOf(">") + 1;
        try {
            instance.defMaps = fluid.parseDefMaps(script[1], offset);
        } catch (e) {
            // A script which can't be parsed keeps the positions noted when it last could be
        }
    }
};

/**
 * Construct the CodeMirror view of an editor
 * @param {fluid.codemirror} self - The CodeMirror component
 * @param {fluid.editor} holder - The editor holding it, whose `mode` gives its language
 * @param {Element} container - The view's rendered container, holding the element its template renders
 * @return {EditorView} The CodeMirror view
 */
fluid.codemirror.construct = function (self, holder, container) {
    const kind = fluid.codemirror.kinds[holder.mode] || "js";
    let instance = null;
    const view = fluid.codemirror6.fluidEditor({
        parent: container.firstElementChild,
        doc: "",
        kind,
        style: true,
        onChange: (text, user) => {
            // Only text the user has edited is written back - in particular not the editor's initial contents, which
            // may be linted before readText has supplied them
            if (user && instance) {
                instance.hasUserEdits = true;
            }
            if (kind === "vue" && instance) {
                fluid.codemirror.noteDefMaps(instance, text);
            }
        },
        // The linting is asynchronous, and so the reactive source of an edit cannot be followed through it
        onDiagnostics: (diagnostics, text) => {
            if (!fluid.isDestroyed(self) && !diagnostics.some(diagnostic => diagnostic.severity === "error")) {
                self.validText = text;
            }
        }
    });
    instance = view;
    instance.hasUserEdits = false;
    instance.defMaps = {};
    fluid.disableRendering(self);
    return instance;
};

/**
 * Write text which the user has edited, once it has linted free of errors, back to the editor holding this CodeMirror
 * @param {fluid.codemirror} self - The CodeMirror component
 * @param {fluid.editor} holder - The editor holding it, which may write the text back with its `writeText` method
 * @param {String|null} validText - The editor's text as last linted free of errors, or `null` if none has been
 * @param {EditorView} instance - The CodeMirror view
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
 * Destroy a CodeMirror view constructed by fluid.codemirror.construct
 * @param {EditorView} instance - The CodeMirror view
 */
fluid.codemirror.destroy = function (instance) {
    instance.destroy();
};
</script>

<!-- Infusion's one copy of CodeMirror 6, with fluid-lint, as fluid.codemirror6 - loaded once for the whole document -->
<script src="%infusion-6/src/lib/fluid-lint/fluid-lint.js" data-fl-scope="global"></script>

<!-- The source positions of the definitions written by SFC scripts, read by fluid.editor's goToRef -->
<script src="%infusion-6/src/lib/lezer/lezer-javascript-browser.js" data-fl-scope="global"></script>
<script src="%fluid-edit/js/defMaps.js"></script>

<style>
/* The view's container, within fluid.editor, and the element its template renders, which holds the CodeMirror view */
.fl-editor > :has(> .fl-codemirror) {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
}

.fl-codemirror {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
}

/* No wider than the pane, however long its lines - which scroll within it - so that its tooltips, held within it, fit */
.fl-codemirror .cm-editor {
    flex: 1;
    min-width: 0;
    height: 100%;
    font-family: var(--fl-monospace, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace);
    font-size: 12px;
}

.fl-codemirror .cm-scroller {
    font-family: inherit;
}

/* Errors red, stylistic warnings orange - in the gutter, beneath the text and in the tooltip */
.fl-codemirror .cm-lintRange-error {
    background-image: none;
    text-decoration: underline wavy #bb0000;
}

.fl-codemirror .cm-lintRange-warning {
    background-image: none;
    text-decoration: underline wavy #e08a00;
}

.cm-tooltip-lint .cm-diagnostic-error {
    border-left-color: #bb0000;
}

.cm-tooltip-lint .cm-diagnostic-warning {
    border-left-color: #e08a00;
}
</style>
