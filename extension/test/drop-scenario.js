"use strict";

// Scenario: widgets cut, pasted and dropped into a post, and images dropped into it. Against a mock GitHub hosting
// the test site, whose static/sfc is given the counter widget of Infusion's tldraw demo - see mock-github.js:
//  1. A counter inserted from the toolbar is cut - it is put on the clipboard as PTF, and leaves the source
//  2. Pasted back with the caret within a paragraph, it splits the paragraph there, as a block of its own
//  3. A widget dropped as a ZIP file - its layer, an image it shows, and the counter's layer defined otherwise than the
//     site does - asks before replacing the counter's layer, renders at once showing its image before it is published,
//     and holds its files in the claim. Another dropped onto it takes its place. A widget pressed on is shown selected,
//     and copying it flashes "Copied"
//  4. An image dropped into the source view is written as markdown where it fell, named for the post, and previewed. A
//     widget dropped onto a widget's element there takes its place whole
//  5. Committing makes one commit of the post and all its files, which the site publishes
// Run with: node extension/test/drop-scenario.js

const fs = require("fs"),
    path = require("path"),
    zlib = require("zlib");
const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";
const counterSFC = path.join(harness.infusionDir, "demo/tldraw/sfc/fluid-demos-counter.vue");
// A PNG of one transparent pixel, and another of one red pixel
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";
const redPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const picturedLayer = "fluid.tests.pictured";
const picturedSFC = `<script>
fluid.def("${picturedLayer}", {
    $layers: "fluid.topLevelWidget",
    caption: "A picture"
});
</script>

<template>
    <figure class="pictured"><img src="/img/zip-cat.png" alt="A cat"><figcaption>@{caption}</figcaption></figure>
</template>
`;

/**
 * Make a ZIP file, its entries deflated
 * @param {Object<String, Buffer>} files - The bytes of each file, by its path within the ZIP file
 * @return {Buffer} The ZIP file
 */
const makeZip = function (files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    Object.entries(files).forEach(([name, bytes]) => {
        const nameBytes = Buffer.from(name, "utf8");
        const deflated = zlib.deflateRawSync(bytes);
        const crc = zlib.crc32(bytes);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(deflated.length, 18);
        local.writeUInt32LE(bytes.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(deflated.length, 20);
        central.writeUInt32LE(bytes.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBytes, deflated);
        centrals.push(central, nameBytes);
        offset += 30 + nameBytes.length + deflated.length;
    });
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
};

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
 * Wait until the claim on the post satisfies a test
 * @param {Object} worker - The extension's service worker
 * @param {Function} test - Receives the claim, and returns `true` once it is as awaited
 * @return {Promise<Claim|undefined>} The claim
 */
const claimSatisfying = async function (worker, test) {
    let claims = await harness.claims(worker);
    for (let i = 0; i < 75 && !(claims[0] && test(claims[0])); ++i) {
        await new Promise(resolve => setTimeout(resolve, 200));
        claims = await harness.claims(worker);
    }
    return claims[0];
};

/**
 * Find the nth plain paragraph of the post - one of more than eight words
 * @param {Object} page - The page
 * @param {Number} nth - Which paragraph
 * @param {String} [action] - "focus" to focus it with the caret at its end
 * @return {Promise<Object>} `{index, text}` - its block's index, and its text
 */
const paragraph = (page, nth, action) => page.evaluate((nth, action) => {
    const element = [...document.querySelectorAll("p[data-fluid-block=\"editable\"]")].filter(p => p.textContent.trim().split(/\s+/).length > 8)[nth];
    if (action === "focus") {
        element.focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
    }
    return {index: +element.dataset.fluidBlockIndex, text: element.textContent};
}, nth, action);

harness.scenario("Cutting, pasting and dropping widgets and images into a post", async function ({mock, browser, worker, expect}) {
    await worker.evaluate(() => chrome.storage.local.set({pollInterval: 1000}));
    const post = await harness.openPage(browser, mock, postPath);
    const dialogs = [];
    post.on("dialog", dialog => {
        dialogs.push(dialog.message());
        dialog.accept();
    });
    await harness.activate(worker, post);
    await post.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});

    // 1. Insert a counter, and cut it
    await paragraph(post, 1, "focus");
    await post.waitForSelector(".fluid-block-toolbar:not([hidden]) .fluid-block-widgets:not([hidden])", {timeout: 15000});
    await post.select(".fluid-block-widget", "fluid.demos.counter");
    await post.click(".fluid-block-toolbar [data-command=\"widget-insert\"]");
    await post.waitForSelector("[fluid-id=\"counter-1\"] .counter-button", {timeout: 15000});
    await post.click("[fluid-id=\"counter-1\"] .counter-button");
    const cutPTF = await post.evaluate(() => {
        const button = document.querySelector("[fluid-id=\"counter-1\"] .counter-button");
        button.focus();
        const range = document.createRange();
        range.selectNode(button);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        const clipboardData = new DataTransfer();
        button.dispatchEvent(new ClipboardEvent("cut", {clipboardData, bubbles: true, cancelable: true}));
        return clipboardData.getData("text/plain");
    });
    expect(/^MIME-Version: 1\.0/.test(cutPTF) && cutPTF.includes("fluid.demos.counter"), "Cutting the counter puts it on the clipboard as PTF");
    const afterCut = await sourceSatisfying(post, source => !source.includes("counter-1"));
    expect(!afterCut.includes("fluid-layers=\"fluid.demos.counter\""), "Cutting the counter removes it from the source");

    // 2. Paste it back, the caret amid a paragraph
    const target = await post.evaluate(() => {
        const element = [...document.querySelectorAll("p[data-fluid-block=\"editable\"]")].filter(p => p.textContent.trim().split(/\s+/).length > 8)[2];
        element.focus();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        const at = node.nodeValue.indexOf(" ", Math.floor(node.nodeValue.length / 2));
        const range = document.createRange();
        range.setStart(node, at);
        range.collapse(true);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        return {head: node.nodeValue.substring(0, at).trim().split(/\s+/).slice(-2).join(" "),
            tail: node.nodeValue.substring(at).trim().split(/\s+/).slice(0, 2).join(" ")};
    });
    await post.evaluate(ptf => {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", ptf);
        document.activeElement.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertFromPaste", dataTransfer: transfer, bubbles: true, cancelable: true}));
    }, cutPTF);
    const pasted = await sourceSatisfying(post, source => source.includes("fluid-layers=\"fluid.demos.counter\""));
    const lines = pasted.split("\n");
    const islandLine = lines.findIndex(line => line.includes("fluid-layers=\"fluid.demos.counter\""));
    expect(islandLine > 1 && lines[islandLine - 1] === "" && lines[islandLine + 1] === "" &&
        lines[islandLine - 2].trimEnd().endsWith(target.head) && lines[islandLine + 2].startsWith(target.tail),
    "The pasted counter splits the paragraph at the caret: " + JSON.stringify(lines.slice(islandLine - 2, islandLine + 3)));
    expect(lines[islandLine].includes("\"count\":1"), "The pasted counter keeps its count: " + lines[islandLine]);
    await post.waitForFunction(() => document.querySelector("[fluid-layers=\"fluid.demos.counter\"]")?.textContent.includes("Clicked 1"), {timeout: 15000});
    expect(dialogs.length === 0, "Pasting a widget whose layers the site holds alike asks nothing: " + JSON.stringify(dialogs));

    // 3. Drop a widget as a ZIP file, bringing an image, and the counter's layer defined otherwise
    const otherCounter = fs.readFileSync(counterSFC, "utf8").replace(/Clicked/g, "Pressed");
    const zip = makeZip({
        "layers/fluid.tests.pictured.vue": Buffer.from(picturedSFC),
        "layers/fluid.demos.counter.vue": Buffer.from(otherCounter),
        "components/potentia.json": Buffer.from(JSON.stringify({$layers: [picturedLayer], caption: "From a ZIP"})),
        "img/zip-cat.png": Buffer.from(pixel, "base64"),
        "__MACOSX/._zip-cat.png": Buffer.from("junk")
    });
    const dropAt = (selector, name, type, content) => post.evaluate((selector, name, type, content) => {
        const element = typeof(selector) === "number" ? [...document.querySelectorAll("p[data-fluid-block=\"editable\"]")]
            .filter(p => p.textContent.trim().split(/\s+/).length > 8)[selector] : document.querySelector(selector);
        const bytes = Uint8Array.from(atob(content), char => char.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, {type}));
        const bounds = element.getBoundingClientRect();
        const init = {dataTransfer: transfer, bubbles: true, cancelable: true, clientX: bounds.left + bounds.width - 2, clientY: bounds.bottom - 4};
        element.dispatchEvent(new DragEvent("dragover", init));
        element.dispatchEvent(new DragEvent("drop", init));
    }, selector, name, type, content);
    const before = await paragraph(post, 0);
    // Dragged over a paragraph, a caret shows where the file would land, and goes once the drag leaves
    const dragCaret = await post.evaluate(() => {
        const element = [...document.querySelectorAll("p[data-fluid-block=\"editable\"]")].filter(p => p.textContent.trim().split(/\s+/).length > 8)[0];
        const transfer = new DataTransfer();
        transfer.items.add(new File(["x"], "any.zip", {type: "application/zip"}));
        // In view, since only there can a point be found in its text
        element.scrollIntoView({block: "center"});
        const bounds = element.getBoundingClientRect();
        const init = {dataTransfer: transfer, bubbles: true, cancelable: true, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + 6};
        element.dispatchEvent(new DragEvent("dragover", init));
        const caret = document.querySelector(".fluid-block-drop-caret");
        const shown = caret ? {kind: caret.getAttribute("data-fluid-drop-kind"), height: caret.getBoundingClientRect().height} : null;
        element.dispatchEvent(new DragEvent("dragleave", {...init, relatedTarget: null}));
        return {shown, gone: !document.querySelector(".fluid-block-drop-caret")};
    });
    expect(dragCaret.shown && dragCaret.shown.kind === "text" && dragCaret.shown.height > 0 && dragCaret.gone,
        "A caret shows where a file dragged over a paragraph would land, and goes once the drag leaves: " + JSON.stringify(dragCaret));
    await dropAt(0, "pictured.zip", "application/zip", zip.toString("base64"));
    await post.waitForSelector("[fluid-layers=\"fluid.tests.pictured\"] figcaption", {timeout: 15000});
    expect((await post.$eval("[fluid-layers=\"fluid.tests.pictured\"] figcaption", node => node.textContent)) === "From a ZIP",
        "The widget dropped as a ZIP file renders at once, with its potentia");
    const dropped = await sourceOf(post);
    const droppedLines = dropped.split("\n");
    const zipLine = droppedLines.findIndex(line => line.includes("fluid-layers=\"fluid.tests.pictured\""));
    expect(zipLine > 0 && droppedLines.slice(0, zipLine).join(" ").includes(before.text.trim().split(/\s+/).slice(-2).join(" ")),
        "It lands where it was dropped, at the end of the paragraph");
    expect(dialogs.length === 1 && dialogs[0].includes("fluid.demos.counter"), "Replacing the counter's layer, which the site defines otherwise, is asked first: " +
        JSON.stringify(dialogs));
    await post.waitForFunction(() => {
        const img = document.querySelector("[fluid-layers=\"fluid.tests.pictured\"] img");
        return img && img.src.startsWith("blob:") && img.complete && img.naturalWidth > 0;
    }, {timeout: 15000});
    expect(true, "The widget's image shows before it is published, from a blob: URL");

    // A ZIP file naming no widget of several layers is refused, the panel showing why as an error
    const unnamed = makeZip({
        "layers/fluid.tests.pictured.vue": Buffer.from(picturedSFC),
        "layers/fluid.demos.counter.vue": Buffer.from(otherCounter)
    });
    await dropAt(1, "unnamed.zip", "application/zip", unnamed.toString("base64"));
    await post.waitForSelector(".fluid-edit-status[data-fluid-status-kind=\"error\"]", {timeout: 15000});
    const refusal = await post.$eval(".fluid-edit-status", node => ({text: node.textContent, colour: getComputedStyle(node).color}));
    expect(refusal.text.includes("no components/potentia.json") && refusal.colour === "rgb(183, 65, 14)",
        "A ZIP file of several layers naming none is refused, shown as an error: " + JSON.stringify(refusal));
    if (process.env.EDIT_TEST_SHOT) {
        await (await post.$(".fluid-edit-panel")).screenshot({path: process.env.EDIT_TEST_SHOT});
    }
    await post.waitForFunction(() => document.querySelector("[fluid-layers=\"fluid.demos.counter\"]")?.textContent.includes("Pressed 1"), {timeout: 15000});
    expect(true, "The counter renders afresh from the layer the ZIP file brought, once its replacement is agreed");
    const zipClaim = await claimSatisfying(worker, claim => claim.files && claim.files["static/img/zip-cat.png"] && claim.text.includes(picturedLayer));
    expect(!!zipClaim && ["static/sfc/fluid-tests-pictured.vue", "static/sfc/fluid-demos-counter.vue", "static/img/zip-cat.png"]
        .every(file => zipClaim.files[file]) && Object.keys(zipClaim.files).length === 3 && !!zipClaim.files["static/sfc/fluid-demos-counter.vue"].baseSha,
    "The claim holds the widget's layers and its image, the counter's replacing the site's: " + JSON.stringify(zipClaim && Object.keys(zipClaim.files || {})));

    // Another widget dropped onto the first takes its place, rather than joining it
    const picturedSelector = "[fluid-layers=\"" + picturedLayer + "\"]";
    const picturedLines = source => source.split("\n").filter(line => line.includes("fluid-layers=\"" + picturedLayer + "\""));
    const captioned = caption => makeZip({
        "layers/fluid.tests.pictured.vue": Buffer.from(picturedSFC),
        "components/potentia.json": Buffer.from(JSON.stringify({$layers: [picturedLayer], caption})),
        "img/zip-cat.png": Buffer.from(pixel, "base64")
    });
    await dropAt(picturedSelector, "displacing.zip", "application/zip", captioned("Displacing").toString("base64"));
    const displaced = await sourceSatisfying(post, source => source.includes("Displacing"));
    expect(picturedLines(displaced).length === 1 && !displaced.includes("From a ZIP"),
        "A widget dropped onto another takes its place: " + JSON.stringify(picturedLines(displaced)));
    await post.waitForFunction(selector => document.querySelector(selector + " figcaption")?.textContent === "Displacing",
        {timeout: 15000}, picturedSelector);
    expect(true, "The displacing widget renders in its place");

    // A widget pressed on is shown selected, and copying it flashes "Copied"
    const copiedWidget = await post.evaluate(selector => {
        document.querySelector(selector).dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
        const island = document.querySelector(selector);
        const selected = island.hasAttribute("data-fluid-block-selected") && getComputedStyle(island).outlineStyle === "solid";
        document.getSelection().removeAllRanges();
        const clipboardData = new DataTransfer();
        island.dispatchEvent(new ClipboardEvent("copy", {clipboardData, bubbles: true, cancelable: true}));
        const flash = document.querySelector(".fluid-block-flash");
        return {selected, ptf: clipboardData.getData("text/plain"), flash: flash && flash.textContent};
    }, picturedSelector);
    expect(copiedWidget.selected, "A widget pressed on is shown selected");
    expect(/^MIME-Version: 1\.0/.test(copiedWidget.ptf) && copiedWidget.ptf.includes(picturedLayer) && copiedWidget.flash === "Copied",
        "Copying the selected widget puts it on the clipboard, flashing \"Copied\": " + JSON.stringify({flash: copiedWidget.flash}));
    await post.waitForFunction(() => !document.querySelector(".fluid-block-flash"), {timeout: 5000});
    expect(true, "The flash goes once it has faded");
    await post.evaluate(() => document.querySelector("p[data-fluid-block=\"editable\"]").dispatchEvent(new PointerEvent("pointerdown", {bubbles: true})));
    expect(!(await post.$(picturedSelector + "[data-fluid-block-selected]")), "Pressing elsewhere selects the widget no longer");

    // 4. Drop an image into the source view
    await post.evaluate(() => {
        const details = document.querySelector(".fluid-edit-source");
        details.open = true;
    });
    await post.waitForSelector(".fluid-edit-source-view .cm-content", {visible: true, timeout: 15000});
    await dropAt(".fluid-edit-source-view .cm-line:nth-child(6)", "image.png", "image/png", redPixel);
    const imaged = await sourceSatisfying(post, source => source.includes("ui-as-code-1.png"));
    const imageLine = imaged.split("\n").find(line => line.includes("ui-as-code-1.png"));
    expect(imageLine === "![image](../../img/ui-as-code-1.png)", "The image is written as markdown, named for the post: " + imageLine);
    await post.waitForFunction(() => [...document.querySelectorAll("img[data-fluid-preview-of]")].some(img =>
        img.getAttribute("data-fluid-preview-of").endsWith("ui-as-code-1.png") && img.complete && img.naturalWidth > 0), {timeout: 15000});
    expect(true, "The dropped image shows in the post before it is published");
    // Whatever loads it, not only an <img> - the site's service worker answers for the files held
    const loaded = await post.evaluate(async () => {
        await navigator.serviceWorker.ready;
        const url = new URL("../../img/ui-as-code-1.png", location.href).href;
        const response = await fetch(url, {cache: "no-store"});
        const bytes = new Uint8Array(await response.arrayBuffer());
        const element = document.createElement("div");
        element.style.cssText = "width: 1px; height: 1px; background-image: url(" + JSON.stringify(url) + ")";
        document.body.appendChild(element);
        // The background loads through the worker too, which the Performance API records as served
        await new Promise(resolve => setTimeout(resolve, 500));
        const entry = performance.getEntriesByName(url).find(one => one.initiatorType === "css");
        element.remove();
        return {status: response.status, png: bytes[0] === 0x89 && bytes[1] === 0x50, controlled: !!navigator.serviceWorker.controller,
            css: entry ? entry.responseStatus : null};
    });
    expect(loaded.controlled && loaded.status === 200 && loaded.png && loaded.css === 200,
        "The site's service worker serves the held image to a fetch and to a stylesheet's url() before it is published: " + JSON.stringify(loaded));
    const imageClaim = await claimSatisfying(worker, claim => claim.files && claim.files["static/img/ui-as-code-1.png"] && claim.text.includes("ui-as-code-1.png"));
    expect(!!imageClaim && Object.keys(imageClaim.files).length === 4, "The claim holds the image beside the widget's files: " +
        JSON.stringify(imageClaim && Object.keys(imageClaim.files || {})));

    // A widget dropped onto a widget's element in the source view takes its place, rather than splitting it
    const sourceIslandLine = await post.evaluate(async layer => {
        const scroller = document.querySelector(".fluid-edit-source-view .cm-scroller");
        // CodeMirror renders only the lines near its viewport, amongst spacers - the line is found, and marked to drop onto
        const find = () => [...document.querySelectorAll(".fluid-edit-source-view .cm-line")]
            .find(line => line.textContent.includes("fluid-layers=\"" + layer + "\""));
        let line = find();
        for (let top = 0; !line && top < scroller.scrollHeight; top += 200) {
            scroller.scrollTop = top;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            line = find();
        }
        if (line) {
            line.scrollIntoView({block: "center"});
            line.setAttribute("data-test-island-line", "");
        }
        return !!line;
    }, picturedLayer);
    expect(sourceIslandLine, "The widget's element shows in the source view");
    const sourceCaret = await post.evaluate(() => {
        const line = document.querySelector(".fluid-edit-source-view [data-test-island-line]");
        const transfer = new DataTransfer();
        transfer.items.add(new File(["x"], "any.zip", {type: "application/zip"}));
        const bounds = line.getBoundingClientRect();
        line.dispatchEvent(new DragEvent("dragover", {dataTransfer: transfer, bubbles: true, cancelable: true,
            clientX: bounds.left + 20, clientY: bounds.top + bounds.height / 2}));
        const caret = document.querySelector(".fluid-edit-source-drop-caret");
        return caret ? Math.abs(caret.getBoundingClientRect().top - bounds.top) < bounds.height : null;
    });
    expect(sourceCaret === true, "A caret shows where a file dragged over the source would land, on the line beneath the pointer");
    await dropAt(".fluid-edit-source-view [data-test-island-line]", "source.zip", "application/zip",
        captioned("From the source view").toString("base64"));
    const sourceDisplaced = await sourceSatisfying(post, source => source.includes("From the source view"));
    expect(picturedLines(sourceDisplaced).length === 1 && !sourceDisplaced.includes("Displacing") &&
        picturedLines(sourceDisplaced)[0].trim().startsWith("<div") && picturedLines(sourceDisplaced)[0].trim().endsWith("</div>"),
    "A widget dropped onto a widget's element in the source view takes its place whole: " + JSON.stringify(picturedLines(sourceDisplaced)));

    // 5. Commit, and find all published
    await post.click(".fluid-edit-commit");
    await harness.waitForState(post, "committed");
    // The panel's header names who last changed the post, and when, linking each to GitHub
    await post.waitForSelector(".fluid-edit-updated:not([hidden])", {timeout: 15000}).catch(() => null);
    const updated = await post.evaluate(() => ({
        pathHref: document.querySelector(".fluid-edit-path").getAttribute("href"),
        hidden: document.querySelector(".fluid-edit-updated").hidden,
        text: document.querySelector(".fluid-edit-updated").textContent.replace(/\s+/g, " ").trim(),
        by: document.querySelector(".fluid-edit-updated-by").getAttribute("href"),
        at: document.querySelector(".fluid-edit-updated-at").getAttribute("href"),
        title: document.querySelector(".fluid-edit-updated-at").getAttribute("title")
    }));
    const commitSha = mock.commits[0] && mock.commits[0].sha;
    expect(/\/blob\/main\/content\/post\/2025-03-20-ui-as-code\.md$/.test(updated.pathHref || ""), "The source's name links to it on GitHub: " + updated.pathHref);
    expect(!updated.hidden && /^Last updated by reviewer at \d{1,2}(st|nd|rd|th) [A-Z][a-z]{2} \d{4} \d{2}:\d{2}$/.test(updated.text) &&
        updated.by === "https://github.com/reviewer" && updated.at.endsWith("/commit/" + commitSha) &&
        updated.title.startsWith(commitSha.substring(0, 7) + " - "), "Who last changed the post and when, linked to their profile and the commit: " +
        JSON.stringify(updated));
    expect(mock.commits.length === 1 && ["static/img/ui-as-code-1.png", "static/img/zip-cat.png", "static/sfc/fluid-tests-pictured.vue"]
        .every(file => mock.commits[0].paths.includes(file)), "One commit, of the post and all its files: " + JSON.stringify(mock.commits.map(commit => commit.paths)));
    await mock.idle();
    expect(mock.runs.length === 1 && mock.runs[0].conclusion === "success", "The Action rebuilt the site: " +
        JSON.stringify(mock.runs.map(run => [run.conclusion, run.error && run.error.substring(0, 600)])));
    expect(fs.readFileSync(path.join(mock.pagesDir, "img/zip-cat.png")).equals(Buffer.from(pixel, "base64")) &&
        fs.readFileSync(path.join(mock.pagesDir, "img/ui-as-code-1.png")).equals(Buffer.from(redPixel, "base64")), "Both images are published");
    const published = fs.readFileSync(path.join(mock.pagesDir, postPath, "index.html"), "utf8");
    expect(published.includes("From the source view") && published.includes("ui-as-code-1.png"), "The post is published showing the widget and the image: " +
        JSON.stringify({caption: (published.match(/<figcaption[^>]*>([^<]*)/) || [])[1], widgets: (published.match(/fluid-potentia='[^']*'/g) || [])}));
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {
    prepareRepo: repoDir => {
        fs.mkdirSync(path.join(repoDir, "static/sfc"), {recursive: true});
        fs.copyFileSync(counterSFC, path.join(repoDir, "static/sfc/fluid-demos-counter.vue"));
    }
});
