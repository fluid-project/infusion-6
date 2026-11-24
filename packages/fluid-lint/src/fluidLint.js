// fluid-lint - linting of Infusion 6 JavaScript and Single File Components. JavaScript is parsed by @lezer/javascript,
// within which the interior of each String and template literal configuring a layer is parsed by the grammar of
// configuration's runes, grammar/fluid-runes.grammar - so that a reference, a compact record or a template's
// interpolations are checked to their interiors, as Infusion will read them. An SFC is parsed by @lezer/html, nesting
// JavaScript within its <script> and the grammar of templates within its <template>. The layer records written to
// fluid.def are checked as Infusion reads them: their directives, `$layers`, and the full forms of `$compute`,
// `$effect`, `$method`, `$lens`, `$bindable`, `$for` and `$component`, whose records are linted in turn.
//
// The same parsers are mounted for CodeMirror 6 by codemirror.js, which highlights the runes and reports the
// diagnostics of `lint` beside the text. Under node, `lint` alone may be used, e.g. by test/lintTests.js.

import {parseMixed} from "@lezer/common";
import {parser as jsParser} from "@lezer/javascript";
import {parser as htmlParser} from "@lezer/html";
import {parser as cssParser} from "@lezer/css";
import {parser as runesParser} from "./fluid-runes.parser.js";

/**
 * @typedef {Object} Diagnostic
 * @property {Number} from - The position at which the problem starts
 * @property {Number} to - The position at which it ends
 * @property {String} severity - "error", "warning" or "info"
 * @property {String} message - A description of the problem
 */

export const valueParser = runesParser;
export const templateParser = runesParser.configure({top: "Template"});
export const callParser = runesParser.configure({top: "CallBody"});

// The directives which may be written as keys of a layer record itself, rather than of a member's record
export const recordDirectives = new Set(["$layers", "$variety", "$importMap"]);

// Those which may further be written in the record of a $component, beside its $layers
export const componentDirectives = new Set([...recordDirectives, "$for", "$if"]);

// The directives written as the single key of a member's record, e.g. `area: {$compute: {...}}`, with the keys each
// accepts in its full form - `null` for one whose content is not a record of fixed keys
export const memberDirectives = {
    $compute: ["func", "args", "equiv"],
    $effect: ["func", "args", "includeSource", "excludeSource", "debounce", "source", "namespace", "priority"],
    $method: ["func", "args"],
    $lens: ["source", "path", "forward", "backward"],
    $bindable: ["bind", "unbind", "onceOnly", "args"],
    $linkage: ["inputLayers", "outputLayers", "selector", "scope", "$if"],
    $component: null,
    $reactiveRoot: null,
    $transient: null,
    $componentList: null
};

// The directives which may be written in compact form, "$type:body"
export const compactDirectives = new Set(["$compute", "$effect", "$method"]);

// The keys of the records of $for
// The keys of the records of $for - `layerAs` naming the member into which each element of its source, a layer record,
// is merged
export const forKeys = ["source", "valueAs", "keyAs", "positionAs", "layerAs"];

// The members of a layer record whose Strings are templates, holding interpolations `@{...}`
export const templateMembers = new Set(["template", "partialTemplate"]);

// A layer name - a dotted path of segments, the first an identifier, e.g. "fluid.viewComponent", "my.kind.404"
export const layerNamePattern = /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/;

// The nodes of JavaScript within which a String is not configuration, but code
const codeNodes = new Set(["ArrowFunction", "FunctionExpression", "FunctionDeclaration", "ClassDeclaration",
    "ClassExpression", "MethodDeclaration", "ParamList", "Block"]);

/**
 * The text of a node
 * @param {SyntaxNode} node - The node
 * @param {Function} read - Reads the text between two positions
 * @return {String} Its text
 */
const textOf = (node, read) => read(node.from, node.to);

/**
 * The name of the key of a Property node, unquoted
 * @param {SyntaxNode} property - The Property node
 * @param {Function} read - Reads the text between two positions
 * @return {String|null} The key, or null if it is computed or absent
 */
export const keyOf = function (property, read) {
    const first = property.firstChild;
    let togo = null;
    if (first && first.name === "PropertyDefinition") {
        togo = textOf(first, read);
    } else if (first && first.name === "String") {
        togo = textOf(first, read).slice(1, -1);
    }
    return togo;
};

/**
 * The value of a Property node - the node following its colon
 * @param {SyntaxNode} property - The Property node
 * @return {SyntaxNode|null} The node of its value, or null for a shorthand property or method
 */
export const valueOf = function (property) {
    let node = property.firstChild;
    while (node && node.name !== ":") {
        node = node.nextSibling;
    }
    return node ? node.nextSibling : null;
};

/**
 * The argument nodes of a CallExpression, without punctuation
 * @param {SyntaxNode} call - The CallExpression
 * @return {SyntaxNode[]} Its arguments
 */
export const argsOf = function (call) {
    const argList = call.getChild("ArgList");
    const togo = [];
    for (let node = argList ? argList.firstChild : null; node; node = node.nextSibling) {
        if (!["(", ")", ","].includes(node.name)) {
            togo.push(node);
        }
    }
    return togo;
};

/**
 * Determine whether a CallExpression defines a layer, as `fluid.def(name, record)` - whose record is configuration
 * @param {SyntaxNode} call - The CallExpression
 * @param {Function} read - Reads the text between two positions
 * @return {Boolean} `true` if it calls fluid.def
 */
export const isDefCall = function (call, read) {
    const callee = call.firstChild;
    return !!callee && callee.name === "MemberExpression" && textOf(callee, read).replace(/\s/g, "") === "fluid.def";
};

/**
 * Find the layer record within which a node of JavaScript is written as configuration - the second argument of a
 * fluid.def call enclosing it - passing through objects and arrays only, and never through code, e.g. the body of a
 * function written as a `func`
 * @param {SyntaxNode} node - The node, e.g. a String
 * @param {Function} read - Reads the text between two positions
 * @return {SyntaxNode|null} The ObjectExpression of the record, or null if the node is not configuration
 */
export const recordOf = function (node, read) {
    let togo = null, done = false;
    for (let child = node, parent = node.parent; parent && !done; child = parent, parent = parent.parent) {
        if (codeNodes.has(parent.name)) {
            done = true;
        } else if (parent.name === "ArgList" && parent.parent && parent.parent.name === "CallExpression") {
            const args = argsOf(parent.parent);
            if (isDefCall(parent.parent, read) && args[1] && args[1].from === child.from && child.name === "ObjectExpression") {
                togo = child;
            }
            done = true;
        } else if (!["ObjectExpression", "ArrayExpression", "Property"].includes(parent.name)) {
            done = true;
        }
    }
    return togo;
};

/**
 * Determine how a String or template literal of JavaScript is read by Infusion, if at all - as configuration, a
 * template, or not - and which top rule of the grammar of runes parses it. A key, e.g. "@onchange", is not configuration
 * @param {SyntaxNode} node - A String or TemplateString node
 * @param {Function} read - Reads the text between two positions
 * @return {String|null} "Value", "Template", or null if the String is not configuration
 */
export const configurationTop = function (node, read) {
    let togo = null;
    const parent = node.parent;
    const isKey = parent && parent.name === "Property" && parent.firstChild && parent.firstChild.from === node.from;
    if (!isKey && recordOf(node, read)) {
        const key = parent && parent.name === "Property" ? keyOf(parent, read) : null;
        togo = topFor(key, read(node.from + 1, node.to));
    }
    return togo;
};

/**
 * The ranges of the interior of a String or template literal - without its quotes, and without the `${...}`
 * substitutions of a template literal
 * @param {SyntaxNode} node - The String or TemplateString node
 * @return {Object[]} The ranges, each `{from, to}`
 */
export const interiorRanges = function (node) {
    const ranges = [];
    let from = node.from + 1;
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === "Interpolation") {
            ranges.push({from, to: child.from});
            from = child.to;
        }
    }
    ranges.push({from, to: Math.max(from, node.to - 1)});
    return ranges.filter(range => range.to > range.from);
};

const parserForTop = {Value: valueParser, Template: templateParser};

/**
 * Determine how a configuration String is read - as a template, if it is held at a member which holds one and it is
 * neither a reference nor a compact record, e.g. `template: "$compute:my.render({self})"`, and otherwise as a value
 * @param {String|null} key - The key at which it is held
 * @param {String} text - Its interior
 * @return {String} "Template" or "Value"
 */
export const topFor = (key, text) => templateMembers.has(key) && !/^[{$]/.test(text) ? "Template" : "Value";

/**
 * The parser of JavaScript within which the grammar of runes is nested over each configuration String - for
 * CodeMirror, which highlights the runes within it
 */
export const fluidJsParser = jsParser.configure({
    wrap: parseMixed((ref, input) => {
        let togo = null;
        if (ref.name === "String" || ref.name === "TemplateString") {
            const read = (from, to) => input.read(from, to);
            const top = configurationTop(ref.node, read);
            if (top) {
                togo = {parser: parserForTop[top], overlay: interiorRanges(ref.node)};
            }
        }
        return togo;
    })
});

// SFCs are read as XML-like HTML, in which any element may close itself, e.g. the <path/> of an SVG symbol
const sfcHtmlParser = htmlParser.configure({dialect: "selfClosing"});

/**
 * The parser of Single File Components, nesting fluidJsParser within each <script> and the grammar of templates
 * within <template>
 */
export const fluidSfcParser = htmlParser.configure({
    dialect: "selfClosing",
    wrap: parseMixed(ref => {
        let togo = null;
        if (ref.name === "ScriptText") {
            togo = {parser: fluidJsParser};
        }
        return togo;
    })
});

/**
 * Count the brackets of one kind left open by a text
 * @param {String} text - The text
 * @param {String} open - The opening bracket
 * @param {String} close - The closing bracket
 * @return {Number} The number left open
 */
const openCount = function (text, open, close) {
    let depth = 0;
    for (const c of text) {
        if (c === open) {
            ++depth;
        } else if (c === close && depth > 0) {
            --depth;
        }
    }
    return depth;
};

/**
 * A fix proposed for a diagnostic - changes to the text, each replacing the text between two positions
 * @typedef {Object} Fix
 * @property {String} label - What the fix does, e.g. 'Insert "}"'
 * @property {Object[]} changes - The changes, each {from, to, insert}
 */

/**
 * Make a fix inserting text at a position
 * @param {Number} pos - The position
 * @param {String} insert - The text inserted
 * @param {String} [label] - What the fix does - by default, 'Insert "..."'
 * @return {Fix} The fix
 */
export const insertion = (pos, insert, label) => ({label: label || "Insert \"" + insert + "\"", changes: [{from: pos, to: pos, insert}]});

/**
 * Make a fix replacing the text between two positions
 * @param {Number} from - The start of the text replaced
 * @param {Number} to - Its end
 * @param {String} insert - Its replacement
 * @param {String} label - What the fix does
 * @return {Fix} The fix
 */
export const replacement = (from, to, insert, label) => ({label, changes: [{from, to, insert}]});

/**
 * Shift the positions of a fix
 * @param {Fix|undefined} fix - The fix, if any
 * @param {Number} delta - The shift
 * @return {Fix|undefined} The fix shifted
 */
const shiftFix = (fix, delta) => fix && {label: fix.label, changes: fix.changes.map(change => ({...change, from: change.from + delta, to: change.to + delta}))};

/**
 * Shift the positions of a diagnostic, and of any fix it proposes
 * @param {Diagnostic} diagnostic - The diagnostic
 * @param {Number} delta - The shift
 * @param {Number} [limit] - A position beyond which its end is clamped
 * @return {Diagnostic} The diagnostic shifted
 */
export const shiftDiagnostic = function (diagnostic, delta, limit = Infinity) {
    const togo = {...diagnostic, from: diagnostic.from + delta, to: Math.min(diagnostic.to, limit) + delta};
    if (diagnostic.fix) {
        togo.fix = shiftFix(diagnostic.fix, delta);
    }
    return togo;
};

/**
 * The distance of edits between two words
 * @param {String} a - One word
 * @param {String} b - The other
 * @return {Number} The number of insertions, deletions and substitutions taking one to the other
 */
const editDistance = function (a, b) {
    let row = Array.from({length: b.length + 1}, (unused, j) => j);
    for (let i = 1; i <= a.length; ++i) {
        const next = [i];
        for (let j = 1; j <= b.length; ++j) {
            next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        row = next;
    }
    return row[b.length];
};

/**
 * Find which of some words a misspelt word was most likely meant to be
 * @param {String} word - The word
 * @param {Iterable<String>} candidates - The words it might have meant
 * @return {String|null} The nearest, if near enough, or null
 */
export const nearestWord = function (word, candidates) {
    let best = null, bestDistance = Infinity;
    for (const candidate of candidates) {
        const distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best !== null && bestDistance <= Math.max(1, Math.floor(best.length / 3)) ? best : null;
};

/**
 * Describe a syntax error within the interior of a configuration String, by what precedes it, proposing a fix where
 * one is clear
 * @param {String} text - The interior
 * @param {Number} pos - The position of the error within it
 * @param {String[]} within - The names of the nodes enclosing the error, innermost first
 * @return {Object} The description, as {message, fix}, whose fix, if any, is positioned within the interior
 */
export const describeRuneError = function (text, pos, within) {
    const before = text.slice(0, pos), at = text[pos];
    const prev = before.slice(-1);
    const ending = at === undefined || at === "," || at === ")" || at === " ";
    const trimmedEnd = before.replace(/\s+$/, "").length;
    let message, fix;
    if (within.includes("Interpolation")) {
        const interior = before.slice(before.lastIndexOf("@{") + 2);
        if (at === "}" && interior.trim() === "") {
            message = "Empty interpolation - write what it shows, e.g. @{name}, @{{self}.title} or @{my.format({self}.date)}";
        } else if (openCount(interior, "{", "}") > 0 && ending) {
            message = "Unclosed reference - expected \"}\" to close the reference's context";
            fix = insertion(pos, "}");
        } else if (openCount(interior, "(", ")") > 0) {
            message = "Unclosed call - expected \")\" to close its arguments";
            // If nothing closes the interpolation either, the fix closes both
            fix = insertion(pos, /^[^<@]*}/.test(text.slice(pos)) ? ")" : ")}");
        } else if (!/^[^<@]*}/.test(text.slice(pos))) {
            message = "Unclosed interpolation - expected \"}\" to close \"@{\"";
            fix = insertion(trimmedEnd, "}");
        } else {
            message = "Malformed interpolation - an interpolation holds a single path, reference or call, e.g. @{name}, " +
                "@{{self}.title} or @{my.format({self}.date)}";
        }
    } else if (prev === "{" && at === "}") {
        message = "Empty context - a reference names the component it reaches, e.g. {self}.path, {$parent}.path or {my.widget}.path";
        fix = insertion(pos, "self", "Insert \"self\"");
    } else if (openCount(before, "{", "}") > 0 && ending) {
        message = "Unclosed reference - expected \"}\" to close the reference's context";
        fix = insertion(trimmedEnd, "}");
    } else if (prev === "." && within.includes("Reference")) {
        message = "Expected the name of a member after \".\" - a path is written {context}.member.member";
        fix = at === "." ? replacement(pos, pos + 1, "", "Remove the extra \".\"") : replacement(pos - 1, pos, "", "Remove the trailing \".\"");
    } else if (prev === ":" && within.includes("Reference")) {
        message = "Expected a label after \":\", e.g. {0}:query";
        fix = replacement(pos - 1, pos, "", "Remove the trailing \":\"");
    } else if (prev === "}" && within.includes("Reference")) {
        message = "After a reference's \"}\", expected \".\" before a path, e.g. {self}.member, or \":\" before a label";
        fix = insertion(pos, ".");
    } else if (within.includes("Call") || openCount(before, "(", ")") > 0) {
        if (at === undefined) {
            message = "Unclosed call - expected \")\" to close its arguments";
            fix = insertion(trimmedEnd, ")");
        } else if (at === "," && /[(,]\s*$/.test(before)) {
            message = "Empty argument - two commas, or a comma after \"(\", leave an argument empty";
            fix = replacement(pos, pos + 1, "", "Remove the \",\"");
        } else if (at === ")" && /,\s*$/.test(before)) {
            message = "Empty argument - a comma before \")\" leaves an argument empty";
            const comma = before.lastIndexOf(",");
            fix = replacement(comma, comma + 1, "", "Remove the trailing \",\"");
        } else {
            message = "Expected \",\" between arguments, or \")\" to close them";
            fix = insertion(trimmedEnd, ",");
        }
    } else if (within.includes("CompactRecord") && /^\$[a-zA-Z]+$/.test(before)) {
        message = "Expected \":\" after " + before + " - a compact record is written " + before + ":my.fn({self}.a)";
        const gap = /^\s*/.exec(text.slice(pos))[0].length;
        fix = replacement(pos, pos + gap, ":", "Write \"" + before + ":\"");
    } else if (within.includes("CompactRecord") && prev === ":" && at === undefined) {
        message = "Expected a function after \"" + before + "\", e.g. " + before + "my.fn({self}.a)";
    } else if (within.includes("CompactRecord") && /^\$[a-zA-Z]+:$/.test(before)) {
        message = "Expected the global name of a function, e.g. my.fn, or a call of one, e.g. my.fn({self}.a)";
    } else if (pos > 0) {
        message = "Unexpected text after the end of the " + (text[0] === "$" ? "compact record" : "reference") +
            " - a String holding one is read whole, and must hold nothing more. To combine values, compute them, " +
            "e.g. \"$compute:my.join({self}.a, {self}.b)\"";
        fix = replacement(trimmedEnd, text.length, "", "Remove the text after it");
    } else {
        message = "Malformed configuration";
    }
    return {message, fix};
};

/**
 * Report each error node of a tree of runes, positioned within the source. Errors which recovery leaves one after
 * another are reported as one, with the message of the first
 * @param {Tree} tree - The tree, of the interior of a String
 * @param {String} text - The interior, as written in source
 * @param {Number} offset - The position in the source of the start of the text parsed
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
const reportRuneErrors = function (tree, text, offset, diagnostics) {
    let last = null;
    tree.iterate({
        enter: ref => {
            if (ref.type.isError) {
                const to = Math.max(ref.to, Math.min(ref.from + 1, text.length));
                if (last && ref.from <= last.end + 1) {
                    last.end = Math.max(last.end, to);
                    last.diagnostic.to = offset + last.end;
                } else {
                    const within = [];
                    for (let parent = ref.node.parent; parent; parent = parent.parent) {
                        within.push(parent.name);
                    }
                    const {message, fix} = describeRuneError(text, ref.from, within);
                    // Text after a whole rune is reported to the end of the String
                    const end = message.startsWith("Unexpected text after") ? text.length : to;
                    const diagnostic = {from: offset + ref.from, to: offset + end, severity: "error", message};
                    if (fix) {
                        diagnostic.fix = shiftFix(fix, offset);
                    }
                    last = {end: to, diagnostic};
                    diagnostics.push(diagnostic);
                }
            }
        }
    });
};

/**
 * Lint part of the value of an event binding as runes - an error found at its end, e.g. of a call left unclosed, is
 * shown over the whole part, since there is no character there to mark
 * @param {String} text - The part, trimmed
 * @param {Number} from - Its position in the source
 * @param {String} top - "Value" or "CallBody"
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
const lintBindingRunes = function (text, from, top, diagnostics) {
    const before = diagnostics.length;
    lintRunes(text, from, top, diagnostics);
    diagnostics.slice(before).forEach(diagnostic => {
        if (diagnostic.from === diagnostic.to) {
            diagnostic.from = from;
            diagnostic.to = from + text.length;
        }
    });
};

// An event binding in a template, e.g. @onclick="{self}.increment()" - its name, and its value within its quotes
const eventBindingPattern = /(@on[\w.-]*)\s*=\s*(["'])([^"']*)\2/g;

/**
 * Lint the event bindings of a template, as fluid.applyOn reads them - a value holding "=" is an assignment, e.g.
 * "{self}.open = true", whose sides are each read as a configuration String, and any other is a call in the compact
 * syntax of $method, e.g. "{self}.increment()" or "my.select({self}, {0})"
 * @param {String} text - The template, as written in source
 * @param {Number} offset - The position of the template in the source
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
const lintEventBindings = function (text, offset, diagnostics) {
    for (const match of text.matchAll(eventBindingPattern)) {
        const value = match[3];
        const valueFrom = offset + match.index + match[0].length - 1 - value.length;
        if (value.trim() === "") {
            diagnostics.push({from: offset + match.index, to: offset + match.index + match[0].length, severity: "error",
                message: "Empty event binding - " + match[1] + " names what it calls, e.g. " + match[1] + "=\"{self}.increment()\""});
        } else if (value.includes("=")) {
            const sides = value.split("=");
            if (sides.length === 2) {
                let from = valueFrom;
                sides.forEach(side => {
                    const lead = /^\s*/.exec(side)[0].length;
                    const trimmed = side.trim();
                    const unNegated = trimmed.startsWith("!") ? trimmed.slice(1) : trimmed;
                    const at = from + lead + trimmed.length - unNegated.length;
                    if (unNegated.startsWith("{")) {
                        lintBindingRunes(unNegated, at, "Value", diagnostics);
                    }
                    from += side.length + 1;
                });
            } else {
                diagnostics.push({from: valueFrom, to: valueFrom + value.length, severity: "error",
                    message: "An assigning event binding holds a single \"=\", e.g. \"{self}.open = true\""});
            }
        } else {
            const lead = /^\s*/.exec(value)[0].length;
            const body = value.trim(), bodyFrom = valueFrom + lead;
            // A context left unclosed before the path, e.g. "{self.increment()", is read as a context named
            // "self.increment", so is reported here rather than as a malformed call
            const context = /^\{([\w$]+)[.(]/.exec(body);
            const head = body.slice(0, Math.max(0, body.indexOf("(")));
            if (context && !head.includes("}")) {
                const close = bodyFrom + 1 + context[1].length;
                diagnostics.push({from: bodyFrom, to: close, severity: "error",
                    message: "Unclosed reference - expected \"}\" to close the reference's context, e.g. {self}.increment()",
                    fix: insertion(close, "}")});
            } else {
                lintBindingRunes(body, bodyFrom, "CallBody", diagnostics);
            }
        }
    }
};

/**
 * Report a path written just after an interpolation rather than within it, e.g. "@{post}.name" or "@{{post}}.name",
 * which renders the path as text - a warning, since the text may be meant, but more often a "}" has strayed
 * @param {Tree} tree - The template's parse
 * @param {String} text - The template
 * @param {Number} offset - The position of the template within any larger document
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
const lintStrandedPaths = function (tree, text, offset, diagnostics) {
    tree.topNode.getChildren("Interpolation").forEach(interpolation => {
        const expression = interpolation.getChild("AtExpression");
        const inner = expression && expression.firstChild;
        const stranded = /^(\.[\w$-]+)+/.exec(text.slice(interpolation.to));
        const pathless = inner && (inner.name === "BarePath" || inner.name === "Reference" && !inner.getChild("Path"));
        if (stranded && pathless) {
            const written = text.slice(interpolation.from, interpolation.to) + stranded[0];
            const body = text.slice(inner.from, inner.to);
            const meant = "@{" + (inner.name === "BarePath" ? "{" + body + "}" : body) + stranded[0] + "}";
            diagnostics.push({from: offset + interpolation.from, to: offset + interpolation.to + stranded[0].length, severity: "warning",
                message: "The path " + stranded[0] + " follows the interpolation rather than lying within it, and is rendered as text - " +
                    "did you mean " + meant + "?",
                fix: replacement(offset + interpolation.from, offset + interpolation.to + stranded[0].length, meant, "Change " + written + " to " + meant)});
        }
    });
};

/**
 * Lint the interior of a configuration String as Infusion reads it - a reference, a compact record, an escaped or
 * plain literal, or a template
 * @param {String} text - The interior, as written in source
 * @param {Number} offset - The position of the interior in the source
 * @param {String} top - "Value", "Template" or "CallBody"
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
export const lintRunes = function (text, offset, top, diagnostics) {
    if (top === "Template") {
        lintEventBindings(text, offset, diagnostics);
    }
    const parser = top === "Template" ? templateParser : top === "CallBody" ? callParser : valueParser;
    const tree = parser.parse(text);
    if (top === "Template") {
        lintStrandedPaths(tree, text, offset, diagnostics);
    }
    const first = tree.topNode.firstChild;
    // A String of "$" not followed by a rune, e.g. "$5.00", is reported once, as a literal wanting its escape
    const firstRune = first && first.name === "CompactRecord" ? first.getChild("RuneName") : null;
    const runeless = first && first.name === "CompactRecord" && !(firstRune && firstRune.to > firstRune.from);
    if (!runeless) {
        reportRuneErrors(tree, text, offset, diagnostics);
    }
    tree.iterate({
        enter: ref => {
            if (ref.name === "CompactRecord") {
                const runeNode = ref.node.getChild("RuneName");
                const rune = runeNode && runeNode.to > runeNode.from ? "$" + text.slice(runeNode.from, runeNode.to) : null;
                const body = ref.node.getChild("CompactBody");
                if (!rune) {
                    diagnostics.push({from: offset + ref.from, to: offset + ref.to, severity: "error",
                        message: "A String beginning with \"$\" is read as a compact record, e.g. \"$compute:my.fn({self}.a)\" - " +
                            "write \"\\\\$\" for a literal \"$\"",
                        fix: insertion(offset + ref.from, "\\\\", "Escape the \"$\" as \"\\\\$\"")});
                } else if (!compactDirectives.has(rune)) {
                    const meant = nearestWord(rune, compactDirectives);
                    const diagnostic = {from: offset + runeNode.from - 1, to: offset + runeNode.to, severity: "error",
                        message: "Unknown compact directive " + rune + (meant ? " - did you mean " + meant + "?" : "") +
                            " A compact record is one of " + [...compactDirectives].join(", ") + ", or write \"\\\\$\" for a literal \"$\""};
                    diagnostic.fix = meant ? replacement(diagnostic.from, diagnostic.to, meant, "Change to " + meant) :
                        insertion(offset + ref.from, "\\\\", "Escape the \"$\" as \"\\\\$\"");
                    diagnostics.push(diagnostic);
                } else if (rune === "$effect" && body && !body.getChild("Call")) {
                    diagnostics.push({from: offset + body.from, to: offset + body.to, severity: "error",
                        message: "A compact $effect must list its arguments, e.g. \"$effect:my.log({self}.count)\""});
                }
            } else if (ref.name === "Selector") {
                const steps = ref.node.getChildren("SelectorStep");
                const lastStep = steps[steps.length - 1];
                if (lastStep && text.slice(lastStep.from, lastStep.to) === ">") {
                    diagnostics.push({from: offset + lastStep.from, to: offset + lastStep.to, severity: "error",
                        message: "A child combinator \">\" must be followed by the name of a context, e.g. {self > my.widget}"});
                }
            } else if (ref.name === "BareArg") {
                const arg = text.slice(ref.from, ref.to);
                if (/^\\?["'`]/.test(arg.trim())) {
                    diagnostics.push({from: offset + ref.from, to: offset + ref.to, severity: "warning",
                        message: "Compact arguments are split on commas and are not unquoted - this argument includes its quotes. " +
                            "Write it bare, or the full form {func, args} for a String holding a comma",
                        fix: replacement(offset + ref.from, offset + ref.to, arg.trim().replace(/^\\?["'`]|\\?["'`]$/g, ""), "Remove the quotes")});
                }
            }
        }
    });
};

/**
 * The context in which the linting of a JavaScript tree proceeds
 * @typedef {Object} LintContext
 * @property {Function} read - Reads the text between two positions
 * @property {Diagnostic[]} diagnostics - Receives the diagnostics
 */

/**
 * Lint a String node of configuration
 * @param {SyntaxNode} node - The String or TemplateString node
 * @param {String} top - "Value", "Template" or "CallBody"
 * @param {LintContext} context - The context
 */
const lintStringNode = function (node, top, context) {
    interiorRanges(node).forEach(range => lintRunes(context.read(range.from, range.to), range.from, top, context.diagnostics));
};

/**
 * Report a diagnostic against a node
 * @param {SyntaxNode} node - The node
 * @param {String} severity - The severity
 * @param {String} message - The message
 * @param {LintContext} context - The context
 * @param {Fix} [fix] - A fix it proposes
 */
const report = function (node, severity, message, context, fix) {
    const diagnostic = {from: node.from, to: node.to, severity, message};
    if (fix) {
        diagnostic.fix = fix;
    }
    context.diagnostics.push(diagnostic);
};

/**
 * Report an unknown key of a record, suggesting the known key it was most likely meant to be
 * @param {SyntaxNode} keyNode - The node of the key
 * @param {String} key - The key
 * @param {Iterable<String>} known - The keys known in its place
 * @param {String} message - The message, to which any suggestion is added
 * @param {LintContext} context - The context
 */
const reportUnknownKey = function (keyNode, key, known, message, context) {
    const meant = nearestWord(key, known);
    const quoted = /^["']/.test(context.read(keyNode.from, keyNode.to));
    const fix = meant ? replacement(keyNode.from + (quoted ? 1 : 0), keyNode.to - (quoted ? 1 : 0), meant, "Change to " + meant) : undefined;
    report(keyNode, "error", (meant ? "Did you mean " + meant + "? " : "") + message, context, fix);
};

/**
 * The Property nodes of an ObjectExpression
 * @param {SyntaxNode} object - The ObjectExpression
 * @return {SyntaxNode[]} Its properties
 */
const propertiesOf = object => object.getChildren("Property");

/**
 * The element nodes of an ArrayExpression
 * @param {SyntaxNode} array - The ArrayExpression
 * @return {SyntaxNode[]} Its elements
 */
const elementsOf = function (array) {
    const togo = [];
    for (let node = array.firstChild; node; node = node.nextSibling) {
        if (!["[", "]", ","].includes(node.name)) {
            togo.push(node);
        }
    }
    return togo;
};

const isStringNode = node => node && (node.name === "String" || node.name === "TemplateString");

// The nodes of literals which are never a layer name nor a layer record - a value computed in code, e.g. a variable
// or a call, cannot be checked, and is passed
const nonLayerLiterals = new Set(["Number", "BooleanLiteral", "RegExp", "ObjectExpression", "ArrayExpression", "null"]);

/**
 * Lint the `$layers` of a record - a layer name, a reference, or an Array of them
 * @param {SyntaxNode} value - The node of its value
 * @param {LintContext} context - The context
 */
const lintLayers = function (value, context) {
    const lintOne = node => {
        if (isStringNode(node)) {
            const name = context.read(node.from + 1, node.to - 1);
            if (name.startsWith("{")) {
                lintStringNode(node, "Value", context);
            } else if (!layerNamePattern.test(name)) {
                report(node, "error", "A layer name is a dotted path of identifiers, e.g. \"fluid.viewComponent\"", context);
            }
        } else if (nonLayerLiterals.has(node.name)) {
            report(node, "error", "$layers holds a layer name, a reference, or an Array of them", context);
        }
    };
    if (value.name === "ArrayExpression") {
        elementsOf(value).forEach(lintOne);
    } else {
        lintOne(value);
    }
};

/**
 * Lint a function record in its full form, `{func, args, ...}` - its keys, and its `func`
 * @param {SyntaxNode} record - The ObjectExpression
 * @param {String} directive - The directive whose record it is, e.g. "$compute"
 * @param {String[]} allowed - The keys it accepts
 * @param {LintContext} context - The context
 */
const lintFuncRecord = function (record, directive, allowed, context) {
    const keys = propertiesOf(record).map(property => keyOf(property, context.read));
    propertiesOf(record).forEach(property => {
        const key = keyOf(property, context.read);
        const value = valueOf(property);
        if (key !== null && !allowed.includes(key)) {
            reportUnknownKey(property.firstChild, key, allowed, "Unknown key \"" + key + "\" of a " + directive + " record - expected one of " + allowed.join(", "), context);
        } else if (key === "func" && value && isStringNode(value)) {
            const func = context.read(value.from + 1, value.to - 1);
            if (func.startsWith("{")) {
                lintStringNode(value, "Value", context);
            } else if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(func)) {
                report(value, "error", "A func is the global name of a function, e.g. \"my.multiply\", a reference to one, or a function", context);
            }
        } else if (value) {
            // eslint-disable-next-line no-use-before-define
            lintMaterial(value, context, key);
        }
    });
    if (!keys.includes("func") && directive !== "$lens" && directive !== "$bindable") {
        report(record, "error", "A " + directive + " record names its function as `func`", context);
    }
};

/**
 * Lint the content of a member directive, e.g. the record within `{$compute: ...}`
 * @param {String} directive - The directive
 * @param {SyntaxNode} value - The node of its content
 * @param {LintContext} context - The context
 */
const lintDirective = function (directive, value, context) {
    const allowed = memberDirectives[directive];
    if (directive === "$component") {
        if (value.name === "ObjectExpression") {
            // eslint-disable-next-line no-use-before-define
            lintRecord(value, componentDirectives, context);
        } else if (value.name !== "null" && nonLayerLiterals.has(value.name)) {
            // null removes the component, e.g. one contributed by another layer
            report(value, "error", "A $component holds a layer record", context);
        }
    } else if (directive === "$linkage") {
        const lintLinkage = linkage => {
            if (linkage.name === "ObjectExpression") {
                propertiesOf(linkage).forEach(property => {
                    const key = keyOf(property, context.read), propValue = valueOf(property);
                    if (!allowed.includes(key)) {
                        reportUnknownKey(property.firstChild, key, allowed, "Unknown key \"" + key + "\" of a $linkage - expected one of " + allowed.join(", "), context);
                    } else if (key === "inputLayers" || key === "outputLayers") {
                        lintLayers(propValue, context);
                    } else if (propValue) {
                        // eslint-disable-next-line no-use-before-define
                        lintMaterial(propValue, context, key);
                    }
                });
            } else {
                report(linkage, "error", "A $linkage holds a record {inputLayers, outputLayers}, or an Array of them", context);
            }
        };
        if (value.name === "ArrayExpression") {
            elementsOf(value).forEach(lintLinkage);
        } else {
            lintLinkage(value);
        }
    } else if (directive === "$lens" || directive === "$bindable") {
        if (value.name === "ObjectExpression") {
            lintFuncRecord(value, directive, allowed, context);
            propertiesOf(value).forEach(property => {
                const key = keyOf(property, context.read), propValue = valueOf(property);
                if (["forward", "backward", "bind", "unbind"].includes(key) && isStringNode(propValue)) {
                    lintStringNode(propValue, "CallBody", context);
                }
            });
            if (directive === "$lens" && !propertiesOf(value).some(property => keyOf(property, context.read) === "source")) {
                report(value, "error", "A $lens names the site it views as its `source`", context);
            }
        } else {
            report(value, "error", "A " + directive + " holds a record of " + allowed.join(", "), context);
        }
    } else if (allowed) {
        if (value.name === "ObjectExpression") {
            lintFuncRecord(value, directive, allowed, context);
        } else if (value.name === "ArrayExpression" && directive === "$effect") {
            elementsOf(value).forEach(element => {
                if (element.name === "ObjectExpression") {
                    lintFuncRecord(element, directive, allowed, context);
                } else {
                    report(element, "error", "A composite $effect is an Array of listener records, each {func, args, namespace, priority}", context);
                }
            });
        } else if (isStringNode(value)) {
            report(value, "error", "A " + directive + " holds a function record {func, args} - or write the compact form \"" +
                directive + ":fn(args)\" as the member's value", context);
        } else if (!["ArrowFunction", "FunctionExpression", "VariableName", "MemberExpression"].includes(value.name)) {
            report(value, "error", "A " + directive + " holds a function record {func, args}", context);
        }
    } else if (value) {
        // eslint-disable-next-line no-use-before-define
        lintMaterial(value, context, null);
    }
};

/**
 * Lint material held at a member of a record, or nested within it - a String of configuration, a directive's record,
 * or plain data whose Strings are themselves configuration
 * @param {SyntaxNode} value - The node of the material
 * @param {LintContext} context - The context
 * @param {String|null} key - The key at which it is held, if any
 */
export const lintMaterial = function (value, context, key) {
    if (isStringNode(value)) {
        lintStringNode(value, topFor(key, context.read(value.from + 1, value.to)), context);
    } else if (value.name === "ObjectExpression") {
        const properties = propertiesOf(value);
        const directives = properties.filter(property => (keyOf(property, context.read) || "").startsWith("$"));
        const isLayerRecord = directives.length > 0 && directives.every(property => componentDirectives.has(keyOf(property, context.read)));
        if (isLayerRecord) {
            // e.g. an element of the source of a $for, merged into each subcomponent through its `layerAs`
            // eslint-disable-next-line no-use-before-define
            lintRecord(value, componentDirectives, context);
        } else if (directives.length > 0) {
            directives.forEach(property => {
                const directive = keyOf(property, context.read);
                const content = valueOf(property);
                if (directive in memberDirectives) {
                    if (directives.length > 1 && property === directives[0]) {
                        report(property.firstChild, "error", "A member's record holds a single directive, but this holds " +
                            directives.map(one => keyOf(one, context.read)).join(", "), context);
                    } else if (content) {
                        lintDirective(directive, content, context);
                    }
                } else if (componentDirectives.has(directive)) {
                    report(property.firstChild, "error", directive + " belongs to a layer record, not beside " +
                        directives.filter(one => one !== property).map(one => keyOf(one, context.read)).join(", "), context);
                } else {
                    reportUnknownKey(property.firstChild, directive, Object.keys(memberDirectives), "Unknown directive " + directive +
                        " - a member's record holds one of " + Object.keys(memberDirectives).join(", "), context);
                }
            });
            const sole = directives.length === 1 ? keyOf(directives[0], context.read) : null;
            properties.filter(property => !directives.includes(property)).forEach(property => {
                const other = keyOf(property, context.read);
                // A $reactiveRoot's record may hold members of the root's value beside it - literals, or references
                if (sole === "$reactiveRoot") {
                    if (valueOf(property)) {
                        lintMaterial(valueOf(property), context, other);
                    }
                } else if (!(sole === "$transient" && other === "dispose")) {
                    report(property.firstChild, "warning", "\"" + other + "\" beside a directive is ignored", context);
                }
            });
        } else {
            properties.forEach(property => {
                const nested = valueOf(property);
                if (nested) {
                    lintMaterial(nested, context, keyOf(property, context.read));
                }
            });
        }
    } else if (value.name === "ArrayExpression") {
        elementsOf(value).forEach(element => lintMaterial(element, context, null));
    }
};

/**
 * Lint a layer record - its directives, and the material of each of its members
 * @param {SyntaxNode} record - The ObjectExpression of the record
 * @param {Set<String>} allowed - The directives it may bear as keys
 * @param {LintContext} context - The context
 */
export const lintRecord = function (record, allowed, context) {
    propertiesOf(record).forEach(property => {
        const key = keyOf(property, context.read);
        const value = valueOf(property);
        if (key !== null && key.startsWith("$")) {
            if (!allowed.has(key)) {
                const hint = key in memberDirectives ? " - it is the single key of a member's record, e.g. area: {" + key + ": ...}" :
                    componentDirectives.has(key) ? " - it belongs to the record of a $component" : "";
                if (key in memberDirectives || componentDirectives.has(key)) {
                    report(property.firstChild, "error", key + " is not a directive of a layer record" + hint, context);
                } else {
                    reportUnknownKey(property.firstChild, key, [...allowed],
                        "Unknown directive " + key + " in a layer record - a layer record's directives are " + [...allowed].join(", "), context);
                }
            } else if (key === "$layers" && value) {
                lintLayers(value, context);
            } else if (key === "$for" && value) {
                if (value.name === "ObjectExpression") {
                    propertiesOf(value).forEach(forProperty => {
                        const forKey = keyOf(forProperty, context.read);
                        if (!forKeys.includes(forKey)) {
                            reportUnknownKey(forProperty.firstChild, forKey, forKeys, "Unknown key \"" + forKey + "\" of $for - expected one of " + forKeys.join(", "), context);
                        } else if (valueOf(forProperty)) {
                            lintMaterial(valueOf(forProperty), context, forKey);
                        }
                    });
                    if (!propertiesOf(value).some(forProperty => keyOf(forProperty, context.read) === "source")) {
                        report(value, "error", "A $for names the collection it iterates as its `source`", context);
                    }
                } else {
                    report(value, "error", "A $for holds a record {" + forKeys.join(", ") + "}", context);
                }
            } else if (value) {
                lintMaterial(value, context, key);
            }
        } else if (value) {
            lintMaterial(value, context, key);
        }
    });
};

const closerOf = {"{": "}", "(": ")", "[": "]"};

/**
 * Scan JavaScript up to a position, passing over its Strings, template literals and comments, for the brackets left
 * open, and any String left unterminated at the end of its line
 * @param {String} text - The JavaScript
 * @param {Number} pos - The position
 * @return {Object} The scan, as {stack, unterminated} - the open brackets, outermost first, each as {bracket, pos},
 * and the position of the first unterminated String's quote, or -1
 */
const scanJs = function (text, pos) {
    const stack = [];
    let unterminated = -1;
    let i = 0;
    while (i < pos) {
        const c = text[i];
        if (c === "\"" || c === "'" || c === "`") {
            let j = i + 1;
            while (j < text.length && text[j] !== c && !(c !== "`" && text[j] === "\n")) {
                j += text[j] === "\\" ? 2 : 1;
            }
            if (text[j] !== c && unterminated === -1) {
                unterminated = i;
            }
            i = j + 1;
        } else if (c === "/" && text[i + 1] === "/") {
            const end = text.indexOf("\n", i);
            i = end === -1 ? pos : end + 1;
        } else if (c === "/" && text[i + 1] === "*") {
            const end = text.indexOf("*/", i + 2);
            i = end === -1 ? pos : end + 2;
        } else {
            if (closerOf[c]) {
                stack.push({bracket: c, pos: i});
            } else if (c === "}" || c === ")" || c === "]") {
                if (stack.length > 0 && closerOf[stack[stack.length - 1].bracket] === c) {
                    stack.pop();
                }
            }
            ++i;
        }
    }
    return {stack, unterminated};
};

/**
 * Find the brackets left open before a position in JavaScript
 * @param {String} text - The JavaScript
 * @param {Number} pos - The position
 * @return {Object[]} The open brackets, outermost first, each as {bracket, pos}
 */
const openBrackets = (text, pos) => scanJs(text, pos).stack;

/**
 * Determine whether a brace of JavaScript opens an object, rather than a block - by what precedes it
 * @param {String} text - The JavaScript
 * @param {Number} pos - The position of the brace
 * @return {Boolean} `true` if it opens an object
 */
const opensObject = function (text, pos) {
    const before = text.slice(0, pos).replace(/\s+$/, "");
    return /[(,:[=?]$/.test(before) || /\breturn$/.test(before) || before === "";
};

/**
 * Describe a syntax error of JavaScript, by the brackets open at it and the text around it, proposing a fix where
 * one is clear
 * @param {String} text - The JavaScript
 * @param {Number} pos - The position of the error
 * @param {Number} end - The end of the error
 * @param {Function} lineOf - Gives the line, as the user sees it, of a position
 * @return {Object} The description, as {message, fix}
 */
const describeJsError = function (text, pos, end, lineOf) {
    const at = text[pos];
    const {stack, unterminated} = scanJs(text, text.length);
    const open = openBrackets(text, pos);
    const innermost = open[open.length - 1];
    const before = text.slice(0, pos).replace(/\s+$/, "");
    const prev = before.slice(-1);
    const token = (text.slice(pos, end).trim() || (/^\s*(\S+)/.exec(text.slice(pos)) || [])[1] || "").slice(0, 24);
    const inObject = innermost && innermost.bracket === "{" && opensObject(text, innermost.pos);
    let message, fix;
    if (unterminated !== -1 && unterminated < pos + 1 + (at === undefined ? 1 : 0) && lineOf(unterminated) <= lineOf(pos)) {
        const quote = text[unterminated];
        const word = /^[^\s,;)}\]]*/.exec(text.slice(unterminated + 1))[0];
        message = "Syntax error - the String begun with " + quote + " on line " + lineOf(unterminated) + " is not closed before the end of its line";
        fix = insertion(unterminated + 1 + word.length, quote, "Close the String");
    } else if ((at === "}" || at === ")" || at === "]") && !innermost) {
        message = "Syntax error - this \"" + at + "\" closes no bracket";
        fix = replacement(pos, pos + 1, "", "Remove the \"" + at + "\"");
    } else if ((at === "}" || at === ")" || at === "]") && closerOf[innermost.bracket] !== at) {
        message = "Syntax error - expected \"" + closerOf[innermost.bracket] + "\" to close the \"" + innermost.bracket +
            "\" on line " + lineOf(innermost.pos) + " before this \"" + at + "\"";
        fix = insertion(pos, closerOf[innermost.bracket]);
    } else if (innermost && innermost.bracket !== "{" && at === ":" && lineOf(innermost.pos) < lineOf(pos)) {
        // A member's key within brackets, e.g. after a "(" left open on an earlier line
        message = "Syntax error - the \"" + innermost.bracket + "\" on line " + lineOf(innermost.pos) +
            " is not closed before this member";
    } else if (innermost && innermost.bracket === "(" && at === "{" && /[\w$)\]]$/.test(before)) {
        message = "Syntax error - expected \")\" to close the \"(\" on line " + lineOf(innermost.pos) + " before this \"{\"";
        fix = insertion(before.length, ")");
    } else if (text.slice(pos).trim() === "" && stack.length > 0) {
        const last = stack[stack.length - 1];
        message = "Syntax error - the \"" + last.bracket + "\" on line " + lineOf(last.pos) + " is never closed";
        fix = insertion(text.replace(/\s+$/, "").length, stack.slice().reverse().map(one => closerOf[one.bracket]).join(""),
            "Close " + (stack.length > 1 ? "the brackets left open" : "the \"" + last.bracket + "\""));
    } else if (inObject && at === "." && /[\w$]$/.test(before)) {
        const key = /[\w$.]*$/.exec(before)[0] + /^[\w$.]*/.exec(text.slice(pos))[0];
        const from = before.length - /[\w$]*$/.exec(before)[0].length;
        message = "Syntax error - a key of an object is a name, or a String - quote a dotted key, e.g. \"" + key + "\"";
        fix = replacement(from, from + key.length, "\"" + key + "\"", "Quote the key");
    } else if (at === "=" && prev === "=" && text[pos - 2] !== "=") {
        message = "Syntax error - \"==\" compares values; a declaration or assignment writes \"=\"";
        fix = replacement(pos - 1, pos + 1, "=", "Write \"=\"");
    } else if (/[-+*/%=<>&|!?:.,^~]$/.test(prev) && prev !== "," || prev === "," && !innermost) {
        message = "Syntax error - the expression ending in \"" + prev + "\" is incomplete" + (token ? " before \"" + token + "\"" : "");
    } else if (/^(const|let|var)$/.test(/[\w$]+$/.exec(before)?.[0] || "")) {
        message = "Syntax error - a declaration names its variable, e.g. const name = value";
    } else if (token) {
        message = "Syntax error - unexpected \"" + token + "\"" + (inObject ? " - the members of an object are written key: value, separated by \",\"" : "");
    } else {
        message = "Syntax error - something is missing here";
    }
    return {message, fix};
};

/**
 * Report the syntax errors of a tree of JavaScript or HTML. Errors which recovery leaves one after another are
 * reported as one
 * @param {Tree} tree - The tree
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 * @param {Number} length - The length of the text parsed
 * @param {Function} [describe] - Describes an error at a position, up to an end, as {message, fix} - by default, as
 * "Syntax error"
 */
const reportSyntaxErrors = function (tree, diagnostics, length, describe) {
    let last = null;
    tree.iterate({
        enter: ref => {
            if (ref.type.isError) {
                const to = Math.min(length, Math.max(ref.to, ref.from + 1));
                if (last && ref.from <= last.to + 1) {
                    last.to = Math.max(last.to, to);
                } else {
                    const {message, fix} = describe ? describe(ref.from, to) : {message: "Syntax error"};
                    last = {from: ref.from, to, severity: "error", message};
                    if (fix) {
                        last.fix = fix;
                    }
                    diagnostics.push(last);
                }
            }
        }
    });
};

/**
 * Find the position of the first error of a tree
 * @param {Tree} tree - The tree
 * @return {Number} Its position, or -1 if it has none
 */
const firstError = function (tree) {
    let found = -1;
    tree.iterate({
        enter: ref => {
            if (found === -1 && ref.type.isError) {
                found = ref.from;
            }
            return found === -1;
        }
    });
    return found;
};

/**
 * Propose the repairs of a syntax error of JavaScript which leave every position as it was, each replacing one
 * character - a comma missing between members, elements or arguments, written over the whitespace before the error;
 * a ";" written for "," between members of an object; or a "=" written for ":"
 * @param {String} text - The JavaScript
 * @param {Number} error - The position of the error
 * @return {Object[]} The repairs, each as {at, insert, from, to, message, label} - the character replaced and its
 * replacement, the range reported, and the diagnostic's message and its fix's label
 */
const proposeRepairs = function (text, error) {
    const togo = [];
    const open = openBrackets(text, error);
    const innermost = open[open.length - 1];
    if (innermost) {
        const inObject = innermost.bracket === "{" && opensObject(text, innermost.pos);
        const before = text.slice(0, error);
        const gap = /(\S)(\s+)$/.exec(before);
        // Within the parameters of a function, a missing ")" is likelier than a missing ","
        const params = innermost.bracket === "(" && /\bfunction\s*[\w$]*\s*$/.test(text.slice(0, innermost.pos));
        if (gap && !params && (innermost.bracket !== "{" || inObject) && !/[,{[(:;=]/.test(gap[1])) {
            const at = error - gap[2].length;
            const between = innermost.bracket === "{" ? "members of an object" : innermost.bracket === "[" ? "elements of an array" : "arguments of a call";
            togo.push({at, insert: ",", from: at - 1, to: at, message: "Syntax error - expected \",\" between the " + between, label: "Insert \",\""});
        }
        const semicolon = before.replace(/\s+$/, "").length;
        if (inObject && text[error] === ";") {
            togo.push({at: error, insert: ",", from: error, to: error + 1,
                message: "Syntax error - the members of an object are separated by \",\", not \";\"", label: "Replace \";\" with \",\""});
        } else if (inObject && text[semicolon - 1] === ";") {
            togo.push({at: semicolon - 1, insert: ",", from: semicolon - 1, to: semicolon,
                message: "Syntax error - the members of an object are separated by \",\", not \";\"", label: "Replace \";\" with \",\""});
        }
        // The object holding a "=", which is either open at the error, or closed just before it, e.g. {a = 1}
        const trimmed = before.replace(/\s+$/, "");
        const closedJustBefore = trimmed.endsWith("}") ? openBrackets(text, trimmed.length - 1).pop() : null;
        const object = inObject ? {from: innermost.pos, to: error + 1} :
            closedJustBefore && opensObject(text, closedJustBefore.pos) ? {from: closedJustBefore.pos, to: trimmed.length} : null;
        if (object) {
            const member = /[{,]\s*([\w$]+|"[^"]*"|'[^']*')\s*(=)(?![=>])[^,]*$/.exec(text.slice(object.from, object.to).replace(/}$/, ""));
            if (member) {
                const at = object.from + member.index + member[0].indexOf("=", member[0].indexOf(member[1]) + member[1].length);
                togo.push({at, insert: ":", from: at, to: at + 1,
                    message: "Syntax error - the members of an object are written key: value, not key = value", label: "Replace \"=\" with \":\""});
            }
        }
    }
    return togo;
};

/**
 * Repair JavaScript's slips of a single character, each found at an error - see `proposeRepairs` - so that one slip
 * does not leave the rest of a record unread. A repair is kept only if the next error is then found later. Each is
 * reported, proposing itself as the fix
 * @param {String} text - The JavaScript
 * @param {Tree} tree - Its tree
 * @param {Diagnostic[]} diagnostics - Receives a diagnostic of each repair
 * @return {Object} The repaired text and its tree, as {text, tree}
 */
const repairJs = function (text, tree, diagnostics) {
    let current = {text, tree};
    let error = firstError(tree);
    let attempts = 0;
    while (error > 0 && attempts < 32) {
        ++attempts;
        let accepted = null;
        proposeRepairs(current.text, error).forEach(repair => {
            if (!accepted) {
                const text = current.text.slice(0, repair.at) + repair.insert + current.text.slice(repair.at + 1);
                const tree = jsParser.parse(text);
                const next = firstError(tree);
                if (next === -1 || next > error) {
                    accepted = {text, tree, next};
                    // A ":" written for "=" takes the place of any space before it, e.g. "a = 1" becoming "a: 1"
                    const spaced = repair.insert === ":" ? /[ \t]*$/.exec(current.text.slice(0, repair.at))[0].length : 0;
                    diagnostics.push({from: repair.from, to: repair.to, severity: "error", message: repair.message,
                        fix: repair.insert === "," && current.text[repair.at] !== ";" ? insertion(repair.at, ",") :
                            replacement(repair.at - spaced, repair.at + 1, repair.insert, repair.label)});
                }
            }
        });
        if (accepted) {
            current = {text: accepted.text, tree: accepted.tree};
            error = accepted.next;
        } else {
            error = -1;
        }
    }
    return current;
};

/**
 * Lint JavaScript which has been parsed - its syntax, and each layer record written to fluid.def
 * @param {Tree} original - The tree, parsed by @lezer/javascript
 * @param {String} source - The text parsed
 * @param {Number} offset - The position of the text within any larger document
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 * @param {Number} lineBase - The number of lines of any larger document before the text, less any lines wrapping it
 */
const lintJsTree = function (original, source, offset, diagnostics, lineBase) {
    const own = [];
    const {text, tree} = repairJs(source, original, own);
    const lineOf = pos => lineBase + text.slice(0, pos).split("\n").length;
    reportSyntaxErrors(tree, own, text.length, (pos, end) => describeJsError(text, pos, end, lineOf));
    const context = {read: (from, to) => text.slice(from, to), diagnostics: own};
    tree.iterate({
        enter: ref => {
            if (ref.name === "CallExpression" && isDefCall(ref.node, context.read)) {
                const [name, record] = argsOf(ref.node);
                if (name && isStringNode(name)) {
                    const layerName = context.read(name.from + 1, name.to - 1);
                    if (!layerNamePattern.test(layerName)) {
                        report(name, "error", "A layer name is a dotted path of identifiers, e.g. \"my.widget\"", context);
                    }
                }
                if (record && record.name === "ObjectExpression") {
                    lintRecord(record, recordDirectives, context);
                } else if (record && ["String", "TemplateString", "Number", "ArrayExpression", "BooleanLiteral"].includes(record.name)) {
                    // A record computed elsewhere, e.g. fluid.def(name, source.def), is not linted
                    report(record, "error", "fluid.def's second argument is a layer record, written as an object", context);
                }
            }
        }
    });
    own.forEach(diagnostic => diagnostics.push(shiftDiagnostic(diagnostic, offset)));
};

// What a fragment of a layer record is wrapped in, so that it is linted as a record - see `lintFragment`
const fragmentHead = "fluid.def(\"fragment\", {\n", fragmentTail = "\n});";

/**
 * Determine whether JavaScript parses without error
 * @param {String} text - The JavaScript
 * @return {Number} The number of its error nodes
 */
const errorCount = function (text) {
    let count = 0;
    jsParser.parse(text).iterate({
        enter: ref => {
            if (ref.type.isError) {
                ++count;
            }
        }
    });
    return count;
};

/**
 * Determine whether JavaScript is a fragment of a layer record, e.g. `view: {$component: {...}}`, such as the examples
 * of documentation show - a text which parses better within a record than alone, or which begins, after any comments,
 * with a member written as a labelled statement
 * @param {String} text - The JavaScript
 * @return {Boolean} `true` if it is a fragment of a record
 */
export const isFragment = function (text) {
    const alone = errorCount(text);
    // A fragment `member: {...}` parses alone as a labelled statement, but is meant as a member of a record
    let first = jsParser.parse(text).topNode.firstChild;
    while (first && first.name === "LineComment" || first && first.name === "BlockComment") {
        first = first.nextSibling;
    }
    const labelled = !!first && first.name === "LabeledStatement";
    // A text beginning with a member is a fragment even if it holds a slip, which parses alone as statements
    return labelled || alone > 0 && errorCount(fragmentHead + text + fragmentTail) <= alone;
};

/**
 * Lint JavaScript - a script, or a fragment of a layer record, e.g. `view: {$component: {...}}`, such as the examples
 * of documentation show. A text which parses better within a record than alone is linted as a fragment of one
 * @param {String} text - The JavaScript
 * @param {Number} [offset] - The position of the text within any larger document
 * @param {Diagnostic[]} [diagnostics] - Receives the diagnostics
 * @param {Number} [lineBase] - The number of lines of any larger document before the text
 * @return {Diagnostic[]} The diagnostics
 */
export const lintJs = function (text, offset = 0, diagnostics = [], lineBase = 0) {
    const wrapped = fragmentHead + text + fragmentTail;
    if (isFragment(text)) {
        const own = [];
        lintJsTree(jsParser.parse(wrapped), wrapped, -fragmentHead.length, own, lineBase - fragmentHead.split("\n").length + 1);
        own.filter(diagnostic => diagnostic.from >= 0 && diagnostic.from <= text.length)
            .map(diagnostic => diagnostic.fix && diagnostic.fix.changes.some(change => change.from < 0 || change.to > text.length) ?
                {...diagnostic, fix: undefined} : diagnostic)
            .forEach(diagnostic => diagnostics.push(shiftDiagnostic(diagnostic, offset, text.length)));
    } else {
        lintJsTree(jsParser.parse(text), text, offset, diagnostics, lineBase);
    }
    return diagnostics;
};

// Elements whose close tag HTML implies, by what follows them, and void elements, which have none
const impliedCloseTags = new Set(["p", "li", "dt", "dd", "option", "optgroup", "tr", "td", "th", "thead", "tbody", "tfoot",
    "colgroup", "rp", "rt", "caption"]);
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// Elements of HTML which are obsolete, and are styled instead with CSS
const obsoleteTags = new Set(["center", "font", "big", "strike", "tt", "marquee", "blink", "frame", "frameset"]);

/**
 * Lint the markup of a template - its elements' structure, reported as errors: a close tag which closes no open
 * element, and an element left open which HTML does not close by itself - and, if `style` is set, stylistic warnings:
 * an image with no alternative text, and an obsolete element
 * @param {SyntaxNode} node - The node of the template's element, whose descendants are linted
 * @param {String} text - The whole text parsed
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 * @param {Boolean} style - Whether to report stylistic warnings
 */
export const lintMarkup = function (node, text, diagnostics, style) {
    const tagOf = element => {
        const open = element.firstChild;
        const name = open && open.getChild("TagName");
        return name ? text.slice(name.from, name.to).toLowerCase() : null;
    };
    const visit = parent => {
        for (let child = parent.firstChild; child; child = child.nextSibling) {
            if (child.name === "MismatchedCloseTag") {
                diagnostics.push({from: child.from, to: child.to, severity: "error",
                    message: "Syntax error - this close tag closes no element open here"});
            } else if (child.name === "Element") {
                const tag = tagOf(child);
                const open = child.firstChild;
                const closed = child.lastChild && child.lastChild.name === "CloseTag";
                if (open && open.name === "OpenTag" && !closed && tag && !impliedCloseTags.has(tag) && !voidTags.has(tag)) {
                    diagnostics.push({from: open.from, to: open.to, severity: "error",
                        message: "Syntax error - <" + tag + "> is never closed"});
                }
                lintDirectiveAttributes(open, text, diagnostics);
                if (style && tag === "img" && !open.getChildren("Attribute").some(attr => {
                    const name = attr.getChild("AttributeName");
                    return name && text.slice(name.from, name.to) === "alt";
                })) {
                    diagnostics.push({from: open.from, to: open.to, severity: "warning",
                        message: "An image should have an alt attribute, describing it to those who can't see it"});
                }
                if (style && obsoleteTags.has(tag)) {
                    diagnostics.push({from: open.from, to: open.to, severity: "warning",
                        message: "<" + tag + "> is obsolete - style the element with CSS instead"});
                }
                visit(child);
            }
        }
    };
    visit(node);
};

// The attributes of a template's markup which Infusion's renderer reads as directives - any other beginning with "@" is
// dropped unread. Event bindings, "@on" followed by the event's name, are linted by lintEventBindings
const directiveAttributes = new Set(["@id", "@if", "@else", "@class", "@relative"]);

/**
 * Report each attribute of an open tag which begins with "@" but which the renderer reads as no directive, e.g. "@edward"
 * or "@iff" - an error, since the renderer drops it without a word
 * @param {SyntaxNode} open - The OpenTag or SelfClosingTag
 * @param {String} text - The whole text parsed
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
const lintDirectiveAttributes = function (open, text, diagnostics) {
    open.getChildren("Attribute").forEach(attr => {
        const nameNode = attr.getChild("AttributeName");
        const name = nameNode ? text.slice(nameNode.from, nameNode.to) : "";
        if (name.startsWith("@") && !directiveAttributes.has(name) && !/^@on[\w.-]+$/.test(name)) {
            const meant = nearestWord(name, [...directiveAttributes, "@onclick", "@onchange", "@oninput", "@onkeydown"]);
            const diagnostic = {from: nameNode.from, to: nameNode.to, severity: "error",
                message: "Unknown directive " + name + (meant ? " - did you mean " + meant + "?" : " -") + " The renderer reads " +
                    [...directiveAttributes].join(", ") + " and event bindings \"@on\" + the event's name, e.g. @onclick, " +
                    "and drops any other attribute beginning with \"@\""};
            if (meant) {
                diagnostic.fix = replacement(nameNode.from, nameNode.to, meant, "Change to " + meant);
            }
            diagnostics.push(diagnostic);
        }
    });
};

/**
 * The ancestor of a node, or the node itself, of a given name
 * @param {SyntaxNode} node - The node
 * @param {String} name - The name sought
 * @return {SyntaxNode|null} The nearest such node, or `null` if there is none
 */
const enclosing = function (node, name) {
    let togo = node;
    while (togo && togo.name !== name) {
        togo = togo.parent;
    }
    return togo;
};

/**
 * Describe a syntax error of CSS from where @lezer/css found it. Its grammar admits nested rules, so that a declaration
 * written wrongly within a rule, e.g. `colr red` or `color: red background: blue`, is read as a nested rule's selector
 * which lacks its block - which is reported as the declaration it was meant to be
 * @param {SyntaxNode} error - The error node
 * @param {String} text - The CSS
 * @return {Object} The diagnostic's `from`, `to`, `message` and any `fix`
 */
const describeCssError = function (error, text) {
    const rule = enclosing(error, "RuleSet");
    const nested = rule && !rule.getChild("Block") && rule.parent && rule.parent.name === "Block";
    const unexpected = error.to > error.from ? "\"" + text.slice(error.from, error.to) + "\"" : "the end of the CSS";
    let togo = {from: error.from, to: error.to, message: "Syntax error - unexpected " + unexpected};
    if (nested) {
        // A declaration read as a nested rule - its extent runs to the ";" which the selector swallowed, if any
        const end = text.indexOf(";", rule.from);
        const to = end === -1 || end > rule.to ? rule.to : end;
        const written = text.slice(rule.from, to).trim();
        const colons = (written.match(/:/g) || []).length;
        const property = /^[\w-]+/.exec(written);
        togo = {from: rule.from, to: rule.from + text.slice(rule.from, to).trimEnd().length};
        if (colons === 0 && property) {
            togo.message = "Syntax error - expected \":\" after the property \"" + property[0] + "\", e.g. \"" + property[0] + ": value;\"";
            togo.fix = insertion(rule.from + property[0].length, ":");
        } else if (colons === 0 || written.startsWith(":")) {
            togo.message = "Syntax error - a declaration is written \"property: value;\"";
        } else {
            togo.message = "Syntax error - expected \";\" between declarations - \"" + written + "\" holds more than one";
        }
    } else if (rule && !rule.getChild("Block") && rule.parent && rule.parent.name === "StyleSheet" && /:/.test(text.slice(rule.from, rule.to))) {
        togo = {from: rule.from, to: rule.to, message: "Syntax error - this rule has no \"{\" opening its declarations"};
    } else if (error.parent.name === "StyleSheet" && text.slice(error.from, error.to) === "}") {
        togo.message = "Syntax error - this \"}\" closes no rule";
        togo.fix = replacement(error.from, error.to, "", "Remove the \"}\"");
    } else if (error.parent.name === "Block" && error.to >= text.trimEnd().length) {
        togo = {from: enclosing(error, "Block").from, to: enclosing(error, "Block").from + 1,
            message: "Syntax error - this \"{\" is never closed", fix: insertion(text.trimEnd().length, "\n}")};
    } else if (error.prevSibling && error.prevSibling.name === "," && error.nextSibling && error.nextSibling.name === "Block") {
        togo = {from: error.prevSibling.from, to: error.prevSibling.to, message: "Syntax error - the list of selectors ends with a comma",
            fix: replacement(error.prevSibling.from, error.prevSibling.to, "", "Remove the comma")};
    } else if (error.parent.name === "ArgList") {
        const call = error.parent.parent, callee = call && call.getChild("Callee");
        togo.message = "Syntax error - the \"(\" of " + (callee ? text.slice(callee.from, callee.to) + "(...)" : "this call") + " is never closed";
        togo.fix = insertion(error.from, ")");
    } else if (enclosing(error, "Declaration")) {
        const declaration = enclosing(error, "Declaration"), name = declaration.getChild("PropertyName");
        const bad = text.slice(error.from, error.to);
        const value = name ? "the value of \"" + text.slice(name.from, name.to) + "\"" : "this value";
        togo.message = /^#/.test(bad) ? "Syntax error - \"" + bad + "\" in " + value + " is no colour - one is written with 3, 4, 6 or 8 hex digits, e.g. #c0ffee" :
            /^["']/.test(bad) ? "Syntax error - a String in " + value + " is never closed" :
                "Syntax error - unexpected " + unexpected + " in " + value;
    }
    return togo;
};

/**
 * Report the syntax errors of CSS, each described as `describeCssError` describes it - a run of errors within one
 * extent being reported once
 * @param {Tree} tree - The CSS's parse by @lezer/css
 * @param {String} text - The CSS
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 */
const reportCssErrors = function (tree, text, diagnostics) {
    let last = null;
    tree.iterate({
        enter: ref => {
            if (ref.type.isError) {
                const described = describeCssError(ref.node, text);
                const from = Math.min(described.from, text.length), to = Math.min(text.length, Math.max(described.to, from + 1));
                if (last && from <= last.to + 1) {
                    last.to = Math.max(last.to, to);
                } else {
                    last = {from: Math.min(from, Math.max(0, text.length - 1)), to, severity: "error", message: described.message};
                    if (described.fix) {
                        last.fix = described.fix;
                    }
                    diagnostics.push(last);
                }
            }
        }
    });
};

/**
 * Lint CSS - syntax errors, and, if `style` is set, stylistic warnings: an empty rule, a property declared twice in one
 * rule, and `!important`
 * @param {String} text - The CSS
 * @param {Number} offset - The position of the text within any larger document
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 * @param {Boolean} style - Whether to report stylistic warnings
 * @return {Diagnostic[]} The diagnostics
 */
export const lintCss = function (text, offset = 0, diagnostics = [], style = false) {
    const tree = cssParser.parse(text);
    const own = [];
    reportCssErrors(tree, text, own);
    if (style) {
        tree.iterate({
            enter: ref => {
                if (ref.name === "Block" && ref.node.parent && ref.node.parent.name === "RuleSet") {
                    const declarations = ref.node.getChildren("Declaration");
                    if (declarations.length === 0 && !ref.node.getChild("RuleSet")) {
                        own.push({from: ref.from, to: ref.to, severity: "warning", message: "An empty rule"});
                    }
                    const seen = new Set();
                    declarations.forEach(declaration => {
                        const name = declaration.getChild("PropertyName");
                        const property = name ? text.slice(name.from, name.to) : null;
                        if (property && seen.has(property)) {
                            own.push({from: name.from, to: name.to, severity: "warning",
                                message: "\"" + property + "\" is declared again in this rule, overriding the first"});
                        }
                        seen.add(property);
                    });
                } else if (ref.name === "Important") {
                    own.push({from: ref.from, to: ref.to, severity: "warning",
                        message: "!important overrides the cascade - prefer a more specific selector"});
                }
            }
        });
    }
    own.forEach(diagnostic => diagnostics.push({...diagnostic, from: diagnostic.from + offset, to: diagnostic.to + offset}));
    return diagnostics;
};

/**
 * Report the stylistic warnings of JavaScript, by Infusion's own style: a String in single quotes, a loose comparison,
 * a declaration by `var`, the body of an `if` or `else` written without braces, a statement without its semicolon and a
 * superfluous trailing comma
 * @param {String} text - The JavaScript
 * @param {Number} offset - The position of the text within any larger document
 * @param {Diagnostic[]} diagnostics - Receives the diagnostics
 * @return {Diagnostic[]} The diagnostics
 */
// The statements which end with a semicolon, and the nodes which hold statements - a statement elsewhere, e.g. the
// declaration in the head of a for loop, is terminated by its holder
const terminatedStatements = new Set(["ExpressionStatement", "VariableDeclaration", "ReturnStatement", "BreakStatement",
    "ContinueStatement", "ThrowStatement", "DebuggerStatement", "ImportDeclaration", "ExportDeclaration", "DoStatement"]);
const statementParents = new Set(["Script", "Block", "SwitchBody", "IfStatement", "LabeledStatement"]);

export const lintJsStyle = function (text, offset = 0, diagnostics = []) {
    const fragment = isFragment(text);
    const source = fragment ? fragmentHead + text + fragmentTail : text;
    const shift = fragment ? -fragmentHead.length : 0;
    const own = [];
    jsParser.parse(source).iterate({
        enter: ref => {
            const slice = source.slice(ref.from, ref.to);
            if (ref.name === "String" && slice.startsWith("'")) {
                own.push({from: ref.from, to: ref.to, severity: "warning", message: "Strings are written in double quotes"});
            } else if (ref.name === "CompareOp" && (slice === "==" || slice === "!=")) {
                own.push({from: ref.from, to: ref.to, severity: "warning", message: "Compare with " + slice + "= rather than " + slice});
            } else if (ref.name === "var") {
                own.push({from: ref.from, to: ref.to, severity: "warning", message: "Declare with const or let rather than var"});
            } else if (terminatedStatements.has(ref.name) && statementParents.has(ref.node.parent && ref.node.parent.name) &&
                !(ref.node.lastChild && ref.node.lastChild.name === ";") && !(ref.name === "ExportDeclaration" && /^export\s+(default\s+)?(async\s+)?(function|class)\b/.test(slice))) {
                own.push({from: ref.to - 1, to: ref.to, severity: "warning", message: "A statement ends with a semicolon",
                    fix: insertion(ref.to + shift + offset, ";")});
            } else if (ref.name === "ArgList" || ref.name === "ArrayExpression" || ref.name === "ObjectExpression") {
                const close = ref.node.lastChild, last = close && close.prevSibling;
                if (last && last.name === "," && close.to - close.from === 1) {
                    own.push({from: last.from, to: last.to, severity: "warning", message: "A superfluous trailing comma",
                        fix: replacement(last.from + shift + offset, last.to + shift + offset, "", "Remove the comma")});
                }
            }
            if (ref.name === "IfStatement") {
                for (let child = ref.node.firstChild; child; child = child.nextSibling) {
                    const body = child.name === "ParenthesizedExpression" || child.name === "else" ? child.nextSibling : null;
                    if (body && body.name !== "Block" && body.name !== "IfStatement") {
                        own.push({from: body.from, to: body.to, severity: "warning",
                            message: "The body of an if or else is written as a block, within braces"});
                    }
                }
            }
        }
    });
    own.filter(diagnostic => diagnostic.from + shift >= 0 && diagnostic.from + shift <= text.length)
        .forEach(diagnostic => diagnostics.push({...diagnostic, from: diagnostic.from + shift + offset, to: diagnostic.to + shift + offset}));
    return diagnostics;
};

/**
 * Lint a Single File Component - the JavaScript of each <script> not loaded from elsewhere, the interpolations and
 * markup of its <template>, and the CSS of each <style>
 * @param {String} text - The SFC
 * @param {Diagnostic[]} [diagnostics] - Receives the diagnostics
 * @param {LintOptions} [options] - Options - see `lint`
 * @return {Diagnostic[]} The diagnostics
 */
export const lintSfc = function (text, diagnostics = [], options = {}) {
    const tree = sfcHtmlParser.parse(text);
    reportSyntaxErrors(tree, diagnostics, text.length);
    tree.iterate({
        enter: ref => {
            const element = ref.name === "ScriptText" ? ref.node.parent : null;
            // Only a <script> at the top level of the SFC is its JavaScript - one within its template is markup
            const styleElement = ref.name === "StyleText" ? ref.node.parent : null;
            if (element && element.parent && element.parent.name === "Document") {
                lintJs(text.slice(ref.from, ref.to), ref.from, diagnostics, text.slice(0, ref.from).split("\n").length - 1);
                if (options.style) {
                    lintJsStyle(text.slice(ref.from, ref.to), ref.from, diagnostics);
                }
            } else if (styleElement && styleElement.parent && styleElement.parent.name === "Document") {
                lintCss(text.slice(ref.from, ref.to), ref.from, diagnostics, !!options.style);
            } else if (ref.name === "Element" && ref.node.parent && ref.node.parent.name === "Document") {
                const open = ref.node.firstChild, close = ref.node.lastChild;
                const tagName = open && open.getChild("TagName");
                if (tagName && text.slice(tagName.from, tagName.to) === "template" && close && close.name === "CloseTag") {
                    lintRunes(text.slice(open.to, close.from), open.to, "Template", diagnostics);
                    lintMarkup(ref.node, text, diagnostics, !!options.style);
                }
            }
        }
    });
    return diagnostics;
};

/**
 * @typedef {Object} LintOptions
 * @property {Boolean} [style] - Whether to report stylistic warnings beside errors - see `lintJsStyle`, `lintCss` and
 * `lintMarkup`. Editors report them, shown apart from errors, and the ESLint plugin leaves them to ESLint's own rules
 */

/**
 * Lint a text of Infusion - JavaScript, or a Single File Component. Errors are what would fail - syntax, and records
 * Infusion can't read - and warnings what would work, but is better written otherwise
 * @param {String} text - The text
 * @param {String} [kind] - "js" or "vue" - by default, "vue" for a text beginning with "<", and otherwise "js"
 * @param {LintOptions} [options] - Options
 * @return {Diagnostic[]} The diagnostics, in order of position
 */
export const lint = function (text, kind, options = {}) {
    const resolved = kind || (/^\s*</.test(text) ? "vue" : "js");
    const diagnostics = resolved === "vue" ? lintSfc(text, [], options) : lintJs(text);
    if (resolved !== "vue" && options.style) {
        lintJsStyle(text, 0, diagnostics);
    }
    return diagnostics.sort((a, b) => a.from - b.from || a.to - b.to);
};
