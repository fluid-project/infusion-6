"use strict";

// Scenario: two pages showing one claim, the one finding it published while the other never polls - the race described
// in a-scratch/reports/committed-claim-poll-race.md. Against a mock GitHub hosting the test site (packages/wend-test-site) - see mock-github.js:
//  1. On a post, the user edits the footer, which a list page open beside it shows too, marked uncommitted. The list
//     page polls only once an hour, so that it learns nothing by polling while the scenario runs
//  2. They commit from the post - the list page, not polling, still holds the claim as uncommitted
//  3. The site is rebuilt, and the post, polling, finds the claim published - dropping it, and reloading
//  4. The service worker tells the list page that the claim was removed as published, and it too reloads to the
//     published footer - rather than holding the claim, or, found gone by a poll, taking it as discarded and reverting
//     to the footer it loaded with, from before the edit
// Run with: node extension/test/publish-race-scenario.js

const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";
const listPath = "post/";
const marker = "edited in place, published while another page looked away";

harness.scenario("A page whose committed claim is published by another page reloads to the publication", async function ({mock, browser, worker, expect}) {
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 1000}));

    // 1. Edit the footer on the post, with a list page open beside it
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activateByPanel(browser, worker, post);
    await post.click(".fluid-edit-framing");
    await post.waitForSelector(`footer[data-fluid-claim-state="editable"]`, {timeout: 30000});
    await post.click("footer");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-panel textarea").value.includes("beautifulWend.footer"), {timeout: 15000});
    await harness.editSource(post, text => text.replace("</a> powered", "</a> powered, " + marker));
    await post.waitForSelector(`footer[data-fluid-claim-state="uncommitted"]`, {timeout: 15000});
    // The interval is read as a page's editing boots, so the post keeps polling every second
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 3600000}));
    const list = await harness.openPage(browser, mock, listPath);
    await list.waitForSelector(`footer[data-fluid-claim-state="uncommitted"]`, {timeout: 30000});
    expect(true, "The list page shows the post's edit of the footer, uncommitted");

    // 2. Commit from the post
    await post.bringToFront();
    await post.click(".fluid-edit-commit");
    await post.waitForSelector(`footer[data-fluid-claim-state="committed"]`, {timeout: 30000});
    expect(await list.$eval("footer", node => node.getAttribute("data-fluid-claim-state")) === "uncommitted",
        "The list page, not polling, still holds the claim as uncommitted");

    // 3. The site is rebuilt, and the post finds the claim published
    await mock.idle();
    expect(mock.runs.length === 1 && mock.runs[0].conclusion === "success", "The Action rebuilt the site: " +
        JSON.stringify(mock.runs.map(run => [run.conclusion, run.error && run.error.substring(0, 300)])));
    for (let i = 0; i < 100 && (await harness.claims(worker)).length > 0; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect((await harness.claims(worker)).length === 0, "The post, polling first, finds the claim published and drops it");
    await post.waitForFunction(marker => !document.querySelector("footer[data-fluid-claim-state]") &&
        document.querySelector("footer").textContent.includes(marker), {timeout: 30000}, marker);
    expect(true, "The post reloads to the published footer, unmarked");

    // 4. Told by the service worker, the list page reloads too - well within its poll of an hour
    await list.waitForFunction(marker => !document.querySelector("footer[data-fluid-claim-state]") &&
        document.querySelector("footer").textContent.includes(marker), {timeout: 30000}, marker);
    expect(true, "The list page, told that the claim was published, reloads to the published footer too");
    expect(post.errors.length === 0 && list.errors.length === 0, "No errors in the pages: " + [...post.errors, ...list.errors].join("; "));
});
