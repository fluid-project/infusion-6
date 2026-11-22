/* eslint-env node */
"use strict";

// Scenario: claims of several files, committed as one changeset through the Git Data API - step 1 of
// a-scratch/reports/images-in-place.md. Against a mock GitHub hosting ponder - see mock-github.js:
//  1. A post is edited to show an image, held in its claim as a further file, in static/img - committing makes one
//     commit of both, and the Action publishes the image
//  2. The post's page, polling the published trace, finds both published - the post's text in `sources`, the image's
//     bytes in `staticFiles` - and drops the claim
//  3. A changeset removing an image which someone else has changed meanwhile is in conflict, naming that image, and
//     commits nothing
//  4. Read afresh, it commits - removing one image and adding another, as a rename does
// The claims are made through the service worker, as the panel will make them once images can be dropped (step 2).
// Run with: node extension/test/changeset-scenario.js

const fs = require("fs"),
    path = require("path"),
    crypto = require("crypto");
const harness = require("./harness.js");
const mockGitHub = require("./mock-github.js");

const postPath = "post/2025-03-20-ui-as-code/";
const sourcePath = "content/post/2025-03-20-ui-as-code.md";
// A PNG of one transparent pixel
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";
const hashOf = bytes => "sha256-" + crypto.createHash("sha256").update(bytes).digest("hex");

/**
 * Make an uncommitted claim on the post, with further files, as the panel would
 * @param {Object} worker - The extension's service worker
 * @param {Object} mock - The mock
 * @param {Function} edit - Receives the post's text, and returns its edited text
 * @param {Object<String, ClaimFile>} files - The further files
 * @return {Promise<Claim>} The claim, stored
 */
const makeClaim = async function (worker, mock, edit, files) {
    const text = fs.readFileSync(path.join(mock.repoDir, sourcePath), "utf8");
    const edited = edit(text);
    // eslint-disable-next-line no-undef
    return worker.evaluate(claim => fluidClaims.put({...claim, id: fluidClaims.idOf(claim.repo, claim.path)}), {
        repo: "amb26/ponder", branch: "ponder-infusion", path: sourcePath, page: "/" + postPath,
        baseHash: hashOf(Buffer.from(text, "utf8")), baseSha: mockGitHub.blobSha(Buffer.from(text, "utf8")),
        text: edited, hash: hashOf(Buffer.from(edited, "utf8")), state: "uncommitted", files
    });
};

// eslint-disable-next-line no-undef
const commit = (worker, id) => worker.evaluate(id => commitClaim(id), id);

harness.scenario("Committing a claim of several files as one changeset", async function ({mock, browser, worker, expect}) {
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 1000}));
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activate(worker, post);

    // 1. A post showing a new image, committed together
    const imagePath = "static/img/ui-as-code-1.png";
    const bytes = Buffer.from(pixel, "base64");
    const claim = await makeClaim(worker, mock, text => text.replace(/\n\n/, "\n\n![A pixel](/img/ui-as-code-1.png)\n\n"),
        {[imagePath]: {content: pixel, hash: hashOf(bytes)}});
    const committed = await commit(worker, claim.id);
    expect(committed.state === "committed", "The changeset is committed: " + JSON.stringify([committed.state, committed.message]));
    expect(mock.commits.length === 1 && JSON.stringify(mock.commits[0].paths) === JSON.stringify([sourcePath, imagePath]),
        "As one commit, of the post and its image: " + JSON.stringify(mock.commits.map(one => one.paths)));
    expect(fs.readFileSync(path.join(mock.repoDir, imagePath)).equals(bytes), "The image is in the repository, byte for byte");
    expect(/with static\/img\/ui-as-code-1\.png/.test(mock.commits[0].message), "The commit's message names the image: " + mock.commits[0].message);
    await mock.idle();
    expect(mock.runs.length === 1 && mock.runs[0].conclusion === "success", "The Action rebuilt the site: " +
        JSON.stringify(mock.runs.map(run => [run.conclusion, run.error && run.error.substring(0, 300)])));
    const trace = JSON.parse(fs.readFileSync(path.join(mock.pagesDir, "fluid-trace.json"), "utf8"));
    expect(trace.staticFiles && trace.staticFiles[imagePath] === hashOf(bytes), "The published trace records the image's hash");
    expect(fs.readFileSync(path.join(mock.pagesDir, "img/ui-as-code-1.png")).equals(bytes), "The image is published");

    // 2. The page drops the claim once both are published
    await post.reload({waitUntil: "load"});
    let remaining = null;
    for (let i = 0; i < 60 && remaining !== 0; ++i) {
        await new Promise(resolve => setTimeout(resolve, 500));
        remaining = (await harness.claims(worker)).length;
    }
    expect(remaining === 0, "The page drops the claim once the post and its image are published");

    // 3. Removing an image which someone else has changed meanwhile
    const doomed = "static/img/KCF.jpg";
    const doomedSha = mockGitHub.blobSha(fs.readFileSync(path.join(mock.repoDir, doomed)));
    const renamed = "static/img/kcf-renamed.jpg";
    const renameFiles = sha => ({
        [doomed]: {content: null, baseSha: sha, hash: null},
        [renamed]: {content: fs.readFileSync(path.join(mock.repoDir, doomed)).toString("base64"),
            hash: hashOf(fs.readFileSync(path.join(mock.repoDir, doomed)))}
    });
    const stale = await makeClaim(worker, mock, text => text + "\nRenaming an image.\n", renameFiles(doomedSha));
    fs.appendFileSync(path.join(mock.repoDir, doomed), Buffer.from([0]));
    const conflicted = await commit(worker, stale.id);
    expect(conflicted.state === "conflict" && JSON.stringify(conflicted.conflicts) === JSON.stringify([doomed]),
        "A changeset over another's change is in conflict, naming the file changed: " + JSON.stringify([conflicted.state, conflicted.conflicts]));
    expect(mock.commits.length === 1 && fs.existsSync(path.join(mock.repoDir, doomed)), "Nothing is committed");

    // 4. Read afresh, it commits, removing one image and adding the other
    const fresh = await makeClaim(worker, mock, text => text + "\nRenaming an image.\n",
        renameFiles(mockGitHub.blobSha(fs.readFileSync(path.join(mock.repoDir, doomed)))));
    const done = await commit(worker, fresh.id);
    expect(done.state === "committed" && mock.commits.length === 2 && mock.commits[1].paths.length === 3,
        "The rename is committed as one commit: " + JSON.stringify([done.state, done.message, mock.commits.map(one => one.paths)]));
    expect(!fs.existsSync(path.join(mock.repoDir, doomed)) && fs.existsSync(path.join(mock.repoDir, renamed)), "The image is renamed in the repository");
    await mock.idle();
    expect(mock.runs.length === 2 && mock.runs[1].conclusion === "success", "The Action rebuilt the site again");
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
});
