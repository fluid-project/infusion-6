"use strict";

// Scenario: reviewing every edit held in this browser on committing any one - see fluidConfirm in background.js.
// Against a mock GitHub hosting the test site (packages/wend-test-site) - see mock-github.js:
//  1. Edits are held on two sources - the post the panel edits, and another post, edited in the same session
//  2. Commit, from the post's panel - the extension's window lists both, the post's own first, and committing commits
//     both, as one commit
// Run with: node extension/test/commit-review-scenario.js

const fs = require("fs"),
    path = require("path"),
    crypto = require("crypto");
const harness = require("./harness.js");
const mockGitHub = require("./mock-github.js");

const postPath = "post/2025-03-20-ui-as-code/";
const otherPath = "content/post/second.md";
const hashOf = bytes => "sha256-" + crypto.createHash("sha256").update(bytes).digest("hex");

harness.scenario("Reviewing every held edit on committing one", async function ({mock, browser, worker, expect}) {
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activate(worker, post);

    // 1. An edit of the post, through its panel, and one of another post, held as the other's page would hold it
    // Long enough that the window reviewing it must scroll
    const longEdit = Array.from({length: 120}, (unused, i) => "A line of a long edit, number " + (i + 1) + ".").join("\n");
    await harness.editSource(post, text => text.replace(/\n\n/, "\n\nAn edit of this post.\n\n" + longEdit + "\n\n"));
    await harness.waitForState(post, "uncommitted");
    const contentPath = JSON.parse(await post.$eval("#fluid-provenance", node => node.textContent)).source.path;
    const text = fs.readFileSync(path.join(mock.repoDir, otherPath), "utf8");
    const edited = text + "\nAn edit of the other post.\n";
    // eslint-disable-next-line no-undef
    await worker.evaluate(claim => fluidClaims.put({...claim, id: fluidClaims.idOf(claim.repo, claim.path)}), {
        repo: "fluid-project/wend-test-site", branch: "main", path: otherPath, page: "/post/second/",
        baseHash: hashOf(Buffer.from(text, "utf8")), baseSha: mockGitHub.blobSha(Buffer.from(text, "utf8")),
        text: edited, hash: hashOf(Buffer.from(edited, "utf8")), state: "uncommitted", updated: Date.now()
    });

    // 1a. Don't commit dismisses the window, committing nothing
    const reviewed = async count => {
        for (let i = 0; i < 100 && !(browser.confirmations.length >= count && ("dismissed" in browser.confirmations[count - 1]
            || browser.confirmations[count - 1].closed)); ++i) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return browser.confirmations[count - 1];
    };
    browser.confirmDecision = false;
    await post.click(".fluid-edit-commit");
    const declined = await reviewed(1);
    expect(declined && declined.closed && mock.commits.length === 0, "Don't commit closes the window, and nothing is committed: " +
        JSON.stringify(declined && {closed: declined.closed, after: declined.after}));

    // 1b. A request lost by the service worker, as when Chrome stops it while idle, is said to have lapsed - nothing
    // more may be chosen, and Close dismisses the window
    browser.confirmDecision = true;
    browser.confirmLapse = true;
    await post.click(".fluid-edit-commit");
    const lapsed = await reviewed(2);
    browser.confirmLapse = false;
    expect(lapsed && !lapsed.closed && lapsed.after.status.includes("lapsed") && lapsed.after.approve &&
        lapsed.after.boxes.every(disabled => disabled) && lapsed.after.decline === "Close" && lapsed.dismissed && mock.commits.length === 0,
    "Should the request have lapsed, the window says so, offers nothing more to choose, and Close dismisses it: " +
        JSON.stringify(lapsed && {closed: lapsed.closed, after: lapsed.after, dismissed: lapsed.dismissed}));

    // 2. Commit from the panel - both are reviewed, and committed together
    await post.click(".fluid-edit-commit");
    await harness.waitForState(post, "committed");
    const review = browser.confirmations[2];
    expect(browser.confirmations.length === 3 && JSON.stringify(review.paths) === JSON.stringify([contentPath, otherPath]),
        "One window reviews both edits, the post's own first: " + JSON.stringify(browser.confirmations));
    expect(review.diff.includes("An edit of this post.") && review.diff.includes("An edit of the other post."), "Each edit's change is shown");
    const layout = review.layout;
    expect(layout.claimsScroll && !layout.bodyScrolls && layout.buttonsInView,
        "The edits reviewed scroll within the window, its Commit chosen and Don't commit buttons in view beneath them: " + JSON.stringify(layout));
    expect([layout.repoFont, layout.diffFont].every(font => font.startsWith("ui-monospace") && font.includes("Liberation Mono")),
        "The repository and the diffs are shown in the shared monospaced face: " + JSON.stringify([layout.repoFont, layout.diffFont]));
    expect(mock.commits.length === 1 && JSON.stringify(mock.commits[0].paths.slice().sort()) === JSON.stringify([contentPath, otherPath].sort()),
        "Both are committed as one commit: " + JSON.stringify(mock.commits.map(one => one.paths)));
    expect(fs.readFileSync(path.join(mock.repoDir, otherPath), "utf8") === edited, "The other post is committed as edited");
    // eslint-disable-next-line no-undef
    const other = await worker.evaluate(id => fluidClaims.get(id), "fluid-project/wend-test-site:" + otherPath);
    expect(other && other.state === "committed", "The other post's claim is committed too: " + JSON.stringify(other && other.state));
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
});
