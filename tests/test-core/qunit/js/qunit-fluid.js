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

/* global QUnit */

"use strict";

QUnit.assert.expectFluidError = function (message, toInvoke, errorTexts) {
    const assert = this;
    errorTexts = fluid.makeArray(errorTexts);
    let gotFailure;
    let capturedActivity;
    const captureActivity = function (args, activity) {
        capturedActivity = fluid.renderActivity(activity).map(activity => JSON.stringify(activity)).join("");
    };

    try {
        fluid.failureEvent.addListener(x => x, "QUnit");
        fluid.failureEvent.addListener(captureActivity, "captureActivity", "before:fail");
        this.expect(1);
        toInvoke();
    } catch (e) {
        gotFailure = true;
        if (!(e instanceof fluid.FluidError)) {
            assert.ok(false, message + " - received non-framework exception");
            throw e;
        }
        if (errorTexts.length > 0) {
            const fullText = e.message + capturedActivity;
            const missingText = errorTexts.find(errorText => !fullText.includes(errorText));
            assert.undefined(missingText, message + " - message text must contain each of " + errorTexts.join(", "));
        } else {
            assert.true(true, message);
        }
    } finally {
        if (!gotFailure) {
            assert.ok(false, "No failure received for test " + message);
        }
        fluid.failureEvent.removeListener("QUnit");
        fluid.failureEvent.removeListener("captureActivity");
    }
};

QUnit.assert.expect = function (asserts) {
    if (arguments.length === 1) {
        if (this.test.expected === undefined) {
            this.test.expected = asserts;
        } else {
            this.test.expected += asserts;
        }
    } else {
        return this.test.expected;
    }
};

QUnit.assert.fail = function (message) {
    this.ok(false, message);
};

QUnit.assert.undefined = function (value, message) {
    this.ok(value === undefined, message);
};

QUnit.assert.notUndefined = function (value, message) {
    this.ok(value !== undefined, message);
};

QUnit.assert.unavailable = function (value, message) {
    this.ok(fluid.isUnavailable(value), message);
};
