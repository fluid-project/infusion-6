/* eslint-env node */
"use strict";

// eslint-plugin-fluid-lint - reports the diagnostics of fluid-lint, packages/fluid-lint, through ESLint. fluid-lint
// parses with lezer rather than espree, and reads each String configuring a layer by the grammar of configuration's
// runes, checking references, compact records, templates and the directives of layer records as Infusion reads them.
//
// - The rules `fluid-lint/errors` and `fluid-lint/warnings` report fluid-lint's diagnostics of each severity in
//   JavaScript, so that each may be configured, or disabled by a comment, as any other rule
// - The processor `fluid-lint/vue` lints a Single File Component whole, since ESLint does not parse one of itself.
//   Its diagnostics are reported under the same rule names, at the severity fluid-lint gives them
//
// fluid-lint is an ES module, loaded by require, as node supports from version 22.12. A fix which fluid-lint proposes
// is offered as a suggestion rather than applied by --fix, since it is a guess at what was meant.

const {lint} = require("../fluid-lint/src/fluidLint.js");

const ruleNames = {error: "errors", warning: "warnings"};

// The diagnostics of each SourceCode, cached so that both rules lint it once
const cache = new WeakMap();

/**
 * The diagnostics of fluid-lint for a SourceCode
 * @param {SourceCode} sourceCode - The SourceCode of the file being linted
 * @return {Diagnostic[]} Its diagnostics
 */
const diagnosticsOf = function (sourceCode) {
    let togo = cache.get(sourceCode);
    if (!togo) {
        togo = lint(sourceCode.text, "js");
        cache.set(sourceCode, togo);
    }
    return togo;
};

/**
 * Make a rule reporting fluid-lint's diagnostics of one severity
 * @param {String} severity - "error" or "warning"
 * @return {Object} The rule
 */
const makeRule = function (severity) {
    return {
        meta: {
            type: severity === "error" ? "problem" : "suggestion",
            docs: {
                description: `Report fluid-lint's ${severity}s in the configuration of Infusion layers`
            },
            hasSuggestions: true,
            schema: []
        },
        create: function (context) {
            const sourceCode = context.sourceCode || context.getSourceCode();
            return {
                "Program:exit": function () {
                    diagnosticsOf(sourceCode).filter(diagnostic => diagnostic.severity === severity).forEach(diagnostic => {
                        const report = {
                            loc: {
                                start: sourceCode.getLocFromIndex(diagnostic.from),
                                end: sourceCode.getLocFromIndex(Math.max(diagnostic.to, diagnostic.from))
                            },
                            message: diagnostic.message
                        };
                        if (diagnostic.fix) {
                            report.suggest = [{
                                desc: diagnostic.fix.label,
                                fix: fixer => diagnostic.fix.changes.map(change => fixer.replaceTextRange([change.from, change.to], change.insert))
                            }];
                        }
                        context.report(report);
                    });
                }
            };
        }
    };
};

/**
 * Merge the changes of a fix into one, replacing the whole range they span, as a suggestion of a processor's message
 * must be
 * @param {String} text - The text which the fix changes
 * @param {Fix} fix - The fix
 * @return {Object} The change, as {range, text}
 */
const mergeChanges = function (text, fix) {
    const changes = [...fix.changes].sort((a, b) => a.from - b.from);
    const from = changes[0].from, to = Math.max(...changes.map(change => change.to));
    let merged = "", pos = from;
    changes.forEach(change => {
        merged += text.slice(pos, change.from) + change.insert;
        pos = Math.max(pos, change.to);
    });
    return {range: [from, to], text: merged + text.slice(pos, to)};
};

/**
 * Convert a position within a text to a line and column, as ESLint reports them - lines from 1 and columns from 1
 * @param {Number[]} lineStarts - The position of the start of each line of the text
 * @param {Number} pos - The position
 * @return {Object} The location, as {line, column}
 */
const locOf = function (lineStarts, pos) {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= pos) {
        ++line;
    }
    return {line: line + 1, column: pos - lineStarts[line] + 1};
};

// The messages of fluid-lint for each SFC, held from preprocess to postprocess
const pending = new Map();

const vueProcessor = {
    meta: {
        name: "fluid-lint/vue"
    },
    /**
     * Lint an SFC whole, holding its messages for postprocess - no block is returned for ESLint to parse
     * @param {String} text - The SFC
     * @param {String} filename - Its file name
     * @return {Object[]} The blocks to be linted by ESLint - none
     */
    preprocess: function (text, filename) {
        const lineStarts = [0];
        for (let i = 0; i < text.length; ++i) {
            if (text[i] === "\n") {
                lineStarts.push(i + 1);
            }
        }
        const messages = lint(text, "vue").map(diagnostic => {
            const start = locOf(lineStarts, diagnostic.from), end = locOf(lineStarts, Math.max(diagnostic.to, diagnostic.from));
            const message = {
                ruleId: "fluid-lint/" + (ruleNames[diagnostic.severity] || "warnings"),
                severity: diagnostic.severity === "error" ? 2 : 1,
                message: diagnostic.message,
                line: start.line,
                column: start.column,
                endLine: end.line,
                endColumn: end.column
            };
            if (diagnostic.fix) {
                message.suggestions = [{
                    desc: diagnostic.fix.label,
                    fix: mergeChanges(text, diagnostic.fix)
                }];
            }
            return message;
        });
        pending.set(filename, messages);
        return [];
    },
    /**
     * Return the messages held for an SFC
     * @param {Object[][]} messageLists - The messages of ESLint's linting of each block - none
     * @param {String} filename - The file name of the SFC
     * @return {Object[]} Its messages
     */
    postprocess: function (messageLists, filename) {
        const togo = pending.get(filename) || [];
        pending.delete(filename);
        return togo;
    },
    supportsAutofix: false
};

module.exports = {
    meta: {
        name: "eslint-plugin-fluid-lint",
        version: "1.0.0"
    },
    rules: {
        errors: makeRule("error"),
        warnings: makeRule("warning")
    },
    processors: {
        vue: vueProcessor
    },
    configs: {
        recommended: {
            plugins: ["fluid-lint"],
            rules: {
                "fluid-lint/errors": "error",
                "fluid-lint/warnings": "warn"
            },
            overrides: [{
                files: ["*.vue"],
                processor: "fluid-lint/vue"
            }]
        }
    }
};
