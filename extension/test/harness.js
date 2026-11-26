"use strict";

// Support for scenario tests of the "Edit in Infusion" extension against a mock GitHub - see mock-github.js. A scenario
// starts the mock for a site, launches Chromium with the extension pointed at the mock's API, and drives pages of the
// published site as a user would, through the extension's own UI and its service worker.

const path = require("path"),
    fs = require("fs"),
    os = require("os"),
    childProcess = require("child_process");

const mockGitHub = require("./mock-github.js");

const harness = {
    extensionDir: path.resolve(__dirname, "../edit-in-infusion"),
    infusionDir: path.resolve(__dirname, "../.."),
    // The site the scenarios edit
    testSiteDir: path.resolve(__dirname, "../../packages/wend-test-site")
};

// Puppeteer is that installed with Infusion, which keeps its captive browser within the checkout - see .puppeteerrc.cjs
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR ?? require(path.join(harness.infusionDir, ".puppeteerrc.cjs")).cacheDirectory;
const puppeteer = require("puppeteer");

/**
 * Build a wend site in a scratch repository, as its workflow does - with wend's build script, installed in the site's
 * node_modules, against the Infusion checkout holding this file unless EDIT_TEST_INSTALLED_INFUSION is set
 * @param {String} repoDir - The scratch repository
 * @param {String} outDir - The directory into which to publish
 * @param {String} commit - The sha of the commit built
 * @return {Promise} Resolves once built, rejects if the build fails
 */
harness.buildSite = function (repoDir, outDir, commit) {
    return new Promise((resolve, reject) => {
        const child = childProcess.spawn(process.execPath, [path.join(repoDir, "node_modules/@fluid-project/wend/js/buildSite.js"), "-o", outDir],
            {cwd: repoDir, env: {...process.env, GITHUB_SHA: commit}, stdio: ["ignore", "pipe", "pipe"]});
        let output = "";
        child.stdout.on("data", data => output += data);
        child.stderr.on("data", data => output += data);
        child.on("close", code => code === 0 ? resolve(output) : reject(new Error("Build failed with " + code + ":\n" + output)));
    });
};

/**
 * Place a site's bases beneath it at the commits its wend.bases.lock.json records, as wend-fetch-bases does
 * @param {String} repoDir - The site's scratch repository
 * @param {Object<String, MockBase>} bases - Its bases, by repository
 */
harness.fetchBases = function (repoDir, bases) {
    const lock = JSON.parse(fs.readFileSync(path.join(repoDir, "wend.bases.lock.json"), "utf8"));
    Object.entries(lock).forEach(([repo, {sha}]) => {
        const target = path.join(repoDir, ".wend/bases", ...repo.split("/"));
        fs.rmSync(target, {recursive: true, force: true});
        fs.cpSync(bases[repo].versions[sha], target, {recursive: true});
    });
};

/**
 * Start a mock GitHub hosting a wend site - by default packages/wend-test-site, which holds what the scenarios rely on.
 * Two environment variables choose what is built, for checking a release before it is published - e.g. a copy of the
 * site with tarballs made by `npm pack` installed into it, as scripts/testPacked.js makes:
 *  - EDIT_TEST_SITE: the working tree of the site, in place of packages/wend-test-site
 *  - EDIT_TEST_INSTALLED_INFUSION: if set, the site is built with the Infusion installed in its node_modules, rather
 *    than with the checkout holding this file
 * @param {Object} [options] - Options
 * @param {String} [options.siteDir] - The site's working tree, by default EDIT_TEST_SITE, or else
 * packages/wend-test-site
 * @param {Number} [options.buildDelay] - How long each Action waits before building, in ms
 * @param {Function} [options.prepareRepo] - Receives the scratch repository's directory before it is first built, e.g.
 * to add files the scenario needs
 * @param {Object<String, MockBase>} [options.bases] - The site's bases held as git repositories, which the mock serves
 * as public repositories - each build fetches each at the commit the site's wend.bases.lock.json records, as
 * wend-fetch-bases does, from the base's working tree for that commit
 * @return {Promise<Object>} The mock, serving
 */
harness.startSite = async function (options = {}) {
    const siteDir = path.resolve(options.siteDir ?? process.env.EDIT_TEST_SITE ?? harness.testSiteDir);
    const installedInfusion = !!process.env.EDIT_TEST_INSTALLED_INFUSION;
    // The site's editing configuration, which wend.site.json names, gives the repository and branch edits are committed to
    const descriptor = JSON.parse(fs.readFileSync(path.join(siteDir, "wend.site.json"), "utf8"));
    const editing = JSON.parse(fs.readFileSync(path.join(siteDir, descriptor.editing), "utf8"));
    const mock = mockGitHub.create({
        siteDir,
        repo: editing.repo,
        branch: editing.branch,
        buildDelay: options.buildDelay ?? 500,
        bases: options.bases,
        build: options.bases ? (repoDir, outDir, commit) => {
            harness.fetchBases(repoDir, options.bases);
            return harness.buildSite(repoDir, outDir, commit);
        } : harness.buildSite,
        // e.g. MOCK_GITHUB_REUSE=<a build of the same site>, while developing a scenario - the published site must be current
        reusePages: process.env.MOCK_GITHUB_REUSE,
        // The scratch repository is elsewhere, so the checkout of Infusion it builds with is named absolutely
        prepare: async repoDir => {
            // A site with no install of its own, as packages/wend-test-site, is built with Infusion's root node_modules,
            // where npm links the workspaces @fluid-project/wend and @fluid-project/wend-theme-beautiful
            if (!fs.existsSync(path.join(repoDir, "node_modules"))) {
                fs.symlinkSync(path.join(harness.infusionDir, "node_modules"), path.join(repoDir, "node_modules"));
            }
            if (installedInfusion) {
                console.log("# Building " + siteDir + " with the Infusion installed in its node_modules");
            } else {
                fs.writeFileSync(path.join(repoDir, "moduleOverrides.json5"), JSON.stringify([{moduleName: "infusion-6", baseDir: harness.infusionDir}]));
            }
            if (options.prepareRepo) {
                await options.prepareRepo(repoDir);
            }
        }
    });
    return mock.start();
};

/**
 * Make a build of the extension for testing - a copy whose manifest bears `fluid_testing`, which alone honours a mock's
 * API and a faster poll set in its storage, and which is granted the mock's host up front, as a user would grant it
 * on clicking the extension's action, which a test can't
 * @return {String} The directory of the copy
 */
harness.testBuild = function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-in-infusion-test-"));
    fs.cpSync(harness.extensionDir, dir, {recursive: true});
    const manifestFile = path.join(dir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.fluid_testing = true;
    manifest.host_permissions = [...manifest.host_permissions, "http://127.0.0.1/*"];
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 4));
    return dir;
};

/**
 * The options with which to launch Chromium holding a test build of the extension - loaded as an unpacked extension,
 * which Chrome for Testing, as puppeteer installs it, allows, though branded Chrome no longer does
 * @param {String} extensionDir - The directory of the test build - see harness.testBuild
 * @param {Object} [options] - Further options of puppeteer.launch, e.g. `{headless: false}`, whose `args` are added
 * @return {Object} The options of puppeteer.launch
 */
harness.launchOptions = function (extensionDir, options = {}) {
    return {headless: true, enableExtensions: [extensionDir], ...options, args: ["--no-sandbox", ...options.args ?? []]};
};

/**
 * Launch Chromium with a test build of the extension, pointed at a mock's API and holding a token
 * @param {Object} mock - The mock, serving
 * @return {Promise<Object>} `{browser, worker}` - the browser, and the extension's service worker
 */
harness.launch = async function (mock) {
    const extensionDir = harness.testBuild();
    const browser = await puppeteer.launch(harness.launchOptions(extensionDir));
    browser.on("disconnected", () => fs.rmSync(extensionDir, {recursive: true, force: true}));
    // Each commit a page asks for is confirmed by the user in a window of the extension's own - see fluidConfirm in
    // background.js - which is confirmed here as the user would, or declined if `confirmDecision` is false, recording
    // what it showed
    browser.confirmations = [];
    browser.confirmDecision = true;
    browser.on("targetcreated", async target => {
        if (process.env.MOCK_GITHUB_VERBOSE) {
            console.log("  [target] " + target.type() + " " + target.url());
        }
        if (target.url().includes("/confirm.html")) {
            const page = await target.page();
            await page.waitForSelector("#approve:not([disabled])", {timeout: 15000});
            browser.confirmations.push(await page.evaluate(() => ({path: document.getElementById("path").textContent,
                repo: document.getElementById("repo").textContent, diff: document.getElementById("claims").textContent,
                paths: Array.from(document.querySelectorAll(".claim input")).map(box => box.dataset.path)})));
            await page.click(browser.confirmDecision ? "#approve" : "#decline");
        }
    });
    const worker = await (await browser.waitForTarget(target => target.type() === "service_worker")).worker();
    // The published trace is polled every 2s rather than every 15s, so that a page finds a rebuild well within a test's wait
    await worker.evaluate(apiUrl => chrome.storage.local.set({githubApi: apiUrl, githubToken: "mock-token", pollInterval: 2000}), mock.apiUrl);
    return {browser, worker};
};

/**
 * Open a page of the published site, blocking requests to other hosts, which a test cannot reach
 * @param {Object} browser - The browser
 * @param {Object} mock - The mock
 * @param {String} pagePath - The page's path within the site, e.g. "post/x/"
 * @return {Promise<Object>} The page, loaded
 */
harness.openPage = async function (browser, mock, pagePath) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => request.url().startsWith(mock.url) || request.url().startsWith("chrome-extension:") ?
        request.continue() : request.abort());
    page.errors = [];
    page.on("pageerror", error => page.errors.push(String(error)));
    page.on("console", message => {
        if (process.env.MOCK_GITHUB_VERBOSE || message.type() === "error") {
            // A failure to load a resource names it only by its location
            const url = message.location() && message.location().url;
            console.log("  [" + pagePath + " " + message.type() + "] " + message.text().substring(0, 300) + (url ? " - " + url : ""));
        }
    });
    await page.goto(mock.url + pagePath, {waitUntil: "load"});
    return page;
};

/**
 * Activate the extension on a page, as the user does by clicking its action - enlisting the page's site, injecting
 * the content scripts, and opening the editor - and wait for its editor to show the source it edits, if any
 * @param {Object} worker - The extension's service worker
 * @param {Object} page - The page
 * @return {Promise} Resolves once the editor holds the page's source
 */
harness.activate = async function (worker, page) {
    await page.bringToFront();
    // eslint-disable-next-line no-undef
    await worker.evaluate(async () => fluidEditBackground.activateTab((await chrome.tabs.query({active: true, lastFocusedWindow: true}))[0]));
    await page.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready]:not([hidden])", {timeout: 30000});
};

/**
 * Activate the extension on a page through its panel, as the user does - clicking its button, which opens the panel,
 * and then *Edit this page* in it. A test can't click the button, so the panel is opened as a page of its own, naming
 * the tab it would have been opened over
 * @param {Object} browser - The browser
 * @param {Object} worker - The extension's service worker
 * @param {Object} page - The page
 * @return {Promise<Object>} The panel's page, once the editor holds the page's source - closed, as the panel closes itself
 */
harness.activateByPanel = async function (browser, worker, page) {
    const pageUrl = page.url();
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({url}))[0].id, pageUrl);
    const panel = await browser.newPage();
    // The origin of a chrome-extension: URL is opaque, so the panel's URL is made from its host
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/popup.html?tab=" + tabId);
    await panel.waitForSelector("#start:not([disabled])", {timeout: 15000});
    await panel.click("#start");
    await page.bringToFront();
    await page.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready]:not([hidden])", {timeout: 30000});
    return panel;
};

/**
 * Type a whole new text into the editor's source, as the user would edit it
 * @param {Object} page - The page
 * @param {Function} edit - Receives the source's text, and returns its edited text
 * @return {Promise<String>} The edited text
 */
harness.editSource = async function (page, edit) {
    const text = edit(await page.$eval(".fluid-edit-panel textarea", node => node.value));
    await page.$eval(".fluid-edit-panel textarea", (node, value) => {
        node.value = value;
        node.dispatchEvent(new Event("input"));
    }, text);
    return text;
};

/**
 * Wait until the blocks of a page are marked with a claim's state
 * @param {Object} page - The page
 * @param {String} state - The state, e.g. "uncommitted"
 * @param {Number} [timeout] - How long to wait, in ms
 * @return {Promise} Resolves once they are
 */
harness.waitForState = (page, state, timeout = 15000) =>
    page.waitForSelector(`[data-fluid-claim-state="${state}"]`, {timeout});

/**
 * List the claims held by the extension
 * @param {Object} worker - The extension's service worker
 * @return {Promise<Object[]>} The claims
 */
// eslint-disable-next-line no-undef
harness.claims = worker => worker.evaluate(() => fluidClaims.list());

/**
 * Run a scenario, reporting each of its expectations, and stopping the mock and the browser however it ends
 * @param {String} name - The scenario's name
 * @param {Function} body - Receives `{mock, browser, worker, expect}`, where `expect(condition, message)` records an
 * expectation, and returns a promise
 * @param {Object} [options] - Options for the mock, as for `startSite`
 */
harness.scenario = async function (name, body, options) {
    const failures = [];
    let passed = 0;
    const expect = (condition, message) => {
        if (condition) {
            passed++;
        } else {
            failures.push(message);
        }
        console.log((condition ? "ok - " : "not ok - ") + message);
    };
    console.log("# " + name);
    const mock = await harness.startSite(options);
    let browser;
    try {
        const launched = await harness.launch(mock);
        browser = launched.browser;
        await body({mock, browser, worker: launched.worker, expect});
    } catch (error) {
        failures.push("Scenario threw: " + (error.stack || error));
        console.log("not ok - scenario threw: " + (error.stack || error));
    } finally {
        if (browser) {
            await browser.close();
        }
        await mock.stop();
    }
    console.log(`# ${passed} passed, ${failures.length} failed`);
    process.exitCode = failures.length > 0 ? 1 : 0;
};

module.exports = harness;
