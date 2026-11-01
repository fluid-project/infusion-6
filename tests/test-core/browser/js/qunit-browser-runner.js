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

/* eslint-env node */

"use strict";

// Runs QUnit test pages such as tests/framework-tests/core/html/FluidViewTests.html in the captive Chromium supplied
// by puppeteer. These are the pages which `npm test` runs in node against linkedom, whose DOM departs from a browser's
// in places, e.g. it has no capture phase and reports a missing class attribute as "" rather than null - running them
// here verifies them against a real DOM.
// Usage: node tests/test-core/browser/js/qunit-browser-runner.js [--headful] [--console] [--timeout=ms] page.html...
// With no pages supplied, runs those listed in infusion.tests.server of package.json

const path = require("path"),
    minimist = require("minimist");

// Loaded first, since it configures the location of puppeteer's captive browser
const fluidDemoRunner = require("./demo-runner.js");

const puppeteer = require("puppeteer");

const fluidQUnitBrowserRunner = {};

/**
 * @typedef {Object} QUnitAssertionFailure
 * @property {String} message - The assertion's message
 * @property {String} [expected] - The expected value, as rendered by QUnit.dump
 * @property {String} [actual] - The actual value, as rendered by QUnit.dump
 * @property {String} [stack] - The stack at which the assertion was made
 */

/**
 * @typedef {Object} QUnitTestResult
 * @property {String} fullName - The test's module and name, joined by " > "
 * @property {String} status - "passed", "failed", "skipped" or "todo"
 * @property {QUnitAssertionFailure[]} errors - The failed assertions of the test
 */

/**
 * Installed in each page before any of its scripts run, to subscribe to QUnit's events once its scripts have loaded
 * QUnit and registered their tests, but before QUnit starts them on the page's load event. Each test's result, and the
 * run's totals, are relayed to the runner through the functions it exposes.
 */
fluidQUnitBrowserRunner.pageAgent = function () {
    document.addEventListener("DOMContentLoaded", () => {
        const QUnit = window.QUnit;
        if (QUnit) {
            QUnit.on("testEnd", test => {
                window.fluidQUnitTestEnd({
                    fullName: test.fullName.join(" > "),
                    status: test.status,
                    errors: test.errors.map(error => ({
                        message: error.message,
                        expected: "expected" in error ? QUnit.dump.parse(error.expected) : undefined,
                        actual: "actual" in error ? QUnit.dump.parse(error.actual) : undefined,
                        stack: error.stack
                    }))
                });
            });
            QUnit.on("runEnd", run => window.fluidQUnitRunEnd({testCounts: run.testCounts, runtime: run.runtime}));
        } else {
            window.fluidQUnitRunEnd({error: "QUnit was not loaded by the page"});
        }
    });
};

/**
 * Report a failed test, with each of its failed assertions
 * @param {QUnitTestResult} test - The failed test
 */
fluidQUnitBrowserRunner.reportFailure = function (test) {
    console.log(`not ok - ${test.fullName}`);
    test.errors.forEach(error => {
        console.log(`    ${error.message ?? "assertion failed"}`);
        if (error.expected !== undefined || error.actual !== undefined) {
            console.log(`      expected: ${error.expected}`);
            console.log(`      actual:   ${error.actual}`);
        }
        if (error.stack) {
            console.log(`      at: ${error.stack.split("\n")[0].trim()}`);
        }
    });
};

/**
 * Run a single QUnit test page in a fresh browser page, reporting each failed test as it ends and the page's totals
 * once it completes.
 * @param {puppeteer.Browser} browser - The browser in which to open the page
 * @param {String} pagePath - The page's path, relative to the repository root
 * @param {String} baseUrl - The base URL of the server serving the repository
 * @param {Object} options - Options for the run
 * @param {Boolean} [options.console] - If true, relay messages logged to the page's console
 * @param {Number} options.timeout - Time in ms allowed for the page to complete its tests
 * @return {Promise<Object>} A promise for the page's tally, holding counts of `passed`, `failed` and `skipped` tests
 */
fluidQUnitBrowserRunner.runPage = async function (browser, pagePath, baseUrl, options) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    if (options.console) {
        page.on("console", message => console.log(`    console.${message.type()}: ${message.text()}`));
    }
    let resolveRun;
    const runEnded = new Promise(resolve => resolveRun = resolve);
    await page.exposeFunction("fluidQUnitTestEnd", test => {
        if (test.status === "failed") {
            fluidQUnitBrowserRunner.reportFailure(test);
        }
    });
    await page.exposeFunction("fluidQUnitRunEnd", run => resolveRun(run));
    await page.evaluateOnNewDocument(fluidQUnitBrowserRunner.pageAgent);

    let timer;
    const timedOut = new Promise(resolve => {
        timer = setTimeout(() => resolve({error: `Tests did not complete within ${options.timeout}ms`}), options.timeout);
    });
    let run;
    try {
        await page.goto(new URL(pagePath, baseUrl).href);
        run = await Promise.race([runEnded, timedOut]);
    } catch (error) {
        run = {error: error.message};
    } finally {
        clearTimeout(timer);
        await page.close();
    }
    pageErrors.forEach(message => console.log(`# page error: ${message}`));
    let tally;
    if (run.error) {
        console.log(`not ok - ${pagePath}: ${run.error}`);
        tally = {passed: 0, failed: 1, skipped: 0};
    } else {
        const counts = run.testCounts;
        console.log(`${counts.failed === 0 ? "ok" : "not ok"} - ${pagePath}: ${counts.passed} of ${counts.total} tests passed in ${run.runtime}ms`);
        tally = {passed: counts.passed, failed: counts.failed, skipped: counts.skipped + counts.todo};
    }
    return tally;
};

/**
 * Run a list of QUnit test pages in turn, and exit the process with a status reflecting their aggregate result.
 * @param {String[]} pagePaths - Paths of the test pages, relative to the repository root
 * @param {Object} options - Options as accepted by `runPage`, together with `headful` to show the browser
 * @return {Promise} A promise which resolves once all pages have run
 */
fluidQUnitBrowserRunner.runPages = async function (pagePaths, options) {
    const server = await fluidDemoRunner.startServer(fluidDemoRunner.repoRoot);
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    const browser = await puppeteer.launch({headless: !options.headful, args: ["--no-sandbox"]});
    const totals = {passed: 0, failed: 0, skipped: 0};
    try {
        console.log(`# Running ${pagePaths.length} QUnit pages in ${await browser.version()}`);
        for (const pagePath of pagePaths) {
            const tally = await fluidQUnitBrowserRunner.runPage(browser, pagePath, baseUrl, options);
            totals.passed += tally.passed;
            totals.failed += tally.failed;
            totals.skipped += tally.skipped;
        }
    } finally {
        await browser.close();
        server.close();
    }
    console.log(`# ${totals.passed} tests passed, ${totals.failed} failed, ${totals.skipped} skipped`);
    process.exitCode = totals.failed === 0 ? 0 : 1;
};

if (require.main === module) {
    const argv = minimist(process.argv.slice(2), {boolean: ["headful", "console"]});
    const pkg = require(path.join(fluidDemoRunner.repoRoot, "package.json"));
    // Pages supplied on the command line are resolved against the current directory, and served relative to the root
    const pagePaths = argv._.length > 0 ? argv._.map(page => path.relative(fluidDemoRunner.repoRoot, path.resolve(page)).split(path.sep).join("/")) :
        pkg.infusion.tests.server;
    fluidQUnitBrowserRunner.runPages(pagePaths, {
        headful: argv.headful,
        console: argv.console,
        timeout: Number(argv.timeout ?? 120000)
    });
}

module.exports = fluidQUnitBrowserRunner;
