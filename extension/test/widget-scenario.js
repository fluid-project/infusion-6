"use strict";

// Scenario: widgets in a post - see a-scratch/reports/widgets-in-content.md. Against a mock GitHub hosting the test site, whose
// static/sfc is given the counter widget of Infusion's tldraw demo - see mock-github.js:
//  1. The block editor's toolbar offers the site's widgets; "+" inserts a counter after the block in hand, written into
//     the source as an island element, and rendered live
//  2. The user clicks the counter, and leaves it - its count is written back into its element's potentia
//  3. A widget held on the clipboard as PTF, of a layer the site lacks, is pasted after a block - it renders at once,
//     and its layer is held in the claim as a further file, static/sfc/fluid-tests-greeter.vue
//  4. Committing makes one commit of the post and the widget's layer; the site publishes both, the post rendering the
//     widgets, and the page, reloaded, restores the counter's count from its markup
// Run with: node extension/test/widget-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";
const counterSFC = path.join(harness.infusionDir, "demo/tldraw/sfc/fluid-demos-counter.vue");
const greeterLayer = "fluid.tests.greeter";
const greeterSFC = `<script>
fluid.def("${greeterLayer}", {
    $layers: "fluid.topLevelWidget",
    greeting: "Hello"
});
</script>

<template>
    <div class="greeter"><span class="greeting">@{greeting}</span></div>
</template>
`;

const sourceOf = page => page.$eval(".fluid-edit-panel textarea", node => node.value);

/**
 * Wait until the page's source satisfies a test
 * @param {Object} page - The page
 * @param {Function} test - Receives the source, and returns `true` once it is as awaited
 * @return {Promise<String>} The source
 */
const sourceSatisfying = async function (page, test) {
    let source = await sourceOf(page);
    for (let i = 0; i < 100 && !test(source); ++i) {
        await new Promise(resolve => setTimeout(resolve, 100));
        source = await sourceOf(page);
    }
    return source;
};

/**
 * Focus an editable paragraph of the post, so that the toolbar is shown over it
 * @param {Object} page - The page
 * @param {Number} nth - Which plain paragraph
 * @return {Promise<Number>} Its block's index
 */
const focusParagraph = (page, nth) => page.evaluate(nth => {
    const element = [...document.querySelectorAll("p[data-fluid-block=\"editable\"]")].filter(p => p.textContent.trim().split(/\s+/).length > 8)[nth];
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    return +element.dataset.fluidBlockIndex;
}, nth);

harness.scenario("Inserting, using, pasting and committing widgets in a post", async function ({mock, browser, worker, expect}) {
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 1000}));
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activate(worker, post);
    await post.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});

    // 1. Insert a counter from the toolbar
    await focusParagraph(post, 1);
    await post.waitForSelector(".fluid-block-toolbar:not([hidden]) .fluid-block-widgets:not([hidden])", {timeout: 15000});
    const offered = await post.$$eval(".fluid-block-widget option", options => options.map(option => option.value));
    expect(offered.includes("fluid.demos.counter"), "The toolbar offers the site's widgets: " + JSON.stringify(offered));
    await post.select(".fluid-block-widget", "fluid.demos.counter");
    await post.click(".fluid-block-toolbar [data-command=\"widget-insert\"]");
    const inserted = await sourceSatisfying(post, source => source.includes("fluid-layers=\"fluid.demos.counter\""));
    expect(inserted.split("\n").includes("<div fluid-layers=\"fluid.demos.counter\" fluid-id=\"counter-1\"></div>"),
        "The counter is written into the source as an island element of its own");
    await post.waitForSelector("[fluid-id=\"counter-1\"] .counter-button", {timeout: 15000});
    expect(true, "The counter renders live in the post");

    // 2. Use it, and leave it
    for (let i = 0; i < 3; ++i) {
        await post.click("[fluid-id=\"counter-1\"] .counter-button");
    }
    expect((await post.$eval("[fluid-id=\"counter-1\"]", node => node.textContent)).includes("Clicked 3 times"), "The counter counts");
    await focusParagraph(post, 0);
    const saved = await sourceSatisfying(post, source => source.includes("fluid-potentia"));
    const savedLine = saved.split("\n").find(line => line.includes("fluid-id=\"counter-1\""));
    expect(savedLine === `<div fluid-layers="fluid.demos.counter" fluid-id="counter-1" fluid-potentia='{"$live":{"/":{"state":{"count":3}}}}'></div>`,
        "Leaving the counter writes its count back into its element: " + savedLine);

    // 3. Paste a widget held as PTF, of a layer the site lacks
    await focusParagraph(post, 2);
    await post.evaluate((layer, sfc) => {
        const ptf = fluid.ptf.encode([
            {kind: "layer", contentType: fluid.layerMimeTypes.sfc, filename: layer, body: sfc},
            {kind: "potentia", contentType: fluid.layerMimeTypes.json, filename: "/", body: JSON.stringify({$layers: [layer], greeting: "Hello from the clipboard"})}
        ]);
        const transfer = new DataTransfer();
        transfer.setData("text/plain", ptf);
        document.activeElement.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertFromPaste", dataTransfer: transfer, bubbles: true, cancelable: true}));
    }, greeterLayer, greeterSFC);
    await post.waitForSelector("[fluid-layers=\"fluid.tests.greeter\"] .greeting", {timeout: 15000});
    expect((await post.$eval("[fluid-layers=\"fluid.tests.greeter\"] .greeting", node => node.textContent)) === "Hello from the clipboard",
        "The pasted widget renders at once, with its potentia");
    let claims = [];
    for (let i = 0; i < 50 && !(claims[0] && claims[0].files && claims[0].text.includes(greeterLayer)); ++i) {
        await new Promise(resolve => setTimeout(resolve, 200));
        claims = await harness.claims(worker);
    }
    const greeterPath = "static/sfc/fluid-tests-greeter.vue";
    expect(claims.length === 1 && claims[0].files && claims[0].files[greeterPath] && Object.keys(claims[0].files).length === 1,
        "The claim holds the widget's layer as a further file, and nothing of the site's own: " + JSON.stringify(claims.map(claim => Object.keys(claim.files || {}))));

    // 4. Commit, and find both published
    await post.click(".fluid-edit-commit");
    await harness.waitForState(post, "committed");
    expect(mock.commits.length === 1 && mock.commits[0].paths.includes(greeterPath), "One commit, of the post and the widget's layer: " +
        JSON.stringify(mock.commits.map(commit => commit.paths)));
    await mock.idle();
    expect(mock.runs.length === 1 && mock.runs[0].conclusion === "success", "The Action rebuilt the site: " +
        JSON.stringify(mock.runs.map(run => [run.conclusion, run.error && run.error.substring(0, 600)])));
    const published = fs.readFileSync(path.join(mock.pagesDir, postPath, "index.html"), "utf8");
    expect(published.includes("Hello from the clipboard"), "The post is published rendering the pasted widget");
    expect(published.includes("data-fluid-boot-page"), "The post boots Infusion, since it holds widgets");
    expect(fs.existsSync(path.join(mock.pagesDir, "sfc/fluid-tests-greeter.vue")), "The widget's layer is published");
    const provenance = JSON.parse(published.match(/<script[^>]*fluid-provenance\+json[^>]*>([^<]*)<\/script>/)[1]);
    expect(provenance.widgets.layers.some(widget => widget.layer === greeterLayer), "The pasted widget is now offered by the site: " +
        JSON.stringify(provenance.widgets));
    await post.waitForFunction(() => !document.querySelector("[data-fluid-claim-state]"), {timeout: 30000});
    await post.waitForFunction(() => document.querySelector("[fluid-id=\"counter-1\"]")?.textContent.includes("Clicked 3 times"), {timeout: 30000});
    expect(true, "The page reloads to the published post, restoring the counter's count from its markup");
    expect((await harness.claims(worker)).length === 0, "The claim is dropped once published");
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {
    prepareRepo: repoDir => {
        fs.mkdirSync(path.join(repoDir, "static/sfc"), {recursive: true});
        fs.copyFileSync(counterSFC, path.join(repoDir, "static/sfc/fluid-demos-counter.vue"));
    }
});
