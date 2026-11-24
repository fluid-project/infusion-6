"use strict";

// Scenario: editing through abstractions - a user edits the framing of a page, its footer, which every page of the
// site renders from one SFC. Against a mock GitHub hosting the test site (packages/wend-test-site) - see mock-github.js:
//  1. On a post, the user activates the extension, ticks "Also edit framing", and clicks the footer
//  2. They edit the footer's source - the claim is held in IndexedDB, and the footer re-renders live, marked uncommitted
//  3. They browse to another page, one with no source of its own - the edited footer is shown there too, marked alike,
//     though the page as published is unchanged
//  4. They commit - forking the theme's footer into the site - the mock's Action rebuilds the site, and the second page, polling the published trace, drops the
//     claim and reloads, showing the published footer, unmarked
//  5. On the list page, they edit the site's configuration, wend.json, and the footer's author re-renders
//  6. On the post, they edit its content, and someone else changes the source meanwhile - committing finds the conflict
// Run with: node extension/test/framing-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";
const listPath = "post/";
// The theme's footer, which the site forks on its first edit - see `framing` in the test site's wend/editing.json
const footerPath = "wend/override/beautifulWend/sfc/beautifulWend-footer.vue";
const marker = "edited in place through its framing";

harness.scenario("Editing the framing of a page shows on every page until published", async function ({mock, browser, worker, expect}) {
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 1000}));

    // 1. Activate on the post, and choose to edit its footer
    const post = await harness.openPage(browser, mock, postPath);
    const registered = () => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts().then(scripts => scripts.map(script => script.id)));
    expect((await registered()).length === 0, "Before any click, the extension is enlisted in no site");
    // Editing begins from the panel which the extension's button opens - Edit this page, enabled on a page of the site
    await harness.activateByPanel(browser, worker, post);
    expect(true, "The panel offers to edit a page of the site, and its Edit this page opens the editor");
    expect(JSON.stringify(await registered()) === JSON.stringify(["site:http://127.0.0.1/*"]),
        "Editing enlists the site: " + JSON.stringify(await registered()));
    await post.click(".fluid-edit-framing");
    await post.waitForSelector(`footer[data-fluid-claim-state="editable"]`, {timeout: 30000});
    expect(true, "Editing the framing marks the post's footer as editable");
    await post.click("footer");
    await post.waitForSelector(`footer[data-fluid-claim-state="editing"]`, {timeout: 15000});
    await post.waitForFunction(() => document.querySelector(".fluid-edit-panel textarea").value.includes("beautifulWend.footer"), {timeout: 15000});
    expect(true, "The panel holds the footer's SFC, read from the repository");

    // 2. Edit the footer
    await harness.editSource(post, text => text.replace("by Boz", "by Boz, " + marker));
    await post.waitForSelector(`footer[data-fluid-claim-state="uncommitted"]`, {timeout: 15000});
    const postFooter = await post.$eval("footer", node => node.textContent);
    expect(postFooter.includes(marker), "The post's footer renders the edit live");
    const claims = await harness.claims(worker);
    expect(claims.length === 1 && claims[0].path === footerPath && claims[0].state === "uncommitted",
        "One claim is held, uncommitted, on the footer's SFC: " + JSON.stringify(claims.map(claim => [claim.path, claim.state])));
    expect(mock.commits.length === 0, "Nothing is committed yet");

    // 3. Browse to a page with no source of its own - the site is enlisted, so it shows claims without a click
    const list = await harness.openPage(browser, mock, listPath);
    await list.waitForSelector(`footer[data-fluid-claim-state="uncommitted"]`, {timeout: 30000});
    const listFooter = await list.$eval("footer", node => node.textContent);
    expect(listFooter.includes(marker), "The list page shows the edited footer too");
    expect(await list.$eval("footer", node => node.getAttribute("data-fluid-claim-label")).then(label => /not yet committed/.test(label)),
        "The list page labels its footer as edited but not committed");
    const publishedList = fs.readFileSync(path.join(mock.pagesDir, listPath, "index.html"), "utf8");
    expect(!publishedList.includes(marker), "The list page as published is unchanged");

    // 4. Commit, from the post - confirmed by the user in the extension's own window - the Action rebuilds, and the
    // list page finds its edit published
    await post.bringToFront();
    // First, a script of the page itself asks for the commit, as any script of the page could - the user declines it
    browser.confirmDecision = false;
    await post.evaluate(() => document.dispatchEvent(new CustomEvent("fluid-edit-relay-request", {detail: JSON.stringify({requestId: "forged",
        type: "claim-commit", id: JSON.parse(document.getElementById("fluid-provenance").textContent).repo + ":wend/override/beautifulWend/sfc/beautifulWend-footer.vue"})})));
    for (let i = 0; i < 50 && browser.confirmations.length === 0; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(browser.confirmations.length === 1 && browser.confirmations[0].path.startsWith(footerPath) && browser.confirmations[0].diff.includes(marker),
        "A commit asked for by a script of the page is shown to the user to confirm, with its change: " + JSON.stringify(browser.confirmations));
    expect(mock.commits.length === 0, "Declined, nothing is committed");
    browser.confirmDecision = true;
    await post.click(".fluid-edit-commit");
    await post.waitForSelector(`footer[data-fluid-claim-state="committed"]`, {timeout: 15000});
    expect(browser.confirmations.length === 2, "The panel's own commit is confirmed by the user too");
    expect(mock.commits.length === 1 && mock.commits[0].path === footerPath, "One commit, of the footer's SFC");
    expect(fs.existsSync(path.join(mock.repoDir, footerPath)) &&
        !fs.readFileSync(path.join(mock.repoDir, "node_modules/@fluid-project/wend-theme-beautiful/sfc/beautifulWend-footer.vue"), "utf8").includes(marker),
    "The commit forks the theme's footer into the site, leaving the theme's own unchanged");
    await mock.idle();
    expect(mock.runs.length === 1 && mock.runs[0].conclusion === "success", "The Action rebuilt the site: " +
        JSON.stringify(mock.runs.map(run => [run.conclusion, run.error && run.error.substring(0, 300)])));
    expect(fs.readFileSync(path.join(mock.pagesDir, listPath, "index.html"), "utf8").includes(marker), "The list page is published with the edit");
    await list.bringToFront();
    await list.waitForFunction(marker => !document.querySelector("footer[data-fluid-claim-state]") &&
        document.querySelector("footer").textContent.includes(marker), {timeout: 30000}, marker);
    expect(true, "The list page reloads to the published footer, unmarked");
    expect((await harness.claims(worker)).length === 0, "The claim is dropped once published");

    // 5. An edit of the site's configuration, wend.json, re-renders what reads it - the footer's author - and is discarded
    await harness.activate(worker, list);
    expect(await list.$eval(".fluid-edit-source", node => node.hidden), "On a list, with nothing chosen to edit, no source is shown");
    expect(await list.$(".fluid-edit-list-head .fluid-edit-new-post") !== null, "The list offers + at its head, to write a new post");
    if (!await list.$eval(".fluid-edit-framing", node => node.checked)) {
        await list.click(".fluid-edit-framing");
    }
    await list.click(".fluid-edit-config");
    await list.waitForFunction(() => document.querySelector(".fluid-edit-panel textarea").value.includes("\"config\""), {timeout: 15000});
    await harness.editSource(list, text => {
        const patch = JSON.parse(text);
        patch.config.author.name = "A. Wend Author";
        return JSON.stringify(patch, null, 4) + "\n";
    });
    await list.waitForFunction(() => document.querySelector("footer").textContent.includes("A. Wend Author"), {timeout: 15000});
    expect(true, "Editing the configuration re-renders the footer's author live");
    expect((await harness.claims(worker)).some(claim => claim.path === "wend.json" && claim.state === "uncommitted"),
        "The configuration's edit is held as a claim");
    await list.click(".fluid-edit-discard");
    await list.waitForFunction(() => !document.querySelector("footer").textContent.includes("A. Wend Author"), {timeout: 15000});
    expect(true, "Discarding the configuration's edit restores the footer");

    // 6. A conflicting edit of the post's content
    await post.bringToFront();
    await post.reload({waitUntil: "load"});
    await harness.activate(worker, post);
    await harness.editSource(post, text => text.replace(/\n\n/, "\n\nAn edit made in place.\n\n"));
    await harness.waitForState(post, "uncommitted");
    const contentPath = JSON.parse(await post.$eval("#fluid-provenance", node => node.textContent)).source.path;
    const file = path.join(mock.repoDir, contentPath);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8") + "\nAn edit made by someone else.\n");
    await post.click(".fluid-edit-commit");
    await harness.waitForState(post, "conflict");
    expect(true, "Committing over another's change marks the content as in conflict");
    expect(mock.commits.length === 1, "The conflicting edit is not committed");
    expect(post.errors.length === 0 && list.errors.length === 0, "No errors in the pages: " + [...post.errors, ...list.errors].join("; "));
});
