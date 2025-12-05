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

// --- Example: diamond-shaped graph with 4 nodes ---
// Structure:
//    top
//   /   \
//  A     B
//   \   /
//    base

QUnit.test("Diamond tests", assert => {

    const base = fluid.cell(2);

    const seq = [];

    const A = fluid.cell().compute(v => {
        console.log("compute A (base * 2)");
        seq.push("A");
        return v * 2;
    }, [base]);

    const B = fluid.cell().compute(v => {
        console.log("compute B (base + 3)");
        seq.push("B");
        return v + 3;
    }, [base]);

    const top = fluid.cell().compute((a, b) => {
        console.log("compute top (A + B)");
        seq.push("top");
        return a + b;
    }, [A, B]);

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

QUnit.test("Bidi tests", assert => {

    const celsiusCell = fluid.cell(15);
    const fahrenheitCell = fluid.cell();

    const cSeq = [];
    const cEffect = fluid.effect({
        bind: celsius => cSeq.push(celsius)
    }, [celsiusCell]);

    assert.deepEqual(cSeq, [15], "Startup notification");

    const fSeq = [];
    const fEffect = fluid.effect({
        bind: fahrenheit => fSeq.push(fahrenheit)
    }, [fahrenheitCell]);

    const reset = () => {
        fSeq.length = 0;
        cSeq.length = 0;
    };

    assert.deepEqual(fSeq, [], "No startup notification - auto-promote undefined to unavailable");

    fahrenheitCell.compute(celsius => 9 * celsius / 5 + 32, [celsiusCell]);

    assert.deepEqual(fSeq, [59], "One notification on forward arc");
    assert.deepEqual(cSeq, [15], "No backward notification");

    celsiusCell.compute(fahrenheit => 5 * (fahrenheit - 32) / 9, [fahrenheitCell]);

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
    fahrenheitCell.compute(null);

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

QUnit.test("Early cutoff tests", assert => {

    let busyCount = 0;

    function busy() {
        busyCount++;
    }

    const headCell = fluid.cell(0);
    const c1Cell = fluid.cell().compute(head => head, [headCell]);
    const c2Cell = fluid.cell().compute(() => { c1Cell.get(); return 0; });
    const c3Cell = fluid.cell().compute(c2 => { busy(); return c2 + 1; }, [c2Cell]);
    const c4Cell = fluid.cell().compute(c3 => c3 + 2, [c3Cell]);
    const c5Cell = fluid.cell().compute(c4 => c4 + 3, [c4Cell]);

    // Initial computation
    headCell.set(1);
    assert.equal(c5Cell.get(), 6, "Computed value 6");
    assert.equal(busyCount, 1, "One lot of busy on init");

    console.log("Test start");

    headCell.set(0);
    assert.equal(c5Cell.get(), 6, "No change in computed value");
    assert.equal(busyCount, 1, "Busy censored through early cutoff");

});
