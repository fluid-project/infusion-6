/* eslint-env node */
"use strict";

// Test that a page with nested Single File Components and placeholder data renders identically whether booted in the
// browser from its minimal, dehydrated form, or from the form written for it by hydrate.js. The page is
// roundtrip/index.html, whose root SFC imports others from a subdirectory, which import a further one in turn. They
// share a script referred to by different relative paths, inject a stylesheet and a symbol, and load a script for the
// browser alone which marks a container with a class of its own. Its data is fetched by a reader bearing
// fluid.withPlaceholder, which names a placeholder fetched in its place when the page is rendered statically.

const path = require("path"),
    linkedom = require("linkedom");

const fluidHydrationRoundTrip = require("../../test-core/browser/js/hydration-roundtrip.js");

const repoRoot = path.resolve(__dirname, "../../..");

const failures = [];
const expectAll = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

// The page is ready once its real records are rendered, and it no longer shows itself as loading
const ready = `document.querySelectorAll(".rt-item").length === 5 && !!document.querySelector(".rt-app.rt-loaded")
    && !!document.querySelector(".rt-widget-live")`;

const snapshot = `(() => ({
    components: [...document.querySelectorAll("[fluid-layers]")].map(fluidCanonicalMarkup),
    injections: fluidInjectionKeys(),
    symbols: [...document.querySelectorAll("#fl-symbols-host symbol")].map(node => node.id),
    sharedRuns: fluid.tests.rt.sharedRuns,
    widgetRuns: window.fluidTestsRtWidgetRuns,
    countWeight: getComputedStyle(document.querySelector(".rt-count")).fontWeight
}))()`;

// Evaluated as soon as the page is parsed - the hydrated page shows its markup, rendered from the placeholder data,
// before any component has booted
const initial = `(() => ({
    items: [...document.querySelectorAll(".rt-item")].map(item => item.textContent),
    loading: !!document.querySelector(".rt-app.rt-loading")
}))()`;

// The pages tested - index.html, whose bootstrap and imports are in its head, and body-boot.html, laid out as a page built
// by a site generator such as Hugo, whose bootstrap and imports are in its body after markup of its own
const pages = ["index.html", "body-boot.html"];

const roundTrip = async function (pageName) {
    const expect = (condition, message) => expectAll(condition, pageName + ": " + message);
    const result = await fluidHydrationRoundTrip.run({
        root: repoRoot,
        page: "tests/framework-tests/server/roundtrip/" + pageName,
        ready, snapshot, initial,
        timeout: 30000
    });

    // The hydrated page as written
    const {document} = linkedom.parseHTML(result.hydratedText);
    const items = [...document.querySelectorAll(".rt-item")].map(item => item.textContent);
    expect(items.length === 1 && items[0] === "Placeholder", "Hydrated page rendered from the placeholder data - found " + JSON.stringify(items));
    expect(!!document.querySelector(".rt-app.rt-loading"), "Hydrated page shows itself as rendered from placeholders");
    expect(!result.hydratedText.includes("file:"), "Hydrated page refers to no file: URL");
    expect(!!document.querySelector("fluid-import[src='sfc/fluid-tests-rt-app.vue']"), "Hydrated page keeps its import");
    expect(/from placeholder .*data\/placeholder\/records\.json in place of .*data\/records\.json/.test(result.hydrateOutput || ""),
        "Hydrater reports the placeholder it rendered from - found " + (result.hydrateOutput || "").slice(-400));
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
    expect(result.hydrated.initial.items.join() === "Placeholder" && result.hydrated.initial.loading,
        "Hydrated page shows its placeholder rendering as soon as it is parsed - found " + JSON.stringify(result.hydrated.initial));
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

const main = async function () {
    for (const pageName of pages) {
        await roundTrip(pageName);
    }
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
