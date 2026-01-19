"use strict";

/* global QUnit */

QUnit.module("Fluid Signals Async Tests");

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L15

QUnit.test("Diamond should not cause waterfalls on read (async)", async assert => {
    //     s
    //    / \
    //   /   \
    //  b     c
    //   \   /
    //    \ /
    //     e

    const s = fluid.cell(1, {name: "s"});

    let async1Calls = 0, async2Calls = 0;
    let effectCalls = 0, effectArgs = [];

    const async1 = async (v) => {
        async1Calls++;
        const togo = await Promise.resolve(v);
        console.log("b's compute resolved");
        return togo;
    };

    const async2 = async (v) => {
        async2Calls++;
        const togo = await Promise.resolve(v);
        console.log("c's compute resolved");
        return togo;
    };

    const b = fluid.cell();
    b.name = "b";
    b.asyncComputed(async1, [s]);

    const c = fluid.cell();
    c.name = "c";
    c.asyncComputed(async2, [s]);

    const e = fluid.cell.effect((v1, v2) => {
        effectCalls++;
        effectArgs.push([v1, v2]);
    }, [b, c], {name: "e"});

    // At this point, async1/async2 should have been called once, effect not yet called
    assert.equal(async1Calls, 1, "async1 called once initially");
    assert.equal(async2Calls, 1, "async2 called once initially");
    assert.equal(effectCalls, 0, "effect not called yet");

    // Wait for asyncs to resolve
    await new Promise(r => setTimeout(r, 0));

    assert.equal(async1Calls, 1, "async1 still called once after resolve");
    assert.equal(async2Calls, 1, "async2 still called once after resolve");
    assert.equal(effectCalls, 1, "effect called once after resolve");
    assert.deepEqual(effectArgs[0], [1, 1], "effect called with [1, 1]");

    s.set(2);

    // Weird asymmetry in Solid's test - expectation that arcs execute immediately on setup, but not on update
    // We don't have a "flush" phase but if we did it should work symmetrically
    // assert.equal(async1Calls, 1, "async1 not called again after set before flush");
    // assert.equal(async2Calls, 1, "async2 not called again after set before flush");
    // assert.equal(effectCalls, 1, "effect not called again before flush");
    // assert.equal(async1Calls, 2, "async1 called again after flush");
    // assert.equal(async2Calls, 2, "async2 called again after flush");
    // assert.equal(effectCalls, 1, "effect not called again until asyncs resolve");

    // Wait for asyncs to resolve
    await new Promise(r => setTimeout(r, 0));

    assert.equal(async1Calls, 2, "async1 called twice after resolve");
    assert.equal(async2Calls, 2, "async2 called twice after resolve");
    assert.equal(effectCalls, 2, "effect called again after asyncs resolve, exactly twice in total");
    assert.deepEqual(effectArgs[1], [2, 2], "effect called with [2, 2]");

    e.dispose();

});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L63

QUnit.test("Waterfall when dependent on another async with shared source", async assert => {
    // Graph:
    //    s
    //   /|
    //  a |
    //   \|
    //    b
    //    |
    //    e

    const s = fluid.cell(1, {name: "s"});

    let a;
    let async1Calls = 0, async2Calls = 0;
    let effectCalls = 0, effectArgs = [];

    const async1 = async (sv) => {
        async1Calls++;
        const togo = await Promise.resolve(sv);
        return togo;
    };

    const async2 = async (sv, av) => {
        async2Calls++;
        const togo = await Promise.resolve(sv + av);
        return togo;
    };

    a = fluid.cell();
    a.name = "a";
    a.asyncComputed(async1, [s]);

    const b = fluid.cell();
    b.name = "b";
    b.asyncComputed(async2, [s, a]);

    const e = fluid.cell.effect(v => {
        effectCalls++;
        effectArgs.push(v);
    }, [b], {name: "e"});

    // Initial expectations: asyncs scheduled, effect not yet called
    assert.equal(async1Calls, 1, "async1 called once initially");
    assert.equal(async2Calls, 0, "async2 not called initially");
    assert.equal(effectCalls, 0, "effect not called yet");

    // Wait for asyncs to resolve: b should recompute after a resolves
    await new Promise(r => setTimeout(r, 0));
    assert.equal(async1Calls, 1, "async1 still called once after resolve");
    // Milo has two calls here, but the 2nd is unnecessary with static dependencies
    assert.equal(async2Calls, 1, "async2 called once after a resolves");
    assert.equal(effectCalls, 1, "effect called once after resolve");
    assert.equal(effectArgs[0], 2, "effect called with 2");

    console.log("Starting update s to 2");
    // Update source
    s.set(2);

    // Wait for asyncs to resolve
    await new Promise(r => setTimeout(r, 0));
    assert.equal(async1Calls, 2, "async1 called twice after update resolves");
    assert.equal(async2Calls, 2, "async2 called twice after update resolves");
    // Milo has 4 here, we have two through using static dependencies
    assert.equal(effectCalls, 2, "effect called twice in total after second resolve");
    assert.equal(effectArgs[1], 4, "effect called with 4");

    e.dispose();
});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L112

QUnit.test("Should show stale state with unavailable", async assert => {

    const s = fluid.cell(1);

    const async1 = () => Promise.resolve(s.get());

    const a = fluid.cell().asyncComputed(async () => {
        return await async1();
    });

    fluid.cell.effect(() => {}, [a]); // ensure re-compute

    const b = fluid.cell().computed(av => fluid.isUnavailable(av) ? "stale" : "not stale", [a], {isFree: true});

    assert.equal(b.get(), "stale");

    await new Promise(r => setTimeout(r, 0));

    assert.equal(b.get(), "not stale");
    assert.equal(a.get(), 1);

    s.set(2);

    assert.equal(b.get(), "stale");

    await new Promise(r => setTimeout(r, 0));

    assert.equal(b.get(), "not stale");
    assert.equal(a.get(), 2);
});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L133

QUnit.test("Should handle refreshes", async assert => {

    let n = 1;

    const a = fluid.cell().asyncComputed(async () => {
        return Promise.resolve(n++);
    });

    const b = fluid.cell().computed((aVal) =>
        fluid.isUnavailable(aVal) ? "stale" : aVal
    , [a], {isFree: true});

    assert.ok(b.get(), "stale", "b is stale/unavailable before first resolution");

    // Allow first async resolution
    await new Promise(r => setTimeout(r, 0));
    assert.equal(b.get(), 1, "First resolved value");

    // Refresh puts a back into pending but keeps stale value
    a.refresh();
    assert.equal(b.get(), "stale", "Shows stale value after refresh");

    // Allow refreshed async resolution
    await new Promise(r => setTimeout(r, 0));
    assert.equal(b.get(), 2, "Second resolved value");

    // Refresh again
    a.refresh();
    assert.equal(b.get(), "stale", "Shows stale value after second refresh");

    // Allow resolution
    await new Promise(r => setTimeout(r, 0));
    assert.equal(b.get(), 3, "Third resolved value");
});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L154

QUnit.test("Should show pending state", async assert => {

    const s = fluid.cell(1);
    let res = null;

    const async1 = () => Promise.resolve(s.get());

    const a = fluid.cell().asyncComputed(async () => {
        return await async1();
    });

    // Solid's "pending" operator is unnecessary in fluid.cell since we promote static dependencies and
    // reads will never throw
    const pp = fluid.cell().computed(
        (sVal) => sVal, [s, a],
        { isFree: true }
    );

    // Effect to capture projected value
    fluid.cell.effect((ppVal) => {
        res = ppVal;
    }, [pp]);

    // Allow initial async resolution
    await new Promise(r => setTimeout(r, 0));
    assert.equal(res, 1, "Initial value observed");

    // Trigger update
    s.set(2);

    // Force synchronous propagation
    pp.get();

    assert.equal(res, 2, "Updated value visible while async is pending");

    // Allow async to settle
    await new Promise(r => setTimeout(r, 0));
    assert.equal(res, 2, "Value remains stable after async resolution");
});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L177

QUnit.test("Should resolve to a value with resolveAsync (untracked)", async assert => {

    const s = fluid.cell(1);

    const a = fluid.cell().asyncComputed(async () => {
        return s.get();
    });

    let value;

    // Effect with no reactive dependencies, runs exactly once
    fluid.cell.effect(
        () => {
            (async () => { // Untracked async read
                value = await fluid.cell.signalToPromise(a);
            })();
        },
        []
    );

    // Not yet resolved
    assert.strictEqual(value, undefined, "Value is undefined before async resolution");

    // Allow first async resolution
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(value, 1, "Resolved to initial value");

    // Update dependency
    s.set(2);

    // No refresh triggered, and effect is not tracking `a`
    assert.strictEqual(value, 1, "Value unchanged after dependency update");

    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(value, 1, "Still unchanged because effect is untracked");
});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L204

QUnit.test("Should handle streams", async assert => {

    let callCount = 0;
    let lastValue;

    const v = fluid.cell().asyncComputed(async function* () {
        // Original had "yield await" which is redundant - https://stackoverflow.com/questions/77012368/is-yield-await-redundant-in-javascript-async-generator-functions
        yield Promise.resolve(1);
        yield Promise.resolve(2);
        yield Promise.resolve(3);
    });

    fluid.cell.effect(
        (vVal) => {
            callCount++;
            lastValue = vVal;
        },
        [v]
    );

    // No value yet - async not resolved
    assert.equal(callCount, 0, "Effect not called before first yield");

    // Note that due to skipping "yield await" our dispatch path is one shorter than solid's

    // Allow first yield
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(callCount, 1, "Effect called once after first yield");
    assert.equal(lastValue, 1, "First yielded value");

    // Allow second yield
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(callCount, 2, "Effect called twice after second yield");
    assert.equal(lastValue, 2, "Second yielded value");

    // Allow third yield
    await Promise.resolve();
    assert.equal(callCount, 3, "Effect called three times after third yield");
    assert.equal(lastValue, 3, "Third yielded value");
});

// Adopted from solid-signals test at https://github.com/solidjs/signals/blob/main/tests/createAsync.test.ts#L234

QUnit.test("Should still resolve in untracked scopes", async assert => {

    const s = fluid.cell(1);
    s.name = "s";

    let callCount = 0;
    let lastValue;

    const a = fluid.cell().asyncComputed(async () => {
        return s.get();
    });
    a.name = "a";

    // Effect that reads `a` but does NOT track it reactively
    fluid.cell.effect(
        () => {
            fluid.cell.untracked( () => {
                console.log("Effect wrapper called");
                // untracked read: no staticSources
                fluid.cell.signalToPromise(a).then(v => {
                    callCount++;
                    lastValue = v;
                });
            });
        },
        [], {name: "non-tracker"}
    );

    assert.equal(callCount, 0, "Effect not called synchronously");

    // Allow async resolution
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(callCount, 1, "Async resolves once");
    assert.equal(lastValue, 1, "Resolved to initial value");

    // Update dependency
    s.set(2);
    assert.equal(callCount, 1, "No re-run after dependency change");

    await Promise.resolve();
    assert.equal(callCount, 1, "Still no re-run");

    // Update again
    s.set(3);
    assert.equal(callCount, 1, "Still no re-run");

    await Promise.resolve();
    assert.equal(callCount, 1, "Async not re-triggered");
});
