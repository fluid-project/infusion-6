"use strict";

// Scenario test of signing in to GitHub from the "Edit in Infusion" extension's options, by GitHub's device flow,
// against a mock of it - see mock-device-flow.js. The user asks to sign in, is shown a code, opens GitHub's page from
// the options, enters the code there and authorizes, and the options page signs them in by itself. Also: GitHub asking
// for slower polling, signing out, cancelling at GitHub, and a copy of the extension with no client id, which offers a
// personal access token instead. Needs no build of a site. Run with: node extension/test/signin-scenario.js

const http = require("http");
const fs = require("fs");
const harness = require("./harness.js");
const mockDeviceFlow = require("./mock-device-flow.js");
const puppeteer = require("puppeteer");

const clientId = "Ov23mockclientid";

/**
 * Start a server of the mock device flow, its web pages beneath /web and its API beneath /api
 * @return {Promise<Object>} `{server, flow, webUrl, apiUrl}`
 */
const startServer = async function () {
    const holder = {};
    const server = http.createServer((req, res) => {
        const urlPath = new URL(req.url, "http://localhost").pathname;
        const webPath = urlPath.startsWith("/web/") ? urlPath.substring("/web".length) : null;
        const apiPath = urlPath.startsWith("/api/") ? urlPath.substring("/api".length) : null;
        holder.flow.handle(req, res, webPath, apiPath).then(served => {
            if (!served) {
                res.writeHead(404, {"Content-Type": "text/plain"});
                res.end("Not found");
            }
        }, error => {
            res.writeHead(500, {"Content-Type": "text/plain"});
            res.end(String(error));
        });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    holder.flow = mockDeviceFlow.create({clientId, verificationUri: base + "/web/login/device", slowDownOnce: true, interval: 1});
    return {server, flow: holder.flow, webUrl: base + "/web", apiUrl: base + "/api"};
};

/**
 * Wait until an element of a page is shown, i.e. it and none of its ancestors is hidden
 * @param {Object} page - The page
 * @param {String} selector - The element's selector
 * @param {Number} [timeout] - How long to wait, in ms
 * @return {Promise} Resolves once it is shown
 */
const waitShown = (page, selector, timeout = 15000) =>
    page.waitForFunction(sel => {
        const node = document.querySelector(sel);
        return node && !node.closest("[hidden]");
    // Polled by a timer, since a tab in the background, e.g. one the extension has turned from, runs no animation frames
    }, {timeout, polling: 100}, selector);

/**
 * Whether an element of a page is shown
 * @param {Object} page - The page
 * @param {String} selector - The element's selector
 * @return {Promise<Boolean>} `true` if it is shown
 */
const isShown = (page, selector) => page.$eval(selector, node => !node.closest("[hidden]"));

/**
 * Sign in from the options page as a user would, up to entering the code at GitHub's page and deciding there
 * @param {Object} browser - The browser
 * @param {Object} options - The options page
 * @param {String} decision - "authorize" or "cancel", the button clicked at GitHub
 * @return {Promise<String>} The code shown to the user
 */
const signInAtGitHub = async function (browser, options, decision) {
    await options.click("#signin");
    await waitShown(options, "#device");
    const userCode = await options.$eval("#user-code", node => node.textContent);
    const opened = browser.waitForTarget(target => target.url().includes("/web/login/device"));
    await options.click("#open-github");
    const github = await (await opened).page();
    await github.waitForSelector("#user-code");
    await github.type("#user-code", userCode);
    await Promise.all([github.waitForNavigation(), github.click("#" + decision)]);
    await github.close();
    await options.bringToFront();
    return userCode;
};

const main = async function () {
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
    console.log("# Signing in to GitHub from the extension's options");
    const {server, flow, webUrl, apiUrl} = await startServer();
    const extensionDir = harness.testBuild();
    const browser = await puppeteer.launch(harness.launchOptions(extensionDir));
    try {
        const workerTarget = await browser.waitForTarget(target => target.type() === "service_worker");
        const worker = await workerTarget.worker();
        const extensionId = new URL(workerTarget.url()).host;
        await worker.evaluate((web, api, id) => chrome.storage.local.set({githubWeb: web, githubApi: api, githubClientId: id}),
            webUrl, apiUrl, clientId);
        const stored = () => worker.evaluate(() => chrome.storage.local.get(["githubToken", "githubTokenKind", "githubLogin"]));

        const options = await browser.newPage();
        await options.goto("chrome-extension://" + extensionId + "/options.html");
        await waitShown(options, "#signin");
        expect(true, "Signed out, the options offer to sign in with GitHub");
        expect(!(await options.$eval("#token-details", node => node.open)), "with the personal access token tucked away");

        const userCode = await signInAtGitHub(browser, options, "authorize");
        expect(/^MOCK-\d+$/.test(userCode), "Signing in shows the code GitHub issued: " + userCode);
        await waitShown(options, "#signed-in", 20000);
        expect(true, "Once authorized at GitHub, the options page signs in by itself");
        expect((await options.$eval("#login", node => node.textContent)) === " as mock-user", "naming the user signed in");
        const first = [...flow.signIns.values()][0];
        expect(first.scope === "public_repo", "The App is asked for the scope public_repo");
        expect(first.polls >= 2, "GitHub's request to slow down was heeded, polling continuing after it");
        const afterSignIn = await stored();
        expect(afterSignIn.githubToken === first.token && afterSignIn.githubTokenKind === "oauth" && afterSignIn.githubLogin === "mock-user",
            "The token is kept in the extension's storage, as one from signing in");

        // A test can't open the menu of the extension's button, but updating its item fails unless it was created
        expect(await worker.evaluate(() => new Promise(resolve => chrome.contextMenus.update("fluid-signout", {}, () => resolve(!chrome.runtime.lastError)))),
            "Signing out is offered in the menu of the extension's button");
        await options.click("#signout");
        await waitShown(options, "#signin");
        expect(!(await stored()).githubToken, "Signing out forgets the token");

        await signInAtGitHub(browser, options, "cancel");
        await options.waitForFunction(() => document.getElementById("status").textContent.includes("cancelled"), {timeout: 20000, polling: 100});
        expect(await isShown(options, "#signin"), "Cancelling at GitHub leaves the extension signed out, offering to sign in again");
        expect(!(await stored()).githubToken, "with no token kept");

        // The welcome panel, which a click of the extension's action opens until the user is signed in. A test can't
        // click the action, so the panel is opened as a page, naming the tab it would have been opened over
        const popupOf = () => worker.evaluate(() => chrome.action.getPopup({}));
        expect((await popupOf()).endsWith("popup.html"), "Signed out, a click of the extension's button opens the welcome panel");
        const site = await browser.newPage();
        await site.goto(webUrl.replace("/web", "/site/"));
        const siteTabId = await worker.evaluate(async url => (await chrome.tabs.query({url}))[0].id, webUrl.replace("/web", "/site/"));
        const panel = await browser.newPage();
        await panel.goto("chrome-extension://" + extensionId + "/popup.html?tab=" + siteTabId);
        await waitShown(panel, "#connect");
        expect(true, "The panel invites the user to connect their GitHub account");
        await panel.click("#connect");
        await waitShown(panel, "#user-code");
        const panelCode = await panel.$eval("#user-code", node => node.textContent);
        expect(/^MOCK-\d+$/.test(panelCode), "Connecting shows the code to enter at GitHub: " + panelCode);
        const opened = browser.waitForTarget(target => target.url().includes("/web/login/device"));
        await panel.click("#open-github");
        const github = await (await opened).page();
        await github.waitForSelector("#user-code");
        await github.type("#user-code", panelCode);
        await Promise.all([github.waitForNavigation(), github.click("#authorize")]);
        await github.close();
        await waitShown(panel, "#start", 20000);
        expect(true, "Once authorized at GitHub, the panel welcomes the user, signed in by the service worker alone");
        expect((await panel.$eval("#login", node => node.textContent)) === " as mock-user", "naming them");
        expect(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, siteTabId), "The user is returned to the tab they began from");
        expect((await popupOf()).endsWith("popup.html"), "Signed in, a click still opens the panel on a page with no recognised provenance");
        expect(await panel.$eval("#start", node => node.disabled), "On a page which isn't editable, Edit this page is disabled");
        expect((await panel.$eval("#start-holder", node => node.title)).includes("isn't editable"), "with a tooltip saying why");
        expect(await isShown(panel, "#signout"), "The panel offers to sign out");
        await site.close();
        await options.bringToFront();
        await waitShown(options, "#signout");
        await options.click("#signout");
        await waitShown(options, "#signin");
        expect((await popupOf()).endsWith("popup.html"), "Signing out restores the welcome panel");

        await worker.evaluate(() => chrome.storage.local.set({githubClientId: ""}));
        await options.reload();
        await options.waitForFunction(() => document.getElementById("token-details").open, {timeout: 10000, polling: 100});
        expect(!(await isShown(options, "#signin")), "Without a client id, signing in is not offered");
        expect(true, "and the personal access token is offered instead");
        await options.type("#token", "github_pat_mock");
        await options.click("#save");
        await waitShown(options, "#signed-in");
        const afterToken = await stored();
        expect(afterToken.githubToken === "github_pat_mock" && afterToken.githubTokenKind === "token", "A token given is kept as such");
        expect((await options.$eval("#login", node => node.textContent)) === " by a personal access token", "and shown so");
    } catch (error) {
        failures.push("Scenario threw: " + (error.stack || error));
        console.log("not ok - scenario threw: " + (error.stack || error));
    } finally {
        await browser.close();
        fs.rmSync(extensionDir, {recursive: true, force: true});
        await new Promise(resolve => server.close(resolve));
    }
    console.log(`# ${passed} passed, ${failures.length} failed`);
    process.exitCode = failures.length > 0 ? 1 : 0;
};

main();
