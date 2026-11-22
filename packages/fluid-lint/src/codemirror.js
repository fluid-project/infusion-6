/* eslint-env browser */
// fluid-lint for CodeMirror 6 - languages of Infusion JavaScript and SFCs, whose configuration Strings are parsed and
// highlighted by the grammar of runes, and a linter reporting the diagnostics of fluidLint.js beside the text.
// `fluidEditor` makes an editor of either, as the live examples of Infusion's documentation use - see
// src/components/sfc/fluid-liveExample.vue in Infusion.

import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection} from "@codemirror/view";
import {EditorState, Compartment, StateEffect} from "@codemirror/state";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {syntaxHighlighting, defaultHighlightStyle, HighlightStyle, bracketMatching, indentOnInput, LanguageSupport} from "@codemirror/language";
import {javascriptLanguage} from "@codemirror/lang-javascript";
import {html} from "@codemirror/lang-html";
import {linter, lintGutter} from "@codemirror/lint";
import {tags as t} from "@lezer/highlight";
import {parseMixed} from "@lezer/common";
import {lint, isFragment, configurationTop, interiorRanges, valueParser, templateParser} from "./fluidLint.js";

const parserForTop = {Value: valueParser, Template: templateParser};

/**
 * The language of Infusion JavaScript - @codemirror/lang-javascript's, within which the grammar of runes is nested
 * over each String configuring a layer, as fluidLint.js's fluidJsParser nests it
 */
export const fluidJavaScriptLanguage = javascriptLanguage.configure({
    wrap: parseMixed((ref, input) => {
        let togo = null;
        if (ref.name === "String" || ref.name === "TemplateString") {
            const top = configurationTop(ref.node, (from, to) => input.read(from, to));
            if (top) {
                togo = {parser: parserForTop[top], overlay: interiorRanges(ref.node)};
            }
        }
        return togo;
    })
}, "fluidJavaScript");

/**
 * Support for Infusion JavaScript
 * @return {LanguageSupport} The language support
 */
export const fluidJavaScript = () => new LanguageSupport(fluidJavaScriptLanguage);

/**
 * Support for Infusion's Single File Components - HTML whose elements may close themselves, holding Infusion
 * JavaScript within its <script>
 * @return {LanguageSupport} The language support
 */
export const fluidSfc = () => html({
    selfClosingTags: true,
    nestedLanguages: [{tag: "script", parser: fluidJavaScriptLanguage.parser}]
});

// The highlighting of runes within configuration Strings, beside that of the language around them
export const runeHighlightStyle = HighlightStyle.define([
    {tag: t.special(t.brace), color: "#a0522d", fontWeight: "bold"},
    {tag: t.namespace, color: "#8b008b"},
    {tag: t.keyword, color: "#0000cd", fontWeight: "bold"},
    {tag: t.function(t.variableName), color: "#006400"},
    {tag: t.escape, color: "#b8860b"}
]);

// Dispatched by `relint` to lint an editor afresh, although its text has not changed
const relintEffect = StateEffect.define();

/**
 * Lint an editor afresh, e.g. since the diagnostics supplied by its `extraDiagnostics` have changed
 * @param {EditorView} view - The editor
 */
export const relint = function (view) {
    view.dispatch({effects: relintEffect.of(null)});
};

/**
 * A linter of Infusion JavaScript or SFCs, reporting the diagnostics of fluidLint.js
 * @param {String} kind - "js" or "vue"
 * @param {Function} [onDiagnostics] - Receives the diagnostics of each linting, e.g. to run a text only once it is clean
 * @param {Function} [extraDiagnostics] - Receives the editor's text, and returns diagnostics found by other means, e.g.
 * the problems of a component made from it - shown beside those of fluid-lint. Call `relint` on the editor to show
 * them afresh when they change.
 * @return {Extension} The linter
 */
export const fluidLinter = (kind, onDiagnostics, extraDiagnostics) => linter(view => {
    const text = view.state.doc.toString();
    const diagnostics = [...lint(text, kind), ...extraDiagnostics ? extraDiagnostics(text) : []];
    if (onDiagnostics) {
        onDiagnostics(diagnostics, text);
    }
    // A fix proposed for a diagnostic is offered as its action, applied to the editor's text from its tooltip
    return diagnostics.map(({from, to, severity, message, fix}) => ({from, to, severity, message, source: "fluid-lint",
        actions: fix ? [{name: fix.label, apply: target => target.dispatch({changes: fix.changes})}] : []}));
}, {delay: 300, needsRefresh: update => update.transactions.some(tr => tr.effects.some(effect => effect.is(relintEffect)))});

/**
 * @typedef {Object} FluidEditorOptions
 * @property {Element} parent - The element the editor is made within
 * @property {String} doc - Its initial text
 * @property {String} [kind] - "js" (the default) or "vue"
 * @property {Function} [onChange] - Receives the editor's text whenever it changes
 * @property {Function} [onDiagnostics] - Receives the diagnostics and text of each linting
 * @property {Function} [extraDiagnostics] - Supplies further diagnostics of the editor's text - see `fluidLinter`
 * @property {Boolean} [readOnly] - `true` if the text is shown, but not edited
 */

/**
 * Make an editor of Infusion JavaScript or an SFC, linted as it is edited
 * @param {FluidEditorOptions} options - Its options
 * @return {EditorView} The editor
 */
export const fluidEditor = function ({parent, doc, kind = "js", onChange, onDiagnostics, extraDiagnostics, readOnly = false}) {
    const language = new Compartment();
    return new EditorView({
        parent,
        state: EditorState.create({
            doc,
            extensions: [
                lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), history(), indentOnInput(),
                bracketMatching(), syntaxHighlighting(runeHighlightStyle), syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
                keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
                language.of(kind === "vue" ? fluidSfc() : fluidJavaScript()),
                lintGutter(), fluidLinter(kind, onDiagnostics, extraDiagnostics),
                EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
                EditorView.updateListener.of(update => {
                    if (update.docChanged && onChange) {
                        onChange(update.state.doc.toString());
                    }
                })
            ]
        })
    });
};

export {lint, isFragment, EditorView, EditorState};
