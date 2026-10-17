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
    const testDef = fluid.tests.testComponent();
    assert.strictEqual(testDef.testValue, 0, "Retrieve basic value");
    assert.strictEqual(testDef.events.onCreate, 0, "Retrieve merged value");
    fluid.def("fluid.tests.testComponent", {
        $layers: "fluid.component",
        testValue: 1
    });
    assert.strictEqual(testDef.testValue, 1, "Updated basic value");
    assert.strictEqual(testDef.events.onCreate, 0, "Merged value unchanged");
});

fluid.def("fluid.tests.basicTestComponent", {
    $layers: "fluid.component",
    testValue: 0
});

QUnit.test("Basic construction and destruction", function (assert) {

    const that = fluid.tests.basicTestComponent();
    assert.notUndefined(that, "Got a value as component instance");
    assert.ok(fluid.isComponent(that), "Got a component as component instance");

    const path = that[fluid.metadataSymbol].path;

    const shadow1 = fluid.globalInstantiator.pathToComponent[path];
    assert.notUndefined(shadow1, "Component's shadow should be present");

    assert.ok(that.destroy, "Component has a destroy method");
    that.destroy();
    fluid.cell.stabilize();

    assert.ok(fluid.isDestroyed(that), "Component successfully destroyed");

    // White-box testing: assure that component is genuinely destroyed and its shadow has been cleaned up

    const shadow2 = fluid.globalInstantiator.pathToComponent[path];
    assert.undefined(shadow2, "Component's shadow should have been destroyed");

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
    fluid.cell.stabilize();
    assert.deepEqual(log, [[0, 10]], "Initial effect on startup");
    log.length = 0;
    that.gridBounds = [0, 20];
    fluid.cell.stabilize();
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
    fluid.cell.stabilize();
    assert.deepEqual(log, [1], "Initial effect on startup");
    log.length = 0;

    that.count++;
    fluid.cell.stabilize();
    assert.deepEqual(log, [2], "Effect on update");
    log.length = 0;
    that.count++;
    fluid.cell.stabilize();
    assert.deepEqual(log, [3], "Effect on update");
    log.length = 0;
    that.destroy();
    fluid.cell.stabilize();
    assert.deepEqual(log, [], "No attempt to log anything on destruction");
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
    fluid.cell.stabilize();
    assert.deepEqual(log, [1], "Initial effect on startup");
    log.length = 0;

    // Get the real, signalised component instance from behind the proxy
    const that = fluid.unProxy(proxy).get();
    // Upgrade the "count" property from a definition layer computed signal to a live writeable signal
    const countSignal = fluid.pathToLive(that[fluid.metadataSymbol], "count");

    // Update the count via the signals API - more efficient than using the proxy
    countSignal.set(countSignal.get() + 1);
    fluid.cell.stabilize();
    assert.deepEqual(log, [2], "Effect on update");
    log.length = 0;
    countSignal.set(countSignal.get() + 1);
    fluid.cell.stabilize();
    assert.deepEqual(log, [3], "Effect on update");
    that.destroy();
    log.length = 0;

    // The signal can't be invalidated after destruction, but all effects allocated by the component will be disposed
    countSignal.set(countSignal.get() + 1);
    assert.deepEqual(log, [], "No effect after destruction");
});


QUnit.test("Effects resolution II - no notification on unrelated update", function (assert) {
    const log = [];
    const that = fluid.tests.effectsII({
        log: count => log.push(count)
    });
    fluid.cell.stabilize();
    assert.deepEqual(log, [1], "Initial effect on startup");
    log.length = 0;

    that.unrelated = 1;
    assert.deepEqual(log, [], "No effect on unrelated update");
});


// Crucial but somewhat arguable test - a $computed whose arg is bare {self} should not be notified on updates which
// change the overall component contents. Future behaviour will probably restore tracking for members dereferenced.

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
                console.log("Received computed update with ", self);
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
    fluid.cell.stabilize();
    that.updated = 1;
    fluid.cell.stabilize();
    assert.equal(globalHolder.effectCount, 1, "Just one update to effect");
    assert.equal(globalHolder.computedCount, 1, "Just one update to computed");
    that.otherUpdated = 1;
    fluid.cell.stabilize();
    assert.equal(globalHolder.computedCount, 1, "Computed for {self} does not update");
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
    fluid.cell.stabilize();
    const url = dataSource.resolve();
    assert.equal(url, dataSource.url, "Resolved grade context name via invoker");
    const data = dataSource.get();
    assert.deepEqual(data, {value: 4}, "Resolved structure through base layer method call");
});

/** Taken from FLUID-5288: Improved diagnostic for incomplete grade hierarchy **/

fluid.def("fluid.tests.missingGradeComponent", {
    $layers: ["fluid.tests.nonexistentGrade"],
    fetchValue: {
        $compute: {
            args: "{self}.childValue",
            func: x => x
        }
    }
});

QUnit.test("FLUID-5288 I: Incomplete grade definition signals unavailable", function (assert) {
    const that = fluid.tests.missingGradeComponent();
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(that), "component with missing parent is unavailable");
    assert.ok(that.message.includes("fluid.tests.nonexistentGrade is not defined"), "Received relevant message");

    // Whitebox: Attempt to jam $compute by evaluating it early
    const realThat = that[fluid.proxySymbol].get();
    const earlyV = realThat.fetchValue.get();
    assert.ok(fluid.isUnavailable(earlyV), "Early attempt to compute value should produce unavailable");

    // Now define the grade
    fluid.def("fluid.tests.nonexistentGrade", {
        $layers: "fluid.component",
        childValue: 2
    });
    fluid.cell.stabilize();

    // Evaluate the signal again and it should now be defined
    assert.ok(fluid.isComponent(that), "Component has sprung into life after missing grade defined");
    assert.equal(that.fetchValue, 2, "Successfully computed value via supplied definition");
    // Clean up layer registry
    fluid.deleteLayer("fluid.tests.nonexistentGrade");
});

/** FLUID-7001 circular hierarchy tests */

fluid.def("fluid.tests.circularComponent", {
    $layers: "fluid.tests.circularComponent"
});

QUnit.test("FLUID-7001 circularity", function (assert) {
    const that = fluid.tests.circularComponent();
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(that), "component with circular hierarchy is unavailable");
    assert.ok(that.message.includes("circular"), "Received relevant message");
});

fluid.def("fluid.tests.indirectCircularComponent", {
    $layers: "fluid.tests.indirectCircularComponentParent"
});

fluid.def("fluid.tests.indirectCircularComponentParent", {
    $layers: "fluid.tests.indirectCircularComponent"
});


QUnit.test("FLUID-7001 indirect circularity", function (assert) {
    const that = fluid.tests.indirectCircularComponent();
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(that), "component with circular hierarchy is unavailable");
    assert.ok(that.message.includes("circular"), "Received relevant message");
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
    fluid.cell.stabilize();
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
                func: "fluid.percStringTemplate",
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
        read: "$compute:fluid.percStringTemplate(%userDbUrl/_design/lookup/_view/byUsernameOrEmail, {self}.couch)"
    }
});

QUnit.test("FLUID-4930: Retrunking IV", function (assert) {
    const that = fluid.tests.FLUID4930.verify.api();
    // Issue here: We can't construct subcomponents without an effect - need FDS
    fluid.cell.stabilize();
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
                    value: "sibling",
                    joinedResolution: "{joined}.value" // "child"
                }
            },
            joinedResolution: "{joined}.value", // "root"
            siblingResolution: "{sibling}.value" // "sibling"
        }
    }
});

QUnit.test("FLUID-7000 scoping test", function (assert) {
    const that = fluid.tests.FLUID7000scope();
    // Oddity here - we can't construct subcomponents without resolving effects! Needs FDS.
    fluid.cell.stabilize();
    assert.equal(that.joined.joinedResolution, "root", "Same-named scope resolved to root in its own material");
    // Can't actually support this for FLUID-7000 without stopping scope chain from being a chain - would need to
    // traverse manually which likely degrade performance a lot. See diagram from 6/5/25
    // assert.equal(that.joined.sibling.joinedResolution, "child", "Same-named scope resolved by sibling component to child");
    assert.equal(that.joined.joined.joinedResolution, "child", "Same-named scope resolved to child in double nesting");
    assert.equal(that.joined.siblingResolution, "sibling", "Resolved to sibling in own parent");
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
    await fluid.siteToPromise(that, "result");
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
    fluid.cell.stabilize();
    checkObnoxious(that.holder.member);
    checkObnoxious(that.computed.member);
    checkObnoxious(that.fromEffect.member);
    that.method();
    checkObnoxious(that.fromMethod.member);
});

// Higher-order reference tracking. A $contextRef's *value* is a $sitedRef cell.
// These probe whether that indirection is represented in the graph, or merely
// re-derived by each consumer through flattenSignals.

fluid.def("fluid.tests.lateRef.watcher", {
    $layers: "fluid.component",
    log: () => {},
    watch: "$effect:fluid.tests.logValue({holder}.late, {self}.log)"
});

fluid.def("fluid.tests.lateRef.holder", {
    $layers: "fluid.component",
    log: () => {},
    late: "$compute:fluid.unavailable(Not yet supplied, config)",
    watcher: {
        $component: {
            $layers: "fluid.tests.lateRef.watcher",
            log: "{holder}.log"
        }
    }
});

QUnit.test("Late-arriving cross-component reference", function (assert) {
    const log = [];
    const that = fluid.tests.lateRef.holder({log: v => log.push(v)});
    fluid.cell.stabilize();
    assert.deepEqual(log, [], "No notification whilst target is unavailable");

    that.late = 1;              // upgrades the path into the live layer
    fluid.cell.stabilize();
    assert.deepEqual(log, [1], "Notified once target becomes available");

    log.length = 0;
    that.late = 2;              // path already live - no potentia turnover
    fluid.cell.stabilize();
    assert.deepEqual(log, [2], "Notified on update to an already-live path");
});

// lensing and liveQueryILSelector tests

fluid.def("fluid.tests.editor", {
    $layers: "fluid.component"
});

fluid.def("fluid.tests.editorHolder", {
    $layers: "fluid.component",
    names: {
        $reactiveRoot: []
    },
    editors: {
        $component: {
            $layers: "fluid.tests.editor",
            $for: {
                source: "{editorHolder}.names",
                valueAs: "name"
            },
            editorName: "{self}.name"
        }
    }
});

/**
 * Stabilise and read the names of the editors currently matched by a live IL selector query.
 *
 * @param {Cell} query - A live query cell as returned from `fluid.liveQueryILSelector`.
 * @return {String[]|Unavailable} The `editorName` of each matched component, in tree order, or any
 * unavailable value which the query yielded.
 */
fluid.tests.queryEditorNames = function (query) {
    fluid.cell.stabilize();
    const editors = query.get();
    let togo;
    if (fluid.isUnavailable(editors)) {
        togo = editors;
    } else {
        togo = editors.map(editor => editor.editorName);
    }
    return togo;
};

QUnit.test("Live query over a $for-driven component list", function (assert) {
    const that = fluid.tests.editorHolder();
    const query = fluid.liveQueryILSelector(that, "fluid.tests.editor");

    assert.deepEqual(fluid.tests.queryEditorNames(query), [],
        "No editors are matched for an empty collection");

    that.names.push("alpha");
    assert.deepEqual(fluid.tests.queryEditorNames(query), ["alpha"],
        "One editor matched after first push");

    that.names.push("beta");
    assert.deepEqual(fluid.tests.queryEditorNames(query), ["alpha", "beta"],
        "Two editors matched after second push");

    that.names.splice(0, 1);
    assert.deepEqual(fluid.tests.queryEditorNames(query), ["beta"],
        "One editor remains matched after splice");

    that.destroy();
});


// Raw (non-framework) signals supplied directly as $compute arguments - e.g. a global registry such as fluid.layerStore.
// fluid.flattenSignals dereferences a bare cell through fluid.deSignalToSite and then treats its value as "arg material",
// recursing through every member. Since the value is not configuration-derived, it may be arbitrarily linked (here, back
// to the store itself through nested raw cells), and the traversal never terminates.

fluid.tests.rawStore = fluid.cell(undefined, {name: "Raw test layer store"});

fluid.tests.rawStoreEntry = fluid.cell({
    layerName: "fluid.tests.someLayer",
    store: fluid.tests.rawStore // Back-link: entry -> store -> entry -> ...
}, {name: "Raw test layer store entry"});

fluid.tests.rawStore.set({
    layers: {
        "fluid.tests.someLayer": fluid.tests.rawStoreEntry
    }
});

fluid.tests.rawStoreReceived = [];

/**
 * Stand-in for fluid.editor.layerList.fromStore - records what it was supplied and lists the store's layer names.
 * @param {Object} store - The layer store as delivered by the framework.
 * @param {Boolean} showUserLayersOnly - Filtering flag, resolved from a genuine IL reference.
 * @return {String[]} The names of the layers held in the store.
 */
fluid.tests.layerListFromStore = function (store, showUserLayersOnly) {
    fluid.tests.rawStoreReceived.push({store, showUserLayersOnly});
    return Object.keys(store.layers);
};

fluid.def("fluid.tests.rawSignalArg", {
    $layers: "fluid.component",
    showUserLayersOnly: false,
    layerList: {
        $compute: {
            func: "fluid.tests.layerListFromStore",
            args: [fluid.tests.rawStore, "{self}.showUserLayersOnly"]
        }
    }
});

QUnit.test("Raw signal supplied as $compute argument is not traversed", function (assert) {
    fluid.tests.rawStoreReceived.length = 0;
    const that = fluid.tests.rawSignalArg();
    fluid.cell.stabilize();

    // With the bug, flattenSignals overflows the stack inside fluid.cell.update, which catches the RangeError and
    // commits it as an unavailable value - so the suite survives but this assertion fails
    const layerList = that.layerList;
    assert.notOk(fluid.isUnavailable(layerList), "Computation with raw signal argument evaluated without error");
    assert.deepEqual(layerList, ["fluid.tests.someLayer"], "Computed result derived from store");
    assert.equal(fluid.tests.rawStoreReceived.length, 1, "Compute function invoked exactly once");

    if (fluid.tests.rawStoreReceived.length > 0) {
        const received = fluid.tests.rawStoreReceived[0].store;
        assert.equal(received, fluid.tests.rawStore._value,
            "Store value delivered by identity - material from a raw signal is not cloned or expanded");
        assert.equal(received.layers["fluid.tests.someLayer"], fluid.tests.rawStoreEntry,
            "Nested raw cells inside the store's value are left as they are");
    } else {
        assert.ok(false, "Compute function was never invoked");
    }

    // Reactivity through the raw signal should be preserved
    fluid.tests.rawStore.set({layers: {}});
    fluid.cell.stabilize();
    assert.deepEqual(that.layerList, [], "Computation updates when the raw signal is set");

    that.destroy();
});

// Method arguments referenced positionally as {N} which are not supplied at the call site should resolve to undefined,
// as with ordinary JS semantics, rather than producing an unavailable value which poisons the entire argument list

fluid.tests.missingArgLog = [];

fluid.def("fluid.tests.missingMethodArgs", {
    $layers: "fluid.component",
    allocateColour: {
        $method: {
            func: (self, layerName, layerDef) => {
                fluid.tests.missingArgLog.push({self, layerName, layerDef});
                return layerName;
            },
            args: ["{self}", "{0}:layerName", "{1}:layerDef"]
        }
    }
});

QUnit.test("Missing method arguments resolve to undefined", function (assert) {
    fluid.tests.missingArgLog.length = 0;
    const that = fluid.tests.missingMethodArgs();
    fluid.cell.stabilize();

    let result;
    try {
        result = that.allocateColour("$live");
    } catch (e) {
        assert.ok(false, "Method invocation with missing trailing argument threw: " + e.message);
    }

    assert.equal(fluid.tests.missingArgLog.length, 1, "Method function invoked exactly once");
    if (fluid.tests.missingArgLog.length > 0) {
        const received = fluid.tests.missingArgLog[0];
        assert.ok(fluid.isComponent(received.self), "{self} resolved to the component");
        assert.equal(received.layerName, "$live", "Supplied argument {0} delivered");
        assert.strictEqual(received.layerDef, undefined, "Missing argument {1} delivered as undefined");
        assert.equal(result, "$live", "Method return value delivered to caller");
    } else {
        assert.ok(false, "Method function was never invoked");
    }

    // Both arguments missing - all positional references should resolve to undefined
    fluid.tests.missingArgLog.length = 0;
    try {
        that.allocateColour();
    } catch (e) {
        assert.ok(false, "Method invocation with no arguments threw: " + e.message);
    }
    if (fluid.tests.missingArgLog.length > 0) {
        const received = fluid.tests.missingArgLog[0];
        assert.strictEqual(received.layerName, undefined, "Missing argument {0} delivered as undefined");
        assert.strictEqual(received.layerDef, undefined, "Missing argument {1} delivered as undefined");
    } else {
        assert.ok(false, "Method function was never invoked with no arguments");
    }

    that.destroy();
});

// Method arguments resolving to structures should be returned unchanged

fluid.tests.structuredArgLog = [];

fluid.def("fluid.tests.structuredMethodArgs", {
    $layers: "fluid.component",
    allocateColour: {
        $method: {
            func: (self, layerName, layerDef) => {
                fluid.tests.structuredArgLog.push({self, layerName, layerDef});
                return layerName;
            },
            args: ["{self}", "{0}:layerName", "{1}:layerDef"]
        }
    }
});

QUnit.test("Structured method argument containing unavailable value is delivered unchanged", function (assert) {
    fluid.tests.structuredArgLog.length = 0;
    const that = fluid.tests.structuredMethodArgs();
    fluid.cell.stabilize();

    const layerDef = {
        $layers: "fluid.component",
        colour: fluid.unavailable("Colour not yet allocated", "config")
    };

    let result;
    try {
        result = that.allocateColour("$live", layerDef);
    } catch (e) {
        assert.ok(false, "Method invocation with structured argument threw: " + e.message);
    }

    assert.equal(fluid.tests.structuredArgLog.length, 1, "Method function invoked exactly once");
    if (fluid.tests.structuredArgLog.length > 0) {
        const received = fluid.tests.structuredArgLog[0];
        assert.equal(received.layerName, "$live", "Supplied argument {0} delivered");
        assert.notOk(fluid.isUnavailable(received.layerDef), "Structured argument {1} not collapsed into an unavailable value");
        assert.strictEqual(received.layerDef, layerDef, "Structured argument {1} delivered by identity, unchanged");
        assert.ok(fluid.isUnavailable(received.layerDef?.colour), "Unavailable member of structured argument preserved");
        assert.equal(result, "$live", "Method return value delivered to caller");
    } else {
        assert.ok(false, "Method function was never invoked");
    }

    that.destroy();
});

QUnit.test("Layer definition released from its gate whilst being read by an instantiating component", async assert => {
    const loading = fluid.cell(fluid.unavailable("Loading fluid.tests.gated", "pending"), {name: "loading"});
    // A loader which is an effect, pending whilst its source is - pulling an effect ends its fit
    const loader = fluid.cell.effect(() => true, [loading], {name: "loader for fluid.tests.gated"});
    // As fluid.ensureImportsLoaded does, the layer's record holds the pending loader until its definition arrives
    fluid.writeLayer("fluid.tests.gated", loader);
    const that = fluid.initFreeComponent("fluid.tests.gated", {});
    fluid.cell.stabilize();

    const effectLog = [];
    // As the SFC's script does - the definition arrives whilst injection is still pending, and so is gated on it
    fluid.writeLayer("fluid.tests.gated", {
        $layers: ["fluid.component"],
        value: 42,
        logEffect: {
            $effect: {
                func: value => effectLog.push(value),
                args: "{self}.value"
            }
        }
    });
    assert.ok(fluid.gatedLayers.has("fluid.tests.gated"), "Definition gated on pending injection");
    fluid.cell.stabilize();

    // On completion the component re-reads its layer, whose record still holds the injection signal - pulling it to
    // test its availability ends its fit, which runs the gate effect and writes the definition mid-read
    loading.set(true);
    await fluid.cell.settle();
    assert.notOk(fluid.gatedLayers.has("fluid.tests.gated"), "Gate released");
    assert.deepEqual(effectLog, [42], "Component's effects allocated");
    assert.equal(that.value, 42, "Component instantiated from released definition");
    that.destroy();
});
