"use strict";

// eslint-config-infusion-6 - the ESLint configuration of Infusion 6, as a flat configuration for ESLint 10. It replaces
// eslint-config-fluid 2.1.1, an eslintrc configuration, with the settings Infusion's own .eslintrc.json made over it:
//
// - eslint-config-fluid's rules, each at the severity and with the options it gave. Its formatting rules, deprecated in
//   ESLint's core, are those of @stylistic/eslint-plugin, the core's own rules carried on under the same names, with
//   any option whose default differs from the core's stated
// - Its JSDoc rules and settings, by eslint-plugin-jsdoc
// - Its environments - browser and jquery, and the global `fluid` - as `languageOptions.globals`
// - Infusion's own settings over it: `strict` as "global", `no-loop-func` and `no-console` off, double quotes allowing
//   template literals and single quotes to avoid escapes, `any` rather than `Any` as JSDoc's preferred name of `*`,
//   `$` as a global, and ECMAScript 2022, its scripts parsed as scripts
// - fluid-lint's rules, and its processor of Single File Components - see eslint-plugin-fluid-lint
//
// Settings of ESLint 8 which ESLint 10 changed are kept as they were - `no-unused-vars` does not report a caught error
// which is unused, and an unused disabling comment is not reported.
//
// Exported are
// - `recommended` - an Array of configuration objects, to be spread into a project's eslint.config.js
// - `node` - an object to give files run by node, which once declared `/* eslint-env node */`: CommonJS and node's
//   globals, e.g. `{files: ["bin/**"], ...infusion.node}`. A file which is also an ES module may follow it with
//   `languageOptions: {sourceType: "module"}`
// - `module` - likewise, for ES modules run in the browser
// - `globals` - the globals package, sets of the globals of each environment, e.g. `globals.webextensions`
// Run nothing - this file only exports configuration

const globals = require("globals");
const jsdoc = require("eslint-plugin-jsdoc");
const stylistic = require("@stylistic/eslint-plugin");
const fluidLint = require("eslint-plugin-fluid-lint");

const scriptFiles = ["**/*.js", "**/*.cjs", "**/*.mjs"];

const recommended = [{
    name: "infusion-6/scripts",
    files: scriptFiles,
    languageOptions: {
        ecmaVersion: 2022,
        // ESLint 10 takes a .js file for an ES module unless told otherwise - eslintrc took it for a script
        sourceType: "script",
        globals: {
            ...globals.browser,
            ...globals.jquery,
            fluid: "writable",
            $: "writable"
        }
    },
    linterOptions: {
        reportUnusedDisableDirectives: "off"
    },
    plugins: {
        "@stylistic": stylistic,
        jsdoc
    },
    settings: {
        jsdoc: {
            // eslint-plugin-jsdoc 39 read comments as JSDoc, its later versions as TypeScript by default
            mode: "jsdoc",
            tagNamePreference: {
                returns: "return"
            },
            preferredTypes: {
                "*": "any",
                any: "any",
                boolean: "Boolean",
                number: "Number",
                object: "Object",
                string: "String"
            }
        }
    },
    rules: {
        // Of eslint-config-fluid, in ESLint's core
        "block-scoped-var": "error",
        "curly": ["error", "all"],
        // "allow-null", as eslint-config-fluid had it, is the deprecated spelling of this
        "eqeqeq": ["error", "always", {null: "ignore"}],
        "new-cap": ["error", {newIsCap: true, capIsNew: true, properties: false}],
        "no-caller": "error",
        "no-cond-assign": ["error", "except-parens"],
        "no-debugger": "error",
        "no-empty": ["error", {allowEmptyCatch: true}],
        "no-eval": "error",
        "no-extend-native": "error",
        "no-irregular-whitespace": "error",
        "no-iterator": "error",
        "no-multi-str": "error",
        "no-new": "error",
        "no-new-wrappers": "error",
        "no-proto": "error",
        "no-redeclare": "error",
        "no-script-url": "error",
        "no-sequences": "error",
        "no-undef": "error",
        // ESLint 9 began reporting unused caught errors by default
        "no-unused-vars": ["error", {caughtErrors: "none"}],
        "no-with": "error",
        "valid-typeof": "error",
        // Infusion's own, over eslint-config-fluid's "error" and "safe"
        "no-console": "off",
        "no-loop-func": "off",
        "strict": ["error", "global"],

        // Of eslint-config-fluid, now of @stylistic
        "@stylistic/comma-dangle": ["error", "never"],
        // The core checked none of these by default
        "@stylistic/comma-style": ["error", "last", {exceptions: {
            ArrayPattern: true,
            ArrowFunctionExpression: true,
            CallExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            ImportDeclaration: true,
            ObjectPattern: true,
            NewExpression: true
        }}],
        "@stylistic/eol-last": "error",
        // @stylistic indents a switch's cases by default - the core did not. The core ignored the indentation of a
        // property's value begun on the line after its key, where @stylistic indents it once - ignored here for a template
        // literal, the only such value written in Infusion, whose text is not indented anyway
        "@stylistic/indent": ["error", 4, {SwitchCase: 0, ignoredNodes: ["Property > TemplateLiteral.value"]}],
        "@stylistic/keyword-spacing": "error",
        "@stylistic/linebreak-style": ["error", "unix"],
        "@stylistic/no-trailing-spaces": "error",
        // Infusion's own, over eslint-config-fluid's plain "double" - @stylistic names the core's `true` "always"
        "@stylistic/quotes": ["error", "double", {allowTemplateLiterals: "always", avoidEscape: true}],
        "@stylistic/semi": ["error", "always"],
        "@stylistic/space-before-blocks": ["error", "always"],
        "@stylistic/space-before-function-paren": ["error", {anonymous: "always", named: "never"}],
        "@stylistic/space-infix-ops": "error",
        "@stylistic/space-unary-ops": ["error", {words: true, nonwords: false, overrides: {typeof: false}}],
        "@stylistic/wrap-iife": ["error", "inside"],

        // Of eslint-config-fluid, by eslint-plugin-jsdoc
        "jsdoc/check-alignment": "error",
        "jsdoc/check-param-names": "error",
        "jsdoc/check-tag-names": "error",
        "jsdoc/check-types": "warn",
        "jsdoc/require-hyphen-before-param-description": "error",
        "jsdoc/require-param": "error",
        "jsdoc/require-param-description": "error",
        "jsdoc/require-param-name": "error",
        "jsdoc/require-param-type": "error",
        "jsdoc/require-returns": "error",
        "jsdoc/require-returns-check": "error",
        "jsdoc/require-returns-description": "error",
        "jsdoc/require-returns-type": "error",
        "jsdoc/valid-types": "error"
    }
}, {
    name: "infusion-6/commonjs",
    files: ["**/*.cjs"],
    languageOptions: {
        sourceType: "commonjs"
    }
}, {
    name: "infusion-6/es-modules",
    files: ["**/*.mjs"],
    languageOptions: {
        sourceType: "module"
    }
}, ...fluidLint.configs.recommended];

module.exports = {
    recommended,
    globals,
    node: {
        languageOptions: {
            sourceType: "commonjs",
            globals: globals.node
        }
    },
    module: {
        languageOptions: {
            sourceType: "module"
        }
    }
};
