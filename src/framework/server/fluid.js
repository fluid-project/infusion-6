/*
Copyright The Infusion copyright holders
See the AUTHORS.md file at the top-level directory of this distribution and at
https://github.com/fluid-project/infusion/raw/main/AUTHORS.md.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/main/Infusion-LICENSE.txt
*/
/* eslint-env node */

"use strict";

const fs = require("fs"),
    path = require("path"),
    vm = require("vm"),
    nodeFetch = require("./node-fetch-wrapper.js");

const moduleBaseDir = path.resolve(__dirname, "../../../");


/**
 * Joins two path segments using a forward slash.
 *
 * Ensures that there is exactly one slash between segments.
 *
 * @param {String} a - The first path segment.
 * @param {String} b - The second path segment.
 * @return {String} The combined path.
 */
function buildPath(a, b) {
    console.log(a, b);
    return a.replace(/\/+$/, "") + "/" + b.replace(/^\/+/, "");
}

// Report of experiments performed with node.js globals done on 1/9/14 - what we might like to write at this point is
// fluid: {global: GLOBAL}; - this "nearly" works but unfortunately the process of transporting the "pan-global" object
// across the sandbox initialization boundary ends up shredding it. We end up with a situation where in this file,
// fluid.global.fluid === fluid - but from within Fluid.js, fluid.global.fluid === undefined. node.js docs on sandboxing
// do report that the results can be fragile and version unstable. However, we need to continue with sandboxing because of
// the delicate expectations, for example, on visible globals caused by QUnit's sniffing code.
// Experiment performed with node.js 0.8.6 on Windows.
// We achieve a lot of what we might want via "global.fluid = fluid" below. However, other top-level names constructed
// via fluid.registerNamespace will not be exported up to the pan-global.

const context = vm.createContext({
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    __dirname: __dirname,
    path: path,
    process: process, // Enable straightforward ContextAwareness check
    require: require,
    URL: URL,
    fetch: nodeFetch
});

context.window = context;

/* Load a standard, non-require-aware Fluid framework file into the Fluid context, given a filename
 * relative to this directory (src/module) **/
const loadInContext = function (fullPath) {
    const data = fs.readFileSync(fullPath);
    vm.runInContext(data, context, fullPath);
};

const loadImportsFromPackage = function (path) {
    const modulePath = buildPath(moduleBaseDir, path);
    const pkgPath = modulePath + "package.json";
    const pkg = require(pkgPath);
    const imports = pkg.infusion.imports;
    const ourImports = imports.server || imports;
    ourImports.forEach(include => {
        const fullPath = buildPath(modulePath, include);
        loadInContext(fullPath);
    });
};

loadImportsFromPackage("/");

const fluid = context.fluid;
fluid.V8Context = context;


// As well as for efficiency, it's useful to customise this because an uncaught
// exception fired from a a setTimeout handler in node.js will prevent any
// further from being serviced, which impedes testing these handlers
fluid.invokeLater = function (func) {
    process.nextTick(func);
};

fluid.loadInContext = loadInContext;
fluid.loadImportsFromPackage = loadImportsFromPackage;

fluid.testingSupportLoaded = false;

/**
 * Set up testing environment with QUnit in node.
 */
fluid.loadTestingSupport = function () {
    // Guard against multiple inclusion of QUnit - FLUID-6188
    if (!fluid.testingSupportLoaded) {
        loadImportsFromPackage("tests/");
        fluid.testingSupportLoaded = true;
    }
};


fluid.module.register("infusion", moduleBaseDir);

// Export the fluid object into the pan-module node.js global object
global.fluid = fluid;

require("./server-support.js");

module.exports = fluid;
