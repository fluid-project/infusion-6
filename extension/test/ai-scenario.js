"use strict";

// Scenario: the "Ask me anything" panel in the editing panel - see fluid-editAskAnything.vue. Against a mock GitHub
// hosting the test site, whose static/sfc is given the counter widget of Infusion's tldraw demo - see mock-github.js.
// No model is conversed with: the replies a model would send are handed to the panel's assistant directly.
//  1. The sparkles of the panel's header disclose the panel at its foot, set off by a bar sharing the panel's height
//  2. The workspace sent to the AI holds the page's widgets and its markdown, marked with the user's cursor - after the
//     element of a widget, should the cursor stand within it
//  3. A reply creating a widget pastes it into the source at the cursor, as a block of its own, defining its layer,
//     which is held in the claim with the source; a reply deleting a widget removes its element from the source
// Run with: node extension/test/ai-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";
const counterSFC = path.join(harness.infusionDir, "demo/tldraw/sfc/fluid-demos-counter.vue");
const sentLayer = "fluid.tests.sent";
const sentSFC = `<script>
fluid.def("${sentLayer}", {
    $layers: "fluid.topLevelWidget",
    word: "Sent"
});
</script>

<template>
    <div class="sent">@{word}</div>
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

harness.scenario("Asking an AI about a page, and receiving widgets from it", async function ({mock, browser, worker, expect}) {
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activate(worker, post);
    await post.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});
    if (!await post.$eval(".fluid-edit-source", node => node.open)) {
        await post.click(".fluid-edit-source summary");
    }

    // 1. Disclose the panel
    await post.click(".fluid-edit-ai-toggle");
    await post.waitForSelector(".fluid-edit-ai.ask-anything", {timeout: 30000});
    expect(await post.$eval(".fluid-edit-ai-bar", node => !node.hidden && node.getAttribute("role") === "separator"),
        "The sparkles disclose the panel at the foot, set off by its bar: " + await post.$eval(".fluid-edit-ai-bar", node => node.outerHTML));
    expect(await post.evaluate(() => !!fluid.staticEditing.ai.assistant), "The panel's assistant is made");

    // 2. The workspace, its source marked with the cursor - placed first within a paragraph, then within a widget
    const markedAt = async function (find) {
        return post.evaluate(find => {
            const edit = window.fluidEditBridge.editor.controller;
            const at = edit.source.getText().indexOf(find) + find.length;
            edit.source.view.dispatch({selection: {anchor: at}});
            const host = fluid.staticEditing.ai.makeHost(edit);
            return host.workspaceParts()[0].body;
        }, find);
    };
    const text = await sourceOf(post);
    const paragraph = text.split("\n").find(line => line.split(/\s+/).length > 8);
    const mid = paragraph.substring(0, paragraph.indexOf(" ", Math.floor(paragraph.length / 2)));
    const inParagraph = await markedAt(mid);
    expect(inParagraph !== null && inParagraph.includes("<fluid-infusion-cursor/>") && inParagraph.replace("<fluid-infusion-cursor/>", "") === text,
        "The source is sent marked with the cursor, and otherwise as it stands");
    expect(inParagraph.indexOf("<fluid-infusion-cursor/>") === text.indexOf(mid) + mid.length, "The marker stands where the cursor does");

    const prompt = await post.evaluate(() => {
        const edit = window.fluidEditBridge.editor.controller;
        const assistant = fluid.staticEditing.ai.assistant;
        return fluid.ai.arena.systemPrompt.compose(assistant.prompt, [], fluid.staticEditing.ai.makeBridge(edit).gatherWorkspace(), fluid.staticEditing.ai.makeHost(edit));
    });
    expect(prompt.includes("built with wend") && prompt.includes("Placing widgets in the page") && prompt.includes("Content-Description: markdown") &&
        prompt.split("<fluid-infusion-cursor/>").length >= 3, "The system prompt explains the page, and holds its source marked with the cursor");

    // 3. A reply creating a widget, of a layer it defines, pastes it at the cursor
    await markedAt(mid);
    const created = await post.evaluate((layer, sfc) => {
        const ptf = fluid.ptf.encode([
            {kind: "layer", contentType: fluid.layerMimeTypes.sfc, filename: layer, body: sfc},
            {kind: "component", filename: "fresh", parts: [
                {kind: "potentia", contentType: fluid.layerMimeTypes.json, filename: "/", body: JSON.stringify({$layers: [layer], word: "From the AI"})}
            ]}
        ]);
        return fluid.staticEditing.ai.assistant.interpret(ptf, {model: "test", direction: "Make a widget here"});
    }, sentLayer, sentSFC);
    expect(created.problems.length === 0, "The reply is applied without problems: " + JSON.stringify(created.problems));
    const withSent = await sourceSatisfying(post, source => source.includes("fluid-layers=\"fluid.tests.sent\""));
    const lines = withSent.split("\n");
    const at = lines.findIndex(line => line.includes("fluid-layers=\"fluid.tests.sent\""));
    expect(at > 1 && lines[at - 1] === "" && lines[at - 2].trimEnd().endsWith(mid.trim().split(/\s+/).pop()),
        "The widget is pasted at the cursor, splitting the paragraph: " + JSON.stringify(lines.slice(at - 2, at + 3)));
    await post.waitForFunction(() => document.querySelector("[fluid-layers=\"fluid.tests.sent\"]")?.textContent.trim() === "From the AI", {timeout: 15000});
    expect(true, "The page renders the widget sent");
    let claims = [];
    for (let i = 0; i < 50 && !(claims[0] && claims[0].files && claims[0].files["static/sfc/fluid-tests-sent.vue"]); ++i) {
        await new Promise(resolve => setTimeout(resolve, 200));
        claims = await harness.claims(worker);
    }
    expect(claims[0] && claims[0].files && claims[0].files["static/sfc/fluid-tests-sent.vue"], "The widget's layer is held in the claim, to be committed with the source");

    // 4. With the cursor within the widget's element, a further widget is pasted after it, never within it
    const sentId = lines[at].match(/fluid-id="([^"]*)"/)[1];
    const inWidget = await markedAt(`fluid-id="${sentId}"`);
    const markerAt = inWidget.indexOf("<fluid-infusion-cursor/>");
    expect(markerAt > inWidget.indexOf(`fluid-id="${sentId}"`) && inWidget.substring(markerAt - 6, markerAt).includes(">"),
        "With the cursor within a widget's element, it is marked as standing after it");

    // 5. A reply deleting the widget removes its element
    const deleted = await post.evaluate(id => fluid.staticEditing.ai.assistant.interpret(fluid.ptf.encode([
        {kind: "delete", contentType: fluid.layerMimeTypes.json, filename: id, body: ""}
    ]), {model: "test", direction: "Delete it"}), sentId);
    const withoutSent = await sourceSatisfying(post, source => !source.includes(`fluid-id="${sentId}"`));
    expect(!withoutSent.includes(`fluid-id="${sentId}"`), "A reply deleting the widget removes it from the source: " + JSON.stringify(deleted));
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {
    prepareRepo: repoDir => {
        fs.mkdirSync(path.join(repoDir, "static/sfc"), {recursive: true});
        fs.copyFileSync(counterSFC, path.join(repoDir, "static/sfc/fluid-demos-counter.vue"));
    }
});
