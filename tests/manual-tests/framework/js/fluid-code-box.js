/* eslint-env browser */
/* global globalThis */
"use strict";
/**
 * Counter used to mint unique global keys for per-run console shims so that
 * the user's source can resolve `console` to a local shim without us ever
 * touching the real global console.
 */
let shimCounter = 0;
/**
 * Markup for the copy-to-clipboard button shown at the top-right of each
 * textarea. The FontAwesome "clone" glyph requires the host page to have
 * FontAwesome loaded.
 */
const copyIconMarkup = `
<button type="button" class="fluid-code-box-copy"
        aria-label="Copy code to clipboard" title="Copy to clipboard">
    <i class="fa fa-clone" aria-hidden="true"></i>
</button>
`;
/**
 * Markup for the two-column wrapper: editor side (positioned frame holding
 * the textarea + copy icon, plus the Run button below) and results side
 * (header + output panel).
 */
const layoutMarkup = `
<div class="fluid-code-box-wrapper">
    <div class="fluid-code-box-editor">
        <div class="fluid-code-box-editor-frame"></div>
        <button type="button" class="fluid-code-box-run">Run it</button>
    </div>
    <div class="fluid-code-box-results">
        <div class="fluid-code-box-results-header">Results</div>
        <div class="fluid-code-box-results-panel"></div>
    </div>
</div>
`;
/**
 * Format a single console argument into a String for display.
 * @param {*} value - The value passed to a console method - may be a string, an Error, or any other JS value.
 * @return {String}   A human-readable representation of the value, suitable for insertion as DOM text.
 */
function formatArg(value) {
    if (typeof value === "string") {
        return value;
    } else if (value instanceof Error) {
        return value.stack || String(value);
    } else {
        try {
            return JSON.stringify(value, null, 2);
        } catch (e) {
            return String(value);
        }
    }
}
/**
 * Count the number of lines in a String (minimum 1).
 * @param {String} text - The textarea source whose newline count determines its rendered height.
 * @return {Number}       Line count, clamped to a minimum of 1 so empty content still occupies a row.
 */
function countLines(text) {
    const lines = text.split("\n").length;
    if (lines < 1) {
        return 1;
    } else {
        return lines;
    }
}
/**
 * Append a line of output to the given results panel.
 * @param {HTMLElement} panel  - The results panel element that will receive the new output line as a child.
 * @param {String} line        - The pre-formatted text to display on a single output row.
 * @param {String} kind        - Output category, either "log" or "error" - used as a CSS modifier class for styling.
 */
function appendOutput(panel, line, kind) {
    const entry = document.createElement("div");
    entry.className = "fluid-code-box-output-line fluid-code-box-output-" + kind;
    entry.textContent = line;
    panel.appendChild(entry);
}
/**
 * Parse an HTML template string into a DocumentFragment. Useful for
 * building small subtrees declaratively rather than via a sequence of
 * `createElement`/`setAttribute`/`appendChild` calls. Note that the
 * returned fragment empties itself the first time it is appended into the
 * document - resolve any element references from it before that point.
 * @param {String} html - A snippet of HTML markup describing the subtree to build.
 * @return {DocumentFragment} A fragment containing the parsed nodes.
 */
function parseFragment(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
}
/**
 * Copy the supplied text to the system clipboard via the asynchronous
 * Clipboard API. The host environment must be a secure context (https or
 * localhost) and grant clipboard-write permission; otherwise the returned
 * promise rejects.
 * @param {String} text - The text to place on the system clipboard.
 * @return {Promise} A promise that resolves once the copy has succeeded, or rejects on failure.
 */
function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
}
/**
 * Build a top-right copy-to-clipboard button containing a FontAwesome
 * "clone" icon, wired to copy the supplied textarea's current value when
 * clicked. The host page must have FontAwesome loaded for the icon to
 * render.
 * @param {HTMLTextAreaElement} textarea - The textarea whose value should be copied when the button is clicked.
 * @return {HTMLButtonElement} A button element ready to be positioned over the textarea.
 */
function buildCopyIcon(textarea) {
    const fragment = parseFragment(copyIconMarkup);
    const button = fragment.querySelector("button");
    button.addEventListener("click", function () {
        copyToClipboard(textarea.value);
    });
    return button;
}
/**
 * Build a console-shaped Object whose log/error/warn/info methods append to
 * the supplied panel and also forward to the real console for visibility in
 * the dev tools.
 * @param {HTMLElement} panel - The results panel that intercepted console calls should write into.
 * @return {Object}             A console-shaped object exposing log, info, warn and error methods.
 */
function makeConsoleShim(panel) {
    /**
     * @param {String} kind       - Output category written to the panel - either "log" or "error".
     * @param {String} forward    - Method name on the real console to forward the call to (e.g. "log", "warn").
     * @return {Function}         - A console method implementation that writes to the panel and forwards to the real console.
     */
    function method(kind, forward) {
        return function () {
            const parts = Array.prototype.map.call(arguments, formatArg);
            appendOutput(panel, parts.join(" "), kind);
            console[forward].apply(console, arguments);
        };
    }
    return {
        log: method("log", "log"),
        info: method("log", "info"),
        warn: method("log", "warn"),
        error: method("error", "error")
    };
}
/**
 * Rewrite relative module specifiers (those starting with `./` or `../`) in
 * the supplied source so that they become absolute URLs resolved against the
 * page's base URI. This is needed because the source is loaded from a
 * `blob:` URL whose scheme isn't hierarchical, so the browser can't resolve
 * relative specifiers against it. Bare specifiers (e.g. `"fluid"`) and
 * already-absolute specifiers (e.g. `"/x.mjs"`, `"https://..."`) are left
 * alone.
 * @param {String} source  - The module source whose import/export specifiers may need rewriting.
 * @param {String} baseUrl - The URL to resolve relative specifiers against - typically `document.baseURI`.
 * @return {String}          The source with relative specifiers rewritten to absolute URLs.
 */
function resolveImports(source, baseUrl) {
    // Matches the specifier slot in:
    //   import ... from "X"
    //   import "X"
    //   export ... from "X"
    //   import("X")
    // The specifier itself is captured in group 2 (with its surrounding quote
    // type in group 1) so we can rebuild the literal with the same quoting.
    const pattern = /(?:\b(?:import|export)\b[^"'`;]*?\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'`\n]+)\1/g;
    return source.replace(pattern, function (match, quote, specifier) {
        if (specifier.startsWith("./") || specifier.startsWith("../")) {
            const absolute = new URL(specifier, baseUrl).href;
            const replacement = quote + absolute + quote;
            // Preserve the prefix of the match (everything before the quoted
            // specifier) by splicing the rebuilt literal onto its end.
            const prefixLength = match.length - (specifier.length + 2);
            return match.substring(0, prefixLength) + replacement;
        } else {
            return match;
        }
    });
}
/**
 * Execute the source as an ES module via a Blob URL, with a local `console`
 * binding prepended so that any `console.x(...)` in the source resolves to
 * our shim instead of the global. Relative module specifiers in the source
 * are first rewritten to absolute URLs so they continue to work despite the
 * non-hierarchical `blob:` scheme. Returns a Promise that resolves when the
 * module finishes evaluating.
 * @param {String} source      - The JavaScript module source from the textarea, to be evaluated as an ES module.
 * @param {HTMLElement} panel  - The results panel that will receive console output and any thrown error from the run.
 * @return {Promise}           - A promise that resolves once the module has finished evaluating, or after a thrown error has been reported.
 */
function runSource(source, panel) {
    panel.textContent = "";
    shimCounter = shimCounter + 1;
    const key = "__fluidCodeBoxConsole_" + shimCounter;
    globalThis[key] = makeConsoleShim(panel);
    // Prepend a const binding so identifier resolution for `console` inside
    // the module hits our shim rather than the real global. String literals
    // and comments mentioning "console" are untouched because we are not
    // doing textual substitution on the source.
    const resolved = resolveImports(source, document.baseURI);
    const wrapped = "const console = globalThis[\"" + key + "\"];\n" + resolved;
    const blob = new Blob([wrapped], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const done = import(/* webpackIgnore: true */ url).catch(function (err) {
        appendOutput(panel, formatArg(err), "error");
    }).finally(function () {
        URL.revokeObjectURL(url);
        delete globalThis[key];
    });
    return done;
}
/**
 * Replace the textarea's parent layout with a wrapper that places the editor
 * (textarea + Run button) on the left and a results panel on the right. The
 * textarea is hoisted into a positioned frame so that the copy icon can be
 * absolutely positioned at its top-right without disturbing the surrounding
 * flex layout.
 * @param {HTMLTextAreaElement} textarea - The fluid-code-box textarea to be hoisted into the new two-column layout.
 * @return {Object} An object with `button` (the Run button element) and `resultsPanel` (the right-hand output panel) for wiring up event handlers.
 */
function buildLayout(textarea) {
    const fragment = parseFragment(layoutMarkup);
    const wrapper = fragment.querySelector(".fluid-code-box-wrapper");
    const editorFrame = fragment.querySelector(".fluid-code-box-editor-frame");
    const button = fragment.querySelector(".fluid-code-box-run");
    const resultsPanel = fragment.querySelector(".fluid-code-box-results-panel");
    // Capture the textarea's original position before moving it so the new
    // wrapper can be inserted in the same spot.
    const originalParent = textarea.parentNode;
    const originalNextSibling = textarea.nextSibling;
    editorFrame.appendChild(textarea);
    editorFrame.appendChild(buildCopyIcon(textarea));
    originalParent.insertBefore(wrapper, originalNextSibling);
    return {
        button: button,
        resultsPanel: resultsPanel
    };
}
/**
 * Initialise a single fluid-code-box textarea: size it, wrap it, and wire
 * up its Run button.
 * @param {HTMLTextAreaElement} textarea - A textarea with class `fluid-code-box` that should be turned into a runnable code panel.
 */
function initBox(textarea) {
    // Trim a single leading/trailing newline that often comes from authoring
    // the textarea content on its own lines in the source HTML.
    const raw = textarea.value.replace(/^\n/, "").replace(/\n$/, "");
    textarea.value = raw;
    if (!textarea.getAttribute("rows")) {
        textarea.setAttribute("rows", String(countLines(raw)));
    }
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("cols", "80");
    const parts = buildLayout(textarea);
    parts.button.addEventListener("click", function () {
        runSource(textarea.value, parts.resultsPanel);
    });
}
/**
 * Find every textarea.fluid-code-box in the document and initialise it.
 */
function initAll() {
    const boxes = document.querySelectorAll("textarea.fluid-code-box");
    Array.prototype.forEach.call(boxes, initBox);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
} else {
    initAll();
}
