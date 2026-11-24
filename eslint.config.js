"use strict";

// How ESLint lints Infusion - Infusion's own configuration, packages/eslint-config-infusion-6, and what is particular to
// the files of this repository. This replaces the .eslintrc.json files of the root, of extension/ and of
// packages/fluid-lint, and .eslintignore. Run by: npm run lint

const infusion = require("eslint-config-infusion-6");
const globals = infusion.globals;

module.exports = [{
    name: "infusion-6/ignored",
    ignores: [
        "**/lib/**",
        // Not linted by ESLint 8 either, which was given only .js and .vue - their indentation, e.g., is not Infusion's
        "**/*.mjs",
        // An edited copy of CodeMirror's JSHint lint addon - third-party code, as are the lib directories
        "tests/test-core/qunit/js/function-lint.js",
        // Pages for manual experiment and performance measurement, not run by any test
        "tests/manual-tests/**",
        // The parser generated from fluid-lint's grammar - see packages/fluid-lint/README.md
        "packages/fluid-lint/src/fluid-runes.parser*.js",
        // The theme's third-party scripts and stylesheets, served as they are - Bootstrap, jQuery, PhotoSwipe etc.
        "packages/wend-theme-beautiful/static/**"
    ]
},
...infusion.recommended,
{
    // The files run by node - once each declaring `/* eslint-env node */`
    name: "infusion-6/node",
    files: [
        "*.js",
        "*.cjs",
        "bin/**/*.js",
        "scripts/**/*.js",
        "src/build/**/*.js",
        "src/framework/server/**/*.js",
        "tests/framework-tests/server/**/*.js",
        "tests/test-core/browser/js/demo-runner.js",
        "tests/test-core/browser/js/hydration-roundtrip.js",
        "tests/test-core/browser/js/qunit-browser-runner.js",
        "tests/test-core/qunit/js/fqunit-*.js",
        "extension/test/**/*.js",
        "packages/eslint-config-infusion-6/**/*.js",
        "packages/eslint-plugin-fluid-lint/**/*.js",
        "packages/fluid-lint/build.js",
        "packages/fluid-lint/test/**/*.js",
        "packages/fluid-lint/**/*.cjs",
        // Run by node and in the browser alike
        "packages/fluid-lint/src/fluidLint.js",
        "packages/wend/js/buildSite.js",
        "packages/wend/js/feeds.js",
        "packages/wend/js/markdown.js",
        "packages/wend/js/site.js",
        "packages/wend/js/siteModel.js",
        "packages/wend/js/trace.js"
    ],
    ...infusion.node
}, {
    name: "infusion-6/es-modules",
    files: [
        "demo/tldraw*/js/tldraw-driver.js",
        "demo/tldraw/js/tldraw-ai.js",
        "demo/tldraw/js/tldraw-arena.js",
        "demo/tldraw/js/tldraw-clipboard.js",
        "demo/tldraw/js/tldraw-credentials*.js",
        // fluid-lint is a package of ES modules
        "packages/fluid-lint/**/*.js"
    ],
    ...infusion.module
}, {
    name: "infusion-6/extension",
    // As extension/.eslintrc.json gave them, to the tests too, which run code in the extension's service worker
    files: ["extension/**/*.js"],
    languageOptions: {
        globals: globals.webextensions
    }
}, {
    name: "infusion-6/extension-service-worker",
    files: ["extension/edit-in-infusion/js/background.js"],
    languageOptions: {
        globals: {
            ...globals.serviceworker,
            fluidClaims: "readonly",
            fluidGitHub: "readonly"
        }
    }
}];
