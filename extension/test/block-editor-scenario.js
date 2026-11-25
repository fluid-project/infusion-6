"use strict";

// Scenario: editing a post in place, block by block, never seeing a "#" - against a mock GitHub hosting the test site, see
// mock-github.js. The user activates the extension on a post, which is made editable in place, its markdown source
// folded away, and:
//  1. types at the end of a paragraph, and leaves it - the source changes in that paragraph's lines alone
//  2. selects a word of another paragraph and makes it bold with Ctrl+B
//  3. splits a paragraph with Enter - the new paragraph has the caret
//  3a. presses Enter at the end of a paragraph - the new, empty paragraph is edited in place, and may be typed into
//  4. makes a paragraph a subheading from the toolbar
//  5. unfolds the markdown source, in CodeMirror, and finds every edit there
//  6. focuses a block in the page, and its lines are highlighted in the source
//  7. places the cursor in the source, marking its block in the page, and types there, which the page renders
//  8. types a link and an image there, completing each from the site's pages and images
//  9. types links to headings, of the page as edited and of another page, completing each
// Run with: node extension/test/block-editor-scenario.js

const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";

/**
 * Find the index of the nth editable paragraph of the page's content, of those holding plain text alone
 * @param {Object} page - The page
 * @param {Number} nth - Which, counting from 0
 * @return {Promise<Number>} Its block index
 */
const plainParagraph = (page, nth) => page.evaluate(nth => {
    const candidates = [...document.querySelectorAll("p[data-fluid-block=\"editable\"]")]
        .filter(p => p.children.length === 0 && p.textContent.trim().split(/\s+/).length > 8);
    return +candidates[nth].dataset.fluidBlockIndex;
}, nth);

/**
 * Place the caret in a block - at its end, or after its first word
 * @param {Object} page - The page
 * @param {Number} index - The block's index
 * @param {String} where - "end", or "afterFirstWord"
 * @return {Promise} Resolves once placed
 */
const placeCaret = (page, index, where) => page.evaluate((index, where) => {
    const element = document.querySelector(`[data-fluid-block-index="${index}"]`);
    element.focus();
    const range = document.createRange();
    const text = element.firstChild;
    if (where === "end") {
        range.selectNodeContents(element);
        range.collapse(false);
    } else {
        const offset = text.nodeValue.indexOf(" ") + 1;
        range.setStart(text, offset);
        range.collapse(true);
    }
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
}, index, where);

const sourceOf = page => page.$eval(".fluid-edit-panel textarea", node => node.value);

/**
 * Wait until the panel's source has changed from a text, and the page has rendered it with its blocks editable again
 * @param {Object} page - The page
 * @param {String} previous - The source before
 * @return {Promise<String>} The source after
 */
const sourceChange = async function (page, previous) {
    await page.waitForFunction(previous => document.querySelector(".fluid-edit-panel textarea").value !== previous, {timeout: 15000}, previous);
    await harness.waitForState(page, "uncommitted");
    await page.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 15000});
    await new Promise(resolve => setTimeout(resolve, 300));
    return sourceOf(page);
};

/**
 * List the lines of one text which another lacks
 * @param {String} from - The one text
 * @param {String} to - The other
 * @return {String[]} The lines of `to` not in `from`
 */
const linesAdded = (from, to) => {
    const before = new Set(from.split("\n"));
    return to.split("\n").filter(line => !before.has(line));
};

harness.scenario("Editing a post in place, block by block", async function ({mock, browser, worker, expect}) {
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activate(worker, post);
    await post.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});
    const census = await post.evaluate(() => ({
        editable: document.querySelectorAll("[data-fluid-block=\"editable\"]").length,
        source: document.querySelectorAll("[data-fluid-block=\"source\"]").length,
        folded: !document.querySelector(".fluid-edit-source").open
    }));
    const sourceBlocks = await post.evaluate(() => [...document.querySelectorAll("[data-fluid-block=\"source\"]")]
        .map(node => node.tagName + ": " + node.outerHTML.substring(0, 90)));
    console.log("  blocks edited as source:\n    " + sourceBlocks.join("\n    "));
    expect(census.editable > 10 && census.editable > census.source, "Most of the post's blocks are editable in place: " + JSON.stringify(census));
    expect(census.folded, "The markdown source is folded away");
    // The panel is docked outside the page's body, set off by a resize bar, with the page scrolling in its own share
    await post.waitForSelector("html > .fl-resize-bar[role=\"separator\"]", {timeout: 15000}).then(() => null, () => null);
    const docking = await post.evaluate(() => ({
        panelParent: document.querySelector(".fluid-edit-panel").parentElement.tagName,
        mode: document.documentElement.getAttribute("fl-docking-area-mode"),
        bar: !!document.querySelector("html > .fl-resize-bar[role=\"separator\"]"),
        bodyScrolls: document.body.scrollHeight > document.body.clientHeight && getComputedStyle(document.body).overflowY === "auto",
        rootScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        bodyRight: Math.round(document.body.getBoundingClientRect().right),
        panelLeft: Math.round(document.querySelector(".fluid-edit-panel").getBoundingClientRect().left)
    }));
    expect(docking.panelParent === "HTML" && docking.mode === "right edge", "The panel is docked beside the body, outside it: " + JSON.stringify(docking));
    expect(docking.bar, "Set off by a resize bar");
    expect(docking.bodyScrolls && !docking.rootScrolls && docking.bodyRight <= docking.panelLeft,
        "The page scrolls beside its own content, the panel beside it: " + JSON.stringify(docking));
    const base = await sourceOf(post);

    // 1. Type at the end of a paragraph, and leave it
    const first = await plainParagraph(post, 0);
    await placeCaret(post, first, "end");
    await post.keyboard.type(" Typed in place.");
    await post.keyboard.press("Escape");
    const afterTyping = await sourceChange(post, base);
    const added = linesAdded(base, afterTyping);
    expect(added.length >= 1 && added.join("\n").includes("Typed in place.") && !added.join("\n").includes("#"),
        "The source changes in the paragraph's lines alone: " + JSON.stringify(added));
    expect(afterTyping.split("\n").length === base.split("\n").length, "No lines are added or lost");
    expect(await post.evaluate(() => [...document.querySelectorAll("p")].some(p => p.textContent.includes("Typed in place."))),
        "The page renders the edit from the source");

    // 1a. Type in a paragraph without leaving it - the source follows a moment after the typing pauses, the block keeps
    // the caret, and what is typed after the pause lands after what was typed before it
    const live = await plainParagraph(post, 3);
    await placeCaret(post, live, "end");
    await post.keyboard.type(" Live one");
    const afterLive = await sourceChange(post, afterTyping);
    expect(afterLive.includes(" Live one"), "What is typed reaches the source while the block is still in hand");
    expect(await post.evaluate(index => document.activeElement && document.activeElement.dataset.fluidBlockIndex === String(index), live),
        "The block keeps the focus as its source renders");
    await post.keyboard.type(" two");
    const afterLiveTwo = await sourceChange(post, afterLive);
    expect(afterLiveTwo.includes(" Live one two"), "Typing on after the pause continues at the caret: " +
        JSON.stringify(linesAdded(afterLive, afterLiveTwo)));
    await post.keyboard.press("Escape");

    // 2. Select a word of another paragraph, and make it bold
    const second = await plainParagraph(post, 1);
    const word = await post.evaluate(index => {
        const element = document.querySelector(`[data-fluid-block-index="${index}"]`);
        element.focus();
        const text = element.firstChild;
        const start = text.nodeValue.indexOf(" ") + 1;
        const end = text.nodeValue.indexOf(" ", start);
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, end);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        return text.nodeValue.substring(start, end);
    }, second);
    const toolbarShown = await post.evaluate(() => !document.querySelector(".fluid-block-toolbar").hidden);
    expect(toolbarShown, "The toolbar is shown over the block in hand");
    await post.keyboard.down("Control");
    await post.keyboard.press("b");
    await post.keyboard.up("Control");
    const afterBold = await sourceChange(post, afterLiveTwo);
    expect(afterBold.includes("**" + word + "**"), "Ctrl+B makes \"" + word + "\" bold in the source");
    expect(await post.evaluate(word => [...document.querySelectorAll("strong")].some(node => node.textContent === word), word),
        "The page renders it bold");

    // 3. Split a paragraph with Enter
    const third = await plainParagraph(post, 2);
    const paragraphs = await post.evaluate(() => document.querySelectorAll("p").length);
    await placeCaret(post, third, "afterFirstWord");
    await post.keyboard.press("Enter");
    const afterSplit = await sourceChange(post, afterBold);
    const paragraphsAfter = await post.evaluate(() => document.querySelectorAll("p").length);
    expect(paragraphsAfter === paragraphs + 1, "Enter splits the paragraph in two: " + paragraphs + " -> " + paragraphsAfter +
        "; added " + JSON.stringify(linesAdded(afterBold, afterSplit)));
    expect(afterSplit.split("\n").length >= afterBold.split("\n").length + 2, "The source gains a blank line and the new paragraph's line");
    await post.waitForFunction(index => document.activeElement && document.activeElement.dataset.fluidBlockIndex === String(index + 1),
        {timeout: 5000}, third).then(() => expect(true, "The caret moves to the new paragraph"),
        () => expect(false, "The caret moves to the new paragraph"));

    // 3a. Press Enter at the end of a paragraph - the new paragraph is empty, written in the source as "&nbsp;", and
    // must be edited in place like any other, not marked as edited through the source alone
    await placeCaret(post, third + 1, "end");
    await post.keyboard.press("Enter");
    const afterEnd = await sourceChange(post, afterSplit);
    expect(afterEnd.split("\n").includes("&nbsp;"), "Enter at the end of a paragraph adds an empty one to the source: " +
        JSON.stringify(linesAdded(afterSplit, afterEnd)));
    await post.waitForFunction(index => {
        const element = document.querySelector(`[data-fluid-block-index="${index}"]`);
        return element && element.getAttribute("data-fluid-block") === "editable" && document.activeElement === element;
    }, {timeout: 5000}, third + 2).then(() => expect(true, "The empty paragraph is edited in place, and has the caret"),
        () => expect(false, "The empty paragraph is edited in place, and has the caret"));
    await post.keyboard.type("Typed after Enter");
    await post.evaluate(() => document.activeElement.blur());
    const afterTyped = await sourceChange(post, afterEnd);
    expect(afterTyped.split("\n").includes("Typed after Enter") && !afterTyped.split("\n").includes("&nbsp;"),
        "What is typed into it replaces its \"&nbsp;\" in the source: " + JSON.stringify(linesAdded(afterEnd, afterTyped)));

    // 4. Make a paragraph a subheading from the toolbar
    const fourth = await plainParagraph(post, 3);
    const fourthText = await post.$eval(`[data-fluid-block-index="${fourth}"]`, node => node.textContent.trim());
    await placeCaret(post, fourth, "end");
    await post.select(".fluid-block-toolbar .fluid-block-kind", "h3");
    const afterKind = await sourceChange(post, afterTyped);
    expect(afterKind.split("\n").some(line => line === "### " + fourthText.replace(/\s+/g, " ")), "The paragraph is a subheading in the source: " +
        JSON.stringify(linesAdded(afterTyped, afterKind)));
    expect(await post.evaluate(text => [...document.querySelectorAll("h3")].some(node => node.textContent.replace(/\s+/g, " ").trim() ===
        text.replace(/\s+/g, " ")), fourthText),
    "The page renders it as a subheading");

    // 5. Unfold the source
    await post.click(".fluid-edit-source summary");
    const unfolded = await post.evaluate(() => document.querySelector(".fluid-edit-source").open);
    const claims = await harness.claims(worker);
    const shown = await post.evaluate(() => [...document.querySelectorAll(".cm-line")].length);
    expect(unfolded && shown > 10 && claims.length === 1 && claims[0].text === afterKind, "The unfolded source view holds every edit, as the claim does");
    // 6. The source view follows the block in hand: focusing a block in the page highlights its lines
    const fifth = await plainParagraph(post, 4);
    const fifthWords = await post.$eval(`[data-fluid-block-index="${fifth}"]`, node => node.textContent.trim().split(/\s+/).slice(0, 4).join(" "));
    await placeCaret(post, fifth, "end");
    await post.waitForFunction(words => [...document.querySelectorAll(".fluid-source-block-line")].some(line => line.textContent.includes(words)),
        {timeout: 5000}, fifthWords).then(() => expect(true, "Focusing a block highlights its lines in the source view"),
        () => expect(false, "Focusing a block highlights its lines in the source view"));

    // 7. Placing the cursor in the source marks the block in the page, and typing there renders in the page
    const beforeSource = await sourceOf(post);
    await post.evaluate(words => {
        const line = [...document.querySelectorAll(".cm-line")].find(node => node.textContent.includes(words));
        line.scrollIntoView();
    }, fifthWords);
    // The line is clicked once it has come to rest - the source view, and the page, may still be scrolling
    const lineBox = await post.evaluate(async words => {
        const measure = () => [...document.querySelectorAll(".cm-line")].find(node => node.textContent.includes(words)).getBoundingClientRect();
        let bounds = measure();
        for (let i = 0; i < 40; ++i) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const next = measure();
            const settled = next.top === bounds.top && next.left === bounds.left;
            bounds = next;
            if (settled) {
                break;
            }
        }
        return {x: bounds.left + 20, y: bounds.top + bounds.height / 2};
    }, fifthWords);
    await post.mouse.click(lineBox.x, lineBox.y);
    // The cursor's line is announced once CodeMirror has taken the click
    await new Promise(resolve => setTimeout(resolve, 500));
    await post.waitForFunction(index => document.querySelector(`[data-fluid-block-index="${index}"]`)?.hasAttribute("data-fluid-block-current"),
        {timeout: 5000}, fifth).then(() => expect(true, "The cursor in the source marks its block in the page"),
        () => expect(false, "The cursor in the source marks its block in the page"));
    await post.keyboard.press("Home");
    await post.keyboard.type("Typed in the source. ");
    const afterSourceTyping = await sourceChange(post, beforeSource);
    // Home goes to the start of the visual line, which may be one a wrapped line is broken into
    expect(afterSourceTyping.includes("Typed in the source. ") && linesAdded(beforeSource, afterSourceTyping).length === 1,
        "Typing in the source view edits the source, in one line");
    expect(await post.evaluate(() => [...document.querySelectorAll("p")].some(p => p.textContent.includes("Typed in the source."))),
        "The page renders what was typed in the source view");

    // 8. Typing a link in the source completes it from the site's pages, and an image's from its images, relatively
    const beforeLinks = await sourceOf(post);
    await post.keyboard.press("End");
    await post.keyboard.type(" See [the docs](/docs/fluid-v");
    await post.waitForSelector(".cm-tooltip-autocomplete li", {timeout: 5000});
    const offered = await post.$$eval(".cm-tooltip-autocomplete li", items => items.map(item => item.textContent));
    expect(offered.some(text => text.includes("/docs/fluid-view/")), "Pages are offered, with their titles: " + JSON.stringify(offered.slice(0, 4)));
    // CodeMirror takes no Enter as accepting a completion within its interactionDelay (75ms) of offering it
    await new Promise(resolve => setTimeout(resolve, 200));
    await post.keyboard.press("Enter");
    await post.keyboard.type(") and ![a diagram](../../img/");
    await post.waitForSelector(".cm-tooltip-autocomplete li", {timeout: 5000});
    const images = await post.$$eval(".cm-tooltip-autocomplete li", items => items.map(item => item.textContent));
    expect(images.filter(text => text.includes("../../img/")).length > 5, "Images are offered relative to the page: " +
        images.length + " " + JSON.stringify(images.slice(0, 3)));
    await new Promise(resolve => setTimeout(resolve, 200));
    await post.keyboard.press("Enter");
    await post.keyboard.type(")");
    const afterLinks = await sourceChange(post, beforeLinks);
    expect(/\[the docs\]\(\/docs\/fluid-view\/\)/.test(afterLinks), "The completed link is in the source: " +
        JSON.stringify(linesAdded(beforeLinks, afterLinks)));
    expect(/!\[a diagram\]\(<?\.\.\/\.\.\/img\/[^)]+>?\)/.test(afterLinks), "The completed image is in the source");
    await post.waitForFunction(() => [...document.querySelectorAll("a")].some(a => a.textContent === "the docs" && /\/docs\/fluid-view\/$/.test(a.href)),
        {timeout: 10000}).then(() => expect(true, "The page renders the completed link"), () => expect(false, "The page renders the completed link"));

    // 9. Typing "#" completes the headings of the page as edited - including the subheading made in step 4, which is
    // not yet published - and after another page's path, its headings
    const offeredAt = async function (text) {
        await post.keyboard.type(text);
        await post.waitForSelector(".cm-tooltip-autocomplete li", {timeout: 5000}).catch(() => null);
        const items = await post.$$eval(".cm-tooltip-autocomplete li", nodes => nodes.map(node => node.textContent));
        await post.keyboard.press("Escape");
        return items;
    };
    await post.keyboard.type(" ");
    const ownHeadings = await offeredAt("[above](#");
    expect(ownHeadings.some(text => text.includes("#ui-as-code-harbours-assumptions")), "The page's own headings are offered: " +
        JSON.stringify(ownHeadings.slice(0, 3)));
    const newWord = fourthText.toLowerCase().match(/[a-z]+/)[0];
    expect(ownHeadings.some(text => text.includes(fourthText.replace(/\s+/g, " ").substring(0, 20))),
        "The subheading made in place, unpublished, is offered too (\"" + newWord + "...\")");
    const beforeOther = await sourceOf(post);
    await post.keyboard.type(") and [there](/docs/fluid-view/#");
    await post.waitForSelector(".cm-tooltip-autocomplete li", {timeout: 5000});
    const otherHeadings = await post.$$eval(".cm-tooltip-autocomplete li", nodes => nodes.map(node => node.textContent));
    expect(otherHeadings.length > 3 && otherHeadings[0].startsWith("A first component"), "Another page's headings are offered, by title: " +
        otherHeadings.length + " " + JSON.stringify(otherHeadings.slice(0, 2)));
    await new Promise(resolve => setTimeout(resolve, 200));
    await post.keyboard.press("Enter");
    await post.keyboard.type(")");
    const afterOther = await sourceChange(post, beforeOther);
    expect(afterOther.includes("[there](/docs/fluid-view/#a-first-component)"), "Accepting one writes the whole destination");

    expect(mock.commits.length === 0, "Nothing is committed");
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
});
