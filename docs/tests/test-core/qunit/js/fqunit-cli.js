/* eslint-env node */

"use strict";

const fluid = require("./fqunit-node.js");

fluid.runTests = function (testFiles) {
    testFiles.forEach(testFile => fluid.loadInContext(testFile));
};

if (require.main === module) {
    const testArgs = process.argv.slice(2);
    const pkgPath = fluid.module.resolvePath("%infusion-6/package.json");
    const pkg = require(pkgPath);
    const testFiles = testArgs.length === 0 ? pkg.infusion.tests.server : testArgs;
    fluid.runTests(testFiles);
}

module.exports = fluid.runTests;
