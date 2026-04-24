"use strict";

/* global QUnit */

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1572
QUnit.test("preact-signals: Should drop A->B->A updates", assert => {
    //     A
    //   / |
    //  B  | <- Looks like a flag doesn't it? :D
    //   \ |
    //     C
    //     |
    //     D
    const a = fluid.cell(2);

    const b = fluid.cell().computed(aVal => aVal - 1, [a]);

    const c = fluid.cell().computed((aVal, bVal) => aVal + bVal, [a, b]);

    let computeCount = 0;

    const d = fluid.cell().computed(
        cVal => {
            computeCount++;
            return "d: " + cVal;
        },
        [c]
    );

    // Trigger read
    assert.equal(d.get(), "d: 3");
    assert.equal(computeCount, 1);
    computeCount = 0;

    a.set(4);
    d.get();
    assert.equal(computeCount, 1);
});

// Fresh bidirectional test produced to validate fluid.cell implementation - following similar thoughts
// at https://www.ppig.org/files/2015-PPIG-26th-Basman.pdf

QUnit.test("Bidirectional tests - Temperature conversion with two nodes", assert => {

    const C = fluid.cell(15);
    const F = fluid.cell();

    const cSeq = [];
    const cEffect = fluid.cell.effect(c => cSeq.push(c), [C]);

    assert.deepEqual(cSeq, [15], "Startup notification for C");

    const fSeq = [];
    const fEffect = fluid.cell.effect(f => fSeq.push(f), [F]);

    const reset = () => {
        fSeq.length = 0;
        cSeq.length = 0;
    };

    assert.deepEqual(fSeq, [], "No startup notification for uninitialised F");

    F.computed(c => 9 * c / 5 + 32, [C]);

    assert.deepEqual(fSeq, [59], "One notification C=>F");
    assert.deepEqual(cSeq, [15], "No further notification F=>C");

    C.computed(f => 5 * (f - 32) / 9, [F]);

    assert.deepEqual(fSeq, [59], "No change if cells are fresh");
    assert.deepEqual(cSeq, [15], "No change if cells are fresh");

    reset();

    C.set(20);

    assert.deepEqual(cSeq, [20], "Original update");
    assert.deepEqual(fSeq, [68], "Relayed update");

    reset();

    F.set(212);

    assert.deepEqual(fSeq, [212], "Original update");
    assert.deepEqual(cSeq, [100], "Relayed update");

    // Tear down one relation
    F.computed(null, [C]);

    reset();

    C.set(20);

    assert.deepEqual(cSeq, [20], "Original update");
    assert.deepEqual(fSeq, [], "No relay update");

    reset();

    F.set(59);

    assert.deepEqual(fSeq, [59], "Original update");
    assert.deepEqual(cSeq, [15], "Relayed update");

    reset();

    // Dispose of the sequence logging effects
    cEffect.dispose();
    fEffect.dispose();

    F.set(68);

    assert.deepEqual(fSeq, [], "No further notifications");
    assert.deepEqual(cSeq, [], "No further notifications");

});

QUnit.test("Bidirectional tests - Temperature conversion with three nodes", assert => {

    const K = fluid.cell();
    const C = fluid.cell(15);
    const F = fluid.cell();

    K.computed(celsius => celsius + 273.15, [C]);
    C.computed(kelvin => kelvin - 273.15, [K]);

    F.computed(celsius => 9 * celsius / 5 + 32, [C]);
    C.computed(fahrenheit => 5 * (fahrenheit - 32) / 9, [F]);

    // Celsius value has spread in both directions
    assert.equal(K.get(), 288.15, "Spread from Celsius to Kelvin");
    assert.equal(F.get(), 59, "Spread from Celsius to Fahrenheit");

    K.set(293.15);

    assert.nearEqual(C.get(), 20, "Spread from Kelvin to Celsius");
    assert.nearEqual(F.get(), 68, "Spread from Kelvin to Fahrenheit");
});

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1598
QUnit.test("preact-signals: Should only update every signal once (diamond graph)", assert => {
    // In this scenario "D" should only update once when "A" receives
    // an update. This is sometimes referred to as the "diamond" scenario.
    //     A
    //   /   \
    //  B     C
    //   \   /
    //     D
    const a = fluid.cell("a");

    const b = fluid.cell().computed(aVal => aVal, [a]);

    const c = fluid.cell().computed(aVal => aVal, [a]);

    let spyCount = 0;

    const d = fluid.cell().computed(
        (bVal, cVal) => {
            spyCount++;
            return bVal + " " + cVal;
        },
        [b, c]
    );

    assert.equal(d.get(), "a a");
    assert.equal(spyCount, 1);

    a.set("aa");
    assert.equal(d.get(), "aa aa");
    assert.equal(spyCount, 2);
});

// https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1790
QUnit.test("preact-signals: Should ensure subs update even if one dep unmarks it", assert => {
    // In this scenario "C" always returns the same value. When "A"
    // changes, "B" will update, then "C" at which point its update
    // to "D" will be unmarked. But "D" must still update because
    // "B" marked it. If "D" isn't updated, then we have a bug.
    //     A
    //   /   \
    //  B     *C <- returns same value every time
    //   \   /
    //     D
    const a = fluid.cell("a");

    const b = fluid.cell().computed(
        aVal => aVal,
        [a]
    );

    // establish dependency on A
    const c = fluid.cell().computed(() => "c", [a]);

    let spyResult;
    const d = fluid.cell().computed(
        (bVal, cVal) => {
            spyResult = bVal + " " + cVal;
            return spyResult;
        },
        [b, c]
    );

    assert.equal(d.get(), "a c");

    a.set("aa");
    d.get();
    assert.equal(spyResult, "aa c");
});

// From https://github.com/solidjs/signals/blob/b9e8e0bf7f2d08b4fbec1a5271b20c58b351cc38/tests/graph.test.ts#L294
QUnit.test("solid-signals: Only propagates once with exponential convergence", assert => {

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

/*
const l = async assert => {

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

    await fluid.vizReactive.getStatementSequenceWait(0);
    const dCell = fluid.vizReactive.cell(0, {name: "dCell"});

    await fluid.vizReactive.getStatementSequenceWait(1);
    const f1 = fluid.vizReactive.cell(undefined, {name: "f1"}).vizReactiveAsyncComputed(0, d => d, [dCell]);
    await fluid.vizReactive.getStatementSequenceWait(2);
    const f2 = fluid.vizReactive.cell(undefined, {name: "f2"}).vizReactiveAsyncComputed(1, d => d, [dCell]);
    await fluid.vizReactive.getStatementSequenceWait(3);
    const f3 = fluid.vizReactive.cell(undefined, {name: "f3"}).vizReactiveAsyncComputed(2, d => d, [dCell]);

    await fluid.vizReactive.getStatementSequenceWait(4);
    const g1 = fluid.vizReactive.cell(undefined, {name: "g1"}).vizReactiveAsyncComputed(3, () => await fluid.cell.signalToPromise(f1) + f2.get() + f3.get());
    await fluid.vizReactive.getStatementSequenceWait(5);
    const g2 = fluid.vizReactive.cell(undefined, {name: "g2"}).vizReactiveAsyncComputed(4, () => await fluid.cell.signalToPromise(f1) + f2.get() + f3.get());
    await fluid.vizReactive.getStatementSequenceWait(6);
    const g3 = fluid.vizReactive.cell(undefined, {name: "g3"}).vizReactiveAsyncComputed(5, () => await fluid.cell.signalToPromise(f1) + f2.get() + f3.get());

    await fluid.vizReactive.getStatementSequenceWait(7);
    let hcount = 0;

    await fluid.vizReactive.getStatementSequenceWait(8);
    const h = fluid.vizReactive.cell(undefined, {name: "h"}).vizReactiveAsyncComputed(6, () => {
        hcount++;
        return await fluid.cell.signalToPromise(g1) + g2.get() + g3.get();
    });

    await fluid.vizReactive.getStatementSequenceWait(9);
    hcount = 0;
    await fluid.vizReactive.getStatementSequenceWait(10);
    dCell.set(1);

    await fluid.vizReactive.getStatementSequenceWait(11);
    assert.equal(await fluid.cell.signalToPromise(h), 9, "h correctly recomputed from three converging g-cells");
    await fluid.vizReactive.getStatementSequenceWait(12);
    assert.equal(hcount, 1, "Only one propagation occurred");
}
*/
