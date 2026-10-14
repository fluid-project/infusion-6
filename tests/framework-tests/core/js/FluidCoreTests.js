/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid Core Tests");

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
    fluid.tests.pushArray.forEach(function (fixture) {
        const holder = Object.assign({}, fixture.holder);
        fluid.pushArray(holder, "m1", fixture.topush);
        assert.deepEqual(holder, fixture.expected, "fluid.pushArray - " + fixture.message);
    });
});

function isOdd(i) {
    return i % 2 === 1;
}

QUnit.test("fluid.transform", assert => {
    assert.deepEqual(fluid.transform({a: 0, b: 1}, isOdd), {a: false, b: true}, "Transform hash");
});

QUnit.test("null iteration for fluid.each and fluid.transform", assert => {
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

    fluid.setGlobalValue("fluid.newFunc", function () {
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

QUnit.test("Globals via fluid.getGlobalValue and fluid.registerNamespace", assert => {
    const space = fluid.registerNamespace("fluid.engage.mccord");
    space.func = function () {
        return 2;
    };
    assert.equal(fluid.engage.mccord.func(), 2, "Call function in namespace");

    const fluidd = fluid.getGlobalValue("nothing.fluid");
    assert.unavailable(fluidd, "No environment slippage");

    const fluidd2 = fluid.getGlobalValue("fluid.fluid");
    assert.unavailable(fluidd2, "No environment slippage");

    fluid.registerNamespace("cspace.autocomplete");
    const fluidd3 = fluid.getGlobalValue("cspace.fluid");
    assert.unavailable(fluidd3, "No environment slippage");
    const fluidd4 = fluid.getGlobalValue("cspace.fluid.get");
    assert.unavailable(fluidd4, "No environment slippage");
});

// Unavailable coalescing tests

/**
 * Construct a pending unavailable value, as a cell does on entering an asynchronous update.
 *
 * @param {String} name - A name identifying the notional cell which is pending.
 * @return {Unavailable} A pending unavailable value.
 */
fluid.tests.makePending = function (name) {
    return fluid.pending(undefined, name);
};

/**
 * Assert that a supplied value is a pending unavailable, and not an error unavailable.
 *
 * @param {Object} assert - The QUnit assertion object.
 * @param {Unavailable} value - The value to be checked.
 * @param {String} message - A description of the value's provenance, for assertion messages.
 */
fluid.tests.assertPending = function (assert, value, message) {
    assert.ok(fluid.isUnavailable(value), `${message} - value is unavailable`);
    assert.equal(value.variety, "pending", `${message} - variety is pending`);
    assert.ok(fluid.isPending(value), `${message} - recognised as pending`);
    assert.notOk(fluid.isErrorUnavailable(value), `${message} - not an error`);
};

QUnit.test("Merging two pending unavailables yields a pending unavailable", function (assert) {
    const merged = fluid.mergeUnavailable(fluid.tests.makePending("first"), fluid.tests.makePending("second"));
    fluid.tests.assertPending(assert, merged, "mergeUnavailable of two pendings");
    assert.equal(merged.causes.length, 2, "Both causes are retained");
});

QUnit.test("Constructing an unavailable from pending causes yields a pending unavailable", function (assert) {
    // The route taken by fluid.cell.mapSignalArgs when a computation has several pending arguments
    const causes = [fluid.tests.makePending("first"), fluid.tests.makePending("second")];
    fluid.tests.assertPending(assert, fluid.unavailable(causes), "fluid.unavailable over pending causes");
});

QUnit.test("Reapplying pending causes to an existing pending unavailable keeps it pending", function (assert) {
    // The route taken by fluid.cell.mapSignalArgs when the cell's previous value was already pending
    const existing = fluid.tests.makePending("existing");
    fluid.applyUnavailable(existing, [fluid.tests.makePending("first"), fluid.tests.makePending("second")]);
    fluid.tests.assertPending(assert, existing, "applyUnavailable onto a pending");
});

QUnit.test("Merging into an absent value preserves pending variety", function (assert) {
    // The route taken by fluid.flattenSignals, which accumulates from an initially undefined value
    const merged = fluid.mergeUnavailable(undefined, fluid.tests.makePending("only"));
    fluid.tests.assertPending(assert, merged, "mergeUnavailable into undefined");
});

QUnit.test("Error variety dominates pending in either order", function (assert) {
    const pending = fluid.tests.makePending("pending");
    const failure = fluid.unavailable("Something failed", "error");
    [[pending, failure], [failure, pending]].forEach(function ([left, right], index) {
        const merged = fluid.mergeUnavailable(left, right);
        assert.equal(merged.variety, "error", `Merged variety is error - ordering ${index}`);
        assert.notOk(fluid.isPending(merged), `Not recognised as pending - ordering ${index}`);
    });
});

QUnit.test("An explanatory cause which declares its underlying variety does not escalate it", function (assert) {
    // The idiom to use when wrapping an upstream unavailable with a message, as fluid.fetchContextReference does
    const target = fluid.tests.makePending("target");
    const explanation = fluid.unavailable({message: "Cannot fetch path of unresolved context"}, target.variety);
    fluid.tests.assertPending(assert, fluid.mergeUnavailable(explanation, target), "Explained pending");
});

QUnit.test("A variety absent from the priority table throws", function (assert) {
    assert.throws( () => {
        fluid.mergeUnavailable(fluid.unavailable("First", "I/O"), fluid.unavailable("Second", "I/O"));
    }, (err) => err.message.includes("variety"),
    "Error thrown creating unavailable with unknown variety");
});

QUnit.test("An empty list of causes takes the declared or default variety", function (assert) {
    assert.equal(fluid.unavailable([], "config").variety, "config", "Declared variety is honoured");
    assert.equal(fluid.unavailable([]).variety, "error", "Default variety applies");
});

QUnit.test("Constructing an unavailable neither mutates nor aliases the supplied causes", function (assert) {
    const bare = {message: "A cause without a variety"};
    fluid.unavailable([bare]);
    assert.notOk("variety" in bare, "The caller's cause object has not had a variety written into it");

    const original = fluid.tests.makePending("original");
    const merged = fluid.mergeUnavailable(original, fluid.tests.makePending("other"));
    // fluid.siteSignal writes a site into each cause of an unavailable in this way
    merged.causes[0].site = "a later site";
    assert.equal(original.site, "original", "Siting the merged value's cause does not reach the original");
});

QUnit.test("Directly constructed unavailables retain their declared or default variety", function (assert) {
    assert.equal(fluid.unavailable("Something failed").variety, "error",
        "An unavailable constructed from a bare message defaults to error");
    assert.equal(fluid.unavailable("Not configured", "config").variety, "config",
        "An explicitly declared variety is honoured");
});
