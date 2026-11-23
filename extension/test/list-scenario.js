/* eslint-env node */
"use strict";

// Scenario: editing from a list of posts, against a mock GitHub hosting ponder - see mock-github.js:
//  1. On /post/, the user activates the extension - nothing is chosen to edit, so no source is shown, and the list
//     offers "+" at its head. The framing is not edited by default (a footer would once have been)
//  2. They choose "+", and title a new post - its path follows the title, and its claim is held, uncommitted
//  3. On reloading the list, the new post is offered at the list's head, resumable
//  4. They commit - the mock's Action rebuilds the site, the list reloads, and lists the new post
//  5. They choose a post in the list - the editor stays open on the post they navigate to
//  6. Their folding of "Edit as source" is remembered, by every panel
// Run with: node extension/test/list-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

const listPath = "post/";
const title = "A post written in place";

harness.scenario("Writing a new post from the list, and browsing with the editor open", async function ({mock, browser, worker, expect}) {
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 1000}));

    // 1. Activate on the list
    const list = await harness.openPage(browser, mock, listPath);
    await harness.activate(worker, list);
    const opened = await list.evaluate(() => ({
        path: document.querySelector(".fluid-edit-path").textContent,
        sourceHidden: document.querySelector(".fluid-edit-source").hidden,
        framing: document.querySelector(".fluid-edit-framing").checked,
        plus: !!document.querySelector(".fluid-edit-list-head .fluid-edit-new-post"),
        headBeforeFirst: document.querySelector(".fluid-edit-list-head")?.nextElementSibling?.matches("article.post-preview")
    }));
    expect(opened.path === "/post/" && opened.sourceHidden && !opened.framing, "The list's panel edits nothing until something is chosen: " +
        JSON.stringify(opened));
    expect(opened.plus && opened.headBeforeFirst, "The list offers + at its head");
    expect(await list.$("footer[data-fluid-claim-state]") === null, "The footer is not chosen for editing");

    // 2. Write a new post
    await list.click(".fluid-edit-new-post");
    await list.waitForSelector(".fluid-edit-new:not([hidden])", {timeout: 15000});
    await list.type(".fluid-edit-new-title", title);
    const slugged = /^content\/post\/\d{4}-\d{2}-\d{2}-a-post-written-in-place\.md$/;
    await list.waitForFunction(re => new RegExp(re).test(document.querySelector(".fluid-edit-path").textContent), {timeout: 15000}, slugged.source);
    await harness.editSource(list, text => text + "Its first paragraph.\n");
    await list.waitForFunction(() => document.querySelector(".fluid-edit-panel").getAttribute("data-fluid-claim-state") === "uncommitted", {timeout: 15000});
    // The paragraph's edit is stored a little after it is typed
    let claims = [];
    for (let i = 0; i < 50 && !(claims.length === 1 && claims[0].text.includes("Its first paragraph.")); ++i) {
        await new Promise(resolve => setTimeout(resolve, 200));
        claims = await harness.claims(worker);
    }
    expect(claims.length === 1 && slugged.test(claims[0].path) && !claims[0].baseSha && claims[0].text.includes("title: \"" + title + "\"") &&
        claims[0].text.includes("Its first paragraph."), "One claim, on the new post's path, titled: " + JSON.stringify(claims.map(claim => claim.path)));
    expect(await list.evaluate(() => !document.querySelector(".fluid-edit-source").hidden && document.querySelector(".fluid-edit-source").open),
        "A new post is edited as source");

    // 3. The list, reloaded, offers the new post - and the editor is still open
    await list.reload({waitUntil: "load"});
    await list.waitForSelector(".fluid-edit-pending", {timeout: 30000});
    expect((await list.$eval(".fluid-edit-pending", node => node.textContent)).includes(title), "The reloaded list offers the new post, unpublished");
    await list.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready]:not([hidden])", {timeout: 30000});
    expect(true, "The editor reopens on reloading");
    await list.click(".fluid-edit-pending");
    await list.waitForFunction(title => document.querySelector(".fluid-edit-new-title").value === title, {timeout: 15000}, title);
    expect(true, "Choosing it resumes editing it");

    // 4. Commit
    await list.click(".fluid-edit-commit");
    await list.waitForFunction(() => document.querySelector(".fluid-edit-panel").getAttribute("data-fluid-claim-state") === "committed", {timeout: 15000});
    expect(mock.commits.length === 1 && slugged.test(mock.commits[0].path), "One commit, creating the new post");
    await mock.idle();
    expect(mock.runs.length === 1 && mock.runs[0].conclusion === "success", "The Action rebuilt the site: " +
        JSON.stringify(mock.runs.map(run => [run.conclusion, run.error && run.error.substring(0, 300)])));
    expect(fs.readFileSync(path.join(mock.pagesDir, listPath, "index.html"), "utf8").includes(title), "The list is published with the new post");
    await list.waitForFunction(title => [...document.querySelectorAll("article.post-preview")].some(node => node.textContent.includes(title)) &&
        !document.querySelector(".fluid-edit-pending"), {timeout: 30000}, title);
    expect(true, "The list reloads, listing the published post");
    expect((await harness.claims(worker)).length === 0, "The claim is dropped once published");

    // 5. Browse to a post with the editor open
    await list.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready]:not([hidden])", {timeout: 30000});
    const href = await list.$eval("article.post-preview:nth-of-type(2) a", node => node.getAttribute("href"));
    await Promise.all([list.waitForNavigation({waitUntil: "load"}), list.click("article.post-preview:nth-of-type(2) a")]);
    await list.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready]:not([hidden])", {timeout: 30000});
    const onPost = await list.evaluate(() => ({
        path: document.querySelector(".fluid-edit-path").textContent,
        source: JSON.parse(document.querySelector("#fluid-provenance").textContent).source.path
    }));
    expect(onPost.path === onPost.source, "Navigating to " + href + " keeps the editor open, on the post's source: " + JSON.stringify(onPost));
    await list.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});
    expect(await list.$eval(".fluid-edit-source", node => !node.open), "The post's blocks are edited in place, the source folded away");

    // 6. Unfold the source - remembered by the panel on the next page
    await list.click(".fluid-edit-source summary");
    await list.waitForFunction(() => document.querySelector(".fluid-edit-source").open);
    // Saved through the panel's relay to the extension, so a little after the source unfolds
    let prefs = {};
    for (let tries = 0; tries < 50 && !(prefs.fluidEditPrefs && prefs.fluidEditPrefs.sourceOpen); tries++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        prefs = await worker.evaluate(() => chrome.storage.local.get("fluidEditPrefs"));
    }
    expect(prefs.fluidEditPrefs && prefs.fluidEditPrefs.sourceOpen === true, "Unfolding is saved in the extension's storage: " + JSON.stringify(prefs));
    await list.reload({waitUntil: "load"});
    await list.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready]:not([hidden])", {timeout: 30000});
    await list.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});
    expect(await list.$eval(".fluid-edit-source", node => node.open), "The next panel opens with the source unfolded");
    await list.click(".fluid-edit-close");
    expect(await list.evaluate(() => sessionStorage.getItem("fluid-edit-open") === null), "Closing the editor forgets it for the tab");
    expect(list.errors.length === 0, "No errors in the page: " + list.errors.join("; "));
});
