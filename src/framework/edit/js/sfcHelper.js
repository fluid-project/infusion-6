/* global JSHINT, CSSLint, CodeMirror, LezerJS */

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
        const tree = fluid.parseHTMLToTree(text, {fragment: true, skipWhitespace: true});
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

const stopTokens = new Set(["ArrowFunction", "AssignmentExpression"]);

fluid.pushLezerChildren = function (parent, cursor, text, state) {
    // console.log(`Node ${cursor.name} from ${cursor.from} to ${cursor.to}`);
    const token = {
        name: cursor.name,
        from: cursor.from,
        to: cursor.to,
        text: text.substring(cursor.from, cursor.to),
        children: [],
        parent
    };
    if (cursor.firstChild()) {
        do {
            if (!stopTokens.has(token.name)) {
                const newToken = fluid.pushLezerChildren(token, cursor, text, state);
                token.children.push(newToken);
            }
        } while (cursor.nextSibling());
        cursor.parent();
    }
    return token;
};

const expectToken = function (token, name) {
    if (token.name !== name) {
        throw ("Unexpected token with name ", token.name, ", expected ", name);
    };
    return token;
};

const $m = fluid.metadataSymbol;

fluid.defMapsFromTree = function (token, state) {
    let parsedDef = false,
        pushedSeg = false;
    if (token.name === "CallExpression" && token.children[0].name === "MemberExpression" && token.children[0].text === "fluid.def") {
        const argList = expectToken(token.children[1], "ArgList");
        const defName = expectToken(argList.children[1], "String"); // Should be type String - *(* *name* *,* *ObjectExpression* *)*
        state.currentDef = defName.text.slice(1, -1); // slice off quotes
        state.segs = [];
        parsedDef = true;
    }
    if (state.currentDef && token.name === "Property") {
        const propDef = expectToken(token.children[0], "PropertyDefinition");
        const value = token.children[2]; // Could be ObjectExpression, String, or any other RH
        state.segs.push(propDef.text);
        pushedSeg = true;
        fluid.set(state, ["defMap", state.currentDef, ...state.segs, $m], {from: value.from + state.offset, to: value.to + state.offset});
    }
    ++state.tokens;
    token.children.forEach(child => fluid.defMapsFromTree(child, state));
    if (parsedDef) {
        state.currentDef = null;
    }
    if (pushedSeg) {
        state.segs.pop();
    }
};


fluid.parseDefMaps = function (text, offset) {
    const lezerTree = LezerJS.parser.parse(text);

    const state = {
        tokens: 0,
        offset,
        defMap: {},
        segs: [],
        currentDef: null
    };

    const cursor = lezerTree.cursor();

    const tree = fluid.pushLezerChildren(null, cursor, text);
    fluid.defMapsFromTree(tree, state);
    console.log("Parsed defMaps ", state.defMap);
    return state.defMap;
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
        const text = vnode.children[0].text;
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
        const text = vnode.children[0].text;
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
