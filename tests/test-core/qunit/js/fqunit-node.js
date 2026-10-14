/*
Copyright 2010-2012 OCAD University
Copyright 2010-2012 Antranig Basman

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt

Includes code from Underscore.js 1.4.3
http://underscorejs.org
(c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
Underscore may be freely distributed under the MIT license.
*/

/* eslint-env node */

"use strict";

const fluid = require("../../../.."); // TODO: Restore self-resolution again

fluid.loadTestingSupport();
fluid.setLogging(true);

// Debugging definition - node.js's default is only 10! TODO - place these into Infusion itself
fluid.Error.stackTraceLimit = 100;
Error.stackTraceLimit = 100;

const QUnit = fluid.registerNamespace("QUnit");
const fQUnit = fluid.registerNamespace("fQUnit");

/*
fQUnit.nodeFailureHandler = function (args, activity) {
    if (QUnit.config.current) {
        QUnit.config.current.assert.ok(false, "Assertion failure (see console.log for expanded message): ".concat(args));
    } else {
        fQUnit.globalFailure = args;
    }
    fluid.builtinFail(args, activity);
    // Note that since Infusion has overriden node's global uncaught exception handler, the process will not exit here
};

fluid.failureEvent.addListener(fQUnit.nodeFailureHandler, "fQUnit", "before:fail");

 */

QUnit.load();

// patch this function so it is not confused by the presence of the vestigial jQuery
QUnit.reset = fluid.identity;
// ensure that QUnit does not attempt to start synchronously and hence confuse the queue
// hack inside the IoC testing system
QUnit.config.autorun = false;

// Begin callbacks for test state

const colors = fluid.registerNamespace("colors");

colors.styles = {
    //styles
    "bold"      : [1,  22],
    "italic"    : [3,  23],
    "underline" : [4,  24],
    "inverse"   : [7,  27],
    //grayscale
    "white"     : [37, 39],
    "grey"      : [90, 39],
    "black"     : [90, 39],
    //colors
    "blue"      : [34, 39],
    "cyan"      : [36, 39],
    "green"     : [32, 39],
    "magenta"   : [35, 39],
    "red"       : [31, 39],
    "yellow"    : [33, 39]
};

// stolen from "colors" npm module which grubbily works by polluting global prototypes
colors.stylize = function (str, styles) {
    styles = fluid.makeArray(styles);

    let togo = str;
    for (let i = 0; i < styles.length; ++i) {
        togo = "\u001b[" + colors.styles[styles[i]][0] + "m" + togo +
            "\u001b[" + colors.styles[styles[i]][1] + "m";
    }
    return togo;
};

const testState = {
    currentModule: "",
    assertions: [],
    tests: [],
    global: null
};

QUnit.testStart(function (test) {
    testState.currentModule = test.module || "";
});

fQUnit.log = function () {
    const args = fluid.makeArray(arguments);
    args.unshift("fq: ");
    fluid.log.apply(null, args);
};

fQUnit.applyStyles = process.stdout.isTTY; // don't apply colour styles if not outputting to terminal

fQUnit.stylize = function (str, styles) {
    return fQUnit.applyStyles ? colors.stylize(str, styles) : str;
};

fQUnit.onAllTestsDone = fluid.makeEventFirer();

fQUnit.renderTestName = function (data, member) {
    return (data.module ? "Module \"" + data.module + "\" " : "") + "Test name \"" + data[member] + "\"";
};

fQUnit.passFail = function (failures) {
    return failures === 0 ? fQUnit.stylize("PASS", ["green", "bold"]) : fQUnit.stylize("FAIL", ["red", "bold"]);
};

fQUnit.passCount = function (data) {
    return data.passed + "/" + data.total;
};

/**
 * Callback for each assertion.
 * @param {Object} data
 */
QUnit.log(function (data) {
    data.test = QUnit.config.current.testName;
    data.module = testState.currentModule;
    testState.assertions.push(data);
    if (!data.result) {
        fQUnit.log(fQUnit.passFail(1) + ": " + fQUnit.renderTestName(data, "test") + " - Message: " + data.message);
        if (data.expected !== undefined) {
            fQUnit.log("Expected: ", data.expected);
            fQUnit.log("Actual: ", data.actual);
        }
        if (data.source) {
            fQUnit.log("Source: " + data.source);
        }
    }
});

/**
 * Callback for one done test.
 * @param {Object} test
 */
QUnit.testDone(function (data) {
    // use last module name if no module name defined
    data.module = data.module || testState.currentModule;
    testState.tests.push(data);
    fQUnit.log("Test concluded - " + fQUnit.renderTestName(data, "name") + ": " + fQUnit.passCount(data) + " passed - " +
        fQUnit.passFail(data.failed));
});

// Stolen from Underscore.js 1.4.3 - see licence at head of this file
/* jshint ignore:start */
fluid.debounce = function (func, wait, immediate) {
    let timeout, result;
    return function () {
        const context = this, args = arguments;
        const later = function () {
            timeout = null;
            if (!immediate) {
                result = func.apply(context, args);
            }
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) {
            result = func.apply(context, args);
        }
        return result;
    };
};
/* jshint ignore:end */

fQUnit.allTestsDone = function (data) {
    if (fQUnit.globalFailure) {
        ++data.failed;
        ++data.total;
    }
    testState.global = data;
    const success = data.failed === 0 && data.total !== 0;
    const separator = fQUnit.stylize("***************", [success ? "green" : "red", "bold"]);
    fQUnit.log(separator);
    if (data.total === 0) {
        fQUnit.log("Failure in fixture file - no tests were queued - " + fQUnit.passFail(1));
    } else {
        fQUnit.log("All tests concluded: " + fQUnit.passCount(data) + " total passed in " + data.runtime + "ms - " + fQUnit.passFail(data.failed));
    }
    fQUnit.log(separator);
    fQUnit.onAllTestsDone.fire(data);

    process.exit(success ? 0 : 1);
};
/**
 * Callback for all done tests in the file.
 * @param {Object} res
 */

// Debounce this to deal with case where QUnit notifies that all tests are done, when in fact
// it has just synchronously executed the first of a set of synchronous tests and another is
// just about to arrive.
// This strategy taken from kof's node-qunit: https://github.com/kof/node-qunit/blob/master/lib/child.js
QUnit.done(fluid.debounce(function (data) {
    fQUnit.allTestsDone(data);
}), 100);

fQUnit.testState = testState;

module.exports = fluid;
