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

/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid JS Tests");

fluid.tests.plainObjectTrue = {
    "object": {},
    "noproto": Object.create(null),
    "malignNoProto": Object.create(null, {"constructor": {value: "thing"}})
};

fluid.tests.plainObjectFalse = {
    "null": null,
    "undefined": undefined,
    "document": document,
    "window": window
};

QUnit.test("fluid.isPlainObject tests", assert => {
    fluid.each(fluid.tests.plainObjectTrue, function (totest, key) {
        assert.equal(fluid.isPlainObject(totest), true, "Expected plain: " + key);
        assert.equal(fluid.isPlainObject(totest, true), true, "Expected plain in strict: " + key);
    });
    fluid.each(fluid.tests.plainObjectFalse, function (totest, key) {
        assert.equal(fluid.isPlainObject(totest), false, "Expected nonplain: " + key);
        assert.equal(fluid.isPlainObject(totest, true), false, "Expected nonplain in strict: " + key);
    });
    assert.equal(fluid.isPlainObject([]), true, "Array is plain by standard");
    assert.equal(fluid.isPlainObject([], true), false, "Array is nonplain in strict");
});

fluid.tests.plainObjectFalseArrayable = {
    "null": false,
    "undefined": false,
    "document": false,
    "window": false,
    "jDocument": true,
    "component": false
};

fluid.tests.arrayableFalse = {
    fakeJquery: {jquery: true},
    fakeArray: {length: 10}
};

QUnit.test("fluid.isArrayable tests", assert => {
    fluid.each(fluid.tests.plainObjectTrue, function (totest, key) {
        assert.equal(fluid.isArrayable(totest), false, "Expected not isArrayable: " + key);
    });
    fluid.each(fluid.tests.plainObjectFalse, function (totest, key) {
        assert.equal(fluid.isArrayable(totest), fluid.tests.plainObjectFalseArrayable[key], "Expected isArrayable: " + key);
    });
    fluid.each(fluid.tests.arrayableFalse, function (totest, key) {
        assert.equal(fluid.isArrayable(totest), false, "Expected not isArrayable: " + key);
    });
    assert.equal(fluid.isArrayable([]), true, "Array is arrayable");
});


QUnit.test("fluid.makeArray tests", assert => {
    assert.deepEqual(fluid.makeArray(1), [1], "fluid.makeArray on non-array");
    assert.deepEqual(fluid.makeArray(null), [], "fluid.makeArray on null");
    assert.deepEqual(fluid.makeArray(undefined), [], "fluid.makeArray on undefined");
    const inputArray = [1];
    const outputArray = fluid.makeArray(inputArray);
    assert.deepEqual(inputArray, outputArray, "fluid.makeArray on array - deep equality");
    assert.notEqual(inputArray, outputArray, "fluid.makeArray on array - cloning");
});

fluid.tests.pushArray = [
    {
        message: "nonexistent element - nonarray",
        holder: {},
        topush: 1,
        expected: {
            m1: [1]
        }
    }, {
        message: "nonexistent element - array",
        holder: {},
        topush: [1],
        expected: {
            m1: [1]
        }
    }, {
        message: "existent element - nonarray",
        holder: {
            m1: [1]
        },
        topush: 2,
        expected: {
            m1: [1, 2]
        }
    }, {
        message: "existent element - array",
        holder: {
            m1: [1]
        },
        topush: [2, 3],
        expected: {
            m1: [1, 2, 3]
        }
    }
];

QUnit.test("fluid.pushArray tests", assert => {
    fluid.each(fluid.tests.pushArray, function (fixture) {
        const holder = Object.assign({}, fixture.holder);
        fluid.pushArray(holder, "m1", fixture.topush);
        assert.deepEqual(holder, fixture.expected, "fluid.pushArray - " + fixture.message);
    });
});

function isOdd(i) {
    return i % 2 === 1;
}

QUnit.test("remove_if", assert => {
    assert.deepEqual(fluid.remove_if([2, 4, 6, 8], isOdd), [2, 4, 6, 8], "Remove nothing");
    assert.deepEqual(fluid.remove_if([1, 2, 4, 6, 8], isOdd), [2, 4, 6, 8], "Remove first");
    assert.deepEqual(fluid.remove_if([2, 4, 6, 8, 9], isOdd), [2, 4, 6, 8], "Remove last");
    assert.deepEqual(fluid.remove_if([7, 1, 2, 4, 6, 8], isOdd), [2, 4, 6, 8], "Remove first two");
    assert.deepEqual(fluid.remove_if([2, 4, 6, 8, 9, 11], isOdd), [2, 4, 6, 8], "Remove last two");
    assert.deepEqual(fluid.remove_if([1, 3, 5, 7], isOdd), [], "Remove all");
    assert.deepEqual(fluid.remove_if([], isOdd), [], "Remove from nothing");

    assert.deepEqual(fluid.remove_if({"two": 2, "four": 4, "six": 6, "eight": 8}, isOdd),
        {"two": 2, "four": 4, "six": 6, "eight": 8}, "Remove nothing (object)");
    assert.deepEqual(fluid.remove_if({"one": 1, "two": 2, "four": 4, "six": 6, "eight": 8}, isOdd),
        {"two": 2, "four": 4, "six": 6, "eight": 8}, "Remove first (object)");
    assert.deepEqual(fluid.remove_if({"two": 2, "four": 4, "six": 6, "eight": 8, "nine": 9}, isOdd),
        {"two": 2, "four": 4, "six": 6, "eight": 8}, "Remove last (object)");
    assert.deepEqual(fluid.remove_if({"seven": 7, "one": 1, "two": 2, "four": 4, "six": 6, "eight": 8}, isOdd),
        {"two": 2, "four": 4, "six": 6, "eight": 8}, "Remove first two (object)");
    assert.deepEqual(fluid.remove_if({"two": 2, "four": 4, "six": 6, "eight": 8, "nine": 9, "eleven": 11}, isOdd),
        {"two": 2, "four": 4, "six": 6, "eight": 8}, "Remove last two (object)");
    assert.deepEqual(fluid.remove_if({"one": 1, "three": 3, "five": 5, "seven": 7}, isOdd), {},
        "Remove all (object)");
    assert.deepEqual(fluid.remove_if({}, isOdd), {}, "Remove from nothing (object)");
});

fluid.tests.indexChecker = function (value, index) {
    QUnit.assert.equal(value, index, "Index should remain stable through removal: " + value);
    return value === 1 || value === 2;
};

QUnit.test("remove_if index stability and target", assert => {
    assert.expect(5);
    const target = [];
    fluid.remove_if([0, 1, 2, 3], fluid.tests.indexChecker, target);
    assert.deepEqual(target, [1, 2], "Target contains removed elements in original order");
});

QUnit.test("transform", assert => {
    assert.deepEqual(fluid.transform({a: 0, b: 1}, isOdd), {a: false, b: true}, "Transform hash");
});

QUnit.test("null iteration", assert => {
    assert.expect(2);

    fluid.each(null, function () {
        assert.ok(false, "This should not run");
    });
    var transformed = fluid.transform(null, function () {
        assert.ok(false, "This should not run");
    });
    assert.equal(transformed, null, "Output of null transform should be null");

    assert.true(true, "a null each and a null transform don't crash the framework");
});

QUnit.test("null iteration", assert => {
    assert.expect(2);

    fluid.each(null, function () {
        assert.ok(false, "This should not run");
    });
    const transformed = fluid.transform(null, function () {
        assert.ok(false, "This should not run");
    });
    assert.equal(transformed, null, "Output of null transform should be null");

    assert.true(true, "a null each and a null transform don't crash the framework");
});

QUnit.test("stringTemplate: greedy", assert => {
    const template = "%tenant/%tenantname";
    const tenant = "../tenant";
    const tenantname = "core";
    const expected = "../tenant/core";
    const result = fluid.stringTemplate(template, { tenant: tenant, tenantname: tenantname });
    assert.equal(expected, result, "The template strings should match.");
});

QUnit.test("stringTemplate: array of string values", assert => {
    const template = "Paused at: %0 of %1 files (%2 of %3)";

    const atFile = "12";
    const totalFiles = "14";
    const atSize = "100 Kb";
    const totalSize = "12000 Gb";
    const data = [atFile, totalFiles, atSize, totalSize];

    const expected = "Paused at: " + atFile +
        " of " + totalFiles +
        " files (" + atSize +
        " of " + totalSize + ")";

    const result = fluid.stringTemplate(template, data);
    assert.equal(expected, result, "The template strings should match.");
});

QUnit.test("stringTemplate: data object", assert => {
    const template = "Paused at: %atFile of %totalFiles files (%atSize of %totalSize)";

    const data = {
        atFile: 12,
        totalFiles: 14,
        atSize: "100 Kb",
        totalSize: "12000 Gb"
    };

    const expected = "Paused at: " + data.atFile +
        " of " + data.totalFiles +
        " files (" + data.atSize +
        " of " + data.totalSize + ")";

    const result = fluid.stringTemplate(template, data);
    assert.equal(expected, result, "The template strings should match.");
});

QUnit.test("stringTemplate: empty string", assert => {
    const template = "Hello %name!";

    const data = {
        name: ""
    };

    const expected = "Hello !";
    const result = fluid.stringTemplate(template, data);
    assert.equal(expected, result, "The template strings should match.");
});

QUnit.test("stringTemplate: missing value", assert => {
    const template = "Paused at: %atFile of %totalFiles files (%atSize of %totalSize)";

    const data = {
        atFile: 12,
        atSize: "100 Kb",
        totalSize: "12000 Gb"
    };

    const expected = "Paused at: " + data.atFile +
        " of %totalFiles" +
        " files (" + data.atSize +
        " of " + data.totalSize + ")";

    const result = fluid.stringTemplate(template, data);
    assert.equal(expected, result, "The template strings should match.");
});

QUnit.test("stringTemplate: multiple replacement", assert => {
    const template = "Paused at: %0 of %0 files (%1 of %2)";

    const atFile = "12";
    const totalFiles = "14";
    const atSize = "100 Kb";
    const data = [atFile, totalFiles, atSize];

    const expected = "Paused at: " + atFile +
        " of " + atFile +
        " files (" + totalFiles +
        " of " + atSize + ")";

    const result = fluid.stringTemplate(template, data);
    assert.equal(expected, result, "The template strings should match.");
});

QUnit.test("FLUID-4842 test - configurable \"soft failure\"", assert => {
    const testArgs = [1, "thingit"];

    function failHandle(args) {
        assert.deepEqual(args, testArgs, "Received arguments in error handler");
        fluid.builtinFail(args); // throw exception to keep expectFrameworkDiagnostic happy
    }

    assert.expect(1);
    fluid.failureEvent.addListener(failHandle, "fail");
    assert.expectFluidError("Configurable failure handler", function () {
        fluid.fail.apply(null, testArgs);
    }, "thingit");
    fluid.failureEvent.removeListener("fail");
});

QUnit.test("FLUID-5807 tests - identify fluid.FluidError", assert => {
    const error = new fluid.FluidError("thing");
    assert.true(error instanceof fluid.Error, "Framework error is an error (from its own perspective)");
    assert.true(error instanceof fluid.FluidError, "Framework error is an instance of itself");
    const stack = error.stack.toString();
    assert.notEqual(stack.indexOf("FluidJSTests"), -1, "Our own filename must appear in the stack");
});

function passTestLog(assert, level, expected) {
    assert.equal(fluid.passLogLevel(fluid.logLevel[level]), expected, "Should " + (expected ? "not " : "") + "pass debug level " + level);
}

QUnit.test("FLUID-4936 test - support for logging levels", assert => {
    fluid.setLogging(true);
    passTestLog(assert, "INFO", true);
    passTestLog(assert, "IMPORTANT", true);
    passTestLog(assert, "TRACE", false);
    fluid.popLogging();
    fluid.setLogging(false);
    passTestLog(assert, "INFO", false);
    passTestLog(assert, "IMPORTANT", true);
    fluid.popLogging();
    fluid.setLogging(fluid.logLevel.TRACE);
    passTestLog(assert, "TRACE", true);
    fluid.popLogging();
});

QUnit.test("FLUID-4973 test - activity logging does not crash", assert => {
    fluid.pushActivity("testActivity", "testing my activity with argument %argument", { argument: 3 });
    const activity = fluid.getActivityStack();
    assert.true(activity.length === 1, "One activity in progress");
    const rendered = fluid.renderActivity(activity)[0].join("");
    assert.notEqual(rendered.indexOf("testing my activity with argument 3"), -1, "Activity string rendered");
    fluid.logActivity(activity); // This would previously crash on IE8
    fluid.popActivity();
});

fluid.tests.insert42 = function (args) {
    args.push(42);
};

fluid.tests.memoryLog = [];

fluid.tests.doMemoryLog = function (args) {
    fluid.tests.memoryLog.push(args);
};

QUnit.test("FLUID-6330 test - interception of fluid.log", assert => {
    fluid.loggingEvent.addListener(fluid.tests.insert42, "42", "before:log");
    fluid.loggingEvent.addListener(fluid.tests.doMemoryLog, "log");
    fluid.log("Zis guy");
    // Slice to remove the timestamp argument unshifted by the standard interceptor
    assert.deepEqual(
        fluid.tests.memoryLog[0].slice(1),
        ["Zis guy", 42],
        "Logged to memory with interception"
    );
    fluid.loggingEvent.removeListener(fluid.tests.doMemoryLog);
    fluid.loggingEvent.removeListener("42");
    const listeners = fluid.loggingEvent.sortedListeners.map(rec => rec.listener);
    assert.false(listeners.includes(fluid.tests.insert42), "Intercepting listener removed");
    assert.false(listeners.includes(fluid.tests.doMemoryLog), "Memory log listener removed");
    assert.true(listeners.includes(fluid.doBrowserLog), "Browser log listener restored");
});

QUnit.test("fluid.get and fluid.set", assert => {
    const model = { "path3": "thing" };
    assert.equal(fluid.get(model, "path3"), "thing", "Get simple value");
    assert.deepEqual(fluid.get(model, ""), model, "Get root value");
    assert.undefined(fluid.get(model, "path3.nonexistent"), "Get blank value");
    assert.undefined(fluid.get(model, "path3.nonexistent.non3"), "Get blank value");
    assert.undefined(fluid.get(model, "path1.nonexistent"), "Get blank value");
    assert.undefined(fluid.get(model, "path1.nonexistent.non3"), "Get blank value");
    assert.undefined(fluid.get(model, "path1"), "Get blank value");

    fluid.set(model, "path2.past", "attach");
    assert.deepEqual(model, { path2: { past: "attach" }, path3: "thing" }, "Set blank value");

    fluid.registerGlobalFunction("fluid.newFunc", function () {
        return 2;
    });
    assert.equal(fluid.newFunc(), 2, "Call new global function");
});

QUnit.test("fluid.get for FLUID-6217 - get ending at falsy value", assert => {
    assert.undefined(fluid.get([0, 1, 2], "0.value"), "Simple 0-based fetch");
    assert.undefined(fluid.get([0, 1, 2], "0.any.path.at.all"), "Nested 0-based fetch");
    assert.undefined(fluid.get([0, false, 2], "1.foo.bar.baz"), "Nested false-based fetch");
    assert.undefined(fluid.get({ foo: false }, "foo.bar.baz"), "Fetch from hash");
});

QUnit.test("Globals", assert => {
    const space = fluid.registerNamespace("fluid.engage.mccord");
    space.func = function () {
        return 2;
    };
    assert.equal(fluid.engage.mccord.func(), 2, "Call function in namespace");

    const fluidd = fluid.getGlobalValue("nothing.fluid");
    assert.undefined(fluidd, "No environment slippage");

    const fluidd2 = fluid.getGlobalValue("fluid.fluid");
    assert.undefined(fluidd2, "No environment slippage");

    fluid.registerNamespace("cspace.autocomplete");
    const fluidd3 = fluid.getGlobalValue("cspace.fluid");
    assert.undefined(fluidd3, "No environment slippage");
    const fluidd4 = fluid.getGlobalValue("cspace.fluid.get");
    assert.undefined(fluidd4, "No environment slippage");
});

QUnit.test("Sorting listeners", assert => {
    const accumulate = [];
    const makeListener = function (i) {
        return function () {
            accumulate.push(i);
        };
    };
    const firer = fluid.makeEventFirer();
    firer.addListener(makeListener(4), null, "last");
    firer.addListener(makeListener(3));
    firer.addListener(makeListener(2), null, 10);
    firer.addListener(makeListener(1), null, "first");
    firer.fire();
    assert.deepEqual(accumulate, [1, 2, 3, 4], "Listeners fire in priority order");
});

QUnit.test("Attach and remove listeners", assert => {
    const testListener = function (shouldExecute) {
        assert.ok(shouldExecute, "Listener firing " + (shouldExecute ? "" : "not ") + "expected");
    };

    assert.expect(2);
    const firer = fluid.makeEventFirer();
    firer.addListener(testListener);
    firer.fire(true);
    firer.removeListener(testListener);
    firer.fire(false); // listener should not run and assertion should not execute

    firer.addListener(testListener, "namespace");
    firer.fire(true);
    firer.removeListener(testListener);
    firer.fire(false);
    firer.removeListener("toRemoveNonExistent"); // for FLUID-4791
    firer.fire(false);
});

QUnit.test("FLUID-5506 stack for namespaced listeners", assert => {
    const firer = fluid.makeEventFirer();
    const record = [];

    function addOne(arg) {
        firer.addListener(function () {
            record.push(arg);
        }, "namespace");
    }

    addOne(1);
    addOne(2); // this one is top of stack
    firer.fire();
    firer.removeListener("namespace");
    firer.fire(); // listener 1 is now top of stack
    assert.deepEqual(record, [2, 1], "Listener removed by namespace reveals earlier");
});


fluid.tests.constraintTests = [{
    name: "one before",
    listeners: {
        "a": "",
        "b": "before:a"
    },
    expected: "ba"
}, {
    name: "one after, two last, one standard",
    listeners: {
        "a": "after:b",
        "d": "",
        "b": "last:testing",
        "c": "last"
    },
    expected: "dcba"
}, {
    name: "one before, one after, two first",
    listeners: {
        "a": "before:d",
        "b": "first",
        "c": "first:authoring",
        "d": "after:b"
    },
    expected: "cbad"
}, {
    name: "two fixed, three after",
    listeners: {
        "a": "after:b",
        "b": 10,
        "c": 20,
        "d": "after:e",
        "e": "after:c"
    },
    expected: "cedba"
}, {
    name: "nonexistent reference", // in theory this should be a failure but we can't arrange to add listeners atomically
    listeners: {
        "a": "before:b"
    },
    expected: "a"
}];

fluid.tests.upgradeListeners = function (listeners) {
    return Object.entries(listeners).map(([key, value]) => {
        return {
            ...value,
            namespace: key,
            priority: fluid.parsePriority(value, 0, false, "listeners")
        };
    });
};

QUnit.test("FLUID-5506 constraint-based listeners", function (assert) {
    fluid.each(fluid.tests.constraintTests, function (fixture) {
        const listeners = fluid.tests.upgradeListeners(fixture.listeners);
        fluid.sortByPriority(listeners);
        const flattened = listeners.map(function (listener) {
            return listener.namespace;
        }).join("");
        assert.strictEqual(flattened, fixture.expected, "Expected sort order for test " + fixture.name);
    });
});

QUnit.test("FLUID-5506: constraint-based listeners - failure cases", function (assert) {
    fluid.each(fluid.tests.failedConstraintTests, function (fixture) {
        assert.expectFluidError("Expected failure for test " + fixture.name, function () {
            const listeners = fluid.tests.upgradeListeners(fixture.listeners);
            fluid.sortByPriority(listeners);
        }, "Could not find targets");
    });
});

fluid.tests.failedConstraintTests = [{
    name: "self-reference",
    listeners: {
        "a": "before:a"
    }
}, {
    name: "cyclic reference (2)",
    listeners: {
        "a": "before:b",
        "b": "before:a"
    }
}, {
    name: "cyclic reference (3)",
    listeners: {
        "a": "before:b",
        "b": "before:c",
        "c": "before:a"
    }
}, {
    name: "cyclic reference (2) + fixed",
    listeners: {
        "a": 10,
        "b": "before:c",
        "c": "before:b"
    }
}];

fluid.tests.invokeGlobalFunction = {
    withArgs: function (arg1) {
        QUnit.assert.strictEqual(arguments.length, 1, "A single argument should have been passed in");
        QUnit.assert.strictEqual(arg1, "test arg", "The correct argument should have been passed in");
    },
    withoutArgs: function () {
        QUnit.assert.strictEqual(arguments.length, 0, "There should not have been any arguments passed in");
    }
};

QUnit.test("FLUID-4915: fluid.invokeGlobalFunction", function (assert) {
    assert.expect(3);

    fluid.invokeGlobalFunction("fluid.tests.invokeGlobalFunction.withArgs", ["test arg"]);
    fluid.invokeGlobalFunction("fluid.tests.invokeGlobalFunction.withoutArgs");
});

fluid.def("fluid.tests.functionWithoutArgMap", {
    gradeNames: "fluid.function"
});

QUnit.test("fluid.invokeGradedFunction - diagnostics from bad invocations", function (assert) {
    function testInvalidGradedFunction(name) {
        assert.expectFluidError("fluid.invokeGradedFunction - failure case - " + name, function () {
            fluid.invokeGradedFunction(name);
        }, "Cannot look up name");
    }

    testInvalidGradedFunction("fluid.tests.nonexistentName");
    testInvalidGradedFunction("fluid.tests.functionWithoutArgMap");
    testInvalidGradedFunction("fluid.tests.gradeComponent");
});

fluid.def("fluid.tests.functionWithArgMap", {
    gradeNames: "fluid.function",
    argumentMap: {
        numerator: 0,
        denominator: 1
    }
});

fluid.tests.functionWithArgMap = function (numerator, denominator) {
    return numerator / denominator;
};

QUnit.test("fluid.tests.functionWithArgMap", function (assert) {
    assert.expect(1);

    const result = fluid.tests.functionWithArgMap(10, 2);
    assert.strictEqual(result, 5, "Function with argument map correctly computes the division.");
});


QUnit.test("FLUID-4915: fluid.invokeGlobalFunction", function (assert) {
    assert.expect(3);

    fluid.invokeGlobalFunction("fluid.tests.invokeGlobalFunction.withArgs", ["test arg"]);
    fluid.invokeGlobalFunction("fluid.tests.invokeGlobalFunction.withoutArgs");
});

// C3 tests adapted from https://github.com/federicobond/c3-linearization/blob/master/test/test.js
fluid.tests.c3tests = [{
    name: "single inheritance case",
    defs: {
        A: ["B"],
        B: ["C"],
        C: []
    },
    expected: {"A": ["A", "B", "C"], "B": ["B", "C"], "C": ["C"]}
}, {
    name: "multiple inheritance case",
    defs: {"A": [], "B": [], "C": [], "D": [], "E": [], "K1": ["A", "B", "C"], "K2": ["D", "B", "E"], "K3": ["D", "A"], "Z": ["K1", "K2", "K3"]},
    expected:  {"A": ["A"], "B": ["B"], "C": ["C"], "D": ["D"], "E": ["E"], "K1": ["K1", "A", "B", "C"], "K2": ["K2", "D", "B", "E"],
        "K3": ["K3", "D", "A"], "Z": ["Z", "K1", "K2", "K3", "D", "A", "B", "C", "E"]}
}, { // We don't treat this the way c3-linearization does - an undefined layer is an error as per FLUID-6123
    name: "with missing elements",
    defs: {"K1": ["A", "B", "C"], "K2": ["D", "B", "E"], "K3": ["D", "A"], "Z": ["K1", "K2", "K3"]},
    error: ["A", "not defined"]
}, {
    name: "Solidity",
    defs: {
        ERC721Basic: [],
        ERC721Enumerable: ["ERC721Basic"],
        ERC721Metadata: ["ERC721Basic"],
        ERC721: ["ERC721Metadata", "ERC721Enumerable", "ERC721Basic"]
    },
    expected: {
        ERC721Enumerable: ["ERC721Enumerable", "ERC721Basic"],
        ERC721Metadata: ["ERC721Metadata", "ERC721Basic"],
        ERC721: ["ERC721", "ERC721Metadata", "ERC721Enumerable", "ERC721Basic"],
        ERC721Basic: ["ERC721Basic"]
    }
}, {
    name: "Circular",
    defs: {
        a: ["b"], b: ["c"], c: ["b"]
    },
    error: ["Circular"]
}, { // Adapted from ex_2 in https://www.python.org/download/releases/2.3/mro/#the-end
    name: "Inconsistent",
    defs: {
        O: [], X: ["O"], Y: ["O"], A: ["X", "Y"], B: ["Y", "X"], Z: ["A", "B"]
    },
    error: ["Inconsistent", "Z"]
}
];

fluid.tests.c3tests.forEach(fixture => {
    QUnit.test(`C3 linearisation for FLUID-5800: ${fixture.name}`, function (assert) {
        // Check that grade registry is not corrupted by algorithm
        const defs = fluid.freezeRecursive(fluid.transform(fixture.defs, def => ({$layers: def})));
        if (fixture.expected) {
            Object.keys(defs).forEach(key => {
                const message = "Linearization of layer " + key;
                const lin = fluid.C3_precedence(key, defs);
                assert.deepEqual(lin, fixture.expected[key], message);
            });
        } else {
            const last = Object.keys(defs).reverse()[0];
            assert.expectFluidError("Expected failure", () => fluid.C3_precedence(last, defs), fixture.error);
        }
    });
});
