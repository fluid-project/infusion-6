"use strict";

// A site which is an overlay of another - a "soft fork" naming the wend test site as its base, a git repository - edited
// through the extension against the mock GitHub: a post it inherits is read from the base and becomes the site's own
// on its first commit, and once the base moves on, the panel offers to rebuild the site from it.
// Run with: node extension/test/inherit-scenario.js

const fs = require("fs"),
    os = require("os"),
    path = require("path");
const harness = require("./harness.js");

const baseRepo = "test/base";
const firstSha = "1111111111111111111111111111111111111111";
const laterSha = "2222222222222222222222222222222222222222";

/**
 * Make the working trees of the base at two commits - the test site, and the test site with a post added - and of the
 * site overlaying it, which names the first
 * @return {Object} `{siteDir, bases}` - the site's working tree, and its bases as the mock serves them
 */
const makeSites = function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wend-inherit-"));
    const first = path.join(dir, "base-1"), later = path.join(dir, "base-2"), siteDir = path.join(dir, "site");
    fs.cpSync(harness.testSiteDir, first, {recursive: true, filter: source => !/[/\\](node_modules|docs)$/.test(source)});
    fs.cpSync(first, later, {recursive: true});
    fs.writeFileSync(path.join(later, "content/post/later.md"), "---\ntitle: \"Added to the base later\"\ndate: 2026-11-20\n---\nNew in the base.\n");
    const write = (file, value) => {
        fs.mkdirSync(path.dirname(path.join(siteDir, file)), {recursive: true});
        fs.writeFileSync(path.join(siteDir, file), typeof(value) === "string" ? value : JSON.stringify(value, null, 4) + "\n");
    };
    write("wend.site.json", {bases: [baseRepo], exclude: ["content/post/second.md"], editing: "wend/editing.json"});
    const editing = JSON.parse(fs.readFileSync(path.join(first, "wend/editing.json"), "utf8"));
    write("wend/editing.json", {...editing, repo: "test/overlay"});
    write("wend.json", {config: {title: "An overlay of the test site"}});
    write("wend.bases.lock.json", {[baseRepo]: {branch: "main", sha: firstSha}});
    write("content/post/overlay-only.md", "---\ntitle: \"Only in the overlay\"\ndate: 2026-11-01\n---\nThis post is the overlay's own.\n");
    return {siteDir, bases: {[baseRepo]: {branch: "main", head: firstSha, versions: {[firstSha]: first, [laterSha]: later}}}};
};

const {siteDir, bases} = makeSites();
const marker = "Edited in the overlay";

harness.scenario("A site overlaying a base is edited, and rebuilt once its base moves on", async function ({mock, browser, worker, expect}) {
    const posts = fs.readdirSync(path.join(mock.pagesDir, "post"));
    expect(posts.includes("overlay-only") && posts.includes("hello") && !posts.includes("second"),
        "The site holds its own post and the base's, less the one it excludes: " + JSON.stringify(posts));

    const post = await harness.openPage(browser, mock, "post/hello/");
    const provenance = JSON.parse(await post.$eval("#fluid-provenance", node => node.textContent));
    expect(provenance.source.inherited && provenance.source.inherited.repo === baseRepo && provenance.source.inherited.sha === firstSha,
        "An inherited post's provenance names the base and the commit built: " + JSON.stringify(provenance.source));
    await harness.activateByPanel(browser, worker, post);
    await post.waitForFunction(() => document.querySelector(".fluid-edit-panel textarea").value.includes("title:"), {timeout: 15000});
    const status = await post.$eval(".fluid-edit-status", node => node.textContent);
    expect(status.includes("inherits from " + baseRepo), "The panel says the source is inherited, read from the base: " + status);
    expect(await post.$eval(".fluid-edit-bases", node => node.hidden), "No base has moved on, so no rebuild is offered");

    await harness.editSource(post, text => text.replace(/\n---\n/, "\n---\n" + marker + ". "));
    await harness.waitForState(post, "uncommitted");
    await post.click(".fluid-edit-commit");
    await harness.waitForState(post, "committed", 30000);
    const commit = mock.commits[mock.commits.length - 1];
    expect(commit && commit.paths.includes("content/post/hello.md"), "The first commit makes the site's own copy of the post: " + JSON.stringify(commit && commit.paths));
    await mock.idle();
    await post.waitForFunction(marker => !document.querySelector("[data-fluid-claim-state]") && document.body.textContent.includes(marker),
        {timeout: 30000}, marker);
    expect(true, "The edit is published, and the page reloads to it");
    const republished = JSON.parse(await post.$eval("#fluid-provenance", node => node.textContent));
    expect(!republished.source.inherited, "The post is now the site's own: " + JSON.stringify(republished.source));

    // The base's author commits a new post
    mock.bases[baseRepo].head = laterSha;
    await post.reload();
    await harness.activateByPanel(browser, worker, post);
    await post.waitForSelector(".fluid-edit-bases:not([hidden])", {timeout: 15000});
    const notice = await post.$eval(".fluid-edit-bases", node => node.textContent);
    expect(notice.includes(baseRepo + " has changed"), "The panel offers to rebuild from the base, which has moved on: " + notice.trim());
    const runs = mock.runs.length;
    await post.click(".fluid-edit-rebuild");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-bases").textContent.includes("Rebuilding"), {timeout: 15000});
    const lockCommit = mock.commits[mock.commits.length - 1];
    expect(lockCommit.paths.includes("wend.bases.lock.json") &&
        JSON.parse(fs.readFileSync(path.join(mock.repoDir, "wend.bases.lock.json"), "utf8"))[baseRepo].sha === laterSha,
    "Rebuilding commits the lock file, naming the base's new head");
    await mock.idle();
    expect(mock.runs.length === runs + 1 && mock.runs[mock.runs.length - 1].conclusion === "success", "The commit rebuilds the site");
    await post.waitForFunction(() => !document.querySelector(".fluid-edit-bases") || document.querySelector(".fluid-edit-bases").hidden ||
        !document.querySelector(".fluid-edit-bases").textContent.includes("Rebuilding"), {timeout: 30000});
    expect(fs.existsSync(path.join(mock.pagesDir, "post/later/index.html")), "The rebuilt site publishes the base's new post");
    const trace = JSON.parse(fs.readFileSync(path.join(mock.pagesDir, "fluid-trace.json"), "utf8"));
    expect(trace.bases[0].sha === laterSha, "Its trace records the base's new commit");
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {siteDir, bases});
