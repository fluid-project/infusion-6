/* eslint-env node */
"use strict";

// Test of multi-document rendering on the server: one component tree renders a page per record into an output
// document of its own, into which the Single File Components of its layers are injected - their styles, and their
// scripts as inert records - and all the documents are written once the reactive graph has settled, skipping those
// whose files are already up to date.

const fs = require("fs"),
    os = require("os"),
    path = require("path"),
    {pathToFileURL} = require("url");

const fluid = require("../../..");

const moduleBaseDir = path.resolve(__dirname, "../../..");
const testDataDir = path.join(moduleBaseDir, "tests/framework-tests/core/testData");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-output-documents-test-"));

const failures = [];
const expect = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

fluid.setGlobalValue("fluid.tests.sfc.executions", 0);
fluid.setGlobalValue("fluid.tests.outPath", name => path.join(outDir, name, "index.html"));

fluid.def("fluid.tests.outPage", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.templateViewComponent", "fluid.outputDocumentView"],
            documentLocation: "$compute:fluid.tests.outPath({outPage}.page.name)",
            template: `<html><head><title>@{page.title}</title></head><body><div @id="widget"></div></body></html>`
        }
    },
    widget: {
        $component: {
            $layers: "fluid.tests.sfc.component",
            text: "{outPage}.page.name"
        }
    }
});

fluid.def("fluid.tests.outSite", {
    $layers: "fluid.component",
    pages: {
        $reactiveRoot: [{name: "one", title: "One"}, {name: "two", title: "Two"}]
    },
    documents: {
        $component: {
            $layers: "fluid.tests.outPage",
            $for: {
                source: "{outSite}.pages",
                valueAs: "page"
            }
        }
    }
});

fluid.def("fluid.tests.plainPage", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.templateViewComponent", "fluid.outputDocumentView"],
            documentLocation: "$compute:fluid.tests.outPath({plainPage}.page.name)",
            baseURL: "{plainSite}.baseURL",
            template: `<html lang="en"><head><title>@{page.title}</title></head><body class="@{page.kind}"><h1>@{page.title}</h1></body></html>`
        }
    }
});

fluid.def("fluid.tests.plainSite", {
    $layers: "fluid.component",
    baseURL: "",
    pages: {
        $reactiveRoot: [{name: "a", title: "A", kind: "post"}, {name: "b", title: "B", kind: "page"}]
    },
    documents: {
        $component: {
            $layers: "fluid.tests.plainPage",
            $for: {
                source: "{plainSite}.pages",
                valueAs: "page"
            }
        }
    }
});

/**
 * Check that one component tree renders a document of its own per page, which is rerendered, created and released
 * as the pages change - without writing any of them
 */
const checkPlainSite = function () {
    // The site is published from the output directory, whose pages record the relative URL of its root
    const site = fluid.initFreeComponent("fluid.tests.plainSite", {baseURL: pathToFileURL(outDir).href});
    fluid.cell.stabilize();
    const records = fluid.outputDocuments.get();
    expect(records.map(record => record.location).join() === [fluid.tests.outPath("a"), fluid.tests.outPath("b")].join(),
        "An output document created for each page");
    const [docA, docB] = records.map(record => record.dokkument);
    expect(fluid.isOutputDocument(docA) && docA !== docB, "Pages render into output documents of their own");
    expect(docA.documentElement.getAttribute("lang") === "en", "Root of template rendered onto document element");
    expect(docA.querySelector("title")?.textContent === "A", "Head rendered");
    expect(docA.body.className === "post" && docA.querySelector("h1")?.textContent === "A", "Body rendered");
    expect(docB.querySelector("h1")?.textContent === "B", "Second page rendered into its own document");
    expect(records[0].url.href === pathToFileURL(fluid.tests.outPath("a")).href, "Location resolved to a URL");
    expect(fluid.documentLocation(docA) === records[0].url, "Location of output document is that with which it was created");
    expect(docA.documentElement.getAttribute(fluid.siteRootAttribute) === "../", "Page records the relative URL of the site's root");

    const h1B = docB.querySelector("h1");
    site.pages = [{...site.pages[0], title: "A2"}, site.pages[1]];
    fluid.cell.stabilize();
    expect(docA.querySelector("h1").textContent === "A2", "Edit to a page rerenders its document");
    expect(docB.querySelector("h1") === h1B, "Other document undisturbed");
    expect(docA.documentElement.getAttribute(fluid.siteRootAttribute) === "../" && docA.documentElement.getAttribute("lang") === "en",
        "Record of the site's root survives rerendering of the template's root onto the document element");
    expect(fluid.outputDocuments.get().length === 2, "No further documents created");

    site.pages = [site.pages[0]];
    fluid.cell.stabilize();
    expect(fluid.outputDocuments.get().map(record => record.location).join() === fluid.tests.outPath("a"),
        "Document of removed page released");
    site.destroy();
    fluid.cell.stabilize();
    expect(fluid.outputDocuments.get().length === 0, "All documents released on destruction of the tree");

    const roots = ["https://example.org/blog/post/x/", "https://example.org/blog/404.html", "https://example.org/blog/",
        "https://example.org/other/"].map(location => {
        const dokkument = fluid.createOutputDocument(location, "https://example.org/blog");
        fluid.releaseOutputDocument(dokkument);
        return dokkument.documentElement.getAttribute(fluid.siteRootAttribute);
    });
    expect(JSON.stringify(roots) === JSON.stringify(["../../", "./", "./", null]),
        "Relative URL of the site's root recorded in pages of the site, and only those: " + JSON.stringify(roots));
    const unsited = fluid.createOutputDocument("https://example.org/blog/post/x/");
    fluid.releaseOutputDocument(unsited);
    expect(!unsited.documentElement.hasAttribute(fluid.siteRootAttribute), "Nothing recorded for a document of no site");
};

const run = async function () {
    // A host document declaring the SFC, which renders nothing itself
    const host = fluid.serverDocumentParser(`<!DOCTYPE html><html><head>
        <fluid-module id="testData" src="./"></fluid-module>
        <fluid-import src="%testData/fluid-tests-sfc-component.vue"></fluid-import>
    </head><body></body></html>`);
    host.location = pathToFileURL(path.join(testDataDir, "host.html"));
    fluid.bootDocument(host);

    const site = fluid.initFreeComponent("fluid.tests.outSite");
    const outcome = await fluid.writeOutputDocumentsWhenSettled();
    expect(outcome.written.length === 2 && outcome.unready.length === 0, "Both documents written on first build: " +
        JSON.stringify({written: outcome.written.length, unready: outcome.unready.map(record => record.readiness)}));
    const read = name => fs.readFileSync(path.join(outDir, name, "index.html"), "utf8");
    const checkPage = function (name, title) {
        const dokkument = fluid.serverDocumentParser(read(name));
        expect(dokkument.querySelector("title")?.textContent === title, `Page ${name} renders its title`);
        expect(dokkument.querySelector(".sfc-text")?.textContent === name, `Page ${name} renders its SFC widget`);
        expect(dokkument.head.querySelector("style[id=\"fl-style-fluid.tests.sfc.component-0\"]"), `Page ${name} holds the SFC's style`);
        const script = dokkument.head.querySelector("script[id=\"fl-script-fluid.tests.sfc.component-0\"]");
        expect(script?.getAttribute("type") === fluid.inertScriptType && script.textContent.includes("fluid.def(\"fluid.tests.sfc.component\""),
            `Page ${name} holds an inert record of the SFC's script`);
    };
    checkPage("one", "One");
    checkPage("two", "Two");
    expect(fluid.tests.sfc.executions === 1, "SFC's script executed once only, in the host document: " + fluid.tests.sfc.executions);

    const outcome2 = await fluid.writeOutputDocumentsWhenSettled();
    expect(outcome2.written.length === 0 && outcome2.unchanged.length === 2, "Rebuild without changes writes nothing");

    site.pages = [site.pages[0], {...site.pages[1], title: "Two revised"}];
    const outcome3 = await fluid.writeOutputDocumentsWhenSettled();
    expect(outcome3.written.length === 1 && outcome3.written[0].location === fluid.tests.outPath("two"),
        "Rebuild after an edit writes only the document which changed");
    checkPage("two", "Two revised");
    checkPage("one", "One");
    site.destroy();
    fluid.cell.stabilize();

    checkPlainSite();

    const scripts = fluid.serverDocumentParser(`<html><head>
        <script fluid-client>fluid.tests.clientRan = true;</script>
        <script type="${fluid.inertScriptType}">fluid.tests.inertRan = true;</script>
        <script>fluid.tests.pageRan = true;</script>
    </head></html>`);
    scripts.querySelectorAll("script").forEach(node => fluid.loadScriptNodeInDocument(node, scripts));
    expect(!fluid.tests.clientRan && !fluid.tests.inertRan && fluid.tests.pageRan,
        "Client payload and inert records not evaluated on the server, unlike other page scripts");
};

run().then(() => {
    fs.rmSync(outDir, {recursive: true, force: true});
    if (failures.length === 0) {
        console.log("output-documents-test PASS");
    } else {
        console.log("output-documents-test FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
}, error => {
    console.log("output-documents-test FAIL: ", error);
    process.exitCode = 1;
});
