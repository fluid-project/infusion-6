"use strict";

fluid.registerNamespace("fluid.tests");

/* global QUnit */

QUnit.module("Fluid Signals Tests");

// Fresh bidirectional test produced to validate fluid.cell implementation - following similar thoughts
// at https://www.ppig.org/files/2015-PPIG-26th-Basman.pdf

QUnit.test("Bidirectional tests - two nodes", assert => {

    const celsiusCell = fluid.cell(15, {name: "C"});
    const fahrenheitCell = fluid.cell(undefined, {name: "F"});

    const cSeq = [];
    const cEffect = fluid.cell.effect(celsius => cSeq.push(celsius), [celsiusCell]);
    fluid.cell.stabilize();

    assert.deepEqual(cSeq, [15], "Startup notification");

    const fSeq = [];
    const fEffect = fluid.cell.effect(fahrenheit => fSeq.push(fahrenheit), [fahrenheitCell]);

    const reset = () => {
        fSeq.length = 0;
        cSeq.length = 0;
    };
    fluid.cell.stabilize();

    assert.deepEqual(fSeq, [], "No startup notification - auto-promote undefined to unavailable");

    fahrenheitCell.computed(celsius => 9 * celsius / 5 + 32, [celsiusCell]);
    fluid.cell.stabilize();

    assert.deepEqual(fSeq, [59], "One notification on forward arc");
    assert.deepEqual(cSeq, [15], "No backward notification");

    celsiusCell.computed(fahrenheit => 5 * (fahrenheit - 32) / 9, [fahrenheitCell]);
    fluid.cell.stabilize();

    assert.deepEqual(fSeq, [59], "No change on faithful inverse");
    assert.deepEqual(cSeq, [15], "No change on faithful inverse");

    reset();

    celsiusCell.set(20);
    fluid.cell.stabilize();

    assert.deepEqual(cSeq, [20], "Original update");
    assert.deepEqual(fSeq, [68], "Relayed update");

    reset();

    fahrenheitCell.set(212);
    fluid.cell.stabilize();

    assert.deepEqual(fSeq, [212], "Original update");
    assert.deepEqual(cSeq, [100], "Relayed update");

    // Tear down one relation
    fahrenheitCell.computed(null, [celsiusCell]);

    reset();

    celsiusCell.set(20);
    fluid.cell.stabilize();

    assert.deepEqual(cSeq, [20], "Original update");
    assert.deepEqual(fSeq, [], "No relay update");

    reset();

    fahrenheitCell.set(59);
    fluid.cell.stabilize();

    assert.deepEqual(fSeq, [59], "Original update");
    assert.deepEqual(cSeq, [15], "Relayed update");

    reset();

    // Dispose of the sequence logging effects
    cEffect.dispose();
    fEffect.dispose();

    fahrenheitCell.set(68);
    fluid.cell.stabilize();

    assert.deepEqual(fSeq, [], "No further notifications");
    assert.deepEqual(cSeq, [], "No further notifications");

});

QUnit.test("Bidirectional tests - three nodes", assert => {

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

QUnit.test("Bidirectional tests - three nodes, circularly linked", assert => {

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

    kelvinCell.computed(kelvin => (kelvin - 273.15) * 9 / 5 + 32, [kelvinCell]);
    fahrenheitCell.computed(fahrenheit => (fahrenheit - 32) * 5 / 9 + 273.15, [fahrenheitCell]);

    // Celsius value has spread in both directions
    assert.equal(kelvinCell.get(), 288.15, "Spread from Celsius to Kelvin");
    assert.equal(fahrenheitCell.get(), 59, "Spread from Celsius to Fahrenheit");

    kelvinCell.set(293.15);

    assert.nearEqual(celsiusCell.get(), 20, "Spread from Kelvin to Celsius");
    assert.nearEqual(fahrenheitCell.get(), 68, "Spread from Kelvin to Fahrenheit");

    fahrenheitCell.set(212);

    assert.equal(celsiusCell.get(), 100, "Spread from Fahrenheit to Celsius");
    assert.nearEqual(kelvinCell.get(), 373.15, "Spread from Fahrenheit to Kelvin");
});

/**
 * Construct a bidirectional pair whose reverse leg is a dynamic dependency, only discovered part way through the
 * update which traverses its forward leg. B is computed from A and a further source X. A is computed from `seed`
 * until `mode` becomes "linked", whereupon it is computed from B instead - the reverse leg. A single update sets `seed`
 * and links the pair, and within the same stabilization an effect on `mode` changes X.
 * @param {Number} offset - Added by the reverse leg to its inverse of the forward leg, which is faithful if it is 0
 * @return {Object} The number of times each leg was traversed by the update, the values seen by effects on A and B,
 * and their final values
 */
fluid.tests.lateReverseArc = function (offset) {
    const seed = fluid.cell(1, {name: "seed"}), mode = fluid.cell("own", {name: "mode"}), x = fluid.cell(0, {name: "X"});
    const a = fluid.cell(undefined, {name: "A"}), b = fluid.cell(undefined, {name: "B"});
    const runs = {forward: 0, reverse: 0};
    b.computed((aValue, xValue) => {
        runs.forward++;
        return aValue * 10 + xValue;
    }, [a, x]);
    a.computed(() => {
        let togo;
        if (mode.get() === "linked") {
            runs.reverse++;
            // Guard against a cycle, which would otherwise never terminate for an unfaithful inverse
            togo = runs.reverse > 10 ? fluid.unavailable("Runaway reverse leg") : (b.get() - x.get()) / 10 + offset;
        } else {
            togo = seed.get();
        }
        return togo;
    }, []);
    const bSeen = [], aSeen = [];
    const effects = [
        fluid.cell.effect(bValue => bSeen.push(bValue), [b], {name: "bEffect"}),
        fluid.cell.effect(aValue => aSeen.push(aValue), [a], {name: "aEffect"}),
        fluid.cell.effect(modeValue => {
            if (modeValue === "linked") {
                x.set(5);
            }
        }, [mode], {name: "modeEffect"})
    ];
    fluid.cell.stabilize();
    runs.forward = 0;
    runs.reverse = 0;
    bSeen.length = 0;
    aSeen.length = 0;

    seed.set(2);
    mode.set("linked");
    fluid.cell.stabilize();
    const togo = {runs: {...runs}, bSeen, aSeen, a: a.get(), b: b.get()};
    effects.forEach(effect => effect.dispose());
    return togo;
};

QUnit.test("Bidirectional tests - reverse leg discovered late in the update", assert => {
    // Whether the forward leg was traversed in a fit is decided as it is traversed, by whether the leg has a reverse
    // arc - see fluid.cell.needsFit. Here the reverse arc only appears once A is recomputed from B, after B was first
    // computed from A in the same update. B's further update from X must then still not be relayed back to A.
    const faithful = fluid.tests.lateReverseArc(0);
    assert.deepEqual(faithful.runs, {forward: 1, reverse: 1}, "Each leg traversed once - no cyclic activation of the reverse leg");
    assert.deepEqual([faithful.aSeen, faithful.bSeen], [[], [15]], "A's value is unchanged, so only B's effect is notified, once");
    assert.deepEqual([faithful.a, faithful.b], [1, 15], "Values consistent across the pair");

    // An unfaithful inverse would change A, and so B, on each traversal of the cycle
    const unfaithful = fluid.tests.lateReverseArc(1);
    assert.deepEqual(unfaithful.runs, {forward: 2, reverse: 1}, "Reverse leg traversed once, forward leg once on either side of it");
    assert.deepEqual([unfaithful.aSeen, unfaithful.bSeen], [[2], [20, 25]], "Effects notified of each value once");
    assert.deepEqual([unfaithful.a, unfaithful.b], [2, 25], "Cycle broken after one traversal of the reverse leg");
});

/*
QUnit.test("Genuine cyclicity with monotonicity is acceptable", assert => {

    const layerCountCell = fluid.cell(0, {name: "layerCount"});

    const layerSeq = [];
    const layerEffect = fluid.cell.effect(layerCount => layerSeq.push(layerCount), [layerCountCell]);

    const layerNextCell = fluid.cell(undefined, {name: "layerNext"}).computed(x => x, [layerCountCell]);

    const layerReactor = fluid.cell(undefined, {name: "layerReactor"}).computed(layerCount => {
        if (layerCount < 2) {
            layerCountCell.set(layerCount + 1);
        }
        return layerCountCell._value;
    }, [layerNextCell]);
    layerReactor.get();
    layerReactor.get();
    layerReactor.get();
    fluid.cell.stabilize();
    // Currently only gets up to 1 since layer count is marked as clean after set
    assert.deepEqual(layerSeq, [2], "Layer count has stabilized to 2");
    layerEffect.dispose();
});
 */

QUnit.test("findCause with three nodes", assert => {
    const A = fluid.cell(1, {name: "A"});
    const B = fluid.cell(2, {name: "B"});
    const C = fluid.cell(3, {name: "C"});
    let bCause = null,
        cCause = null;
    B.computed(a => {
        bCause = fluid.cell.findCause();
        return a + 1;
    }, [A]);
    C.computed(b => {
        cCause = fluid.cell.findCause();
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

QUnit.test("Source tracking and source exclusion", assert => {
    const A = fluid.cell(1, {name: "A"});
    const B = fluid.cell(2, {name: "B"}).computed(a => a + 1, [A]);
    const Blog = [];
    // See historical note at https://docs.fluidproject.org/infusion/development/ChangeApplierAPI#example-featuring-user-defined-change-source-filtering
    const Beff = fluid.cell.effect(b => Blog.push(b), [B], {excludeSource: "scrollbar"});
    fluid.cell.stabilize();
    assert.deepEqual(Blog, [2], "Startup effect");

    Blog.length = 0;
    A.set(2);
    fluid.cell.stabilize();
    assert.deepEqual(Blog, [3], "Update effect");

    Blog.length = 0;
    A.set(3, {source: "scrollbar"});
    fluid.cell.stabilize();
    assert.deepEqual(Blog, [], "Update skipped if source excluded");

    A.set(4);
    fluid.cell.stabilize();
    assert.deepEqual(Blog, [5], "Unsourced update after an excluded one is delivered");

    Beff.dispose();
});

QUnit.test("Source exclusion does not stick to a cell after an excluded update", assert => {
    const B = fluid.cell("a", {name: "B"});
    const runs = [];
    const eff = fluid.cell.effect(v => runs.push(v), [B], {excludeSource: "hash"});
    fluid.cell.stabilize();
    assert.deepEqual(runs, ["a"], "Startup effect");

    fluid.cell.withAmbientSource("hash", () => B.set("b"))();
    fluid.cell.stabilize();
    assert.deepEqual(runs, ["a"], "Update with ambient excluded source skipped");

    B.set("c");
    fluid.cell.stabilize();
    assert.deepEqual(runs, ["a", "c"], "Later unsourced update delivered");

    B.set("d", "hash");
    fluid.cell.stabilize();
    assert.deepEqual(runs, ["a", "c"], "Update with excluded source supplied as String skipped");

    B.set("e", {source: "hash"});
    fluid.cell.stabilize();
    assert.deepEqual(runs, ["a", "c"], "Update with excluded source supplied in options skipped");

    B.set("f");
    fluid.cell.stabilize();
    assert.deepEqual(runs, ["a", "c", "f"], "Unsourced update delivered again");

    eff.dispose();
});

QUnit.test("Sourced write to a cell already updated within a sourced fit", assert => {
    const A = fluid.cell(0, {name: "A"});
    const B = fluid.cell(undefined, {name: "B"}).computed(a => a + 1, [A]);
    const runs = [];
    const eff = fluid.cell.effect(b => runs.push(b), [B], {name: "eff", excludeSource: "other"});
    fluid.cell.stabilize();
    runs.length = 0;

    A.set(1, "first");
    assert.equal(B.get(), 2, "B updated within the fit started by the sourced write, which is held open by the read");
    B.set(10, "other");
    fluid.cell.stabilize();
    assert.equal(B.get(), 10, "Sourced write to a cell enlisted in an open fit is applied");
    assert.deepEqual(runs, [], "The write carries its own source downstream, so that it is excluded");

    B.set(11);
    fluid.cell.stabilize();
    assert.deepEqual(runs, [11], "Later unsourced write delivered");
    eff.dispose();
});

QUnit.test("Writes made by an effect inherit the sources of the change which triggered it - FLUID-5498", assert => {
    const hash = fluid.cell("intro", {name: "hash"});
    const section = fluid.cell(0, {name: "section"});
    const panes = ["intro", "history", "solow"];
    // Selects the section named by the hash, as a listener would which navigates on a change of hash
    const follow = fluid.cell.effect(pane => section.set(panes.indexOf(pane)), [hash], {name: "follow"});
    const pane = fluid.cell(undefined, {name: "pane"}).computed(index => panes[index], [section]);
    const userChanges = [];
    const record = fluid.cell.effect(pane => userChanges.push(pane), [pane], {name: "record", excludeSource: "hash"});
    fluid.cell.stabilize();
    userChanges.length = 0;

    fluid.cell.withAmbientSource("hash", () => hash.set("solow"))();
    fluid.cell.stabilize();
    assert.equal(section.get(), 2, "Section follows the hash");
    assert.deepEqual(userChanges, [], "Change of section caused by a change of hash is excluded downstream, two edges and an effect away");

    section.set(1);
    fluid.cell.stabilize();
    assert.deepEqual(userChanges, ["history"], "Unsourced change of section is delivered");

    fluid.cell.withAmbientSource("hash", () => hash.set("intro"))();
    fluid.cell.stabilize();
    assert.deepEqual(userChanges, ["history"], "Further change caused by the hash is excluded");
    assert.equal(fluid.cell.inheritedSources, null, "No sources are inherited outside an effect");

    follow.dispose();
    record.dispose();
});

// kairo's "avoidable computation" test at https://github.com/milomg/js-reactivity-benchmark/blob/main/packages/core/src/benches/kairo/avoidable.ts
// Which was ported to knockout (passes) and adapton (fails), probably fails in S as well.

QUnit.test("An observer of the same source several times observes it until removed as often", assert => {
    const source = fluid.cell(1, {name: "source"}), reads = fluid.cell(2, {name: "reads"});
    let runs = 0;
    // The edge's sources are not deduplicated, so that the source is observed once for each read
    const observer = fluid.cell(undefined, {name: "observer"}).computed(() => {
        runs++;
        let sum = 0;
        for (let i = 0; i < reads.get(); ++i) {
            sum += source.get();
        }
        return sum;
    }, []);
    assert.equal(observer.get(), 2, "Source read twice");
    assert.equal(source._observers.get(observer), 2, "Observer counted once for each read");

    reads.set(1);
    assert.equal(observer.get(), 1, "Source now read once");
    assert.equal(source._observers.get(observer), 1, "One count withdrawn");
    source.set(5);
    assert.equal(observer.get(), 5, "Still notified of the source, which it still reads once");

    reads.set(0);
    assert.equal(observer.get(), 0, "Source no longer read");
    assert.notOk(source._observers.has(observer), "No longer an observer");
    const before = runs;
    source.set(6);
    assert.equal(observer.get(), 0, "Value unchanged");
    assert.equal(runs, before, "Not notified of a source it no longer reads");
});

QUnit.test("Early cutoff", assert => {

    let busyCount = 0;

    function busy() {
        busyCount++;
    }

    const headCell = fluid.cell(0, {name: "head"});
    const c1Cell = fluid.cell(undefined, {name: "c1"}).computed(head => head, [headCell]);
    const c2Cell = fluid.cell(undefined, {name: "c2"}).computed(() => { c1Cell.get(); return 0; });
    const c3Cell = fluid.cell(undefined, {name: "c3"}).computed(c2 => { busy(); return c2 + 1; }, [c2Cell]);
    const c4Cell = fluid.cell(undefined, {name: "c4"}).computed(c3 => c3 + 2, [c3Cell]);
    const c5Cell = fluid.cell(undefined, {name: "c5"}).computed(c4 => c4 + 3, [c4Cell]);

    // Initial computation
    headCell.set(1);
    assert.equal(c5Cell.get(), 6, "Computed value 6");
    assert.equal(busyCount, 1, "One lot of busy on init");

    headCell.set(0);
    assert.equal(c5Cell.get(), 6, "No change in computed value");
    assert.equal(busyCount, 1, "Busy censored through early cutoff");

});


QUnit.test("Early cutoff tests with effects", assert => {

    let busyCount = 0;

    function busy() {
        busyCount++;
    }

    const c5Log = [];

    function reset() {
        busyCount = 0;
        c5Log.length = 0;
    }

    const headCell = fluid.cell(0, {name: "head"});
    const c1Cell = fluid.cell(undefined, {name: "c1"}).computed(head => head, [headCell]);
    const c2Cell = fluid.cell(undefined, {name: "c2"}).computed(() => { c1Cell.get(); return 0; });
    const c3Cell = fluid.cell(undefined, {name: "c3"}).computed(c2 => { busy(); return c2 + 1; }, [c2Cell]);
    const c4Cell = fluid.cell(undefined, {name: "c4"}).computed(c3 => c3 + 2, [c3Cell]);
    const c5Cell = fluid.cell(undefined, {name: "c5"}).computed(c4 => c4 + 3, [c4Cell]);

    const c5Logger = fluid.cell.effect(c5 => c5Log.push(c5), [c5Cell], {name: "c5Logger"});

    fluid.cell.stabilize();

    assert.deepEqual(c5Log, [6], "Pushed through chain to effect");
    assert.equal(busyCount, 1, "One lot of busy on init");
    reset();

    // Update computation 1
    headCell.set(1);
    fluid.cell.stabilize();
    assert.equal(c5Cell.get(), 6, "Computed value 6");
    assert.deepEqual(c5Log, [], "No further effect through early cutoff");
    assert.equal(busyCount, 0, "No further busy through early cutoff");

    reset();
    // Update computation 2
    headCell.set(0);
    fluid.cell.stabilize();
    assert.equal(c5Cell.get(), 6, "No change in computed value");
    assert.deepEqual(c5Log, [], "No further effect through early cutoff");
    assert.equal(busyCount, 0, "No further busy through early cutoff");

    c5Logger.dispose();
});

/**
 * Construct a fixture holding a cell computed from two sources, one of which permanently holds a
 * config-unavailable value, with the sources declared in a supplied order. A dispatcher takes charge of
 * the computation so that the edge yields a concrete value despite the unavailable argument, and records
 * each activation.
 *
 * @param {Boolean} unconfiguredFirst - `true` if the config-unavailable source is to be declared first.
 * @return {Object} A record holding the `trigger` source cell, the computed `target` cell, and an
 * `evaluations` array recording the value produced by each activation of the computing edge.
 */
fluid.tests.makeUnconfiguredFixture = function (unconfiguredFirst) {
    const trigger = fluid.cell(1, {name: "trigger"});
    const unconfigured = fluid.cell(fluid.unavailable("Never configured", "config"),
        {name: "unconfigured"});
    const evaluations = [];
    const dispatcher = function (func, args) {
        const concrete = args.find(arg => !fluid.isUnavailable(arg));
        evaluations.push(concrete);
        return func(concrete);
    };
    const sources = unconfiguredFirst ? [unconfigured, trigger] : [trigger, unconfigured];
    // Seed with a concrete value so that the first wiring does not itself mark the cell stale
    const target = fluid.cell(1, {name: "target"}).computed(x => x, sources, {dispatcher});
    return {trigger, unconfigured, target, evaluations};
};

QUnit.test("Update along an edge holding an unconfigured source", function (assert) {
    [false, true].forEach(function (unconfiguredFirst) {
        const order = unconfiguredFirst ? "unconfigured source declared first" :
            "unconfigured source declared last";
        const fixture = fluid.tests.makeUnconfiguredFixture(unconfiguredFirst);

        assert.equal(fixture.target.get(), 1, `Seeded value undisturbed - ${order}`);
        assert.deepEqual(fixture.evaluations, [], `Settled cell not recomputed on first pull - ${order}`);

        fixture.trigger.set(2);
        assert.equal(fixture.target.get(), 2, `Recomputed along the edge which dirtied it - ${order}`);
        assert.deepEqual(fixture.evaluations, [2], `Edge activated exactly once - ${order}`);

        fixture.trigger.set(3);
        assert.equal(fixture.target.get(), 3, `Recomputed again on further update - ${order}`);
        assert.deepEqual(fixture.evaluations, [2, 3], `Edge activated once per update - ${order}`);
    });
});

QUnit.test("Unconfigured source demotes an edge which did not carry the update", function (assert) {
    const unconfigured = fluid.cell(fluid.unavailable("Never configured", "config"),
        {name: "unconfigured"});
    const other = fluid.cell("fallback", {name: "other"});
    const target = fluid.cell(undefined, {name: "target"});

    // Declared first, so it would win on a tie under findDirtyEdge's strict improvement test
    target.computed(x => x, [unconfigured]);
    target.computed(x => x, [other]);

    assert.equal(target.get(), "fallback",
        "Edge holding an unconfigured source passed over in favour of a configured alternative");
});

QUnit.test("An effect whose run makes one of its sources stale is notified of later changes", assert => {
    const A = fluid.cell(1, {name: "A"});
    const B = fluid.cell(0, {name: "B"});
    // C reads B, so that the effect's write of B makes C stale whilst the effect is running
    const C = fluid.cell(undefined, {name: "C"}).computed((...args) => args[0], [A, B]);
    const runs = [];
    fluid.cell.effect(c => {
        runs.push(c);
        fluid.cell.untracked(() => B.set(B.get() + 1));
    }, [C], {name: "writer"});
    fluid.cell.stabilize();
    assert.deepEqual(runs, [1], "Effect runs initially, and is not rerun since C's value is unchanged by its write");
    A.set(2);
    fluid.cell.stabilize();
    A.set(3);
    fluid.cell.stabilize();
    assert.deepEqual(runs, [1, 2, 3], "Effect notified of each later change to A");
});

QUnit.test("An effect which cyclically triggers itself is stopped and reported", assert => {
    const A = fluid.cell(0, {name: "A"});
    let runs = 0;
    const effect = fluid.cell.effect(a => {
        ++runs;
        A.set(a + 1);
    }, [A], {name: "self-incrementing effect"});
    const logged = [];
    const oldReport = fluid.cell.reportCycle;
    fluid.cell.reportCycle = message => logged.push(message);
    try {
        fluid.cell.stabilize();
    } finally {
        fluid.cell.reportCycle = oldReport;
    }
    assert.equal(runs, fluid.cell.maxEffectRuns, "Effect run the maximum number of times within one stabilization");
    assert.ok(logged.some(line => line.includes("self-incrementing effect") && line.includes("fluid.cell.untracked")),
        "The cycle is reported, naming the effect");
    effect.dispose();
});

QUnit.test("A computation whose received source changes in the course of its update is brought up to date", assert => {
    // B binds lazily: once triggered, pulling it changes its own source A - as for a binding made available partway
    // through a pull
    const A = fluid.cell("unbound", {name: "A"});
    const trigger = fluid.cell("idle", {name: "trigger"});
    const B = fluid.cell(undefined, {name: "B"}).computed((a, t) => {
        if (t === "go" && a === "unbound") {
            A.set("bound");
        }
        return a;
    }, [A, trigger]);
    const C = fluid.cell(undefined, {name: "C"}).computed(b => "C sees " + b, [B]);
    assert.equal(C.get(), "C sees unbound", "Initial value");
    trigger.set("go");
    assert.equal(C.get(), "C sees bound", "The reader receives the value computed from the changed source");
    assert.equal(B.get(), "bound", "The computation holds its current value");
});

QUnit.test("A source made stale again whilst a later source is brought up to date is brought up to date once more", assert => {
    const base = fluid.cell(1, {name: "base"});
    const first = fluid.cell(undefined, {name: "first"}).computed(b => b * 10, [base]);
    const trigger = fluid.cell("idle", {name: "trigger"});
    // Bringing this up to date changes the source of "first", which has already been brought up to date - as for a
    // binding made in the course of a pull which turns over a component read by an earlier argument
    const second = fluid.cell(undefined, {name: "second"}).computed(t => {
        if (t === "go") {
            base.set(2);
        }
        return t;
    }, [trigger]);
    const both = fluid.cell(undefined, {name: "both"}).computed((f, s) => `${f}:${s}`, [first, second]);
    assert.equal(both.get(), "10:idle", "Initial value");
    trigger.set("go");
    assert.equal(both.get(), "20:go", "Both sources' current values received");
    assert.equal(both.get(), "20:go", "And held");
});
