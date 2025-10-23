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
    vm = require("vm");

const moduleBaseDir = path.resolve(__dirname, "../..");

const getBaseDir = function () {
    return __dirname;
};

const buildPath = function (pathSeg) {
    return path.join(getBaseDir(), pathSeg);
};

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
    require: require
});

context.window = context;

/* Load a standard, non-require-aware Fluid framework file into the Fluid context, given a filename
 * relative to this directory (src/module) **/
const loadInContext = function (path, absolute) {
    const fullpath = absolute ? path : buildPath(path);
    const data = fs.readFileSync(fullpath);
    vm.runInContext(data, context, fullpath);
};

const loadIncludes = function (path) {
    const includes = require(buildPath(path));
    includes.forEach(include => loadInContext(include));
};

loadIncludes("includes.json");

const fluid = context.fluid;


// As well as for efficiency, it's useful to customise this because an uncaught
// exception fired from a a setTimeout handler in node.js will prevent any
// further from being serviced, which impedes testing these handlers
fluid.invokeLater = function (func) {
    process.nextTick(func);
};

fluid.loadInContext = loadInContext;
fluid.loadIncludes = loadIncludes;

fluid.testingSupportLoaded = false;

/**
 * Set up testing environment with QUnit in node.
 */
fluid.loadTestingSupport = function () {
    // Guard against multiple inclusion of QUnit - FLUID-6188
    if (!fluid.testingSupportLoaded) {
        fluid.loadIncludes("devIncludes.json");
        fluid.testingSupportLoaded = true;
    }
};


fluid.module.register("infusion", moduleBaseDir, require);

// Export the fluid object into the pan-module node.js global object
global.fluid = fluid;

module.exports = fluid;
