/* global JSHINT, CSSLint, CodeMirror */

"use strict";

fluid.sfcLinters = {
    script: "fluid.lintScriptNode",
    style: "fluid.lintStyleNode",
    template: "fluid.lintTemplateNode"
};

fluid.lintMarkerMap = {
    error: {
        single: "mdi mdi-close-circle",
        multiple: "mdi mdi-close-circle-multiple",
    },
    warning: {
        single: "mdi mdi-alert",
        multiple: "mdi mdi-alert-plus-outline"
    }
};

fluid.sfcValidator = function (text, options, cm) {
    console.log("Received call to sfc validator with text ", text);
    if (!window.JSHINT) {
        if (window.console) {
            window.console.error("Error: window.JSHINT not defined, CodeMirror JavaScript linting cannot run.");
        }
        return [];
    }
    if (cm.getMode().name === "vue") {
        const tree = fluid.parseHTMLToTree(text);
        console.log("Applying vue linting");
        const hints = [];
        tree.children.forEach(child => {
            const linter = fluid.getGlobalValue(fluid.sfcLinters[child.tag]);
            if (!fluid.isUnavailable(linter)) {
                linter(child, text, hints, options, cm);
            }
        });
        return hints;

    } else {
        // It's likely a base HTML mode, need to dispatch back to that
    }
};



// We'd like to register a helper just for type "vue" but CodeMirror lint helper internally makes a hardwired call to getHelper
// for the document start pos,
//     var getAnnotations = options.getAnnotations || cm.getHelper(CodeMirror.Pos(0, 0), "lint");
// which then in turn ends up returning the innerMode:
//     return CodeMirror.innerMode(mode, this.getTokenAt(pos).state).mode
CodeMirror.registerHelper("lint", "html", fluid.sfcValidator);

// All following text cribbed from the insides of CodeMirror linting implementations in javascript-lint.js, css-lint.js etc.
// in the typical massive reuse failure

fluid.lintScriptNode = function (vnode, fullText, hints, options, cm) {
    if (vnode.attrs.src) { // It's an external script which is (probably) not our responsibility - in future bring in locally sourced scripts too
        return;
    } else {
        const text = vnode.children[0]?.text || "";
        cm.defMaps = fluid.parseDefMaps(text, vnode.start + "<script>".length);
        // eslint-disable-next-line new-cap
        JSHINT(text, options.jshint, options.globals);
        const offsetLine = cm.doc.posFromIndex(vnode.start).line;
        const errors = JSHINT.data().errors;
        if (errors) {
            fluid.parseJSHintErrors(errors, hints, offsetLine);
        }
    }
};

fluid.lintStyleNode = function (vnode, fullText, hints, options, cm) {
    if (vnode.attrs.src) { // It's an external stylesheet which is (probably) not our responsibility
        return;
    } else {
        const text = vnode.children[0]?.text || "";
        const {messages} = CSSLint.verify(text, options);
        const offsetLine = cm.doc.posFromIndex(vnode.start).line;
        messages.forEach(message => {
            hints.push({
                from: CodeMirror.Pos(message.line + offsetLine - 1, message.col - 1),
                to: CodeMirror.Pos(message.line + offsetLine - 1, message.col),
                message: message.message,
                severity : message.type
            });
        });
    }
};

// Cribbed from Codemirror javascript-lint.js - wot reusability?

fluid.parseJSHintErrors = function (errors, output, offsetLine = 0) {
    for (let i = 0; i < errors.length; i++) {
        const error = errors[i];
        if (error) {
            if (error.line <= 0) {
                if (window.console) {
                    window.console.warn("Cannot display JSHint error (invalid line " + error.line + ")", error);
                }
                continue;
            }

            let start = error.character - 1, end = start + 1;
            if (error.evidence) {
                const index = error.evidence.substring(start).search(/.\b/);
                if (index > -1) {
                    end += index;
                }
            }

            // Convert to format expected by validation service
            const hint = {
                message: error.reason,
                severity: error.code ? (error.code.startsWith("W") ? "warning" : "error") : "error",
                from: CodeMirror.Pos(error.line + offsetLine - 1, start),
                to: CodeMirror.Pos(error.line + offsetLine - 1, end)
            };

            output.push(hint);
        }
    }
};
