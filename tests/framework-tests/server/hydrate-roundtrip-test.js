/* eslint-env node */
"use strict";

// Test that a page with nested Single File Components and placeholder data renders identically whether booted in the
// browser from its minimal, dehydrated form, or from the form written for it by hydrate.js. The page is
// roundtrip/index.html, whose root SFC imports others from a subdirectory, which import a further one in turn. They
// share a script referred to by different relative paths, inject a stylesheet and a symbol, and load a script for the
// browser alone which marks a container with a class of its own. Its data is fetched by a reader bearing
// fluid.withPlaceholder from a URL which the root layer names, by default, as that of a placeholder it declares - see
// FLUID-7032. The pages index.html and body-boot.html are runnable applications, which override the URL with that of
// their real data, and so are hydrated from it, whilst placeholder.html is a test fixture using the layer as it is, and
// so is hydrated, as it is rendered in the browser, from the placeholder.

const childProcess = require("child_process"),
    fs = require("fs"),
    os = require("os"),
    path = require("path"),
    linkedom = require("linkedom");

const fluidHydrationRoundTrip = require("../../test-core/browser/js/hydration-roundtrip.js");

const repoRoot = path.resolve(__dirname, "../../..");

const failures = [];
const expectAll = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

// The records of each page, the class by which its root shows what it is rendered from, and whether hydrate.js is to
// report a placeholder
const pageSpecs = {
    "index.html": {items: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"], sourceClass: "rt-real", placeholder: false},
    "body-boot.html": {items: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"], sourceClass: "rt-real", placeholder: false},
    "placeholder.html": {items: ["Placeholder"], sourceClass: "rt-placeholder", placeholder: true},
    // Imports a Single File Component with no template of its own, which alone imports the root SFC
    "derived.html": {items: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"], sourceClass: "rt-real", placeholder: false,
        importSrc: "sfc/fluid-tests-rt-derived.vue"}
};

// The page is ready once its records are rendered from what it is configured with
const readyFor = spec => `document.querySelectorAll(".rt-item").length === ${spec.items.length}
    && !!document.querySelector(".rt-app.${spec.sourceClass}") && !!document.querySelector(".rt-widget-live")`;

const snapshot = `(() => ({
    components: [...document.querySelectorAll("[fluid-layers]")].map(fluidCanonicalMarkup),
    injections: fluidInjectionKeys(),
    symbols: [...document.querySelectorAll("#fl-symbols-host symbol")].map(node => node.id),
    sharedRuns: fluid.tests.rt.sharedRuns,
    widgetRuns: window.fluidTestsRtWidgetRuns,
    countWeight: getComputedStyle(document.querySelector(".rt-count")).fontWeight
}))()`;

// Evaluated as soon as the page is parsed - the hydrated page shows its markup, rendered from what it is configured
// with, before any component has booted
const initial = `(() => ({
    items: [...document.querySelectorAll(".rt-item")].map(item => item.textContent),
    sourceClass: document.querySelector(".rt-app")?.classList.contains("rt-placeholder") ? "rt-placeholder" :
        document.querySelector(".rt-app")?.classList.contains("rt-real") ? "rt-real" : null
}))()`;

// The pages tested - index.html, whose bootstrap and imports are in its head, body-boot.html, laid out as a page built
// by a site generator such as Hugo, whose bootstrap and imports are in its body after markup of its own, and the test
// fixture placeholder.html, and derived.html, which imports a Single File Component with no template of its own
const pages = Object.keys(pageSpecs);

const roundTrip = async function (pageName) {
    const expect = (condition, message) => expectAll(condition, pageName + ": " + message);
    const spec = pageSpecs[pageName];
    const result = await fluidHydrationRoundTrip.run({
        root: repoRoot,
        page: "tests/framework-tests/server/roundtrip/" + pageName,
        ready: readyFor(spec), snapshot, initial,
        timeout: 30000
    });

    // The hydrated page as written
    const {document} = linkedom.parseHTML(result.hydratedText);
    const items = [...document.querySelectorAll(".rt-item")].map(item => item.textContent);
    expect(items.join() === spec.items.join(), `Hydrated page rendered from its ${spec.placeholder ? "placeholder" : "real data"} - found ` + JSON.stringify(items));
    expect(!!document.querySelector(".rt-app." + spec.sourceClass), "Hydrated page shows what it is rendered from as " + spec.sourceClass);
    expect(!result.hydratedText.includes("file:"), "Hydrated page refers to no file: URL");
    expect(!result.hydratedText.includes("blob:"), "Hydrated page refers to no Blob URL");
    const importSrc = spec.importSrc ?? "sfc/fluid-tests-rt-app.vue";
    expect(!!document.querySelector(`fluid-import[src='${importSrc}']`), "Hydrated page keeps its import");
    const reported = /Rendered .* from placeholder placeholder:\/\/fluid\.tests\.rt\.app\/records, fetched from blob:/.test(result.hydrateOutput || "");
    expect(reported === spec.placeholder, (spec.placeholder ? "Hydrater reports the placeholder it rendered from" :
        "Hydrater reports no placeholder") + " - found " + (result.hydrateOutput || "").slice(-400));
    const sharedScripts = document.querySelectorAll("script[fluid-src='lib/shared.js']").length;
    expect(sharedScripts === 1, "Script shared by two SFCs recorded once - found " + sharedScripts);
    const clientScript = document.querySelector("script[fluid-client][src='lib/client-widget.js']");
    expect(!!clientScript && clientScript.textContent === "", "Script for the browser alone recorded as a link, not evaluated");
    expect(!!document.querySelector("link[href='sfc/parts/panel.css']"), "Stylesheet of a nested SFC linked relative to the page");
    expect(!!document.querySelector("#fl-symbols-host symbol#rt-star"), "Symbol of the root SFC injected");
    expect(!document.querySelector(".rt-widget-live"), "Widget for the browser alone not bound in the hydrated page");
    // The scripts injected into the hydrated page run as it is parsed, and so must follow the bootstrap of Infusion
    const bootScript = [...document.querySelectorAll("script[src]")].find(node => node.getAttribute("src").endsWith("FluidBoot.js"));
    const injected = [...document.querySelectorAll("script[id^='fl-script-']")];
    const allScripts = [...document.querySelectorAll("script")];
    const misplaced = injected.filter(node => allScripts.indexOf(node) < allScripts.indexOf(bootScript));
    expect(injected.length > 0 && misplaced.length === 0, "Every injected script follows the bootstrap of Infusion - found " +
        misplaced.map(node => node.id).join(", "));

    // The hydrated page shows its static markup before booting
    expect(result.hydrated.initial.items.join() === spec.items.join() && result.hydrated.initial.sourceClass === spec.sourceClass,
        "Hydrated page shows its rendering as soon as it is parsed - found " + JSON.stringify(result.hydrated.initial));
    expect(result.dehydrated.initial.items.length === 0, "Dehydrated page holds no markup of its own");

    // Both pages, once ready
    [["dehydrated", result.dehydrated], ["hydrated", result.hydrated]].forEach(([name, loaded]) => {
        expect(loaded.errors.length === 0, `No errors in ${name} page - found ${JSON.stringify(loaded.errors)}`);
        expect(loaded.snapshot.sharedRuns === 1, `Shared script ran once in ${name} page - ran ${loaded.snapshot.sharedRuns} times`);
        expect(loaded.snapshot.widgetRuns === 1, `Script for the browser alone ran once in ${name} page - ran ${loaded.snapshot.widgetRuns} times`);
        expect(loaded.snapshot.countWeight === "700", `Stylesheet of nested SFC applied in ${name} page`);
    });
    expect(result.dehydrationDifference === null, "Hydration reversed exactly by dehydrate.js - " + result.dehydrationDifference);
    const difference = fluidHydrationRoundTrip.firstDifference(result.dehydrated.snapshot, result.hydrated.snapshot);
    expect(difference === null, "Dehydrated and hydrated pages render identically - " + difference);

    console.log(`${pageName}: hydrated in ${result.hydrateTime}ms; ready in browser: dehydrated ${result.dehydrated.readyTime}ms, ` +
        `hydrated ${result.hydrated.readyTime}ms`);
};

/**
 * Test that hydrate.js, given --no-placeholders, refuses to write a page rendered from a placeholder, and writes one
 * rendered from its real data
 */
const testNoPlaceholders = function () {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-no-placeholders-"));
    try {
        [["placeholder.html", false], ["index.html", true]].forEach(([pageName, writes]) => {
            const output = path.join(tempDir, pageName);
            const result = childProcess.spawnSync(process.execPath, [fluidHydrationRoundTrip.hydrateScript,
                path.join(__dirname, "roundtrip", pageName), "-o", output, "--no-placeholders"], {encoding: "utf8", timeout: 60000});
            const wrote = fs.existsSync(output);
            expectAll(writes ? result.status === 0 && wrote : result.status !== 0 && !wrote &&
                /Not writing hydrated document: 1 of its components rendered from placeholders/.test(result.stderr),
            `${pageName}: hydrate.js --no-placeholders ${writes ? "writes a page rendered from its real data" :
                "refuses a page rendered from a placeholder"} - status ${result.status}, ${(result.stderr || "").slice(-300)}`);
        });
    } finally {
        fs.rmSync(tempDir, {recursive: true, force: true});
    }
};

const main = async function () {
    for (const pageName of pages) {
        await roundTrip(pageName);
    }
    testNoPlaceholders();
    if (failures.length === 0) {
        console.log("hydrate-roundtrip-test PASS");
    } else {
        console.log("hydrate-roundtrip-test FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("hydrate-roundtrip-test FAIL: ", error);
    process.exitCode = 1;
});
