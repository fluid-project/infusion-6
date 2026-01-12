"use strict";

/* global QUnit */

QUnit.module("Fluid Signals Tests");

// preact-signals graph tests:

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1552
QUnit.test("preact-signals: Should run computeds once for multiple dep changes", assert => {

    const a = fluid.cell("a");
    const b = fluid.cell("b");

    let computeCount = 0;

    const c = fluid.cell().computed(
        (aVal, bVal) => {
            computeCount++;
            return aVal + bVal;
        },
        [a, b]
    );

    assert.equal(c.get(), "ab", "Initial computed value");
    assert.equal(computeCount, 1, "Computed ran once initially");

    computeCount = 0;

    // Multiple dependency updates before read
    a.set("aa");
    b.set("bb");

    // Single recomputation on demand
    assert.equal(c.get(), "aabb", "Updated computed value");
    assert.equal(computeCount, 1, "Computed ran once after multiple dep changes");
});

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

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1621
QUnit.test("preact-signals: Should only update every signal once (diamond graph + tail)", assert => {
    // "E" will be likely updated twice if our mark+sweep logic is buggy.
    //     A
    //   /   \
    //  B     C
    //   \   /
    //     D
    //     |
    //     E
    const a = fluid.cell("a");

    const b = fluid.cell().computed(aVal => aVal, [a]);

    const c = fluid.cell().computed(aVal => aVal, [a]);

    const d = fluid.cell().computed((bVal, cVal) => bVal + " " + cVal, [b, c]);

    let spyCount = 0;

    const e = fluid.cell().computed(
        dVal => {
            spyCount++;
            return dVal;
        },
        [d]
    );

    assert.equal(e.get(), "a a");
    assert.equal(spyCount, 1);

    a.set("aa");
    assert.equal(e.get(), "aa aa");
    assert.equal(spyCount, 2);
});

// https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1647
QUnit.test("preact-signals: Should bail out if result is the same", assert => {
    // Bail out if value of "B" never changes
    // A->B->C
    const a = fluid.cell("a");

    // establish dependency on A
    const b = fluid.cell().computed(() => "foo", [a]);

    let spyCount = 0;

    const c = fluid.cell().computed(
        bVal => {
            spyCount++;
            return bVal;
        },
        [b]
    );

    assert.equal(c.get(), "foo");
    assert.equal(spyCount, 1);

    a.set("aa");
    assert.equal(c.get(), "foo");
    assert.equal(spyCount, 1);
});

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1667
QUnit.test("preact-signals: Should only update every signal once (jagged diamond graph + tails)", assert => {
    // "F" and "G" will be likely updated twice if our mark+sweep logic is buggy.
    //     A
    //   /   \
    //  B     C
    //  |     |
    //  |     D
    //   \   /
    //     E
    //   /   \
    //  F     G
    const a = fluid.cell("a");

    const b = fluid.cell().computed(aVal => aVal, [a]);

    const c = fluid.cell().computed(aVal => aVal, [a]);

    const d = fluid.cell().computed(cVal => cVal, [c]);

    let eCount = 0;
    const e = fluid.cell().computed(
        (bVal, dVal) => {
            eCount++;
            return bVal + " " + dVal;
        },
        [b, d]
    );

    let fCount = 0;
    const f = fluid.cell().computed(
        eVal => {
            fCount++;
            return eVal;
        },
        [e]
    );

    let gCount = 0;
    const g = fluid.cell().computed(
        eVal => {
            gCount++;
            return eVal;
        },
        [e]
    );

    assert.equal(f.get(), "a a");
    assert.equal(fCount, 1);

    assert.equal(g.get(), "a a");
    assert.equal(gCount, 1);

    eCount = fCount = gCount = 0;

    a.set("b");

    assert.equal(e.get(), "b b");
    assert.equal(eCount, 1);

    assert.equal(f.get(), "b b");
    assert.equal(fCount, 1);

    assert.equal(g.get(), "b b");
    assert.equal(gCount, 1);

    eCount = fCount = gCount = 0;

    a.set("c");

    assert.equal(e.get(), "c c");
    assert.equal(eCount, 1);

    assert.equal(f.get(), "c c");
    assert.equal(fCount, 1);

    assert.equal(g.get(), "c c");
    assert.equal(gCount, 1);

    // top to bottom
    assert.ok(eCount === 1 && fCount === 1, "E runs before F");
    // left to right
    assert.ok(fCount === 1 && gCount === 1, "F runs before G");
});

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1734
QUnit.test("preact-signals: Should only subscribe to signals listened to", assert => {
    //    *A
    //   /   \
    // *B     C <- we don't listen to C
    const a = fluid.cell("a");

    const b = fluid.cell().computed(aVal => aVal, [a]);

    let spyCount = 0;
    fluid.cell().computed(
        aVal => {
            spyCount++;
            return aVal;
        },
        [a]
    );

    assert.equal(b.get(), "a");
    assert.equal(spyCount, 0);

    a.set("aa");
    assert.equal(b.get(), "aa");
    assert.equal(spyCount, 0);
});

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1753
QUnit.test("preact-signals: Should only subscribe to signals listened to II", assert => {
    // Here both "B" and "C" are active in the beginning, but
    // "B" becomes inactive later. At that point it should
    // not receive any updates anymore.
    //    *A
    //   /   \
    // *B     D <- we don't listen to C
    //  |
    // *C
    const a = fluid.cell("a");

    let spyBCount = 0;
    const b = fluid.cell().computed(
        aVal => {
            spyBCount++;
            return aVal;
        },
        [a]
    );

    let spyCCount = 0;
    const c = fluid.cell().computed(
        bVal => {
            spyCCount++;
            return bVal;
        },
        [b]
    );

    const d = fluid.cell().computed(aVal => aVal, [a]);

    let result = "";
    const eff = fluid.cell.effect(
        cVal => {
            result = cVal;
        },
        [c]
    );

    assert.equal(result, "a");
    assert.equal(d.get(), "a");

    spyBCount = 0;
    spyCCount = 0;

    // unsubscribe effect
    eff.dispose();

    a.set("aa");

    assert.equal(spyBCount, 0);
    assert.equal(spyCCount, 0);
    assert.equal(d.get(), "aa");
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

// From https://github.com/preactjs/signals/blob/%40preact/signals%402.5.1/packages/core/test/signal.test.tsx#L1816
QUnit.test("preact-signals: Should ensure subs update even if two deps unmark it", assert => {
    // In this scenario both "C" and "D" always return the same
    // value. But "E" must still update because "A"  marked it.
    // If "E" isn't updated, then we have a bug.
    //     A
    //   / | \
    //  B *C *D
    //   \ | /
    //     E
    const a = fluid.cell("a");

    const b = fluid.cell().computed(aVal => aVal, [a]);

    // depend on A but always return same value
    const c = fluid.cell().computed(() => "c", [a]);

    // depend on A but always return same value
    const d = fluid.cell().computed(() => "d", [a]);

    let spyResult;
    const e = fluid.cell().computed(
        (bVal, cVal, dVal) => {
            spyResult = bVal + " " + cVal + " " + dVal;
            return spyResult;
        },
        [b, c, d]
    );

    assert.equal(e.get(), "a c d");

    a.set("aa");
    e.get();
    assert.equal(spyResult, "aa c d");
});

// ryan's graph tests from https://github.com/solidjs/signals/blob/main/tests/graph.test.ts
// His earlier ones are cribbed from preact-signals, these are not:

// From https://github.com/solidjs/signals/blob/b9e8e0bf7f2d08b4fbec1a5271b20c58b351cc38/tests/graph.test.ts#L224
QUnit.test("solid-signals: Propagates in topological order", assert => {
    //
    //     c1
    //    /  \
    //   /    \
    //  b1     b2
    //   \    /
    //    \  /
    //     a1
    //
    let seq = "";
    const a1 = fluid.cell(false);

    const b1 = fluid.cell().computed(() => { seq += "b1"; }, [a1]);

    const b2 = fluid.cell().computed(() => { seq += "b2"; }, [a1]);

    const c1 = fluid.cell().computed(
        () => { b1.get(); b2.get(); seq += "c1"; },
        [b1, b2]
    );

    seq = "";
    a1.set(true);

    // trigger propagation
    c1.get();

    assert.equal(seq, "b1b2c1");
});

// From https://github.com/solidjs/signals/blob/b9e8e0bf7f2d08b4fbec1a5271b20c58b351cc38/tests/graph.test.ts#L266
QUnit.test("solid-signals: Only propagates once with linear convergences", assert => {
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

// The following three solid-signals "graph" tests give different results through different semantic

// From https://github.com/solidjs/signals/blob/b9e8e0bf7f2d08b4fbec1a5271b20c58b351cc38/tests/graph.test.ts#L338
// This solid test is weird - why should computations trigger at all without effects to pull them?
QUnit.test("solid-signals: Does not trigger downstream computations unless changed", assert => {
    const s1 = fluid.cell(1);
    let order = "";

    const t1 = fluid.cell().computed(
        s1Val => {
            order += "t1";
            return s1Val;
        },
        [s1]
    );

    const t2 = fluid.cell().computed(
        () => {
            order += "c1";
            t1.get();
        },
        [t1]
    );

    const e = fluid.cell.effect(() => {}, [t2]);

    assert.equal(order, "t1c1");

    order = "";

    // Set to same value
    s1.set(1);
    assert.equal(order, "");

    order = "";

    // Set to different value
    s1.set(2);
    assert.equal(order, "t1c1");

    e.dispose();
});

// https://github.com/solidjs/signals/blob/b9e8e0bf7f2d08b4fbec1a5271b20c58b351cc38/tests/graph.test.ts#L360
// This one also not really supported. Would require a new kind of construct as an "eager computed". As it
// stands, the original t2 is simply ignored.
QUnit.test("solid-signals: Applies updates to changed dependees in same order as createMemo", assert => {
    const s1 = fluid.cell(0);
    let order = "";

    const t1 = fluid.cell().computed(
        s1Val => {
            order += "t1";
            return s1Val === 0;
        },
        [s1]
    );

    fluid.cell().computed(
        s1Val => {
            order += "c1";
            return s1Val;
        },
        [s1]
    );

    const t3 = fluid.cell().computed(
        t1Val => {
            order += "c2";
            return t1Val;
        },
        [t1]
    );

    const e = fluid.cell.effect(() => {}, [t3]);

    assert.equal(order, "t1c2");

    order = "";

    s1.set(1);
    assert.equal(order, "t1c2");

    e.dispose();
});


// This test adopted from solid-signals which there gives the result "t1c1c2c2_1" - which may be better
// consistent with Phil Eby's axiomatisation of Tilton's Cells at bottom of https://github.com/kennytilton/cells/wiki
// Although there is actually nothing specific there about the case of wholly freshly constructed compute arcs.

// https://github.com/solidjs/signals/blob/b9e8e0bf7f2d08b4fbec1a5271b20c58b351cc38/tests/graph.test.ts#L382
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



// Lineage: Mini/micro-adapton diamond test added to amb's fork of Geoff Litt's port at https://github.com/geoffreylitt/mini-adapton
// Produced by AI at https://chatgpt.com/c/68dfb7ef-d660-8333-80d6-d664f35b5798

// --- Example: diamond-shaped graph with 4 nodes ---
// Structure:
//    top
//   /   \
//  A     B
//   \   /
//    base

QUnit.test("Diamond with two updates", assert => {

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
