/* eslint-env node */
"use strict";

// Try the "Edit in Infusion" extension by hand, e.g. to take screenshots for its store listing, against a mock GitHub
// hosting ponder - see mock-github.js - so that no token is needed, and no commit reaches the real repository. Opens a
// visible Chromium, sized for 1280×800 screenshots, holding the extension's build for testing, on a page of the site.
// Commits go to the mock's scratch copy, and its Action rebuilds the site there. Close the browser to stop.
// Run with: node extension/test/demo.js [page path, e.g. post/2025-03-20-ui-as-code/]
// Set MOCK_GITHUB_REUSE=../ponder/docs to start from ponder's current build rather than building afresh.

const harness = require("./harness.js");
const puppeteer = require("puppeteer");

const main = async function () {
    const pagePath = process.argv[2] || "post/2025-03-20-ui-as-code/";
    console.log("Building and serving ponder through a mock GitHub ...");
    const mock = await harness.startPonder({buildDelay: 2000});
    const extensionDir = harness.testBuild();
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ["--disable-extensions-except=" + extensionDir, "--load-extension=" + extensionDir, "--window-size=1280,880"]
    });
    const worker = await (await browser.waitForTarget(target => target.type() === "service_worker")).worker();
    await worker.evaluate(apiUrl => chrome.storage.local.set({githubApi: apiUrl, githubToken: "mock-token", pollInterval: 3000}), mock.apiUrl);
    const [page] = await browser.pages();
    await page.goto(mock.url + pagePath);
    console.log("Serving " + mock.url + " - pin the extension (the puzzle-piece menu), and click its button to edit.");
    console.log("Commits are made to the mock, which rebuilds the site after each. Close the browser to stop.");
    await new Promise(resolve => browser.on("disconnected", resolve));
    await mock.stop();
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
