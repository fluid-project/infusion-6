/* global preactSignalsCore, QUnit */
/* eslint-disable no-console */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed, effect} = preactSignalsCore;

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

    const head = signal(0);
    const c1 = computed(() => head.value);
    const c2 = computed(() => { c1.value; return 0; });
    const c3 = computed(() => { busy(); return c2.value + 1; });
    const c4 = computed(() => c3.value + 2);
    const c5 = computed(() => c4.value + 3);
    const disposeC5Logger = effect(() => c5Log.push(c5.value));

    assert.deepEqual(c5Log, [6], "Pushed through chain to effect");
    assert.equal(busyCount, 1, "One lot of busy on init");
    reset();

    // Update computation 1
    head.value = 1;
    assert.equal(c5.value, 6, "Computed value 6");
    assert.deepEqual(c5Log, [], "No further effect through early cutoff");
    assert.equal(busyCount, 0, "No further busy through early cutoff");
    reset();

    // Update computation 2
    head.value = 0;
    assert.equal(c5.value, 6, "No change in computed value");
    assert.deepEqual(c5Log, [], "No further effect through early cutoff");
    assert.equal(busyCount, 0, "No further busy through early cutoff");

    disposeC5Logger();
});
