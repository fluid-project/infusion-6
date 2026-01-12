"use strict";

/* global QUnit */

QUnit.module("Fluid Signals Tests");


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
