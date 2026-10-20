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

// Runs JSON demo scripts such as demo/compose-edit/demo-script.json against their demo pages in the captive Chromium
// supplied by puppeteer, delivering real mouse and keyboard input. Locators and expectations are interpreted in the
// page by demo-agent.js, so that this driver needs only to evaluate functions in the page and deliver input.
// Usage: node tests/test-core/browser/js/demo-runner.js [--headful] [--console] [--timeout=ms] [--settle=ms]
//     [--screenshots=dir] script.json...

const fs = require("fs"),
    http = require("http"),
    os = require("os"),
    path = require("path"),
    minimist = require("minimist");

const fluidDemoRunner = {};

fluidDemoRunner.repoRoot = path.resolve(__dirname, "../../../..");

// puppeteer locates its configuration from the current directory - ensure that the captive browser is found in the
// cache named by the repository's .puppeteerrc.cjs wherever we are run from
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR ?? require(path.join(fluidDemoRunner.repoRoot, ".puppeteerrc.cjs")).cacheDirectory;

const puppeteer = require("puppeteer");

fluidDemoRunner.agentPath = path.join(__dirname, "demo-agent.js");

fluidDemoRunner.mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
};

/**
 * Start a static HTTP server for the repository, on a free port of the loopback interface. Pages are served over HTTP
 * rather than from file: URLs since Chromium refuses the fetches which the framework uses to load SFCs from file: URLs.
 * @param {String} root - The directory to be served
 * @return {Promise<http.Server>} A promise for the listening server
 */
fluidDemoRunner.startServer = function (root) {
    const server = http.createServer((req, res) => {
        let pathname = null;
        try {
            pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        } catch (error) {
            console.log(`# malformed request URL ${req.url}`);
        }
        const requested = pathname === null ? null : path.join(root, pathname);
        const filePath = requested?.endsWith(path.sep) ? path.join(requested, "index.html") : requested;
        if (filePath?.startsWith(root)) {
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end();
                } else {
                    res.writeHead(200, {"Content-Type": fluidDemoRunner.mimeTypes[path.extname(filePath)] ?? "text/plain"});
                    res.end(data);
                }
            });
        } else {
            res.writeHead(403);
            res.end();
        }
    });
    return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
};

/**
 * Wait for a set of expectations to pass in the page, polling until they do or the timeout expires. Once they pass,
 * they must still pass after a settling interval, so that an expectation such as a count increasing by exactly one is
 * not satisfied by a transient state on the way to some other.
 * @param {Page} page - The puppeteer page
 * @param {Object[]} expectations - The expectations to be checked, as interpreted by `fluidDemoAgent.check`
 * @param {Number[]} baselines - The counts measured before the step's action
 * @param {Number} timeout - The time in milliseconds to wait for the expectations to pass
 * @param {Number} [settle] - The settling interval in milliseconds - defaults to 0
 * @return {Promise<Object>} A promise for the final result of `fluidDemoAgent.check`
 */
fluidDemoRunner.waitForExpectations = async function (page, expectations, baselines, timeout, settle = 0) {
    const check = () => page.evaluate((e, b) => window.fluidDemoAgent.check(e, b), expectations, baselines);
    const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));
    const deadline = Date.now() + timeout;
    let result = await check();
    let settled = false;
    while (!settled && Date.now() < deadline) {
        if (result.passed) {
            await sleep(settle);
            result = await check();
            settled = result.passed;
        } else {
            await sleep(100);
            result = await check();
        }
    }
    return result;
};

/**
 * Compute the point at which to deliver pointer input to a target, failing if the input would be intercepted by
 * some other element.
 * @param {Page} page - The puppeteer page
 * @param {Object} target - The locator for the target
 * @param {String} [find] - Text within the target over which the point should lie
 * @return {Promise<Object>} A promise for the point, holding `x` and `y`
 */
fluidDemoRunner.pointFor = async function (page, target, find) {
    const point = await page.evaluate((t, f) => window.fluidDemoAgent.pointFor(t, f), target, find);
    if (!point.hit) {
        throw new Error(`Pointer input at (${Math.round(point.x)}, ${Math.round(point.y)}) would be received by ${point.hitDescription} rather than the target`);
    }
    return point;
};

/**
 * Perform a step's action in the page by delivering native input.
 * @param {Page} page - The puppeteer page
 * @param {Object} action - The action, holding a `type` of "click", "dblclick", "hover" or "editText" and a `target`
 * locator.
 * An "editText" action also holds `find` and `replace`, and is performed by clicking on the text and typing the
 * minimal edit transforming `find` into `replace`
 * @return {Promise} A promise which resolves once the input has been delivered
 */
fluidDemoRunner.performAction = async function (page, action) {
    if (action.type === "click") {
        const point = await fluidDemoRunner.pointFor(page, action.target);
        await page.mouse.click(point.x, point.y);
    } else if (action.type === "dblclick") {
        const point = await fluidDemoRunner.pointFor(page, action.target);
        await page.mouse.click(point.x, point.y);
        await page.mouse.click(point.x, point.y, {clickCount: 2});
    } else if (action.type === "hover") {
        const point = await fluidDemoRunner.pointFor(page, action.target);
        await page.mouse.move(point.x, point.y);
    } else if (action.type === "editText") {
        const point = await fluidDemoRunner.pointFor(page, action.target, action.find);
        await page.mouse.click(point.x, point.y);
        const edit = await page.evaluate((t, f, r) => window.fluidDemoAgent.selectForEdit(t, f, r),
            action.target, action.find, action.replace);
        if (edit.insert) {
            await page.keyboard.type(edit.insert);
        } else {
            await page.keyboard.press("Backspace");
        }
    } else {
        throw new Error(`Unknown action type ${action.type}`);
    }
};

/**
 * Print the results of a step's expectations.
 * @param {Object} result - The result of `fluidDemoAgent.check`
 */
fluidDemoRunner.reportExpectations = function (result) {
    result.results.forEach(expectation => {
        const label = expectation.description ? `${expectation.description} - ` : "";
        if (expectation.failures.length === 0) {
            console.log(`    ok - ${label}${expectation.target}`);
        } else {
            console.log(`    not ok - ${label}${expectation.target}`);
            expectation.failures.forEach(failure => console.log(`        ${failure}`));
        }
    });
};

/**
 * Run a single demo script in a fresh browser, reporting the outcome of each step. Each step's action is performed,
 * and its expectations are polled until they pass or the timeout expires. A step also fails if the page raises an
 * uncaught error during it. Subsequent steps are run after a failure, since their results are often still
 * informative. A step holding a `knownIssue` is reported with a TAP "TODO" directive describing the issue, and its
 * failure is tallied as known rather than failed.
 * @param {String} scriptPath - The path of the JSON demo script
 * @param {String} baseUrl - The URL at which the repository is served
 * @param {Object} options - Options holding `headful`, `console` - whether to relay the page's console messages,
 * `timeout` and `settle` in milliseconds as accepted by `waitForExpectations`, and `screenshots`, a directory into
 * which screenshots of failing steps are written
 * @return {Promise<Object>} A promise for a record holding the numbers of `passed`, `failed` and `known` steps
 */
fluidDemoRunner.runScript = async function (scriptPath, baseUrl, options) {
    const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
    const browser = await puppeteer.launch({headless: !options.headful, args: ["--no-sandbox"]});
    const tally = {passed: 0, failed: 0, known: 0};
    try {
        console.log(`# ${script.title} (${scriptPath}) in ${await browser.version()}`);
        const page = await browser.newPage();
        await page.setViewport(script.viewport ?? {width: 1600, height: 1000});
        let pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        if (options.console) {
            page.on("console", message => console.log(`    console.${message.type()}: ${message.text()}`));
        }
        await page.goto(new URL(script.page, baseUrl).href);
        await page.addScriptTag({path: fluidDemoRunner.agentPath});

        const ready = await fluidDemoRunner.waitForExpectations(page, script.ready ?? [], null, options.timeout, options.settle);
        pageErrors.forEach(message => console.log(`# page error during load: ${message}`));
        if (ready.passed) {
            for (let i = 1; i <= script.steps.length; ++i) {
                const step = script.steps[i - 1];
                pageErrors = [];
                let result, actionError;
                try {
                    const baselines = await page.evaluate(e => window.fluidDemoAgent.measure(e), step.expect);
                    await fluidDemoRunner.performAction(page, step.action);
                    result = await fluidDemoRunner.waitForExpectations(page, step.expect, baselines, options.timeout, options.settle);
                } catch (error) {
                    actionError = error;
                }
                const passed = !actionError && result.passed && pageErrors.length === 0;
                const directive = step.knownIssue === undefined ? "" : ` # TODO ${step.knownIssue}`;
                console.log(`${passed ? "ok" : "not ok"} ${i} - ${step.description}${directive}`);
                if (actionError) {
                    console.log(`    action failed: ${actionError.message}`);
                }
                if (result) {
                    fluidDemoRunner.reportExpectations(result);
                }
                pageErrors.forEach(message => console.log(`    page error: ${message}`));
                if (passed) {
                    ++tally.passed;
                    if (step.knownIssue !== undefined) {
                        console.log("    step with known issue now passes - its knownIssue entry may be removed");
                    }
                } else {
                    if (step.knownIssue === undefined) {
                        ++tally.failed;
                    } else {
                        ++tally.known;
                    }
                    const shotPath = path.join(options.screenshots, `${path.basename(scriptPath, ".json")}-step-${i}.png`);
                    await page.screenshot({path: shotPath});
                    console.log(`    screenshot: ${shotPath}`);
                }
            }
        } else {
            console.log("not ok - page did not become ready");
            fluidDemoRunner.reportExpectations(ready);
            ++tally.failed;
        }
    } finally {
        await browser.close();
    }
    return tally;
};

/**
 * Run a list of demo scripts in turn, and exit the process with a status reflecting their aggregate result.
 * @param {String[]} scriptPaths - Paths of the JSON demo scripts to run
 * @param {Object} options - Options as accepted by `runScript`
 * @return {Promise} A promise which resolves once all scripts have run
 */
fluidDemoRunner.runScripts = async function (scriptPaths, options) {
    const server = await fluidDemoRunner.startServer(fluidDemoRunner.repoRoot);
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    fs.mkdirSync(options.screenshots, {recursive: true});
    const totals = {passed: 0, failed: 0, known: 0};
    try {
        for (const scriptPath of scriptPaths) {
            const tally = await fluidDemoRunner.runScript(scriptPath, baseUrl, options);
            totals.passed += tally.passed;
            totals.failed += tally.failed;
            totals.known += tally.known;
        }
    } finally {
        server.close();
    }
    console.log(`# ${totals.passed} steps passed, ${totals.failed} failed, ${totals.known} failed with known issues`);
    process.exitCode = totals.failed === 0 ? 0 : 1;
};

if (require.main === module) {
    const argv = minimist(process.argv.slice(2), {boolean: ["headful", "console"]});
    const pkg = require(path.join(fluidDemoRunner.repoRoot, "package.json"));
    const scriptPaths = argv._.length > 0 ? argv._ : pkg.infusion.tests.browser.map(rel => path.join(fluidDemoRunner.repoRoot, rel));
    fluidDemoRunner.runScripts(scriptPaths, {
        headful: argv.headful,
        console: argv.console,
        timeout: Number(argv.timeout ?? 10000),
        settle: Number(argv.settle ?? 250),
        screenshots: argv.screenshots ?? path.join(os.tmpdir(), "fluid-demo-screenshots")
    });
}

module.exports = fluidDemoRunner;
