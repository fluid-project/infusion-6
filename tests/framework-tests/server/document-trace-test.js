/* eslint-env node */
"use strict";

// Test of the traces of output documents - fluid.traceOutputDocuments, over fluid.cell.recordUpdates and
// fluid.cell.upstream. Each page of a site renders its own title and a navigation list of every page's name. The trace
// of each page must hold what it read and no more - its own page, every page's name, and the layers it used, but not
// another page's title - so that a change to one page's title leaves the inputs of every other page unchanged, as a
// verifying trace in the sense of Mokhov et al.'s "Build Systems a la Carte" (section 4.2.2) requires.

const fs = require("fs"),
    os = require("os"),
    path = require("path");

const fluid = require("../../..");

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-document-trace-test-"));

const failures = [];
const expect = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

fluid.setGlobalValue("fluid.tests.tracePath", name => path.join(outDir, name, "index.html"));

fluid.def("fluid.tests.tracePage", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.templateViewComponent", "fluid.outputDocumentView"],
            documentLocation: "$compute:fluid.tests.tracePath({tracePage}.page.name)",
            template: `<html><head><title>@{page.title}</title></head><body><h1>@{page.title}</h1><ul @id="nav"></ul><p>@{{traceSite}.count} pages</p></body></html>`
        }
    },
    nav: {
        $component: {
            $layers: "fluid.tests.traceNavItem",
            $for: {
                source: "{traceSite}.pages",
                valueAs: "item"
            }
        }
    }
});

fluid.def("fluid.tests.traceNavItem", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<li>@{item.name}</li>`
        }
    }
});

fluid.def("fluid.tests.traceSite", {
    $layers: "fluid.component",
    // A computation shared by every page, reading the whole of the pages
    count: "$compute:fluid.tests.traceCount({self}.pages)",
    pages: {
        $reactiveRoot: [{name: "one", title: "One"}, {name: "two", title: "Two"}]
    },
    documents: {
        $component: {
            $layers: "fluid.tests.tracePage",
            $for: {
                source: "{traceSite}.pages",
                valueAs: "page"
            }
        }
    }
});

fluid.tests.traceCount = pages => pages.length;

/**
 * Render the key of a trace input, without its value
 * @param {TraceInput} input - The input
 * @return {String} Its key, as the trace forms it but without the site's component, e.g. "model pages.1.name" or
 * "layer fluid.tests.tracePage"
 */
const keyOf = input => input.key.replace(/^(model|computed) traceSite\./, "$1 ");

/**
 * Index the inputs of each page's trace by key, holding the value of each model input
 * @param {DocumentTrace[]} traces - The traces
 * @return {Object<String, Object<String, any>>} For each page's location, its inputs' values keyed by `keyOf`
 */
const indexTraces = traces => Object.fromEntries(traces.map(trace => [path.basename(path.dirname(trace.location)),
    Object.fromEntries(trace.inputs.map(input => [keyOf(input), JSON.stringify(input.value)]))]));

/**
 * Build the site from a model, as one run of a build would, and form the traces of its documents
 * @param {Object[]} pages - The model of the site's pages
 * @return {Promise<Object>} The traces indexed as by `indexTraces`, the traces themselves as `traces`, and `site`
 */
const buildAndTrace = async function (pages) {
    const recorder = fluid.cell.recordUpdates();
    const site = fluid.initFreeComponent("fluid.tests.traceSite", {pages: {$reactiveRoot: pages}});
    await fluid.writeOutputDocumentsWhenSettled();
    recorder.stop();
    const traces = fluid.traceOutputDocuments(recorder, fluid.outputDocuments.get());
    return {indexed: indexTraces(traces), traces, site};
};

const main = async function () {
    const first = await buildAndTrace([{name: "one", title: "One"}, {name: "two", title: "Two"}]);
    const traces = first.traces;
    expect(traces.length === 2, "A trace for each of the two documents, found " + traces.length);
    traces.forEach(trace => expect(trace.effects > 0, "Effects rendering into " + trace.location + " are found"));
    const before = first.indexed;
    const one = before.one || {};
    const keys = Object.keys(one).sort();
    expect(keys.some(key => /^model pages\.0(\.|$)/.test(key)), "Page one read its own page: " + keys.join(", "));
    expect(keys.includes("model pages.1.name"), "Page one read the name of page two, for its navigation: " + keys.join(", "));
    expect(!keys.includes("model pages.1.title") && !keys.includes("model pages.1"),
        "Page one did not read the title of page two, nor the whole of it: " + keys.join(", "));
    ["fluid.tests.tracePage", "fluid.tests.traceNavItem", "fluid.templateViewComponent"].forEach(layerName =>
        expect(keys.includes("layer " + layerName), "Page one's trace holds the layer " + layerName + ": " + keys.join(", ")));
    // The site's own layer defines the list of documents, and so is an input of each
    expect(keys.includes("layer fluid.tests.traceSite"), "Page one's trace holds the site's layer, which lists it: " + keys.join(", "));
    expect(one["model pages (keys)"] === JSON.stringify(["0", "1"]), "The list of pages is read for its keys alone: " + one["model pages (keys)"]);
    expect(one["model pages"] === undefined, "The whole of the pages is not read: " + one["model pages"]);
    expect(one["computed count"] === "2", "The count shared by the pages is an input of page one, by its value: " + one["computed count"]);
    expect(Object.values(traces[0].inputs).every(input => !/^model traceSite\.pages\.1$/.test(input.key)),
        "Page one does not read page two whole on account of the shared count, which read it");
    expect(traces[0].inputs.every(input => input.key === input.key.replace(/traceSite-\d+/, "")), "Keys hold no instance numbers");
    first.site.destroy();
    await fluid.cell.settle();

    // The next build, of a model in which page two's title has changed - page one's inputs are unchanged, so that it
    // need not be rendered again, and page two's are not
    const second = await buildAndTrace([{name: "one", title: "One"}, {name: "two", title: "Deux"}]);
    const after = second.indexed;
    const changedOf = name => Object.keys({...before[name], ...after[name]}).filter(key => before[name][key] !== after[name][key]);
    expect(changedOf("one").length === 0, "Page one's inputs are unchanged by a change to page two's title - changed: " +
        changedOf("one").map(key => key + " " + before.one[key] + " -> " + after.one[key]).join(", "));
    expect(changedOf("two").length > 0 && changedOf("two").every(key => /^model pages\.1(\.title)?$/.test(key)),
        "Page two's inputs are changed by a change to its title, and only those holding it - changed: " + changedOf("two").join(", "));
    expect(fs.readFileSync(path.join(outDir, "two", "index.html"), "utf8").includes("Deux"), "Page two was rendered afresh");
    second.site.destroy();
};

main().then(() => {
    if (failures.length === 0) {
        console.log("document-trace-test PASS");
    } else {
        console.log("document-trace-test FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
}, error => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => fs.rmSync(outDir, {recursive: true, force: true}));
