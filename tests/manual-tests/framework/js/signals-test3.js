/* global preactSignalsCore */
/* eslint-disable no-console */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed} = preactSignalsCore;

const outerSignal = signal(0);

const moveSignal = signal(0);

// Verify that we can't update an unrelated signal during a computation

const computer = computed(() => {
    const togo = moveSignal.value + 1;
    outerSignal.value = togo;
    return togo;
});


console.log("Computer: ", computer.value);

console.log("Outer signal ", outerSignal.value);

++moveSignal.value;

console.log("Computer: ", computer.value);

console.log("Outer signal ", outerSignal.value);