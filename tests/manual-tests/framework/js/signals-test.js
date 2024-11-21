/*!
 * Fluid Infusion v6.0.0
 *
 * Infusion is distributed under the Educational Community License 2.0 and new BSD licenses:
 * http://wiki.fluidproject.org/display/fluid/Fluid+Licensing
 *
 * Copyright The Infusion copyright holders
 * See the AUTHORS.md file at the top-level directory of this distribution and at
 * https://github.com/fluid-project/infusion/raw/main/AUTHORS.md
 */
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

/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed} = preactSignalsCore;

const testSelfPeek = function () {
    const source = signal(0);
    const derived = computed(() => {
        const oldValue = derived.v;
        console.log("Old value of derived was ", oldValue);
        return source.value + 1;
    });
    console.log("Derived value is ", derived.value);
    source.value = 1;
    console.log("Derived value is ", derived.value);
};

testSelfPeek();
