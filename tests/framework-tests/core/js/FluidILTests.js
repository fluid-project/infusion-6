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
    const testDef = fluid.readMergedDef("fluid.tests.testComponent");
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
    assert.notUndefined(that, "Got a value as component instance");
    assert.ok(fluid.isComponent(that), "Got a component as component instance");

    assert.ok(that.destroy, "Component has a destroy method");
    that.destroy();
    assert.ok(fluid.isDestroyed(that), "Component successfully destroyed");
});

// Method argument resolution

fluid.tests.lookupTaxon = function (entries, query, maxSuggestions) {
    return entries.filter(entry => entry.includes(query)).slice(0, maxSuggestions);
};

fluid.def("fluid.tests.shortMethod", {
    entries: ["Acmispon parviflorus", "Vicia hirsuta", "Stellaria graminea"],
    lookupTaxon: "$method:fluid.tests.lookupTaxon({self}.entries, {0}:query, {1}:maxSuggestions)"
});

QUnit.test("Method argument resolution", function (assert) {
    const that = fluid.tests.shortMethod();
    const results = that.lookupTaxon("Acmispon", 1);
    assert.deepEqual(results, ["Acmispon parviflorus"], "Resolved method arguments");
});

// Effects

// Basic resolution

fluid.tests.logValue = function (value, log) {
    log(value);
};

fluid.def("fluid.tests.effectsI", {
    gridBounds: [0, 10],
    log: () => {},
    fitBounds: "$effect:fluid.tests.logValue({self}.gridBounds, {self}.log)"
});

QUnit.test("Effects resolution I", function (assert) {
    const log = [];
    const that = fluid.tests.effectsI({
        log: bounds => log.push(bounds)
    });
    assert.deepEqual(log, [[0, 10]], "Initial effect on startup");
    log.length = 0;
    that.gridBounds = [0, 20];
    assert.deepEqual(log, [[0, 20]], "Effect on update");
});

// Read/write

fluid.def("fluid.tests.effectsII", {
    $layers: "fluid.component",
    count: 1,
    log: () => {},
    logCount: "$effect:fluid.tests.logValue({self}.count, {self}.log)"
});

QUnit.test("Effects resolution II - read/write and dispose", function (assert) {
    const log = [];
    const that = fluid.tests.effectsII({
        log: count => log.push(count)
    });
    assert.deepEqual(log, [1], "Initial effect on startup");
    log.length = 0;

    that.count++;
    assert.deepEqual(log, [2], "Effect on update");
    log.length = 0;
    that.count++;
    assert.deepEqual(log, [3], "Effect on update");
    that.destroy();
    assert.throws( () => {
        that.count++;
    }, (err) => err.message.includes("destroyed"),
    "Error thrown accessing destroyed component");
});

// Identical to the previous test only using the signals API to interact with the component rather than the
// convenient but slower proxy API
QUnit.test("Effects resolution II - read/write and dispose via signals API", function (assert) {
    const log = [];
    const proxy = fluid.tests.effectsII({
        log: count => log.push(count)
    });
    assert.deepEqual(log, [1], "Initial effect on startup");
    log.length = 0;

    // Get the real, signalised component instance from behind the proxy
    const that = proxy[fluid.proxySymbol].value;
    // Upgrade the "count" property from a definition layer computed signal to a live writeable signal
    const countSignal = fluid.pathToLive(that, "count");

    // Update the count via the signals API - more efficient than using the proxy
    countSignal.value++;
    assert.deepEqual(log, [2], "Effect on update");
    log.length = 0;
    countSignal.value++;
    assert.deepEqual(log, [3], "Effect on update");
    that.destroy();
    log.length = 0;

    // The signal can't be invalidated after destruction, but all effects allocated by the component will be disposed
    countSignal.value++;
    assert.deepEqual(log, [], "No effect after destruction");
});


QUnit.test("Effects resolution II - no notification on unrelated update", function (assert) {
    const log = [];
    const that = fluid.tests.effectsII({
        log: count => log.push(count)
    });
    assert.deepEqual(log, [1], "Initial effect on startup");
    log.length = 0;

    that.unrelated = 1;
    assert.deepEqual(log, [], "No effect on unrelated upated destruction");
});

const globalHolder = {
    computedCount: 0,
    effectCount: 0
};

fluid.def("fluid.tests.selfUpdate", {
    $layers: "fluid.component",
    selfComputed: {
        $compute: {
            args: "{self}",
            func: (self) => {
                console.log("Received update with ", self);
                return ++globalHolder.computedCount;
            }
        }
    },
    selfEffect: {
        $effect: {
            args: "{self}.selfComputed",
            func: (selfComputed) => {
                console.log("Effect received ", selfComputed);
                globalHolder.effectCount = selfComputed;
            }
        }
    }
});

QUnit.test("Computed arg sensitivity", function (assert) {
    const that = fluid.tests.selfUpdate();
    that.updated = 1;
    assert.equal(globalHolder.effectCount, 1, "Just one updated to computed");
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
    assert.deepEqual(data, {value: 4}, "Resolved structure through base layer method call");
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

/** FLUID-7001 circular hierarchy tests */

fluid.def("fluid.tests.circularComponent", {
    $layers: "fluid.tests.circularComponent"
});

QUnit.test("FLUID-7001 circularity", function (assert) {
    const that = fluid.tests.circularComponent();
    assert.ok(fluid.isUnavailable(that), "component with circular hierarchy is unavailable");
    assert.ok(that.causes[0].message.includes("circular"), "Received relevant message");
});

fluid.def("fluid.tests.indirectCircularComponent", {
    $layers: "fluid.tests.indirectCircularComponentParent"
});

fluid.def("fluid.tests.indirectCircularComponentParent", {
    $layers: "fluid.tests.indirectCircularComponent"
});


QUnit.test("FLUID-7001 indirect circularity", function (assert) {
    const that = fluid.tests.indirectCircularComponent();
    assert.ok(fluid.isUnavailable(that), "component with circular hierarchy is unavailable");
    assert.ok(that.causes[0].message.includes("circular"), "Received relevant message");
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

/** FLUID-4930 retrunking test III - Structure taken from "gpii.express.user.validationMiddleware" */

fluid.def("fluid.tests.FLUID4930.schemaHolder", {
    $layers: "fluid.component",
    schema: {
        type: "object",
        title: "gpii-express-user core user schema",
        description: "This schema defines the common format for user data transmitted and received by the gpii-express-user library.",
        definitions: {
            email: {
                type: "string",
                format: "email",
                required: true,
                errors: {
                    "": "gpii.express.user.email"
                }
            },
            username: {
                required: true,
                type: "string",
                minLength: 1,
                errors: {
                    "": "gpii.express.user.username"
                }
            }
        }
    }
});

fluid.def("fluid.tests.FLUID4930.signup", {
    $layers: "fluid.tests.FLUID4930.schemaHolder",
    resources: {
        schema: {
            parsed: "$compute:{self}.generateSchema()"
        }
    },
    model: {
        inputSchema: "{self}.resources.schema.parsed"
    },
    generateSchema: "$method:fluid.tests.FLUID4930.generateSchema({self}.schema)",
    schema: {
        title: "gpii-express-user user signup schema",
        description: "This schema defines the format accepted when creating a new user.",
        properties: {
            email: "{self}.schema.definitions.email",
            username: "{self}.schema.definitions.username",
            password: "{self}.schema.definitions.password",
            confirm: "{self}.schema.definitions.confirm",
            profile: "{self}.schema.definitions.profile"
        }
    }
});

fluid.tests.FLUID4930.signupExpected = {
    "definitions": {
        "email": {
            "errors": {
                "": "gpii.express.user.email"
            },
            "format": "email",
            "required": true,
            "type": "string"
        },
        "username": {
            "errors": {
                "": "gpii.express.user.username"
            },
            "minLength": 1,
            "required": true,
            "type": "string"
        }
    },
    "description": "This schema defines the format accepted when creating a new user.",
    "properties": {
        "confirm": undefined,
        "email": {
            "errors": {
                "": "gpii.express.user.email"
            },
            "format": "email",
            "required": true,
            "type": "string"
        },
        "password": undefined,
        "profile": undefined,
        "username": {
            "errors": {
                "": "gpii.express.user.username"
            },
            "minLength": 1,
            "required": true,
            "type": "string"
        }
    },
    "title": "gpii-express-user user signup schema",
    "type": "object"
};

fluid.tests.FLUID4930.generateSchema = function (schema) {
    // signal(schema) also works, likely because of proxy wrapping - it should really only unwrap the framework's signals
    return Object.assign({}, schema);
};

QUnit.test("FLUID-4930: Retrunking III", function (assert) {
    const that = fluid.tests.FLUID4930.signup();
    assert.equal(that.schema.properties.email.type, "string", "Successfully evaluated email option");
    assert.equal(that.schema.properties.username.type, "string", "Successfully evaluated username option");
    assert.undefined(that.schema.properties.password?.type, "Peacefully evaluate undefined reference");
    const schema = fluid.def("fluid.tests.FLUID4930.schemaHolder").schema;
    assert.equal(Object.keys(schema.definitions).length, 2, "Resolved 2 keys in deep structure");
    assert.deepEqual(that.model.inputSchema, fluid.tests.FLUID4930.signupExpected, "Resolved schema through method and computation");
});

/** FLUID-4930 retrunking test IV - Structure taken from "gpii.express.user.verify.resend" */

fluid.def("fluid.tests.FLUID4930.verify.api", {
    $layers: "fluid.component",
    /* // Not supported yet - inject in subcomponent definition instead
    $distribute: {
        "source": "{self}.couch",
        "target": "{self resend}.couch"
    },*/
    couch: {
        port: 5984,
        userDbName: "users",
        userDbUrl: {
            $compute: {
                funcName: "fluid.stringTemplate",
                args:     ["http://localhost:%port/%userDbName", { port: "{self}.couch.port", userDbName: "{self}.couch.userDbName" }]
            }
            /** Perhaps a DSL could write:
             * $compute(fluid.stringTemplate(http://localhost:%port/%userDbName, {
             *     port: $self.couch.port,
             *     userDbName: $self.couch.userDbName
             * })
             */
        }
    },
    resend: {
        $component: {
            $layers: "fluid.tests.FLUID4930.verify.resend",
            couch: "{api}.couch"
        }
    }
});

fluid.def("fluid.tests.FLUID4930.verify.resend", {
    $layers: "fluid.component",
    urls: {
        read: "$compute:fluid.stringTemplate(%userDbUrl/_design/lookup/_view/byUsernameOrEmail, {self}.couch)"
    }
});

QUnit.test("FLUID-4930: Retrunking IV", function (assert) {
    const that = fluid.tests.FLUID4930.verify.api();
    const resend = that.resend;
    assert.ok(resend, "Successfully constructed subcomponent");
    assert.ok(fluid.hasLayer(resend, "fluid.tests.FLUID4930.verify.resend"), "Constructed subcomponent with layer");
    assert.equal(that.resend.urls.read, "http://localhost:5984/users/_design/lookup/_view/byUsernameOrEmail", "Successfully evaluated email option");
});

fluid.tests.refIdentityObj = {
    a: 1
};

fluid.def("fluid.tests.expansionFringe", {
    $layers: "fluid.component",
    rootFringe: {
        $compute: {
            func: () => fluid.tests.refIdentityObj
        }
    },
    innerFringe: {
        inner: {
            $compute: {
                func: () => fluid.tests.refIdentityObj
            }
        }
    }
});

QUnit.test("Expansion fringe test", function (assert) {
    const that = fluid.tests.expansionFringe();
    assert.equal(that.rootFringe, fluid.tests.refIdentityObj, "Computed object at root has not been cloned");
    assert.equal(that.innerFringe.inner, fluid.tests.refIdentityObj, "Nested computed object has not been cloned");
});

fluid.def("fluid.tests.FLUID7000scope", {
    joined: {
        $component: {
            $layers: "fluid.component",
            value: "root",
            joined: {
                $component: {
                    $layers: "fluid.component",
                    value: "child",
                    joinedResolution: "{joined}.value" // "child"
                }
            },
            sibling: {
                $component: {
                    $layers: "fluid.component",
                    joinedResolution: "{joined}.value" // "child"
                }
            },
            joinedResolution: "{joined}.value" // "root"
        }
    }
});

QUnit.test("FLUID-7000 scoping test", function (assert) {
    const that = fluid.tests.FLUID7000scope();
    assert.equal(that.joined.joinedResolution, "root", "Same-named scope resolved to root in its own material");
    assert.equal(that.joined.sibling.joinedResolution, "child", "Same-named scope resolved by sibling component to child");
    assert.equal(that.joined.joined.joinedResolution, "child", "Same-named scope resolved to child in double nesting");
});

// Async computation test

fluid.def("fluid.tests.fetchCompute", {
    $layers: "fluid.component",
    first: "$compute:fluid.fetchJSON(../testData/data-2.json)",
    second: "$compute:fluid.fetchJSON(../testData/data-3.json)",
    result: {
        "$compute": {
            func: (a, b) => a + b,
            args: ["{self}.first.value", "{self}.second.value"]
        }
    }
});

QUnit.test("Async computation test", async function (assert) {
    const log = [];
    const that = fluid.tests.fetchCompute({
        logResult: {
            "$effect": {
                func: result => log.push(result),
                args: "{self}.result"
            }
        }
    });
    await fluid.toPromise(that, "result");
    assert.deepEqual(log, [5], "Received exactly one result after double async resolution");
});

// Shape cognition test - framework should only travere and flatten signals in material which is derived from configuration

const $tv = Symbol("fluid.testValue");

// Function which returns an obnoxious circularly linked object which should not be traversed
fluid.tests.obnoxiousReturn = function () {
    const parent = {};
    parent[$tv] = "original";
    parent.child = parent;
    return Object.freeze(parent);
};

fluid.def("fluid.tests.shapeCognition", {
    $layers: "fluid.component",
    holder: {
        member: "$compute:fluid.tests.obnoxiousReturn()"
    },
    computed: "$compute:fluid.identity({self}.holder)",
    fromMethod: null,
    fromEffect: null,
    method: {
        $method: {
            func: (self, holder) => self.fromMethod = holder,
            args: ["{self}", "{self}.holder"]
        }
    },
    effect: {
        $effect: {
            func: (self, holder) => {
                self.fromEffect = holder;
            },
            args: ["{self}", "{self}.holder"]
        }
    }
});

QUnit.test("Shape cognition test", function (assert) {
    const checkObnoxious = function (totest) {
        const unwrapped = fluid.unwrapProxy(totest);
        assert.ok(unwrapped.child, "Check child property");
        assert.equal(unwrapped[$tv], "original", "Original hidden property present");
        assert.equal(unwrapped.child, unwrapped, "Child property equals parent");
    };
    const that = fluid.tests.shapeCognition();
    checkObnoxious(that.holder.member);
    checkObnoxious(that.computed.member);
    checkObnoxious(that.fromEffect.member);
    that.method();
    checkObnoxious(that.fromMethod.member);
});

