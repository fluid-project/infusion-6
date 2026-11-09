/* eslint-env node */
"use strict";

// Support for testing that a page renders identically whether booted in the browser from its minimal, dehydrated form,
// or from the form written for it by src/framework/server/hydrate.js. The dehydrated page holds only its bootstrap of
// Infusion, the imports of its Single File Components and the elements on which its components boot - its booting
// discovers and injects every SFC, script, stylesheet and symbol, fetches its real data, and renders its markup. The
// hydrated page holds all of those as rendered from the placeholders of its data - see fluid.withPlaceholder - which
// the browser adopts and then rerenders
// with its real data. Once each is ready, the markup of their components and the set of their injections must agree.

const childProcess = require("child_process"),
    fs = require("fs"),
    path = require("path");

const fluidDemoRunner = require("./demo-runner.js");
const linkedom = require("linkedom");
const puppeteer = require("puppeteer");

const fluidHydrationRoundTrip = {};

fluidHydrationRoundTrip.hydrateScript = path.resolve(__dirname, "../../../../src/framework/server/hydrate.js");
fluidHydrationRoundTrip.dehydrateScript = path.resolve(__dirname, "../../../../src/framework/server/dehydrate.js");

/**
 * Run dehydrate.js on a hydrated page in a child process, and compare what it writes with the page as hydrate.js
 * read it, serialised as hydrate.js serialises documents
 * @param {String} pageFile - The path of the page before hydration
 * @param {String} hydratedFile - The path of its hydrated form
 * @return {String|null} A description of the first difference between the page and its dehydrated form, or `null`
 * if they agree
 */
fluidHydrationRoundTrip.dehydrationDifference = function (pageFile, hydratedFile) {
    const dehydratedFile = hydratedFile.replace(/\.html$/, "-dehydrated.html");
    let togo;
    try {
        const result = childProcess.spawnSync(process.execPath, [fluidHydrationRoundTrip.dehydrateScript, hydratedFile, "-o", dehydratedFile], {
            encoding: "utf8",
            timeout: 60000
        });
        if (result.status === 0) {
            const {document} = linkedom.parseHTML(fs.readFileSync(pageFile, "utf8"));
            const expected = "<!DOCTYPE html>" + document.documentElement.outerHTML;
            togo = fluidHydrationRoundTrip.firstDifference(expected, fs.readFileSync(dehydratedFile, "utf8"), "dehydrated page");
        } else {
            togo = "dehydrate.js exited with status " + result.status + "\n" + (result.stdout + result.stderr).slice(-2000);
        }
    } finally {
        fs.rmSync(dehydratedFile, {force: true});
    }
    return togo;
};

/**
 * Run hydrate.js on a page in a child process, writing its hydrated form beside it
 * @param {String} pageFile - The path of the page to be hydrated
 * @param {String} hydratedFile - The path to which its hydrated form is written
 * @param {String[]} [extraArgs] - Further arguments to hydrate.js, e.g. ["--framework", "built"]
 * @return {Object} Members `time`, the time in milliseconds taken to hydrate the page, and `output`, what hydrate.js
 * wrote to its standard output
 */
fluidHydrationRoundTrip.hydrate = function (pageFile, hydratedFile, extraArgs = []) {
    const start = Date.now();
    const result = childProcess.spawnSync(process.execPath, [fluidHydrationRoundTrip.hydrateScript, pageFile, "-o", hydratedFile, ...extraArgs], {
        cwd: path.dirname(pageFile),
        encoding: "utf8",
        timeout: 300000,
        maxBuffer: 256 * 1024 * 1024
    });
    if (result.status !== 0) {
        throw new Error("hydrate.js exited with status " + result.status + "\n" + (result.stdout + result.stderr).slice(-4000));
    }
    return {time: Date.now() - start, output: result.stdout};
};

// Defined in the page - serialise a node as markup in a canonical form, with each element's attributes in sorted order,
// since their order is of no significance, and differs between an element created by a rendering and one parsed from
// the markup of a static build. The mark recording an element's state before hydration, data-fluid-hydrated, is
// not part of its rendering
fluidHydrationRoundTrip.canonicalMarkup = `const fluidCanonicalMarkup = function (node) {
    let togo;
    if (node.nodeType === 1) {
        const attrs = [...node.attributes].filter(attr => attr.name !== "data-fluid-hydrated").map(attr => attr.name + "=" + JSON.stringify(attr.value)).sort();
        togo = "<" + node.localName + (attrs.length ? " " + attrs.join(" ") : "") + ">" +
            [...node.childNodes].map(fluidCanonicalMarkup).join("") + "</" + node.localName + ">";
    } else if (node.nodeType === 3) {
        togo = node.nodeValue;
    } else {
        togo = "";
    }
    return togo;
};`;

// Defined in the page - the keys of the nodes injected for Single File Components. A script loaded from a file is
// keyed by its source, since a script shared by several SFCs is injected under the id of whichever first claims it,
// which depends on the order in which they load - any other node is keyed by its id
fluidHydrationRoundTrip.injectionKeys = `const fluidInjectionKeys = function () {
    return [...document.querySelectorAll("[id^='fl-script-'], [id^='fl-style-'], [id^='fl-symbols-']")]
        .map(node => node.hasAttribute("fluid-src") ? "script " + new URL(node.getAttribute("fluid-src"), document.baseURI).pathname : node.id).sort();
};`;

// Evaluated in the page once it is ready - the canonical markup of every element on which a component booted, and the ids of the
// nodes injected for Single File Components, in which a page's own markup and those of a static build may not differ
fluidHydrationRoundTrip.defaultSnapshot = `(() => ({
    components: [...document.querySelectorAll("[fluid-layers]")].map(fluidCanonicalMarkup),
    injections: fluidInjectionKeys()
}))()`;

/**
 * @typedef {Object} RoundTripPageResult
 * @property {any} snapshot - The result of the snapshot expression, evaluated once the page was ready
 * @property {Number} readyTime - The time in milliseconds from navigation until the page was ready
 * @property {String[]} errors - Errors reported by the page, other than those excluded by `ignoreErrors`
 * @property {any} [initial] - The result of the `initial` expression, evaluated as soon as the page was parsed
 * @property {any} [shownAtEnd] - The result of the `initial` expression, evaluated again once the page was ready
 */

/**
 * Load a page in the browser, and wait until it is ready
 * @param {Browser} browser - The puppeteer browser
 * @param {String} url - The URL of the page
 * @param {Object} options - As for `fluidHydrationRoundTrip.run`
 * @return {Promise<RoundTripPageResult>} The outcome of loading the page
 */
fluidHydrationRoundTrip.loadPage = async function (browser, url, options) {
    const page = await browser.newPage();
    await page.setViewport({width: 1400, height: 1000});
    const errors = [];
    const ignored = text => (options.ignoreErrors || []).some(pattern => pattern.test(text));
    page.on("console", msg => {
        if (msg.type() === "error" && !ignored(msg.text())) {
            errors.push(msg.text());
        }
    });
    page.on("pageerror", error => {
        if (!ignored(error.message)) {
            errors.push(error.message);
        }
    });
    const start = Date.now();
    await page.evaluateOnNewDocument(fluidHydrationRoundTrip.canonicalMarkup + "\nwindow.fluidCanonicalMarkup = fluidCanonicalMarkup;\n" +
        fluidHydrationRoundTrip.injectionKeys + "\nwindow.fluidInjectionKeys = fluidInjectionKeys;");
    if (options.preload) {
        await page.evaluateOnNewDocument(options.preload);
    }
    await page.goto(url, {waitUntil: "domcontentloaded", timeout: options.timeout});
    const initial = options.initial ? await page.evaluate(options.initial) : undefined;
    try {
        await page.waitForFunction(options.ready, {timeout: options.timeout, polling: 50});
    } catch (error) {
        const state = options.diagnose ? await page.evaluate(options.diagnose).catch(e => "unavailable: " + e.message) : undefined;
        throw new Error(`Page ${url} was not ready after ${options.timeout}ms - state: ${JSON.stringify(state)}, errors: ${JSON.stringify(errors)}`);
    }
    const readyTime = Date.now() - start;
    // Allow any work triggered by the final change to complete
    await new Promise(resolve => setTimeout(resolve, options.settle ?? 500));
    const snapshot = await page.evaluate(options.snapshot ?? fluidHydrationRoundTrip.defaultSnapshot);
    const shownAtEnd = options.initial ? await page.evaluate(options.initial) : undefined;
    await page.close();
    return {snapshot, readyTime, errors, initial, shownAtEnd};
};

/**
 * @typedef {Object} RoundTripResult
 * @property {String} hydratedText - The text of the hydrated page
 * @property {Number} hydrateTime - The time in milliseconds taken to hydrate the page
 * @property {String|null} dehydrationDifference - The first difference between the page and the result of
 * dehydrating its hydrated form with dehydrate.js, or `null` if hydration was reversed exactly
 * @property {String} hydrateOutput - What hydrate.js wrote to its standard output
 * @property {RoundTripPageResult} dehydrated - The outcome of loading the dehydrated page
 * @property {RoundTripPageResult} hydrated - The outcome of loading the hydrated page
 */

/**
 * Hydrate a page, then load both its dehydrated and hydrated forms in a headless browser
 * @param {Object} options - Options for the test
 * @param {String} options.root - The directory served to the browser, which must hold the page and everything it loads
 * @param {String} options.page - The path of the page, relative to `root`
 * @param {String} options.ready - An expression evaluated in the page, which is truthy once the page is ready
 * @param {String} [options.snapshot] - An expression evaluated in the ready page, whose results for the two forms must
 * agree - defaults to `fluidHydrationRoundTrip.defaultSnapshot`
 * @param {String} [options.initial] - An expression evaluated as soon as each page has been parsed
 * @param {RegExp[]} [options.ignoreErrors] - Patterns of errors which are not reported, e.g. failures to load remote
 * resources
 * @param {String} [options.diagnose] - An expression evaluated in a page which is not ready in time, reported in the
 * failure
 * @param {Number} [options.timeout] - The time in milliseconds to wait for each page to be ready
 * @param {Number} [options.settle] - The time in milliseconds to wait after each page is ready before its snapshot
 * @param {Boolean} [options.keepHydrated] - If `true`, the hydrated page is left beside the page - otherwise it is removed
 * @param {String} [options.preload] - A script evaluated in each page before any of its own, e.g. to record its states
 * @param {String} [options.hash] - A hash, e.g. "#pane:History", with which both forms of the page are loaded
 * @param {String[]} [options.hydrateArgs] - Further arguments to hydrate.js, e.g. ["--framework", "built"]
 * @return {Promise<RoundTripResult>} The outcome of the test
 */
fluidHydrationRoundTrip.run = async function (options) {
    options = {timeout: 60000, ...options};
    const pageFile = path.join(options.root, options.page);
    const hydratedPage = options.page.replace(/\.html$/, "-hydrated.html");
    const hydratedFile = path.join(options.root, hydratedPage);
    const server = await fluidDemoRunner.startServer(options.root);
    const browser = await puppeteer.launch({headless: true, args: ["--no-sandbox"]});
    try {
        const {time: hydrateTime, output: hydrateOutput} = fluidHydrationRoundTrip.hydrate(pageFile, hydratedFile, options.hydrateArgs);
        const hydratedText = fs.readFileSync(hydratedFile, "utf8");
        const dehydrationDifference = fluidHydrationRoundTrip.dehydrationDifference(pageFile, hydratedFile);
        const baseUrl = `http://127.0.0.1:${server.address().port}/`;
        const hash = options.hash || "";
        const dehydrated = await fluidHydrationRoundTrip.loadPage(browser, baseUrl + options.page + hash, options);
        const hydrated = await fluidHydrationRoundTrip.loadPage(browser, baseUrl + hydratedPage + hash, options);
        return {hydratedText, hydrateTime, hydrateOutput, dehydrationDifference, dehydrated, hydrated};
    } finally {
        await browser.close();
        server.close();
        if (!options.keepHydrated) {
            fs.rmSync(hydratedFile, {force: true});
        }
    }
};

/**
 * Find the first difference between two values, for reporting
 * @param {any} a - The first value
 * @param {any} b - The second value
 * @param {String} [where] - The path at which they are found
 * @return {String|null} A description of the first difference, or null if they agree
 */
fluidHydrationRoundTrip.firstDifference = function (a, b, where = "") {
    let togo = null;
    if (typeof(a) === "string" && typeof(b) === "string") {
        if (a !== b) {
            let i = 0;
            while (i < a.length && a[i] === b[i]) {
                ++i;
            }
            togo = `${where} differs at character ${i}:\n    dehydrated: ...${a.slice(Math.max(0, i - 120), i + 120)}...\n` +
                `    hydrated:   ...${b.slice(Math.max(0, i - 120), i + 120)}...`;
        }
    } else if (a && b && typeof(a) === "object" && typeof(b) === "object") {
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
        for (const key of keys) {
            togo = togo ?? fluidHydrationRoundTrip.firstDifference(a[key], b[key], where + "." + key);
        }
    } else if (a !== b) {
        togo = `${where} differs: ${JSON.stringify(a)} versus ${JSON.stringify(b)}`;
    }
    return togo;
};

module.exports = fluidHydrationRoundTrip;
