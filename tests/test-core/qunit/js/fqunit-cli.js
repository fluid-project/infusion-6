/* eslint-env node */

"use strict";

const fluid = require("./fqunit-node.js");
const fQUnit = fluid.registerNamespace("fQUnit");
require("./fqunit-html.js");

/**
 * Run a list of test files. Bare JavaScript fixture files are loaded together into the main Fluid context, and run
 * first. Each HTML driver file (e.g. FluidViewTests.html) is then run in turn in its own fresh browser-like context.
 * The process exits once all have concluded, with a status reflecting their aggregate result.
 * @param {String[]} testFiles - Paths of the test files to run, relative to the current directory
 * @return {Promise} A promise which resolves once all suites have concluded
 */
fluid.runTests = function (testFiles) {
    const jsFiles = testFiles.filter(testFile => !testFile.endsWith(".html"));
    const htmlFiles = testFiles.filter(testFile => testFile.endsWith(".html"));
    const suites = [];
    if (jsFiles.length > 0) {
        suites.push(() => new Promise(resolve => {
            fQUnit.attachReporter(fluid.registerNamespace("QUnit"), resolve);
            jsFiles.forEach(testFile => fluid.loadInContext(testFile));
        }));
    }
    htmlFiles.forEach(htmlFile => suites.push(() => fQUnit.runHtmlFile(htmlFile)));
    return fQUnit.runSuites(suites);
};

if (require.main === module) {
    const testArgs = process.argv.slice(2);
    const pkgPath = fluid.module.resolvePath("%infusion-6/package.json");
    const pkg = require(pkgPath);
    const testFiles = testArgs.length === 0 ? pkg.infusion.tests.server : testArgs;
    fluid.runTests(testFiles);
}

module.exports = fluid.runTests;
