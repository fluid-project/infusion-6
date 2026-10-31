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

fluid.def("fluid.tests.chainBase", {
    $layers: "fluid.component",
    settings: {
        colour: "red",
        size: {width: 10, height: 20}
    },
    label: "base"
});

fluid.def("fluid.tests.chainDerived", {
    $layers: "fluid.tests.chainBase",
    settings: {
        size: {width: 30}
    }
});

QUnit.test("Members merged from the same chain of layer definitions are shared", function (assert) {
    const plain = that => ({colour: that.settings.colour, width: that.settings.size.width, height: that.settings.size.height});
    const shadowOf = that => that[fluid.proxySymbol].shadow;
    const sourceOf = (that, segs) => fluid.get(shadowOf(that).layerMap, [...segs, fluid.metadataSymbol, "source"]);
    const first = fluid.tests.chainDerived();
    const second = fluid.tests.chainDerived();
    const coloured = fluid.tests.chainDerived({settings: {colour: "blue"}});

    assert.deepEqual(plain(first), {colour: "red", width: 30, height: 20}, "Members merged from the chain of definitions");
    assert.deepEqual(plain(coloured), {colour: "blue", width: 30, height: 20}, "Member supplied by a user record merged over the chain");
    const merged = that => fluid.deSignal(shadowOf(that).flatMerged);
    assert.strictEqual(merged(first).settings, merged(second).settings, "Member merged only from definitions is shared by instances of the chain");
    assert.notStrictEqual(merged(first).settings, merged(coloured).settings, "Member to which a user record contributes is merged afresh");
    assert.strictEqual(merged(first).label, "base", "Member of a single definition held directly");

    assert.equal(sourceOf(second, ["settings", "size", "width"]), "fluid.tests.chainDerived", "Provenance of a shared member retained for each instance");
    assert.equal(sourceOf(second, ["settings", "size", "height"]), "fluid.tests.chainBase", "Provenance of a weaker definition retained");
    assert.notEqual(sourceOf(coloured, ["settings", "colour"]), "fluid.tests.chainBase", "Provenance of a member supplied by a user record");
    assert.equal(sourceOf(coloured, ["settings", "size", "height"]), "fluid.tests.chainBase", "Provenance beneath a member merged afresh");

    // A redefinition is a fresh layer, whose chain is merged afresh
    fluid.def("fluid.tests.chainBase", {
        $layers: "fluid.component",
        settings: {
            colour: "green",
            size: {width: 10, height: 40}
        },
        label: "base"
    });
    fluid.cell.stabilize();
    assert.deepEqual(plain(first), {colour: "green", width: 30, height: 40}, "Instance updated on redefinition of a layer of its chain");
    assert.deepEqual(plain(coloured), {colour: "blue", width: 30, height: 40}, "Instance with its own member updated on redefinition");
    assert.strictEqual(merged(first).settings, merged(second).settings, "Member merged from the redefined chain is shared");
    [first, second, coloured].forEach(that => that.destroy());
});

fluid.def("fluid.tests.assocBase", {
    $layers: "fluid.component",
    shape: {p: 1}
});

fluid.def("fluid.tests.assocDerived", {
    $layers: "fluid.tests.assocBase",
    shape: 5
});

// Merging is not associative - a plain value overrides weaker material only where it is the strongest value merged, and
// so a chain of definitions cannot be premerged into a single layer over which a component's own records are merged
QUnit.test("Member of a user record merged over a chain whose definitions do not associate", function (assert) {
    const merge = function (layers) {
        const target = fluid.makeLayer("root", null);
        const mergeRecords = layers.map((layer, i) => ({mergeRecordType: "user", mergeRecordName: "layer" + i}));
        fluid.mergeLayers(target, [], {}, layers, mergeRecords);
        return target;
    };
    const A = {shape: {p: 1}}, B = {shape: 5}, C = {shape: {q: 2}};
    assert.deepEqual({...merge([A, B, C]).shape}, {p: 1, q: 2}, "All layers merged together");
    assert.deepEqual({...merge([merge([A, B]), C]).shape}, {q: 2}, "Weaker layers merged first lose the weakest material");

    const plain = fluid.tests.assocDerived();
    const shaped = fluid.tests.assocDerived({shape: {q: 2}});
    assert.strictEqual(plain.shape, 5, "Member merged only from definitions");
    assert.deepEqual({...shaped.shape}, {p: 1, q: 2}, "Member of a user record merged over every definition of the chain, as if all were merged together");
    [plain, shaped].forEach(that => that.destroy());
});

fluid.def("fluid.tests.sharedRootSource", {
    $layers: "fluid.component",
    text: "First"
});

fluid.def("fluid.tests.sharedRoot", {
    $layers: "fluid.component",
    source: {
        $component: {
            $layers: "fluid.tests.sharedRootSource"
        }
    },
    settings: {
        size: {width: 10}
    },
    state: {
        $reactiveRoot: {
            colour: "red"
        },
        prompt: "{source}.text"
    }
});

// A reactive root is first merged from the chain's shared layer map - once its value is written into the live layer of
// each instance, as it is on creation, it is merged afresh for each
QUnit.test("Layer maps of members merged only from definitions are shared by instances of the chain", function (assert) {
    const shadowOf = that => that[fluid.proxySymbol].shadow;
    const first = fluid.tests.sharedRoot();
    const second = fluid.tests.sharedRoot({source: {$component: {text: "Second"}}});
    fluid.cell.stabilize();
    const firstMap = shadowOf(first).layerMap, secondMap = shadowOf(second).layerMap;
    assert.strictEqual(firstMap.settings, secondMap.settings, "Layer map of a member merged only from definitions shared by instances");
    assert.equal(fluid.get(firstMap, ["settings", fluid.metadataSymbol, "source"]), "fluid.tests.sharedRoot", "Provenance held in the shared map");
    assert.notStrictEqual(firstMap.source, secondMap.source, "Layer map of a member supplied by a user record not shared");
    assert.notStrictEqual(firstMap.state, secondMap.state, "Layer map of a reactive root held in the live layer not shared");
    assert.equal(firstMap.state[fluid.metadataSymbol].reactiveLinks.length, 1, "Link of the reactive root recorded");
    assert.equal(first.state.prompt, "First", "Link resolved against the first instance");
    assert.equal(second.state.prompt, "Second", "Link resolved against the second instance");

    first.state.colour = "blue";
    first.source.text = "Changed";
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(first.state), {colour: "blue", prompt: "Changed"}, "Reactive root of the first instance written, and its link followed");
    assert.deepEqual(fluid.unwrapProxy(second.state), {colour: "red", prompt: "Second"}, "Reactive root of the second instance unaffected");
    [first, second].forEach(that => that.destroy());
});

fluid.def("fluid.tests.sharedRecordsBase", {
    $layers: "fluid.component",
    label: "base"
});

fluid.def("fluid.tests.sharedRecordsExtra", {
    $layers: "fluid.component",
    label: "extra"
});

fluid.def("fluid.tests.sharedRecordsHost", {
    $layers: ["fluid.tests.sharedRecordsBase", "{self}.extraLayers"],
    extraLayers: []
});

QUnit.test("Merge records of definitions shared by components resolving the same chain", function (assert) {
    const shadowOf = that => that[fluid.proxySymbol].shadow;
    const recordOf = (that, name) => shadowOf(that).mergeRecords.find(mergeRecord => mergeRecord.mergeRecordName === name);
    const first = fluid.tests.sharedRecordsHost({$layers: "fluid.tests.sharedRecordsExtra"});
    const second = fluid.tests.sharedRecordsHost({$layers: "fluid.tests.sharedRecordsExtra"});
    fluid.cell.stabilize();
    assert.strictEqual(recordOf(first, "fluid.tests.sharedRecordsBase"), recordOf(second, "fluid.tests.sharedRecordsBase"),
        "Merge record of a definition shared");
    assert.strictEqual(first.$layers, second.$layers, "Resolved layers shared");

    // The same chain, with its extra layer supplied dynamically, which upgrades the priority of that layer's record
    const dynamic = fluid.tests.sharedRecordsHost({extraLayers: ["fluid.tests.sharedRecordsExtra"], label: "user"});
    fluid.cell.stabilize();
    assert.equal(dynamic.label, "extra", "Dynamically supplied layer beats a user record");
    assert.equal(recordOf(dynamic, "fluid.tests.sharedRecordsExtra").mergeRecordType, "dynamicLayers", "Record of the dynamic layer upgraded");

    const later = fluid.tests.sharedRecordsHost({$layers: "fluid.tests.sharedRecordsExtra", label: "user"});
    fluid.cell.stabilize();
    assert.equal(recordOf(later, "fluid.tests.sharedRecordsExtra").mergeRecordType, "def", "Shared record of the definition not upgraded");
    assert.equal(later.label, "user", "User record beats the definition of a later instance of the same chain");
    [first, second, dynamic, later].forEach(that => that.destroy());
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

// Composite effects - FLUID-7028

fluid.tests.appendStage = function (payload, stage, log) {
    const togo = [...fluid.makeArray(payload), stage];
    log(stage, togo);
    return togo;
};

fluid.tests.asyncStage = async function (payload, stage, log) {
    await fluid.tests.wait(1);
    return fluid.tests.appendStage(payload, stage, log);
};

fluid.tests.logStage = function (stage, log) {
    log(stage);
};

fluid.tests.wait = delay => new Promise(resolve => setTimeout(resolve, delay));

fluid.def("fluid.tests.compositeBase", {
    $layers: "fluid.component",
    log: () => {},
    initial: "start",
    ready: {
        $effect: [{
            namespace: "load",
            func: "fluid.tests.appendStage",
            args: ["{self}.initial", "load", "{self}.log"]
        }, {
            namespace: "style",
            func: "fluid.tests.appendStage",
            args: ["{$payload}", "style", "{self}.log"]
        }, {
            namespace: "notify",
            priority: "after:style",
            func: "fluid.tests.logStage",
            args: ["notify", "{self}.log"]
        }]
    },
    consumer: "$effect:fluid.tests.logValue({self}.ready, {self}.log)"
});

fluid.def("fluid.tests.compositeDerived", {
    $layers: "fluid.tests.compositeBase",
    ready: {
        $effect: [{
            namespace: "patterns",
            priority: "before:style",
            func: "fluid.tests.appendStage",
            args: ["{$payload}", "patterns", "{self}.log"]
        }, {
            namespace: "load",
            func: "fluid.tests.appendStage",
            args: ["{self}.initial", "reload", "{self}.log"]
        }]
    }
});

QUnit.test("Composite effect runs its listener records as a chain", function (assert) {
    const log = [];
    const that = fluid.tests.compositeBase({
        log: (...args) => log.push(args)
    });
    fluid.cell.stabilize();
    assert.deepEqual(log, [
        ["load", ["start", "load"]],
        ["style", ["start", "load", "style"]],
        ["notify"],
        [["start", "load", "style"]]
    ], "Records run in order, each receiving the payload of the last, and the final payload consumed by a downstream effect");
    assert.deepEqual(that.ready, ["start", "load", "style"], "Final payload held at the composite effect's path");
    log.length = 0;
    that.initial = "again";
    fluid.cell.stabilize();
    assert.deepEqual(log.map(entry => entry[0]), ["load", "style", "notify", ["again", "load", "style"]], "Chain run afresh on change in an argument");
    that.destroy();
});

QUnit.test("Composite effects merged across layers by namespace", function (assert) {
    const log = [];
    const that = fluid.tests.compositeDerived({
        log: (...args) => log.push(args)
    });
    fluid.cell.stabilize();
    assert.deepEqual(log.map(entry => entry[0]), ["reload", "patterns", "style", "notify", ["start", "reload", "patterns", "style"]],
        "Stronger record displaces weaker of the same namespace in place, and new record is ordered by its priority");
    that.destroy();
});

fluid.tests.logArgCount = function (log, ...args) {
    log(args.length);
};

fluid.def("fluid.tests.compositeSimpleOverride", {
    $layers: "fluid.component",
    log: () => {},
    value: 1,
    logged: {
        $effect: {
            func: "fluid.tests.logArgCount",
            args: ["{self}.log", "{self}.value", "{self}.value"]
        }
    },
    added: "$effect:fluid.tests.logStage(base, {self}.log)"
});

fluid.def("fluid.tests.compositeSimpleOverrideDerived", {
    $layers: "fluid.tests.compositeSimpleOverride",
    logged: {
        $effect: {
            func: "fluid.tests.logArgCount",
            args: ["{self}.log"]
        }
    },
    added: {
        $effect: [{
            namespace: "extra",
            func: "fluid.tests.logStage",
            args: ["extra", "{self}.log"]
        }]
    }
});

QUnit.test("Simple effects merged as listener records with the empty namespace", function (assert) {
    const log = [];
    const that = fluid.tests.compositeSimpleOverrideDerived({
        log: value => log.push(value)
    });
    fluid.cell.stabilize();
    assert.deepEqual(log, [0, "base", "extra"], "Stronger simple effect displaces weaker as a whole rather than having its " +
        "arguments merged with it, and composite record accumulates with simple effect");
    that.destroy();
});

fluid.def("fluid.tests.compositeAsync", {
    $layers: "fluid.component",
    log: () => {},
    initial: "start",
    ready: {
        $effect: [{
            namespace: "load",
            func: "fluid.tests.asyncStage",
            args: ["{self}.initial", "load", "{self}.log"]
        }, {
            namespace: "notify",
            func: "fluid.tests.logStage",
            args: ["notify", "{self}.log"]
        }, {
            namespace: "style",
            priority: "after:notify",
            func: "fluid.tests.asyncStage",
            args: ["{$payload}", "style", "{self}.log"]
        }]
    },
    consumer: "$effect:fluid.tests.logValue({self}.ready, {self}.log)"
});

QUnit.test("Composite effect with asynchronous listener records", async function (assert) {
    const log = [];
    const that = fluid.tests.compositeAsync({
        log: (...args) => log.push(args[0])
    });
    fluid.cell.stabilize();
    assert.deepEqual(log, [], "Nothing logged before first promise resolves");
    const shadow = that[fluid.proxySymbol].shadow;
    const readyCell = fluid.get(shadow.shadowMap, ["ready", fluid.metadataSymbol, "signalProduct"]);
    assert.ok(fluid.isPending(readyCell.get()), "Composite effect pending whilst its chain runs");
    const ready = await fluid.cell.waitFor(readyCell);
    assert.deepEqual(ready, ["start", "load", "style"], "Composite effect can be awaited for its final payload, passed through a listener returning undefined");
    await fluid.cell.settle();
    assert.deepEqual(log, ["load", "notify", "style", ["start", "load", "style"]], "Downstream effect notified once chain completes");

    log.length = 0;
    that.initial = "first";
    fluid.cell.stabilize();
    that.initial = "second";
    await fluid.cell.settle();
    assert.deepEqual(that.ready, ["second", "load", "style"], "Final payload is that of the latest run");
    assert.deepEqual(log, ["load", "load", "notify", "style", ["second", "load", "style"]],
        "Superseded run dispatches no further records once its pending record completes, and downstream effect notified once");
    that.destroy();
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
// Readers of members, whether computed or plain, should not be notified by turnover which leaves those members
// unchanged - FLUID-7021

const globalHolder = {
    computedCount: 0,
    effectCount: 0,
    effectRuns: 0,
    plainEffectRuns: 0
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
                ++globalHolder.effectRuns;
            }
        }
    },
    plain: {name: "unchanged"},
    plainEffect: {
        $effect: {
            args: "{self}.plain",
            func: () => ++globalHolder.plainEffectRuns
        }
    }
});

QUnit.test("Computed arg sensitivity", function (assert) {
    const that = fluid.tests.selfUpdate();
    fluid.cell.stabilize();
    const instanceId = that.instanceId;
    that.updated = 1;
    fluid.cell.stabilize();
    assert.notEqual(that.instanceId, instanceId, "Component turned over through the write to its live layer");
    assert.equal(globalHolder.effectCount, 1, "Just one update to effect");
    assert.equal(globalHolder.computedCount, 1, "Just one update to computed");
    that.otherUpdated = 1;
    fluid.cell.stabilize();
    assert.equal(globalHolder.computedCount, 1, "Computed for {self} does not update");
    assert.equal(globalHolder.effectRuns, 1, "Effect reading computed member not rerun by turnover");
    assert.equal(globalHolder.plainEffectRuns, 1, "Effect reading plain member not rerun by turnover");
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

/** FLUID-7002 circular hierarchy tests */

fluid.def("fluid.tests.circularComponent", {
    $layers: "fluid.tests.circularComponent"
});

QUnit.test("FLUID-7002 circularity", function (assert) {
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


QUnit.test("FLUID-7002 indirect circularity", function (assert) {
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

QUnit.test("FLUID-7001 scoping test", function (assert) {
    const that = fluid.tests.FLUID7000scope();
    // Oddity here - we can't construct subcomponents without resolving effects! Needs FDS.
    fluid.cell.stabilize();
    assert.equal(that.joined.joinedResolution, "root", "Same-named scope resolved to root in its own material");
    // Can't actually support this for FLUID-7001 without stopping scope chain from being a chain - would need to
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

// Arrays nested within a $reactiveRoot - FLUID-7024

fluid.def("fluid.tests.reactiveArrays", {
    $layers: "fluid.component",
    state: {
        $reactiveRoot: {
            name: "Initial",
            entries: []
        }
    },
    list: {
        $reactiveRoot: []
    },
    entryCount: "$compute:fluid.tests.countEntries({self}.state.entries)",
    listCount: "$compute:fluid.tests.countEntries({self}.list)"
});

fluid.tests.countEntries = entries => entries.length;

QUnit.test("Mutation of arrays within reactive roots", function (assert) {
    const that = fluid.tests.reactiveArrays();
    fluid.cell.stabilize();
    assert.equal(that.entryCount, 0, "Initially no entries");

    that.state.entries.push({id: 1});
    fluid.cell.stabilize();
    assert.equal(that.entryCount, 1, "Push onto nested array observed");
    assert.deepEqual(fluid.unwrapProxy(that.state), {name: "Initial", entries: [{id: 1}]}, "Push applied within reactive root");

    that.state.entries = [...that.state.entries, {id: 2}];
    fluid.cell.stabilize();
    assert.equal(that.entryCount, 2, "Reassignment of nested array from a spread of itself observed");
    assert.deepEqual(fluid.unwrapProxy(that.state.entries), [{id: 1}, {id: 2}], "Spread elements written as plain values");

    that.state.name = "Renamed";
    that.state.entries.splice(0, 1);
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(that.state), {name: "Renamed", entries: [{id: 2}]}, "Sibling write and splice both retained");

    that.list.push("a");
    that.list.push("b");
    fluid.cell.stabilize();
    assert.equal(that.listCount, 2, "Successive pushes onto top-level reactive array both observed");
    assert.deepEqual(fluid.unwrapProxy(that.list), ["a", "b"], "Top-level reactive array holds pushed elements");
});

QUnit.test("Proxy onto material which has gone away reads as empty - FLUID-7024", function (assert) {
    const that = fluid.tests.reactiveArrays();
    fluid.cell.stabilize();
    that.state.entries = [{id: 1}, {id: 2}];
    fluid.cell.stabilize();
    const element = that.state.entries[1];
    assert.equal(element.id, 2, "Proxy onto array element reads its material");
    that.state.entries = [];
    fluid.cell.stabilize();
    assert.notOk(fluid.isUnavailable(element), "Testing type of vanished material does not throw");
    assert.equal(Object.getPrototypeOf(element), null, "Vanished material has no prototype");
    assert.deepEqual(Object.keys(element), [], "Vanished material has no keys");
    assert.equal(element.id, undefined, "Member of vanished material reads as undefined");
    that.destroy();
});

// As for the editor's tabs - its open tabs are held in a reactive root, recorded in the history, whereas which of them is
// selected is a plain member which is not, so that navigating the history restores tabs without their selection
fluid.def("fluid.tests.tabHolder", {
    $layers: "fluid.component",
    openTabs: {
        $reactiveRoot: []
    },
    selectedTab: null
});

QUnit.test("Only writes beneath reactive roots recorded in the history", function (assert) {
    const that = fluid.tests.tabHolder();
    fluid.cell.stabilize();
    const start = fluid.layerHistory.get().length;
    that.openTabs.push("first");
    that.selectedTab = "first";
    that.openTabs.splice(0, 1);
    that.selectedTab = null;
    fluid.cell.stabilize();
    const added = fluid.layerHistory.get().slice(start);
    assert.deepEqual(added.map(record => [record.oldValue, record.newValue]), [[[], ["first"]], [["first"], []]],
        "Mutations of reactive array recorded, but not writes to plain member");
    fluid.historyBack();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(that.openTabs), ["first"], "Stepping back reopens the closed tab");
    fluid.historyForward();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(that.openTabs), [], "Stepping forward closes it again");
    that.destroy();
});

// Members merged alongside a $reactiveRoot, which may be links to referenced values - FLUID-7025

fluid.def("fluid.tests.reactiveSource", {
    $layers: "fluid.component",
    text: "From source"
});

fluid.def("fluid.tests.reactiveBase", {
    $layers: "fluid.component",
    state: {
        $reactiveRoot: {
            prompt: "",
            colour: "red",
            nested: {
                size: 1,
                weight: 2
            },
            data: "{not}.aReference"
        }
    }
});

// A mixin overriding single members of the base's reactive root with a link and a literal
fluid.def("fluid.tests.reactiveMixin", {
    $layers: "fluid.tests.reactiveBase",
    source: {
        $component: {
            $layers: "fluid.tests.reactiveSource"
        }
    },
    state: {
        prompt: "{source}.text",
        nested: {
            size: 5
        }
    }
});

QUnit.test("Reactive root members overridden by links and literals from another layer", function (assert) {
    const that = fluid.tests.reactiveMixin();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(that.state), {
        prompt: "From source", colour: "red", nested: {size: 5, weight: 2}, data: "{not}.aReference"
    }, "Linked member drawn from its source, literal overrides initial value, and data within the root is not a link");

    const start = fluid.layerHistory.get().length;
    that.source.text = "Changed at source";
    fluid.cell.stabilize();
    assert.equal(that.state.prompt, "Changed at source", "Linked member follows its source");
    assert.equal(fluid.layerHistory.get().length, start, "Write through link not recorded in the history");

    that.state.colour = "blue";
    fluid.cell.stabilize();
    that.source.text = "Changed again";
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(that.state), {
        prompt: "Changed again", colour: "blue", nested: {size: 5, weight: 2}, data: "{not}.aReference"
    }, "Link still honoured once the reactive root has been written into the live layer");

    that.state.prompt = "Written locally";
    fluid.cell.stabilize();
    assert.equal(that.state.prompt, "Written locally", "Linked member may be written");
    assert.equal(that.source.text, "Changed again", "Write to linked member does not reach its source");
    assert.equal(fluid.layerHistory.get().length, start + 2, "Writes to the reactive root recorded in the history");
    that.source.text = "Changed once more";
    fluid.cell.stabilize();
    assert.equal(that.state.prompt, "Changed once more", "Linked member follows its source again once it changes");
    that.destroy();
});

// Members alongside the $reactiveRoot record in a single layer are equally honoured
fluid.def("fluid.tests.reactiveSingleLayer", {
    $layers: "fluid.component",
    source: {
        $component: {
            $layers: "fluid.tests.reactiveSource"
        }
    },
    state: {
        $reactiveRoot: {
            prompt: "",
            count: 0
        },
        prompt: "{source}.text",
        count: 3
    }
});

// A stronger layer supplying a member within its own $reactiveRoot record displaces a weaker link
fluid.def("fluid.tests.reactiveUnlinked", {
    $layers: "fluid.tests.reactiveMixin",
    state: {
        $reactiveRoot: {
            prompt: "Fixed"
        }
    }
});

// Members supplied by a middle layer, partly displaced by a stronger layer's $reactiveRoot record
fluid.def("fluid.tests.reactiveLayered.base", {
    $layers: "fluid.component",
    state: {$reactiveRoot: {a: 1, b: 2, c: 3}},
    other: "x"
});

fluid.def("fluid.tests.reactiveLayered.mid", {
    $layers: "fluid.tests.reactiveLayered.base",
    state: {a: 10, b: "{self}.other"}
});

fluid.def("fluid.tests.reactiveLayered.top", {
    $layers: "fluid.tests.reactiveLayered.mid",
    state: {$reactiveRoot: {a: 100}}
});

QUnit.test("Reactive root links within a single layer, and displaced by a stronger layer", function (assert) {
    const single = fluid.tests.reactiveSingleLayer();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(single.state), {prompt: "From source", count: 3}, "Link and literal alongside record in a single layer");
    single.source.text = "Changed";
    fluid.cell.stabilize();
    assert.equal(single.state.prompt, "Changed", "Link within a single layer follows its source");
    single.destroy();

    const unlinked = fluid.tests.reactiveUnlinked();
    fluid.cell.stabilize();
    assert.equal(unlinked.state.prompt, "Fixed", "Stronger layer's record displaces weaker link");
    unlinked.source.text = "Changed";
    fluid.cell.stabilize();
    assert.equal(unlinked.state.prompt, "Fixed", "Displaced link not honoured");
    unlinked.destroy();

    const layered = fluid.tests.reactiveLayered.top();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(layered.state), {a: 100, b: "x", c: 3},
        "Stronger record displaces weaker literal at its member only, leaving other members and links in place");
    layered.destroy();
});

QUnit.test("Directive merged alongside a reactive root is reported, but may replace it as a whole", function (assert) {
    const that = fluid.tests.reactiveBase({state: {colour: "$compute:fluid.tests.countEntries({self}.state)"}});
    assert.ok(fluid.isUnavailable(that), "Component holding directive within reactive root is unavailable");
    const message = fluid.deSignal(that[fluid.proxySymbol].shadow.flatMerged).message;
    assert.ok(message.includes("Cannot override member colour of the reactive root at path state"), "Error identifies the member and its reactive root");

    // As for the todo list's selects, whose options are computed in place of an empty reactive root
    const replaced = fluid.tests.reactiveBase({state: "$compute:fluid.tests.countEntries({self}.list)", list: ["a", "b"]});
    fluid.cell.stabilize();
    assert.equal(replaced.state, 2, "Reactive root replaced as a whole by a directive");
    replaced.destroy();
});

// A fresh resolveRoot component resolves in place of one which has been destroyed

fluid.def("fluid.tests.rootResolved", {
    $layers: ["fluid.component", "fluid.resolveRoot"],
    notes: []
});

fluid.def("fluid.tests.rootReader", {
    $layers: "fluid.component",
    read: "{rootResolved}.notes"
});

QUnit.test("Destroyed resolveRoot component withdrawn from root scope", function (assert) {
    const first = fluid.tests.rootResolved({notes: ["first"]});
    const reader = fluid.tests.rootReader();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(reader.read), ["first"], "Root-resolved component resolved");
    first.destroy();
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(reader.read), "Reference unavailable once root-resolved component is destroyed");
    const second = fluid.tests.rootResolved({notes: ["second"]});
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(reader.read), ["second"], "Existing reference resolves to fresh root-resolved component");
    const freshReader = fluid.tests.rootReader();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.unwrapProxy(freshReader.read), ["second"], "Fresh reference resolves to fresh root-resolved component");
    freshReader.destroy();
    reader.destroy();
    second.destroy();
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

fluid.def("fluid.tests.parentBase", {
    $layers: "fluid.component",
    value: 1,
    child: {
        $component: {
            $layers: "fluid.component",
            parentValue: "{$parent}.value"
        }
    }
});

// Contributes to the child's record, so that it is merged afresh from two layers whenever the parent turns over
fluid.def("fluid.tests.parentExtra", {
    child: {
        $component: {
            extra: true
        }
    }
});

QUnit.test("{$parent} reference and subcomponent merged from several layers survives turnover - FLUID-7019", function (assert) {
    const that = fluid.tests.parentBase({$layers: "fluid.tests.parentExtra"});
    fluid.cell.stabilize();
    const childShadow = that.child[fluid.metadataSymbol];
    assert.equal(that.child.parentValue, 1, "Child resolves member of its parent via {$parent}");
    assert.equal(that.child.extra, true, "Child record merged from both layers");

    // Cause the parent to turn over by replacing its definition
    const oldDef = fluid.def("fluid.tests.parentBase");
    fluid.def("fluid.tests.parentBase", {...oldDef, value: 2});
    fluid.cell.stabilize();
    assert.equal(that.child.parentValue, 2, "Child observes updated parent value");
    assert.equal(that.child[fluid.metadataSymbol], childShadow, "Child component preserved across parent turnover");
    assert.notOk(fluid.isDestroyed(that.child), "Child component not destroyed");
    fluid.def("fluid.tests.parentBase", oldDef);
    that.destroy();
});

// FLUID-5614 "double deep trees": a subcomponent record contributed along two paths through the layer hierarchy
fluid.def("fluid.tests.deepC", {
    $layers: "fluid.component",
    fromC: "C",
    overridden: "C"
});

fluid.def("fluid.tests.deepD", {
    $layers: "fluid.component",
    fromD: "D",
    overridden: "D"
});

fluid.def("fluid.tests.deepA", {
    $layers: "fluid.component",
    value: 0,
    sub: {
        $component: {
            $layers: "fluid.tests.deepC",
            fromA: "A",
            shared: "A"
        }
    }
});

fluid.def("fluid.tests.deepB", {
    $layers: "fluid.tests.deepA",
    sub: {
        $component: {
            $layers: "fluid.tests.deepD",
            fromB: "B",
            shared: "B"
        }
    }
});

QUnit.test("Subcomponent records contributed along two paths accumulate - FLUID-5614, FLUID-7019", function (assert) {
    const that = fluid.tests.deepB({
        sub: {
            $component: {
                fromUser: "user"
            }
        }
    });
    fluid.cell.stabilize();
    const sub = that.sub;
    assert.ok(fluid.hasLayer(sub, "fluid.tests.deepC"), "Layer contributed by base layer's record retained");
    assert.ok(fluid.hasLayer(sub, "fluid.tests.deepD"), "Layer contributed by derived layer's record retained");
    assert.deepEqual([sub.fromA, sub.fromB, sub.fromC, sub.fromD, sub.fromUser], ["A", "B", "C", "D", "user"],
        "Members of every contribution and of all contributed layers present");
    assert.equal(sub.shared, "B", "Member contributed by derived layer's record overrides that of base layer's");
    assert.equal(sub.overridden, "D", "Later contributed layer overrides earlier one");

    const instanceId = sub.instanceId;
    that.value = 1;
    fluid.cell.stabilize();
    assert.equal(that.sub.instanceId, instanceId, "Subcomponent not turned over when its parent turns over with unchanged contributions");
    that.destroy();
});

fluid.def("fluid.tests.mixedRecord", {
    $layers: "fluid.component",
    sub: {
        $component: {
            $layers: "fluid.component"
        }
    }
});

QUnit.test("Plain value merged with a subcomponent record is reported - FLUID-7019", function (assert) {
    const that = fluid.tests.mixedRecord({sub: {value: 1}});
    assert.ok(fluid.isUnavailable(that), "Component holding malformed subcomponent record is unavailable");
    const message = fluid.deSignal(that[fluid.proxySymbol].shadow.flatMerged).message;
    assert.ok(message.includes("at path sub from user"), "Error identifies the path and source of the malformed value");
    assert.ok(message.includes("{$component: ...}"), "Error explains how the record should be written");
});

// Injected component references - FLUID-7020

fluid.def("fluid.tests.injection.innerType", {
    $layers: "fluid.component",
    value: "inner"
});

fluid.def("fluid.tests.injection.otherType", {
    $layers: "fluid.component",
    value: "other"
});

fluid.def("fluid.tests.injection.holder", {
    $layers: "fluid.component",
    original: {
        $component: {
            $layers: "fluid.component",
            inner: {
                $component: {
                    $layers: "fluid.tests.injection.innerType"
                }
            }
        }
    },
    other: {
        $component: {
            $layers: "fluid.tests.injection.otherType"
        }
    },
    injected: "{original}.inner",
    reader: {
        $component: {
            $layers: "fluid.component",
            byMember: "{injected}.value",
            byNickName: "{innerType}.value",
            byLayerName: "{fluid.tests.injection.innerType}.value",
            byOriginalName: "{inner}.value"
        }
    },
    // References which do not designate a component at a location in the tree are not injected
    plainValue: "{original}.inner.value",
    selfRef: "{self}"
});

QUnit.test("Injected component reference - FLUID-7020", function (assert) {
    const that = fluid.tests.injection.holder();
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];
    const innerShadow = that.original.inner[fluid.metadataSymbol];
    const injectedPath = fluid.composeSegment(shadow.path, "injected");

    assert.equal(that.injected, that.original.inner, "Injected member is the same component as the original");
    assert.equal(that.injected.value, "inner", "Injected component's members are readable through its injected site");
    assert.equal(innerShadow.path, fluid.composeSegments([shadow.path, "original", "inner"]), "Injected component retains its original path");
    assert.equal(shadow.childComponents.injected, innerShadow, "Injected component is recorded as a child of its new parent");
    assert.equal(fluid.globalInstantiator.pathToComponent[injectedPath], innerShadow, "Injected component is recorded at its injected path");
    assert.ok(innerShadow.injectedPaths[injectedPath], "Injected path is recorded on the injected component");

    assert.equal(that.reader.byMember, "inner", "Injected component resolves by its injected member name");
    assert.equal(that.reader.byNickName, "inner", "Injected component resolves by its layer's nickname");
    assert.equal(that.reader.byLayerName, "inner", "Injected component resolves by its layer name");
    assert.ok(fluid.isUnavailable(that.reader.byOriginalName), "Injected component does not resolve by its member name at its original site");
    assert.equal(that.plainValue, "inner", "Reference to a plain value resolves to that value");
    ["plainValue", "selfRef"].forEach(member => {
        assert.undefined(shadow.childComponents[member], `Reference at member ${member} not designating an injectable component is not injected`);
    });

    that.original.inner.destroy();
    fluid.cell.stabilize();
    assert.ok(fluid.isDestroyedShadow(innerShadow), "Original component destroyed");
    assert.ok(fluid.isUnavailable(that.injected), "Injected member is unavailable once its component is destroyed");
    assert.undefined(shadow.childComponents.injected, "Injected component is no longer recorded as a child of its new parent");
    assert.undefined(fluid.globalInstantiator.pathToComponent[injectedPath], "Injected component is no longer recorded at its injected path");
    assert.ok(fluid.isUnavailable(that.reader.byMember), "Injected member name no longer resolves");
    assert.ok(fluid.isUnavailable(that.reader.byNickName), "Injected component's layer nickname no longer resolves");
    that.destroy();
});

QUnit.test("Injected component reference withdrawn when its record changes - FLUID-7020", function (assert) {
    const that = fluid.tests.injection.holder();
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];
    const innerShadow = that.original.inner[fluid.metadataSymbol];
    const otherShadow = that.other[fluid.metadataSymbol];
    const injectedPath = fluid.composeSegment(shadow.path, "injected");
    assert.equal(that.reader.byNickName, "inner", "Injected component initially resolves by its layer's nickname");

    const oldDef = fluid.def("fluid.tests.injection.holder");
    fluid.def("fluid.tests.injection.holder", {...oldDef, injected: "{other}"});
    fluid.cell.stabilize();
    assert.equal(that.injected, that.other, "Freshly referenced component is injected");
    assert.equal(that.reader.byMember, "other", "Injected member name resolves to freshly injected component");
    assert.ok(fluid.isUnavailable(that.reader.byNickName), "Formerly injected component's layer nickname no longer resolves");
    assert.equal(fluid.globalInstantiator.pathToComponent[injectedPath], otherShadow, "Freshly injected component recorded at the injected path");
    assert.notOk(innerShadow.injectedPaths[injectedPath], "Formerly injected component no longer records the injected path");
    assert.notOk(fluid.isDestroyed(that.original.inner), "Formerly injected component is not destroyed");

    fluid.def("fluid.tests.injection.holder", oldDef);
    that.destroy();
});

fluid.def("fluid.tests.injection.freeHolder", {
    $layers: "fluid.component"
});

QUnit.test("Destroying a component holding an injected component leaves it intact - FLUID-7020", function (assert) {
    const target = fluid.tests.injection.innerType();
    const targetShadow = target[fluid.metadataSymbol];
    const that = fluid.tests.injection.freeHolder({
        injected: `{/${targetShadow.path}}`
    });
    fluid.cell.stabilize();
    const injectedPath = fluid.composeSegment(that[fluid.metadataSymbol].path, "injected");
    assert.equal(that.injected, target, "Free component injected through global reference");
    assert.ok(targetShadow.injectedPaths[injectedPath], "Injected path is recorded on the injected component");

    that.destroy();
    fluid.cell.stabilize();
    assert.ok(fluid.isDestroyed(that), "Component holding injected component is destroyed");
    assert.notOk(fluid.isDestroyed(target), "Injected component is not destroyed");
    assert.equal(target.value, "inner", "Injected component is still readable");
    assert.notOk(targetShadow.injectedPaths[injectedPath], "Injected path is no longer recorded on the injected component");
    assert.undefined(fluid.globalInstantiator.pathToComponent[injectedPath], "Injected component is no longer recorded at its injected path");
    target.destroy();
});

QUnit.test("Destroying a component lensed from a data item deletes the item - FLUID-7020", function (assert) {
    const that = fluid.tests.editorHolder();
    that.names.push("alpha");
    that.names.push("beta");
    that.names.push("gamma");
    fluid.cell.stabilize();
    const query = fluid.liveQueryILSelector(that, "fluid.tests.editor");
    assert.deepEqual(fluid.tests.queryEditorNames(query), ["alpha", "beta", "gamma"], "Three editors lensed from data");

    const [, beta] = query.get();
    beta.destroy();
    assert.deepEqual([...that.names], ["alpha", "gamma"], "Destroying lensed component deletes its data item from the source");
    assert.deepEqual(fluid.tests.queryEditorNames(query), ["alpha", "gamma"], "Component list follows the deletion");
    assert.notOk(fluid.isDestroyed(that), "Holder of the source data is not destroyed");
    that.destroy();
});

fluid.def("fluid.tests.injection.overridden", {
    $layers: "fluid.component",
    sub: {
        $component: {
            $layers: "fluid.tests.injection.innerType",
            value: "own"
        }
    }
});

QUnit.test("Reference overrides weaker subcomponent record and is injected - FLUID-7020", function (assert) {
    const target = fluid.tests.injection.otherType();
    const targetShadow = target[fluid.metadataSymbol];
    const that = fluid.tests.injection.overridden({
        sub: `{/${targetShadow.path}}`
    });
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];
    assert.equal(that.sub, target, "Reference overrides weaker subcomponent record");
    assert.equal(that.sub.value, "other", "Injected component's own value is visible");
    assert.notOk(Object.values(fluid.globalInstantiator.pathToComponent).some(oneShadow => oneShadow.path === fluid.composeSegment(shadow.path, "sub")),
        "No component was created for the overridden subcomponent record");
    that.destroy();
    target.destroy();
});

QUnit.test("Subcomponent record holding a String is reported - FLUID-7020", function (assert) {
    const that = fluid.tests.injection.freeHolder({sub: {$component: "{self}"}});
    assert.ok(fluid.isUnavailable(that), "Component holding a String subcomponent record is unavailable");
    const message = fluid.deSignal(that[fluid.proxySymbol].shadow.flatMerged).message;
    assert.ok(message.includes("\"{context}.path\""), "Error explains that a reference should be written directly");
});

fluid.def("fluid.tests.injection.flattenedArgument", {
    $layers: "fluid.component",
    original: {
        $component: {
            $layers: "fluid.component",
            inner: {
                $component: {
                    $layers: "fluid.tests.injection.innerType"
                }
            }
        }
    },
    innerValue: {
        $compute: {
            func: inner => fluid.isComponent(inner) ? inner.value : "not a component",
            args: "{original}.inner"
        }
    }
});

QUnit.test("Reference to a component member is flattened as a component argument - FLUID-7020", function (assert) {
    const that = fluid.tests.injection.flattenedArgument();
    fluid.cell.stabilize();
    assert.equal(that.innerValue, "inner", "Argument designating a subcomponent through a path arrives as the component");
    that.destroy();
});

fluid.def("fluid.tests.injection.vizLoader", {
    $layers: "fluid.component",
    value: "loader",
    // A nearer component of the same name as the one injected below, which the injection hides
    filterRoot: {
        $component: {
            $layers: "fluid.tests.injection.otherType"
        }
    },
    panel: {
        $component: {
            $layers: "fluid.component",
            outerReader: {
                $component: {
                    $layers: "fluid.component",
                    root: "{filterRoot}.value"
                }
            },
            filter: {
                $component: {
                    $layers: "fluid.component",
                    // Injection of a grandparent under a different name - an Infusion 4 idiom
                    filterRoot: "{vizLoader}",
                    reader: {
                        $component: {
                            $layers: "fluid.component",
                            root: "{filterRoot}.value",
                            loader: "{vizLoader}.value"
                        }
                    }
                }
            }
        }
    }
});

QUnit.test("Injection of an ancestor component - FLUID-7020", function (assert) {
    const that = fluid.tests.injection.vizLoader();
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];
    const filter = that.panel.filter;
    const filterShadow = filter[fluid.metadataSymbol];
    const injectedPath = fluid.composeSegment(filterShadow.path, "filterRoot");

    assert.equal(filter.filterRoot, that, "Grandparent is injected under a different name");
    assert.equal(filterShadow.childComponents.filterRoot, shadow, "Grandparent is recorded as a child of the injecting component");
    assert.equal(fluid.globalInstantiator.pathToComponent[injectedPath], shadow, "Grandparent is recorded at its injected path");
    assert.equal(filter.reader.root, "loader", "Injected name hides the more distant component of the same name");
    assert.equal(filter.reader.loader, "loader", "Grandparent still resolves by its own name");
    assert.equal(that.panel.outerReader.root, "other", "Outside the injecting component the name resolves as before");
    assert.equal(that.filterRoot.value, "other", "Grandparent's own subcomponent of the same name is undisturbed");

    let visited = 0;
    fluid.visitComponentChildren(shadow, () => ++visited, {visited: {}});
    assert.equal(visited, 6, "Visiting the tree is not trapped by the cyclic injection");

    filter.destroy();
    fluid.cell.stabilize();
    assert.notOk(fluid.isDestroyed(that), "Destroying the injecting component leaves the injected grandparent intact");
    assert.undefined(fluid.globalInstantiator.pathToComponent[injectedPath], "Injected path is withdrawn");
    assert.undefined(shadow.injectedPaths[injectedPath], "Injected path is withdrawn from the grandparent");
    assert.equal(that.panel.outerReader.root, "other", "Name resolves as before");
    that.destroy();

    const that2 = fluid.tests.injection.vizLoader();
    fluid.cell.stabilize();
    const shadow2 = that2[fluid.metadataSymbol];
    const filterShadow2 = that2.panel.filter[fluid.metadataSymbol];
    assert.equal(that2.panel.filter.filterRoot, that2, "Grandparent is injected in a fresh tree");
    that2.destroy();
    fluid.cell.stabilize();
    assert.ok(fluid.isDestroyedShadow(shadow2), "Grandparent is destroyed whilst injected into its grandchild");
    assert.ok(fluid.isDestroyedShadow(filterShadow2), "Grandchild injecting it is destroyed with it");
});

// $bindable streaming a signal - FLUID-7021

fluid.tests.bindableSource = fluid.cell(1, {name: "fluid.tests.bindableSource"});
fluid.tests.bindableLog = [];

fluid.def("fluid.tests.bindableStream", {
    $layers: "fluid.component",
    bound: {
        $bindable: {
            bind: {
                func: () => {
                    fluid.tests.bindableLog.push("bind");
                    return fluid.tests.bindableSource;
                }
            },
            unbind: {
                func: boundValue => fluid.tests.bindableLog.push("unbind " + fluid.isSignal(boundValue)),
                args: ["{boundValue}"]
            }
        }
    },
    doubled: "$compute:fluid.tests.double({self}.bound)"
});

fluid.tests.double = value => value * 2;

QUnit.test("$bindable binding a signal streams its updates to readers - FLUID-7021", function (assert) {
    fluid.tests.bindableLog.length = 0;
    const that = fluid.tests.bindableStream();
    fluid.cell.stabilize();
    assert.equal(that.bound, 1, "Reader of the bindable sees through the bound signal to its value");
    assert.equal(that.doubled, 2, "Computation over the bindable sees the bound signal's value");
    fluid.tests.bindableSource.set(2);
    fluid.cell.stabilize();
    assert.equal(that.bound, 2, "Update to the bound signal is seen by reader");
    assert.equal(that.doubled, 4, "Update to the bound signal reaches computation over the bindable");
    assert.deepEqual(fluid.tests.bindableLog, ["bind"], "Bound signal's updates do not cause rebinding");
    that.destroy();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.bindableLog, ["bind", "unbind true"], "Bound signal itself is supplied to unbind on destruction");
});

// Avatars - FLUID-7021

fluid.def("fluid.tests.avatar.marker", {
    $layers: "fluid.component",
    preferredSize: null,
    $variety: "framework"
});

fluid.def("fluid.tests.avatar.base", {
    $layers: "fluid.tests.avatar.marker",
    fromBase: "base",
    // Only resolvable where the layer is genuinely deployed
    hostValue: "{fluid.tests.avatar.missingHost}.value"
});

fluid.def("fluid.tests.avatar.derived", {
    $layers: "fluid.tests.avatar.base",
    preferredSize: {w: 100, h: 50}
});

fluid.def("fluid.tests.avatar.linked", {
    fromLinkage: true
});

fluid.def("fluid.tests.avatar.linker", {
    $layers: "fluid.component",
    linkage: {
        $linkage: {
            inputLayers: ["fluid.tests.avatar.marker"],
            outputLayers: ["fluid.tests.avatar.linked"]
        }
    }
});

QUnit.test("Avatars accumulate the material a layer brings to a component - FLUID-7021", function (assert) {
    const avatar = fluid.avatar("fluid.tests.avatar.derived");
    fluid.cell.stabilize();
    const shadow = avatar[fluid.proxySymbol].shadow;
    assert.equal(shadow.parentShadow, fluid.avatarsShadow(), "Avatar is held in the avatars area");
    assert.equal(fluid.avatarsShadow().parentShadow, fluid.globalInstantiator.rootShadow, "Avatars area is at the root of the component tree");
    assert.equal(fluid.avatar("fluid.tests.avatar.derived")[fluid.proxySymbol].shadow, shadow, "Avatar is allocated once per layer");
    assert.equal(fluid.def("fluid.tests.avatar.derived").fromBase, undefined, "Shallow inspection of the definition misses inherited material");

    const merged = fluid.avatarMerged("fluid.tests.avatar.derived");
    assert.ok(merged.$layers.includes("fluid.tests.avatar.marker"), "Avatar accumulates the layers of its parents");
    assert.equal(merged.fromBase, "base", "Avatar accumulates the members of its parents");
    assert.deepEqual({...merged.preferredSize}, {w: 100, h: 50}, "Avatar's own member overrides its parent's placeholder");
    assert.ok(fluid.isUnavailable(avatar.hostValue), "Member depending on a missing prerequisite is unavailable");
    assert.equal(avatar.fromBase, "base", "Avatar is otherwise a regular component");

    const linker = fluid.tests.avatar.linker();
    fluid.cell.stabilize();
    const linkedMerged = fluid.avatarMerged("fluid.tests.avatar.derived");
    assert.ok(linkedMerged.$layers.includes("fluid.tests.avatar.linked"), "Avatar accumulates layers broadcast by linkage");
    assert.equal(linkedMerged.fromLinkage, true, "Avatar accumulates the members of layers broadcast by linkage");
    linker.destroy();
    fluid.cell.stabilize();
    assert.notOk(fluid.avatarMerged("fluid.tests.avatar.derived").$layers.includes("fluid.tests.avatar.linked"),
        "Layer broadcast by linkage is withdrawn when the linkage is destroyed");

    const oldDef = fluid.def("fluid.tests.avatar.base");
    fluid.def("fluid.tests.avatar.base", {...oldDef, fromBase: "updated"});
    fluid.cell.stabilize();
    assert.equal(fluid.avatarMerged("fluid.tests.avatar.derived").fromBase, "updated", "Avatar tracks redefinition of its parent layers");
    fluid.def("fluid.tests.avatar.base", oldDef);
});

fluid.tests.avatar.log = [];

fluid.def("fluid.tests.avatar.computedSize", {
    $layers: "fluid.tests.avatar.marker",
    width: 30,
    preferredSize: "$compute:fluid.tests.avatar.size({self}.width)",
    // Only resolvable where the layer is genuinely deployed
    hostValue: "{fluid.tests.avatar.missingHost}.value",
    effect: "$effect:fluid.tests.avatar.logEffect({self}.width)",
    linkage: {
        $linkage: {
            inputLayers: ["fluid.tests.avatar.marker"],
            outputLayers: ["fluid.tests.avatar.linked"]
        }
    },
    bound: {
        $bindable: {
            bind: "fluid.tests.avatar.logBind({self}.width)"
        }
    }
});

fluid.tests.avatar.size = width => ({w: width, h: width * 2});
fluid.tests.avatar.logEffect = () => fluid.tests.avatar.log.push("effect");
fluid.tests.avatar.logBind = () => fluid.tests.avatar.log.push("bind");

fluid.def("fluid.tests.avatar.rootSingleton", {
    $layers: "fluid.resolveRoot",
    value: "live"
});

fluid.def("fluid.tests.avatar.rootReader", {
    $layers: "fluid.component",
    read: "{rootSingleton}.value"
});

QUnit.test("Avatars are inert, expose computed members and are destroyed with their layer - FLUID-7021", function (assert) {
    fluid.tests.avatar.log.length = 0;
    const avatar = fluid.avatar("fluid.tests.avatar.computedSize");
    fluid.cell.stabilize();
    const shadow = avatar[fluid.proxySymbol].shadow;
    assert.ok(shadow.inert, "Avatar is inert");
    assert.ok(fluid.isUnavailable(avatar.hostValue), "Member depending on a missing prerequisite is unavailable");
    assert.deepEqual({...avatar.preferredSize}, {w: 30, h: 60}, "Computed member is readable from the avatar");
    assert.equal(fluid.avatarMerged("fluid.tests.avatar.computedSize").preferredSize, "$compute:fluid.tests.avatar.size({self}.width)",
        "Merged structure holds the raw record");

    const missingAvatar = fluid.avatar("fluid.tests.avatar.missingLayer");
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(missingAvatar), "Avatar of an undefined layer is unavailable");
    assert.undefined(fluid.unavailableComponentMap.get()[missingAvatar[fluid.proxySymbol].shadow.path],
        "Unavailable avatar is not tracked as holding up the system");
    assert.ok(fluid.isUnavailable(avatar.bound), "Bindable is not bound when read");
    assert.deepEqual(fluid.tests.avatar.log, [], "Avatar allocates no effects and binds nothing");
    assert.notOk(fluid.avatarMerged("fluid.tests.avatar.derived").$layers.includes("fluid.tests.avatar.linked"),
        "Linkage held by an avatar is not registered");
    let visited = 0;
    fluid.visitComponentChildren(fluid.globalInstantiator.rootShadow, oneShadow => {
        visited += oneShadow.path.startsWith("avatars") ? 1 : 0;
    }, {visited: {}});
    assert.equal(visited, 0, "Avatars are not visited by traversals from the root");

    // An avatar allocated first would otherwise claim the name at root, since the first component registered there wins
    fluid.avatar("fluid.tests.avatar.rootSingleton");
    fluid.cell.stabilize();
    const live = fluid.tests.avatar.rootSingleton({value: "fromLive"});
    const reader = fluid.tests.avatar.rootReader();
    fluid.cell.stabilize();
    assert.equal(reader.read, "fromLive", "Avatar of a resolveRoot layer does not claim its name at root");

    fluid.deleteLayer("fluid.tests.avatar.computedSize");
    fluid.cell.stabilize();
    assert.ok(fluid.isDestroyedShadow(shadow), "Avatar destroyed when its layer is deleted");
    assert.undefined(fluid.avatarsShadow().childComponents["fluid.tests.avatar.computedSize"], "Avatar removed from the avatars area");
    reader.destroy();
    live.destroy();
});

fluid.tests.rebindLog = [];

fluid.tests.bindTarget = function (self, target) {
    fluid.tests.rebindLog.push("bind " + target.name);
    return {boundTo: target.name, instanceId: self.instanceId};
};

fluid.def("fluid.tests.rebindable", {
    $layers: "fluid.component",
    target: {name: "first"},
    other: 0,
    bound: {
        $bindable: {
            bind: "fluid.tests.bindTarget({self}, {self}.target)",
            // A bare function is accepted as an unbinder
            unbind: bound => fluid.tests.rebindLog.push("unbind " + bound.boundTo)
        }
    }
});

QUnit.test("$bindable rebinds on genuine change of its arguments only - FLUID-7021", function (assert) {
    fluid.tests.rebindLog.length = 0;
    const that = fluid.tests.rebindable();
    fluid.cell.stabilize();
    assert.equal(that.bound.boundTo, "first", "Value bound");
    const instanceId = that.instanceId;
    that.other = 1;
    fluid.cell.stabilize();
    assert.notEqual(that.instanceId, instanceId, "Component has turned over through a write to its live layer");
    assert.deepEqual(fluid.tests.rebindLog, ["bind first"], "Turnover of a component supplied as an argument does not rebind");
    that.target = {name: "second"};
    fluid.cell.stabilize();
    assert.equal(that.bound.boundTo, "second", "Value rebound on genuine change of argument");
    assert.deepEqual(fluid.tests.rebindLog, ["bind first", "unbind first", "bind second"], "Old value unbound before new value bound");
    that.destroy();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.rebindLog, ["bind first", "unbind first", "bind second", "unbind second"], "Value unbound on destruction");
});

fluid.def("fluid.tests.onceOnlyBindable", {
    $layers: "fluid.tests.rebindable",
    bound: {
        $bindable: {
            onceOnly: true
        }
    }
});

QUnit.test("$bindable marked onceOnly is bound exactly once during its lifetime - FLUID-7021", function (assert) {
    fluid.tests.rebindLog.length = 0;
    const that = fluid.tests.onceOnlyBindable();
    fluid.cell.stabilize();
    assert.equal(that.bound.boundTo, "first", "Value bound");
    const productAt = () => that[fluid.metadataSymbol].shadowMap.bound[fluid.metadataSymbol].signalProduct;
    const product = productAt();
    // The first write raises target into the live layer, remerging the component - the bindable's record, merged from
    // two layers, is then a fresh object merged from the same material, and its signal product must be carried over
    that.target = {name: "second"};
    fluid.cell.stabilize();
    assert.equal(productAt(), product, "Signal product of a record merged from several layers is carried over a remerge");
    that.target = fluid.unavailable("Transiently unavailable", "pending");
    fluid.cell.stabilize();
    that.target = {name: "third"};
    fluid.cell.stabilize();
    assert.equal(that.bound.boundTo, "first", "Value bound once only survives change and transient unavailability of its arguments");
    assert.deepEqual(fluid.tests.rebindLog, ["bind first"], "Never rebound");
    that.destroy();
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.rebindLog, ["bind first", "unbind first"], "Unbound once on destruction");
});

fluid.def("fluid.tests.availability.waiting", {
    $layers: ["fluid.component", "fluid.tests.availability.lateLayer"]
});

QUnit.test("Unavailable components are tracked until available or destroyed - FLUID-7021", function (assert) {
    const that = fluid.tests.availability.waiting();
    const path = that[fluid.proxySymbol].shadow.path;
    fluid.cell.stabilize();
    assert.ok(fluid.unavailableComponentMap.get()[path], "Component awaiting a layer is tracked as unavailable");
    const unavailable = fluid.unavailableComponents.get();
    assert.ok(fluid.isUnavailable(unavailable), "System reports some components unavailable");
    assert.equal(unavailable.variety, "pending", "Unavailability is pending rather than an error");
    fluid.def("fluid.tests.availability.lateLayer", {value: 1});
    fluid.cell.stabilize();
    assert.undefined(fluid.unavailableComponentMap.get()[path], "Component no longer tracked once its layer arrives");

    const other = fluid.tests.availability.waiting({$layers: "fluid.tests.availability.neverLayer"});
    const otherPath = other[fluid.proxySymbol].shadow.path;
    fluid.cell.stabilize();
    assert.ok(fluid.unavailableComponentMap.get()[otherPath], "Second component awaiting a layer is tracked");
    // An unavailable component's proxy exposes no members, including its destroy method
    fluid.destroyComponent(other);
    fluid.cell.stabilize();
    assert.undefined(fluid.unavailableComponentMap.get()[otherPath], "Destroyed component is no longer tracked");
    that.destroy();
});

fluid.def("fluid.tests.selfReference.inner", {
    $layers: "fluid.component",
    seed: 1,
    bounds: "$compute:fluid.identity({self}.seed)",
    doubled: "$compute:fluid.tests.selfReference.double({self}.bounds)"
});

fluid.tests.selfReference.double = x => 2 * x;

fluid.def("fluid.tests.selfReference.outer", {
    $layers: "fluid.component",
    bounds: 5,
    inner: {
        $component: {
            $layers: "fluid.tests.selfReference.inner",
            // A mistake made by the AI, intending {outer}.bounds
            bounds: "{self}.bounds"
        }
    },
    // A reference to a value including its own site
    whole: {
        part: "{self}.whole"
    }
});

QUnit.test("Reference designating its own value is unavailable rather than cycling", function (assert) {
    const that = fluid.tests.selfReference.outer();
    fluid.cell.stabilize();
    const bounds = fluid.deSignal(that.inner.bounds);
    assert.ok(fluid.isUnavailable(bounds), "Self-reference is unavailable");
    assert.ok(fluid.unavailableToCauses(fluid.unProxy(bounds))[0].message.includes("Reference {self}.bounds at path bounds refers to its own value"),
        "Self-reference described");
    assert.ok(fluid.isUnavailable(fluid.deSignal(that.inner.doubled)), "Unavailability propagates to dependents");
    assert.ok(fluid.isUnavailable(fluid.deSignal(that.whole.part)), "Reference to a value including its own site is unavailable");
    assert.equal(fluid.deSignal(that.bounds), 5, "Outer member unaffected");
    assert.ok(fluid.segsOverlap(["a", "b"], ["a"]) && fluid.segsOverlap(["a"], ["a", "b"]) && !fluid.segsOverlap(["a", "b"], ["a", "c"]),
        "Overlapping paths detected");
    that.destroy();
});

fluid.def("fluid.tests.missingMember", {
    $layers: "fluid.component",
    count: 3,
    plain: "$compute:fluid.identity({self}.absent.deep)",
    inner: {
        $component: {
            $layers: "fluid.component",
            // Written as {self}, which designates the subcomponent, intending its parent
            doubled: "$compute:fluid.tests.selfReference.double({self}.count)"
        }
    }
});

QUnit.test("Value computed from a reference to a missing member is explained", function (assert) {
    const that = fluid.tests.missingMember();
    fluid.cell.stabilize();
    const plainCell = fluid.getForComponent(that[fluid.metadataSymbol], "plain");
    const plain = fluid.deSignal(plainCell);
    assert.ok(fluid.isUnavailable(plain), "Value computed from missing member is unavailable");
    const causes = fluid.cell.explainUnavailable(plainCell);
    assert.equal(causes.length, 1, "One cause found for value computed from missing member");
    assert.ok(causes[0].message.startsWith("Component at path " + that[fluid.metadataSymbol].path + " has no member absent"),
        "Missing member described");
    assert.notOk(causes[0].message.includes("parent"), "No hint about the parent, which has no such member either");
    assert.deepEqual(fluid.cell.explainUnavailable(fluid.getForComponent(that[fluid.metadataSymbol], "count")), [],
        "Available value needs no explanation");

    const innerShadow = that.inner[fluid.metadataSymbol];
    // As documented, the explanation reads the graph as it stands, so the value must have been read
    const doubledCell = fluid.getForComponent(innerShadow, "doubled");
    assert.ok(fluid.isUnavailable(fluid.deSignal(doubledCell)), "Value computed from member held by parent is unavailable");
    const doubledCauses = fluid.cell.explainUnavailable(doubledCell);
    assert.equal(doubledCauses.length, 1, "One cause found for value computed from member held by parent");
    assert.ok(doubledCauses[0].message.endsWith("has no member count, although its parent component at path "
        + that[fluid.metadataSymbol].path + " does"), "Parent's member noted");
    assert.equal(doubledCauses[0].hint, fluid.parentMemberHintText, "Hint explains the meaning of {self}");
    that.destroy();
});

fluid.def("fluid.tests.keyedFor", {
    $layers: "fluid.component",
    assets: {
        bootstrap: {href: "b.css"},
        main: {href: "m.css"},
        katex: {priority: 10, href: "k.css"},
        late: {priority: "last", href: "l.css"},
        print: {priority: "after:main", href: "p.css"}
    },
    tags: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{keyedFor}.assets",
                valueAs: "asset",
                keyAs: "key"
            }
        }
    }
});

fluid.def("fluid.tests.keyedForAdapted", {
    $layers: "fluid.tests.keyedFor",
    assets: {
        early: {priority: "before:bootstrap", href: "e.css"},
        main: null
    }
});

QUnit.test("$for over a keyed collection honours priorities and skips removed entries", function (assert) {
    const that = fluid.tests.keyedFor();
    fluid.cell.stabilize();
    assert.deepEqual(that.tags.list.map(member => member.key), ["katex", "bootstrap", "main", "print", "late"],
        "Entries ordered by numeric, relative and extremal priorities, otherwise by key order");
    assert.deepEqual(that.tags.list.map(member => member.asset.href), ["k.css", "b.css", "m.css", "p.css", "l.css"],
        "Iteration variables follow their entries");
    that.destroy();

    const adapted = fluid.tests.keyedForAdapted();
    fluid.cell.stabilize();
    // print's target has been removed, and so it keeps its place amongst the entries with constraints
    assert.deepEqual(adapted.tags.list.map(member => member.key), ["katex", "early", "bootstrap", "late", "print"],
        "Entry contributed by a stronger layer placed by constraint, and entry removed by null skipped");
    adapted.destroy();
});

fluid.def("fluid.tests.positionedFor", {
    $layers: "fluid.component",
    items: ["a", "b", "c"],
    assets: {
        main: {href: "m.css"},
        katex: {priority: "first", href: "k.css"},
        print: {href: "p.css"}
    },
    arrayMembers: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{positionedFor}.items",
                valueAs: "item",
                positionAs: "position"
            }
        }
    },
    keyedMembers: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{positionedFor}.assets",
                keyAs: "key",
                positionAs: "position"
            }
        }
    }
});

QUnit.test("$for positionAs gives position of member regardless of keying", function (assert) {
    const that = fluid.tests.positionedFor();
    fluid.cell.stabilize();
    assert.deepEqual(that.arrayMembers.list.map(member => member.position), [
        {index: 0, first: true, last: false},
        {index: 1, first: false, last: false},
        {index: 2, first: false, last: true}
    ], "Positions of members over an array");
    assert.deepEqual(that.keyedMembers.list.map(member => [member.key, member.position]), [
        ["katex", {index: 0, first: true, last: false}],
        ["main", {index: 1, first: false, last: false}],
        ["print", {index: 2, first: false, last: true}]
    ], "Positions of members over a keyed collection follow its ordering rather than its keys");

    that.items = ["a", "b", "c", "d"];
    fluid.cell.stabilize();
    assert.deepEqual(that.arrayMembers.list.map(member => member.position.last), [false, false, false, true],
        "Former last member is no longer last once the collection grows");
    that.items = ["a"];
    fluid.cell.stabilize();
    assert.deepEqual(that.arrayMembers.list.map(member => member.position), [{index: 0, first: true, last: true}],
        "Sole member is both first and last");
    that.destroy();
});

fluid.def("fluid.tests.removable", {
    $layers: ["fluid.component", "{self}.extraLayers"],
    extraLayers: [],
    header: {
        $component: {
            $layers: "fluid.component",
            label: "header",
            colour: "red"
        }
    },
    footer: {
        $component: {
            $layers: "fluid.component",
            label: "footer"
        }
    },
    headerLabel: "{self}.header.label"
});

fluid.def("fluid.tests.removeHeader", {
    header: null
});

fluid.def("fluid.tests.removeFooter", {
    footer: {
        $component: null
    }
});

fluid.def("fluid.tests.restoreHeader", {
    header: {
        $component: {
            $layers: "fluid.component",
            label: "restored"
        }
    }
});

QUnit.test("Removing a subcomponent with null", function (assert) {
    const that = fluid.tests.removable();
    fluid.cell.stabilize();
    assert.equal(that.header.label, "header", "Subcomponent is present without removal");
    const headerShadow = that.header[fluid.metadataSymbol];

    that.extraLayers = ["fluid.tests.removeHeader", "fluid.tests.removeFooter"];
    fluid.cell.stabilize();
    assert.notOk(fluid.isUnavailable(that), "Parent remains available when subcomponents are removed");
    assert.equal(that.header, null, "Subcomponent removed by null");
    assert.equal(that.footer, null, "Subcomponent removed by {$component: null}");
    assert.ok(fluid.isDestroyedShadow(headerShadow), "Removed subcomponent destroyed");
    assert.notOk(that[fluid.metadataSymbol].childComponents.header, "Removed subcomponent no longer a child");

    // As for FLUID-5743, later layers are stronger
    that.extraLayers = ["fluid.tests.removeHeader", "fluid.tests.restoreHeader"];
    fluid.cell.stabilize();
    assert.equal(that.header.label, "restored", "Stronger contribution brings subcomponent back");
    assert.equal(that.header.colour, undefined, "Only contributions stronger than the removal apply");
    assert.equal(that.footer.label, "footer", "Subcomponent comes back when layer holding null is withdrawn");

    that.extraLayers = [];
    fluid.cell.stabilize();
    assert.equal(that.header.label, "header", "Original subcomponent comes back when all layers withdrawn");
    assert.equal(that.headerLabel, "header", "Reference into restored subcomponent resolves");
    that.destroy();
});

fluid.def("fluid.tests.typeLookup", {
    $layers: ["fluid.component", "{self}.typeLayers"],
    type: "post",
    candidates: "$compute:fluid.tests.typeLookup.candidates({self}.type)",
    typeLayers: "$compute:fluid.firstDefinedLayer({self}.candidates)"
});

fluid.tests.typeLookup.candidates = type => ["fluid.tests.lookupType." + type, "fluid.tests.lookupType.default"];

fluid.def("fluid.tests.lookupType.default", {
    label: "default"
});

QUnit.test("Dynamic layers chosen from those which are defined", function (assert) {
    assert.deepEqual(fluid.definedLayers("fluid.component", ["fluid.tests.lookupType.nonexistent", "fluid.tests.lookupType.default"]),
        ["fluid.component", "fluid.tests.lookupType.default"], "Undefined layer filtered from candidates");
    const that = fluid.tests.typeLookup();
    fluid.cell.stabilize();
    assert.equal(that.label, "default", "Fallback layer applied when preferred layer is not defined");
    assert.notOk(fluid.isUnavailable(that), "Component is available");

    fluid.def("fluid.tests.lookupType.post", {
        label: "post"
    });
    fluid.cell.stabilize();
    assert.equal(that.label, "post", "Preferred layer applied once it is defined");

    that.type = "other";
    fluid.cell.stabilize();
    assert.equal(that.label, "default", "Fallback layer applied when type changes");

    that.type = "post";
    fluid.cell.stabilize();
    fluid.deleteLayer("fluid.tests.lookupType.post");
    fluid.cell.stabilize();
    assert.equal(that.label, "default", "Fallback layer applied once preferred layer is deleted");
    that.destroy();
});

fluid.def("fluid.tests.linkTarget", {
    $layers: "fluid.component",
    adapted: false
});

fluid.def("fluid.tests.linkTarget.adapted", {
    adapted: true
});

fluid.def("fluid.tests.conditionalLinkageHost", {
    $layers: "fluid.component",
    enabled: false,
    holderLinkage: {
        $linkage: [{
            $if: "{self}.enabled",
            inputLayers: "fluid.tests.linkTarget",
            outputLayers: "fluid.tests.linkTarget.adapted"
        }]
    }
});

QUnit.test("$if on an entry of a $linkage record", function (assert) {
    const host = fluid.tests.conditionalLinkageHost();
    const target = fluid.tests.linkTarget();
    fluid.cell.stabilize();
    assert.equal(target.adapted, false, "Linkage whose condition is false is not applied");
    host.enabled = true;
    fluid.cell.stabilize();
    assert.equal(target.adapted, true, "Linkage applied once its condition holds");
    host.enabled = false;
    fluid.cell.stabilize();
    assert.equal(target.adapted, false, "Linkage withdrawn once its condition fails");
    host.enabled = true;
    fluid.cell.stabilize();
    host.destroy();
    fluid.cell.stabilize();
    assert.equal(target.adapted, false, "Linkage withdrawn on destruction of its holder");
    target.destroy();
});

fluid.def("fluid.tests.linkType.page", {});
fluid.def("fluid.tests.linkType.post", {});

fluid.def("fluid.tests.linkHeader", {
    $layers: "fluid.component",
    kind: "plain"
});

fluid.def("fluid.tests.linkHeader.post", {
    kind: "post"
});

fluid.def("fluid.tests.linkDoc", {
    $layers: ["fluid.component", "{self}.typeLayer"],
    typeLayer: "fluid.tests.linkType.page",
    header: {
        $component: {
            $layers: "fluid.tests.linkHeader"
        }
    },
    inner: {
        $component: {
            $layers: "fluid.component",
            header: {
                $component: {
                    $layers: "fluid.tests.linkHeader"
                }
            }
        }
    }
});

fluid.def("fluid.tests.linkSite", {
    $layers: "fluid.component",
    docA: {
        $component: {
            $layers: "fluid.tests.linkDoc"
        }
    },
    docB: {
        $component: {
            $layers: "fluid.tests.linkDoc",
            typeLayer: "fluid.tests.linkType.post"
        }
    }
});

fluid.def("fluid.tests.linkSiteWithLinkage", {
    $layers: "fluid.tests.linkSite",
    headerLinkage: {
        $linkage: [{
            selector: "fluid.tests.linkType.post > fluid.tests.linkHeader",
            outputLayers: "fluid.tests.linkHeader.post",
            scope: "{self}"
        }]
    }
});

QUnit.test("Linkage by ancestor selector, confined to a scope", function (assert) {
    const site = fluid.tests.linkSiteWithLinkage();
    const other = fluid.tests.linkSite();
    fluid.cell.stabilize();
    assert.equal(site.docA.header.kind, "plain", "Header within page document not adapted");
    assert.equal(site.docB.header.kind, "post", "Header which is child of post document adapted");
    assert.equal(site.docB.inner.header.kind, "plain", "Header which is not a direct child of post document not adapted");
    assert.equal(other.docB.header.kind, "plain", "Header of post document outside linkage's scope not adapted");

    site.docA.typeLayer = "fluid.tests.linkType.post";
    fluid.cell.stabilize();
    assert.equal(site.docA.header.kind, "post", "Header adapted once its parent acquires the layer matched by the selector");
    site.docA.typeLayer = "fluid.tests.linkType.page";
    fluid.cell.stabilize();
    assert.equal(site.docA.header.kind, "plain", "Adaptation withdrawn once its parent loses the layer");

    site.destroy();
    fluid.cell.stabilize();
    assert.equal(other.docB.header.kind, "plain", "Header outside scope unaffected by destruction of linkage");
    other.destroy();
});

fluid.def("fluid.tests.precedence.base", {
    $layers: "fluid.component",
    kind: "base"
});

fluid.def("fluid.tests.precedence.post", {
    kind: "post"
});

fluid.def("fluid.tests.precedence.doc", {
    $layers: "fluid.component",
    header: {
        $component: {
            $layers: "fluid.tests.precedence.base"
        }
    }
});

fluid.def("fluid.tests.precedence.type", {
    header: {
        $component: {
            $layers: ["fluid.tests.precedence.base", "fluid.tests.precedence.post"]
        }
    }
});

fluid.def("fluid.tests.precedence.typedDoc", {
    $layers: ["fluid.tests.precedence.doc", "fluid.tests.precedence.type"]
});

QUnit.test("Layers named by a stronger subcomponent record are stronger, in the order it lists them", function (assert) {
    const that = fluid.tests.precedence.typedDoc();
    fluid.cell.stabilize();
    assert.equal(that.header.kind, "post", "Layer listed last by the stronger record wins");
    assert.deepEqual(that.header.$layers, ["fluid.component", "fluid.tests.precedence.base", "fluid.tests.precedence.post"],
        "Layers ordered weakest first");
    that.destroy();
});
