// The parts of CodeMirror 6 the "Edit in Infusion" extension uses, bundled by build.js as the global `fluidCodeMirror` -
// see js/sourceView.js
export {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, Decoration} from "@codemirror/view";
export {EditorState, StateEffect, StateField, Compartment, RangeSetBuilder} from "@codemirror/state";
export {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
export {searchKeymap, highlightSelectionMatches} from "@codemirror/search";
export {syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, foldGutter, foldKeymap} from "@codemirror/language";
export {markdown} from "@codemirror/lang-markdown";
export {json} from "@codemirror/lang-json";
export {vue} from "@codemirror/lang-vue";
export {autocompletion, completionKeymap, startCompletion} from "@codemirror/autocomplete";
