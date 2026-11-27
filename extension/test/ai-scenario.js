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

    // 5. A reply deleting the widget removes its element - though the source quotes it first, in a code block
    const quoted = "```html\n<div fluid-layers=\"" + sentLayer + "\" fluid-id=\"" + sentId + "\"></div>\n```\n\n";
    await post.evaluate(quoted => {
        const edit = window.fluidEditBridge.editor.controller;
        const text = edit.source.getText();
        const at = text.indexOf("\n---\n", 3) + 5;
        edit.source.view.dispatch({changes: {from: at, insert: "\n" + quoted}});
    }, quoted);
    const deleted = await post.evaluate(id => fluid.staticEditing.ai.assistant.interpret(fluid.ptf.encode([
        {kind: "delete", contentType: fluid.layerMimeTypes.json, filename: id, body: ""}
    ]), {model: "test", direction: "Delete it"}), sentId);
    const withoutSent = await sourceSatisfying(post, source => source.split(`fluid-id="${sentId}"`).length === 2);
    expect(withoutSent.includes(quoted) && withoutSent.split(`fluid-id="${sentId}"`).length === 2,
        "A reply deleting the widget removes its element from the source, not the code block quoting it: " + JSON.stringify(deleted));

    // 6. With text selected, the workspace marks it with an id, and a reply's selection part naming it replaces it
    const markSelection = find => post.evaluate(find => {
        const edit = window.fluidEditBridge.editor.controller;
        const at = edit.source.getText().indexOf(find);
        edit.source.view.dispatch({selection: {anchor: at, head: at + find.length}});
        return fluid.staticEditing.ai.makeHost(edit).workspaceParts()[0].body;
    }, find);
    const selected = await markSelection(mid);
    const selectionId = (selected.match(/<fluid-infusion-selection id="(s\d+)">/) || [])[1];
    expect(selectionId && selected.includes(`<fluid-infusion-selection id="${selectionId}">` + mid + "</fluid-infusion-selection>")
        && !selected.includes("<fluid-infusion-cursor/>"), "Selected text is sent marked as the selection, with its id");
    const send = parts => post.evaluate(parts => fluid.staticEditing.ai.assistant.interpret(fluid.ptf.encode(parts),
        {model: "test", direction: "Change the source"}), parts);
    const reply = (id, body) => send([{kind: "replace", contentType: "text/plain; charset=utf-8", filename: "r", target: "selection:" + id, body}]);
    const misnamed = await reply("s999", "Misnamed");
    expect(misnamed.problems.length === 1 && misnamed.problems[0].includes("which is not the user's selection"),
        "A selection part naming another selection is refused: " + JSON.stringify(misnamed.problems));
    const replaced = await reply(selectionId, "Replaced by the AI");
    const withReplacement = await sourceSatisfying(post, source => source.includes("Replaced by the AI"));
    expect(replaced.problems.length === 0 && withReplacement.includes("Replaced by the AI") && !withReplacement.includes(mid),
        "A reply's selection part replaces the selected text: " + JSON.stringify(replaced));

    // 7. A reply's changes to a source which has changed since it was sent are not made
    const staleId = (await markSelection("Replaced by the AI")).match(/<fluid-infusion-selection id="(s\d+)">/)[1];
    await post.evaluate(() => {
        const edit = window.fluidEditBridge.editor.controller;
        const at = edit.source.getText().indexOf("Replaced by the AI");
        edit.source.view.dispatch({changes: {from: at, to: at + 8, insert: "Altered"}});
    });
    const stale = await reply(staleId, "Should not appear");
    const afterStale = await post.evaluate(() => window.fluidEditBridge.editor.controller.source.getText());
    expect(stale.problems.length === 1 && stale.problems[0].includes("has changed since it was sent") && !afterStale.includes("Should not appear"),
        "A selection changed since it was sent is not replaced: " + JSON.stringify(stale.problems));

    // 8. A reply patching the page's source, whose SEARCH text spans the selection's marker, and replacing the selection
    // too, changes both as one edit
    const marked = await markSelection("Altered by the AI");
    const id = marked.match(/<fluid-infusion-selection id="(s\d+)">/)[1];
    const path = await post.evaluate(() => window.fluidEditBridge.editor.controller.targetPath);
    const openAt = marked.indexOf(`<fluid-infusion-selection id="${id}">`);
    const lineStart = marked.lastIndexOf("\n", openAt) + 1;
    const search = marked.substring(lineStart, marked.indexOf("</fluid-infusion-selection>", openAt) + "</fluid-infusion-selection>".length);
    const before = marked.substring(lineStart, openAt);
    const block = `<<<<<<< SEARCH\n${search}\n=======\nPATCHED ${before}<fluid-infusion-selection id="${id}">Altered by the AI</fluid-infusion-selection>\n>>>>>>> REPLACE\n`;
    const both = await send([
        {kind: "patch", contentType: "text/plain; charset=utf-8", filename: "p", target: "file:" + path, body: block},
        {kind: "replace", contentType: "text/plain; charset=utf-8", filename: "r", target: "selection:" + id, body: "Selection replaced too"}
    ]);
    const afterBoth = await sourceSatisfying(post, source => source.includes("Selection replaced too"));
    expect(both.problems.length === 0 && afterBoth.includes("PATCHED " + before + "Selection replaced too") && !afterBoth.includes("fluid-infusion"),
        "The patch and the replacement are both made, leaving no markers: " + JSON.stringify(both));
    const misfiled = await send([{kind: "patch", contentType: "text/plain", filename: "p", target: "file:elsewhere.md", body: block}]);
    expect(misfiled.problems.length === 1 && misfiled.problems[0].includes("which is not the source sent to you"),
        "A patch of a file which was not sent is refused: " + JSON.stringify(misfiled.problems));
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {
    prepareRepo: repoDir => {
        fs.mkdirSync(path.join(repoDir, "static/sfc"), {recursive: true});
        fs.copyFileSync(counterSFC, path.join(repoDir, "static/sfc/fluid-demos-counter.vue"));
    }
});
