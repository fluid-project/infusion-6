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

"use strict";

/* global QUnit */


fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid Signals Tests");

// Lineage: Mini/micro-adapton diamond test added to amb's fork of Geoff Litt's port at https://github.com/geoffreylitt/mini-adapton
// Produced by AI at https://chatgpt.com/c/68dfb7ef-d660-8333-80d6-d664f35b5798

// --- Example: diamond-shaped graph with 4 nodes ---
// Structure:
//    top
//   /   \
//  A     B
//   \   /
//    base

QUnit.test("Diamond tests", assert => {

    const base = fluid.cell(2, {name: "base"});

    const seq = [];

    const A = fluid.cell().computed(v => {
        console.log("compute A (base * 2)");
        seq.push("A");
        return v * 2;
    }, [base]);
    A.name = "A";

    const B = fluid.cell().computed(v => {
        console.log("compute B (base + 3)");
        seq.push("B");
        return v + 3;
    }, [base]);
    B.name = "B";

    const top = fluid.cell().computed((a, b) => {
        console.log("compute top (A + B)");
        seq.push("top");
        return a + b;
    }, [A, B]);
    top.name = "top";

    assert.deepEqual(seq, [], "No notifications on build");

    const first = top.get();

    assert.equal(first, 9, "First compute");
    assert.deepEqual(seq, ["A", "B", "top"], "First activation");

    const second = top.get();

    assert.equal(second, 9, "Second compute");
    assert.deepEqual(seq, ["A", "B", "top"], "No further activation");

    seq.length = 0;

    base.set(10);

    const third = top.get();

    assert.equal(third, 33, "Third compute");
    assert.deepEqual(seq, ["A", "B", "top"], "Second activation");

    seq.length = 0;

    base.set(2);

    const fourth = top.get();

    assert.equal(fourth, 9, "Fourth compute");
    assert.deepEqual(seq, ["A", "B", "top"], "Third activation");

});

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

// JavaScript
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
    // Milo has two calls here, but the 2nd is unnecessary
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
    assert.equal(effectCalls, 2, "effect called twice in total after second resolve");
    assert.equal(effectArgs[1], 4, "effect called with 4");

    e.dispose();
});


// Fresh bidirectional test produced to validate fluid.cell implementation - following similar thoughts
// at https://www.ppig.org/files/2015-PPIG-26th-Basman.pdf

QUnit.test("Bidi tests", assert => {

    const celsiusCell = fluid.cell(15);
    const fahrenheitCell = fluid.cell();

    const cSeq = [];
    const cEffect = fluid.cell.effect(celsius => cSeq.push(celsius), [celsiusCell]);

    assert.deepEqual(cSeq, [15], "Startup notification");

    const fSeq = [];
    const fEffect = fluid.cell.effect(fahrenheit => fSeq.push(fahrenheit), [fahrenheitCell]);

    const reset = () => {
        fSeq.length = 0;
        cSeq.length = 0;
    };

    assert.deepEqual(fSeq, [], "No startup notification - auto-promote undefined to unavailable");

    fahrenheitCell.computed(celsius => 9 * celsius / 5 + 32, [celsiusCell]);

    assert.deepEqual(fSeq, [59], "One notification on forward arc");
    assert.deepEqual(cSeq, [15], "No backward notification");

    celsiusCell.computed(fahrenheit => 5 * (fahrenheit - 32) / 9, [fahrenheitCell]);

    assert.deepEqual(fSeq, [59], "No change on faithful inverse");
    assert.deepEqual(cSeq, [15], "No change on faithful inverse");

    reset();

    celsiusCell.set(20);

    assert.deepEqual(cSeq, [20], "Original update");
    assert.deepEqual(fSeq, [68], "Relayed update");

    reset();

    fahrenheitCell.set(212);

    assert.deepEqual(fSeq, [212], "Original update");
    assert.deepEqual(cSeq, [100], "Relayed update");

    // Tear down one relation
    fahrenheitCell.computed(null, [celsiusCell]);

    reset();

    celsiusCell.set(20);

    assert.deepEqual(cSeq, [20], "Original update");
    assert.deepEqual(fSeq, [], "No relay update");

    reset();

    fahrenheitCell.set(59);

    assert.deepEqual(fSeq, [59], "Original update");
    assert.deepEqual(cSeq, [15], "Relayed update");

    reset();

    // Dispose of the sequence logging effects
    cEffect.dispose();
    fEffect.dispose();

    fahrenheitCell.set(68);

    assert.deepEqual(fSeq, [], "No further notifications");
    assert.deepEqual(cSeq, [], "No further notifications");

});

QUnit.test("Bidi tests with three nodes", assert => {

    const kelvinCell = fluid.cell();
    kelvinCell.name = "Kelvin";
    const celsiusCell = fluid.cell(15);
    celsiusCell.name = "Celsius";
    const fahrenheitCell = fluid.cell();
    fahrenheitCell.name = "Fahrenheit";

    kelvinCell.computed(celsius => celsius + 273.15, [celsiusCell]);
    celsiusCell.computed(kelvin => kelvin - 273.15, [kelvinCell]);

    fahrenheitCell.computed(celsius => 9 * celsius / 5 + 32, [celsiusCell]);
    celsiusCell.computed(fahrenheit => 5 * (fahrenheit - 32) / 9, [fahrenheitCell]);

    // Celsius value has spread in both directions
    assert.equal(kelvinCell.get(), 288.15, "Spread from Celsius to Kelvin");
    assert.equal(fahrenheitCell.get(), 59, "Spread from Celsius to Fahrenheit");

    kelvinCell.set(293.15);

    assert.nearEqual(celsiusCell.get(), 20, "Spread from Kelvin to Celsius");
    assert.nearEqual(fahrenheitCell.get(), 68, "Spread from Kelvin to Fahrenheit");
});

QUnit.test("findCause with three nodes", assert => {
    const A = fluid.cell(1, {name: "A"});
    const B = fluid.cell(2, {name: "B"});
    const C = fluid.cell(3, {name: "C"});
    let bCause = null,
        cCause = null;
    B.computed(a => {
        bCause = fluid.findCause();
        return a + 1;
    }, [A]);
    C.computed(b => {
        cCause = fluid.findCause();
        return b + 1;
    }, [B]);

    const reset = () => {
        bCause = null;
        cCause = null;
    };

    const Cval = C.get();
    assert.equal(Cval, 3, "value fetched");
    reset();
    A.set(2);
    const Cval2 = C.get();
    assert.equal(Cval2, 4, "updated value fetched");
    assert.deepEqual(bCause, [B, A], "B's update cause is A -> B");
    assert.deepEqual(cCause, [C, B, A], "C's update cause is A -> B -> C");
});

// kairo's "avoidable computation" test at https://github.com/milomg/js-reactivity-benchmark/blob/main/packages/core/src/benches/kairo/avoidable.ts
// Which was ported to knockout (passes) and adapton (fails), probably fails in S as well.

QUnit.test("Early cutoff tests", assert => {

    let busyCount = 0;

    function busy() {
        busyCount++;
    }

    const headCell = fluid.cell(0);
    const c1Cell = fluid.cell().computed(head => head, [headCell]);
    const c2Cell = fluid.cell().computed(() => { c1Cell.get(); return 0; });
    const c3Cell = fluid.cell().computed(c2 => { busy(); return c2 + 1; }, [c2Cell]);
    const c4Cell = fluid.cell().computed(c3 => c3 + 2, [c3Cell]);
    const c5Cell = fluid.cell().computed(c4 => c4 + 3, [c4Cell]);

    // Initial computation
    headCell.set(1);
    assert.equal(c5Cell.get(), 6, "Computed value 6");
    assert.equal(busyCount, 1, "One lot of busy on init");

    console.log("Test start");

    headCell.set(0);
    assert.equal(c5Cell.get(), 6, "No change in computed value");
    assert.equal(busyCount, 1, "Busy censored through early cutoff");

});

// a couple of ryan's tests from https://github.com/solidjs/signals/blob/main/tests/graph.test.ts#L266
// His earlier ones are cribbed from preact-signals, these are not:

QUnit.test("Only propagates once with linear convergences", assert => {
    //         d
    //         |
    // +---+---+---+---+
    // v   v   v   v   v
    // f1  f2  f3  f4  f5
    // |   |   |   |   |
    // +---+---+---+---+
    //         v
    //         g
    let gcount = 0;

    const dCell = fluid.cell(0);

    const f1 = fluid.cell().computed(d => d, [dCell]);
    const f2 = fluid.cell().computed(d => d, [dCell]);
    const f3 = fluid.cell().computed(d => d, [dCell]);
    const f4 = fluid.cell().computed(d => d, [dCell]);
    const f5 = fluid.cell().computed(d => d, [dCell]);

    const g = fluid.cell().computed(() => {
        gcount++;
        return (
            f1.get() +
            f2.get() +
            f3.get() +
            f4.get() +
            f5.get()
        );
    });

    // Reset count and trigger update
    gcount = 0;
    dCell.set(1);

    assert.equal(g.get(), 5, "g recomputed once from 5 converging sources");
    assert.equal(gcount, 1, "Only one propagation occurred");
});

QUnit.test("Only propagates once with exponential convergence", assert => {

    //     d
    //     |
    // +---+---+
    // v   v   v
    // f1  f2 f3
    //   \ | /
    //     O
    //   / | \
    // v   v   v
    // g1  g2  g3
    // +---+---+
    //     v
    //     h

    const dCell = fluid.cell(0);

    const f1 = fluid.cell().computed(d => d, [dCell]);
    const f2 = fluid.cell().computed(d => d, [dCell]);
    const f3 = fluid.cell().computed(d => d, [dCell]);

    const g1 = fluid.cell().computed(() => f1.get() + f2.get() + f3.get());
    const g2 = fluid.cell().computed(() => f1.get() + f2.get() + f3.get());
    const g3 = fluid.cell().computed(() => f1.get() + f2.get() + f3.get());

    let hcount = 0;

    const h = fluid.cell().computed(() => {
        hcount++;
        return g1.get() + g2.get() + g3.get();
    });

    hcount = 0;
    dCell.set(1);

    assert.equal(h.get(), 9, "h correctly recomputed from three converging g-cells");
    assert.equal(hcount, 1, "Only one propagation occurred");
});



// This test adopted from solid-signals which there gives the result "t1c1c2c2_1" - which may be better
// consistent with Phil Eby's axiomatisation of Tilton's Cells at bottom of https://github.com/kennytilton/cells/wiki
// Although there is actually nothing specific there about the case of wholly freshly constructed compute arcs.

QUnit.test("Updates downstream pending computations", assert => {

    const s1 = fluid.cell(0);
    const s2 = fluid.cell(0);

    let order = "";

    const t1 = fluid.cell().computed(s1v => {
        order += "t1";
        return s1v === 0;
    }, [s1]);

    const t2 = fluid.cell().computed(s1v => {
        order += "c1";
        return s1v;
    }, [s1]);

    const t3 = fluid.cell().computed(() => {
        order += "c2";
        // force dependency on t1
        t1.get();

        return fluid.cell().computed(s2v => {
            order += "c2_1";
            return s2v;
        }, [s2]);
    });

    s1.set(1);

    // trigger recomputation
    t2.get();
    t3.get().get();
    // Solid-signals November 2025 order: "t1c1c2c2_1"
    assert.equal(order, "c1c2t1c2_1", "Downstream computations run in Reactively order");
});
