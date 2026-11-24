"use strict";

// Tests of eslint-plugin-fluid-lint - run with: npm test, in this package. Texts are linted through ESLint's own API,
// with the plugin's recommended configuration, checking that fluid-lint's diagnostics reach ESLint under the right
// rule, severity and location, in JavaScript and in SFCs, and with their fixes offered as suggestions.

const {ESLint} = require("eslint");
const plugin = require("../index.js");

let passed = 0;
const failures = [];

/**
 * Assert a condition
 * @param {Boolean} condition - The condition
 * @param {String} message - What it asserts
 */
const expect = function (condition, message) {
    if (condition) {
        ++passed;
    } else {
        failures.push(message);
    }
    console.log((condition ? "ok - " : "not ok - ") + message);
};

const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{files: ["**/*.js"], languageOptions: {ecmaVersion: 2022, sourceType: "script"}}, ...plugin.configs.recommended]
});

/**
 * Lint a text through ESLint
 * @param {String} text - The text
 * @param {String} filePath - The name of its file, whose extension selects how it is linted
 * @return {Promise<Object[]>} ESLint's messages
 */
const messagesOf = async function (text, filePath) {
    const [result] = await eslint.lintText(text, {filePath});
    return result.messages;
};

const run = async function () {
    const clean = await messagesOf(`fluid.def("my.a", {$layers: "fluid.viewComponent", v: "{self}.w"});\n`, "clean.js");
    expect(clean.length === 0, "A well-formed layer lints clean");

    const broken = await messagesOf(`fluid.def("my.a", {\n    v: "{self.w"\n});\n`, "broken.js");
    expect(broken.length === 1, "An unclosed reference is reported once");
    expect(broken[0] && broken[0].ruleId === "fluid-lint/errors" && broken[0].severity === 2, "as an error of fluid-lint/errors");
    expect(broken[0] && broken[0].line === 2, "on its line");
    expect(broken[0] && broken[0].suggestions && broken[0].suggestions.length === 1, "with its fix offered as a suggestion");
    expect(broken[0] && broken[0].fix === undefined, "and not applied by --fix");

    const warned = await messagesOf(`fluid.def("my.a", {v: "$compute:my.f(\\"x\\")"});\n`, "warned.js");
    expect(warned.length === 1 && warned[0].ruleId === "fluid-lint/warnings" && warned[0].severity === 1,
        "A quoted compact argument is reported as a warning of fluid-lint/warnings");

    const disabled = await messagesOf(`// eslint-disable-next-line fluid-lint/errors\nfluid.def("my.a", {v: "{self.w"});\n`, "disabled.js");
    expect(disabled.length === 0, "A diagnostic of JavaScript may be disabled by a comment");

    const notConfig = await messagesOf(`const v = "{self.w";\n`, "plain.js");
    expect(notConfig.length === 0, "A String outside a layer record is not read as configuration");

    const sfc = `<script>\nfluid.def("my.b", {\n    $layers: "fluid.templateViewComponent",\n    v: "{self.w"\n});\n</script>\n` +
        `<template>\n    <p>@{title</p>\n</template>\n`;
    const sfcMessages = await messagesOf(sfc, "widget.vue");
    expect(sfcMessages.length === 2, "An SFC's script and template are linted");
    expect(sfcMessages.every(message => message.ruleId === "fluid-lint/errors"), "under fluid-lint/errors");
    expect(sfcMessages[0] && sfcMessages[0].line === 4, "at the line of the SFC, within its script");
    expect(sfcMessages[1] && sfcMessages[1].line === 8, "and within its template");

    const sfcClean = await messagesOf(`<script>\nfluid.def("my.b", {$layers: "fluid.templateViewComponent"});\n</script>\n<template><p>@{title}</p></template>\n`, "clean.vue");
    expect(sfcClean.length === 0, "A well-formed SFC lints clean");

    console.log(`# ${passed} passed, ${failures.length} failed`);
    if (failures.length > 0) {
        process.exitCode = 1;
    }
};

run();
