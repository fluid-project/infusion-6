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

/* global QUnit, preactSignalsCore */

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed, effect} = preactSignalsCore;

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid Signals Tests");

QUnit.test("Delegate tests", assert => {
    const upstreamData = signal({lower: -3, upper: 2965});
    const computeDefault = computed( () => (upstreamData.value));
    const delegate = fluid.delegatedSignal(computeDefault);

    assert.deepEqual(delegate.value, {lower: -3, upper: 2965}, "Initial value is equal to default");

    delegate.value = {lower: 100, upper: 2965};

    assert.deepEqual(delegate.value, {lower: 100, upper: 2965}, "Delegated signal value has been allocated and written");

    delegate.reset();

    assert.deepEqual(delegate.value, {lower: -3, upper: 2965}, "Original value has been restored");
});

QUnit.test("Delegate slippage tests", assert => {
    const upstreamData = signal(3);
    const computeDefault = computed( () => (upstreamData.value));
    const delegate = fluid.delegatedSignal(computeDefault);

    assert.equal(delegate.value, 3, "Initial value is equal to default");

    delegate.value += 2;

    assert.deepEqual(delegate.value, 5, "Delegated signal value has been allocated and written");

    upstreamData.value++;

    assert.deepEqual(delegate.value, 5, "No change in delegated signal value after upstream update");

    delegate.reset();

    assert.deepEqual(delegate.value, 4, "Updated upstream value revealed");
});

QUnit.test("Delegates with effects slippage tests", assert => {
    const upstreamData = signal(3);
    const computeDefault = computed( () => (upstreamData.value));
    const delegate = fluid.delegatedSignal(computeDefault);

    let log = [];
    effect( () => {
        log.push(delegate.value);
    });

    assert.equal(delegate.value, 3, "Initial value is equal to default");
    assert.deepEqual(log, [3], "Single effect on startup");
    log = [];

    delegate.value += 2;

    assert.deepEqual(delegate.value, 5, "Delegated signal value has been allocated and written");
    assert.deepEqual(log, [5], "Single fire of effect");
    log = [];

    upstreamData.value += 2;

    assert.deepEqual(delegate.value, 5, "No change in delegated signal value after upstream update");
    assert.deepEqual(log, [], "No fire of effect on upstream update");

    delegate.reset();

    assert.deepEqual(delegate.value, 5, "Updated upstream value revealedf");
    assert.deepEqual(log, [], "No fire of effect on revealing upstream update equal to written value");
});
