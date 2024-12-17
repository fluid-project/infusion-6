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

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");


QUnit.module("Fluid IL Tests");

QUnit.test("Basic live merging", function (assert) {
    fluid.def("fluid.tests.testComponent", {
        $layers: "fluid.component",
        testValue: 0
    });
    const testDef = fluid.def("fluid.tests.testComponent");
    assert.strictEqual(testDef.value.testValue, 0, "Retrieve basic value");
    assert.strictEqual(testDef.value.events.onCreate, 0, "Retrieve merged value");
    fluid.def("fluid.tests.testComponent", {
        $layers: "fluid.component",
        testValue: 1
    });
    assert.strictEqual(testDef.value.testValue, 1, "Updated basic value");
    assert.strictEqual(testDef.value.events.onCreate, 0, "Merged value unchanged");
});

fluid.def("fluid.tests.basicTestComponent", {
    $layers: "fluid.component",
    testValue: 0
});

QUnit.test("Basic construction and destruction", function (assert) {

    const that = fluid.tests.basicTestComponent();
    assert.assertNotUndefined(that, "Got a value as component instance");
    assert.ok(fluid.isComponent(that), "Got a component as component instance");

    assert.ok(that.destroy, "Component has a destroy method");
    that.destroy();
    assert.ok(that.$lifecycleStatus === "destroyed", "Component successfully destroyed");
});

/** FLUID-4914 derived grade resolution tests **/

fluid.def("fluid.tests.dataSource", {
    $layers: "fluid.component",
    get: {
        $method: {
            func: x => x,
            args: {value: 4}
        }
    }
});

fluid.def("fluid.tests.URLDataSource", {
    $layers: "fluid.tests.dataSource",
    url: "http://jsforcats.com",
    resolve: {
        $method: {
            func: x => x,
            args: "{dataSource}.url"
        }
    }
});

QUnit.test("FLUID-4914: resolve grade as context name", function (assert) {
    const dataSource = fluid.tests.URLDataSource();
    const url = dataSource.resolve();
    assert.equal(url, dataSource.url, "Resolved grade context name via invoker");
    const data = dataSource.get();
    assert.deepEqual(data, {value: 4}, "Resolved grade context name as demands context");
});

/** Taken from FLUID-5288: Improved diagnostic for incomplete grade hierarchy **/

fluid.def("fluid.tests.missingGradeComponent", {
    $layers: ["fluid.tests.nonexistentGrade"]
});

QUnit.test("FLUID-5288 I: Incomplete grade definition signals unavailable", function (assert) {
    const that = fluid.tests.missingGradeComponent();
    assert.ok(fluid.isUnavailable(that), "component with missing parent is unavailable");
    assert.ok(that.causes[0].message.includes("fluid.tests.nonexistentGrade is not defined"), "Received relevant message");
    // Now define the grade
    fluid.def("fluid.tests.nonexistentGrade", {$layers: "fluid.component"});
    // Evaluate the signal again and it should now be defined
    assert.ok(fluid.isComponent(that), "Component has sprung into life after missing grade defined");
    // Clean up layer registry
    fluid.deleteLayer("fluid.tests.nonexistentGrade");
});

/** FLUID-4930 retrunking test taken from fluid-authoring arrow rendering **/

fluid.tests.vectorToPolar = function (start, end) {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    return {
        length: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx)
    };
};

fluid.def("fluid.tests.retrunking", {
    $layers: "fluid.component",
    arrowGeometry: {
        length: "{self}.polar.length",
        width: 10,
        headWidth: 20,
        headHeight: 20,
        angle: "{self}.polar.angle",
        start: [100, 100],
        end: [100, 200]
    },
    polar: "$compute:fluid.tests.vectorToPolar({self}.arrowGeometry.start, {self}.arrowGeometry.end)",
    renderPoints: "$compute:fluid.tests.retrunking.verify({self}.assert, {self}.arrowGeometry)"
});

fluid.tests.retrunking.expected = {
    length: 100,
    width: 10,
    headWidth: 20,
    headHeight: 20,
    angle: Math.PI / 2,
    start: [100, 100],
    end: [100, 200]
};

fluid.tests.retrunking.verify = function (assert, arrowGeometry) {
    assert.deepEqual(arrowGeometry, fluid.tests.retrunking.expected, "FLUID-5981: Fully evaluated expander arguments");
    return true;
};

// FLUID-5981 test rescued from prehistory at https://github.com/amb26/infusion/commit/9c35b6bdb0876aed579b2c964606877523f4fb10

QUnit.test("FLUID-4930: Options retrunking test", function (assert) {
    assert.expect(3);
    const that = fluid.tests.retrunking({assert});
    assert.ok(that.renderPoints);
    assert.deepEqual(that.arrowGeometry, fluid.tests.retrunking.expected, "Successfully evaluated all options");
});

/** FLUID-4930 test II - taken from bagatelle renderer **/

fluid.def("fluid.tests.retrunkingII", {
    $layers: "fluid.component",
    dom: "$compute:fluid.identity({self}.selectors)",
    selectors: {
        svg: ".flc-bagatelle-svg",
        taxonDisplay: ".fld-bagatelle-taxonDisplay",
        autocomplete: ".fld-bagatelle-autocomplete",
        segment: ".fld-bagatelle-segment",
        phyloPic: ".fld-bagatelle-phyloPic",
        mousable: {
            "$compute": {
                args: ["{self}.selectors.segment", "{self}.selectors.phyloPic"],
                func: (...selectors) => selectors.join(", ")
            }
        }
    }
});

QUnit.test("FLUID-4930: Retrunking with expanders", function (assert) {
    const that = fluid.tests.retrunkingII();
    assert.equal(that.selectors.mousable, ".fld-bagatelle-segment, .fld-bagatelle-phyloPic",
        "Expander should have consumed sibling values");
});
