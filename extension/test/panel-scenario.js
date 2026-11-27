"use strict";

// Scenario: the layout of the editing panel - its tabs of the sources opened, and "Ask me anything" popped out from the
// sparkles at its foot. Against a mock GitHub hosting the test site (packages/wend-test-site) - see mock-github.js:
//  1. "Ask me anything" pops out from the sparkles at the panel's foot, and is withdrawn into them - made once, its
//     conversation kept, and given again the share of the panel's height its bar last gave it
//  2. With it shown, "Site configuration" opens the site's configuration in a coloured tab of its own, and its button
//     is no longer offered - "Ask me anything" stays in view, though the configuration's source is long
//  3. Editing the footer opens its tab, spotted once it holds an edit - the panel's tabs replacing its note of what it
//     edits
//  3a. Within the footer edited in place, the selection moves the source's cursor to where it is rendered from, and
//      the source's cursor highlights the text it renders; template references typed in the source are completed, in
//      two levels - a context in scope, then its members - and a member of the footer's own
//  3b. Typed into one of two spans of the footer holding the same text, the text is written into that span's template
//      alone - placed by the range its renderer recorded, which no search of the template for the text could do
//  4. Committing closes every tab but the page's own
//  5. The titles of the panel's controls are shown as tooltips placed by Popper
// Run with: node extension/test/panel-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";
// The site's fork of the theme's footer, repeating a phrase, which only the range its renderer records can place
const forkPath = "wend/override/beautifulWend/sfc/beautifulWend-footer.vue";
const themeFooter = path.join(harness.infusionDir, "packages/wend-theme-beautiful/sfc/beautifulWend-footer.vue");

/**
 * The tabs of the panel, as `{path, kind, selected, dirty}`
 * @param {Object} page - The page
 * @return {Promise<Object[]>} The tabs
 */
const tabsOf = page => page.$$eval(".fluid-edit-tab", tabs => tabs.map(tab => ({path: tab.getAttribute("data-fluid-tab-path"),
    kind: tab.getAttribute("data-fluid-tab-kind"), selected: tab.getAttribute("aria-selected") === "true",
    dirty: !!tab.querySelector(".fluid-edit-tab-dirty"), colour: getComputedStyle(tab).backgroundColor})));

/**
 * Where "Ask me anything" is laid out - its box, and that of its conversation's input - against the window's height
 * @param {Object} page - The page
 * @return {Promise<Object>} `{vh, ai, input, bar}`, each box `{top, bottom}`, null if absent or hidden
 */
const aiBoxes = page => page.evaluate(() => {
    const box = selector => {
        const node = document.querySelector(selector);
        const rect = node && node.closest("[hidden]") === null ? node.getBoundingClientRect() : null;
        return rect && rect.height > 0 ? {top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height)} : null;
    };
    return {vh: innerHeight, ai: box(".fluid-edit-ai"), input: box(".fluid-edit-ai textarea, .fluid-edit-ai [contenteditable=true], .fluid-edit-ai input"),
        toggle: box(".fluid-edit-foot .fluid-edit-ai-toggle")};
});

const visible = (boxes, name) => !!boxes[name] && boxes[name].top >= 0 && boxes[name].bottom <= boxes.vh;

harness.scenario("The editing panel's tabs, and Ask me anything", async function ({mock, browser, worker, expect}) {
    const post = await harness.openPage(browser, mock, postPath);
    await harness.activate(worker, post);
    await post.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});
    const contentPath = JSON.parse(await post.$eval("#fluid-provenance", node => node.textContent)).source.path;

    // 1. Pop out, withdraw, and pop out again
    expect(visible(await aiBoxes(post), "toggle"), "The sparkles stand at the panel's foot");
    expect(!await post.$(".fluid-edit-panel header .fluid-edit-ai-toggle"), "They are no longer in the header");
    let tabs = await tabsOf(post);
    expect(tabs.length === 1 && tabs[0].path === contentPath && tabs[0].kind === "content" && tabs[0].selected,
        "The page's own source has the one tab: " + JSON.stringify(tabs));
    await post.click(".fluid-edit-ai-toggle");
    await post.waitForSelector(".fluid-edit-ai.ask-anything", {timeout: 30000});
    await new Promise(resolve => setTimeout(resolve, 400));
    let boxes = await aiBoxes(post);
    expect(visible(boxes, "ai") && boxes.ai.bottom <= boxes.toggle.top + 1, "Ask me anything pops out above the sparkles: " + JSON.stringify(boxes));
    // Drag its bar up, giving it more of the panel
    const bar = await post.$eval(".fluid-edit-ai-bar", node => {
        const rect = node.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    });
    await post.mouse.move(bar.x, bar.y);
    await post.mouse.down();
    await post.mouse.move(bar.x, bar.y - 80, {steps: 5});
    await post.mouse.up();
    const grown = (await aiBoxes(post)).ai.height;
    expect(grown > boxes.ai.height + 40, "Its bar gives it more of the panel: " + boxes.ai.height + " -> " + grown);
    await post.evaluate(() => {
        document.querySelector(".fluid-edit-ai").setAttribute("data-test-made", "once");
    });
    // Closed just after its bar was dragged, it slides closed downwards, what edits the page growing as it slides
    const mainOf = () => post.$eval(".fluid-edit-main", node => node.getBoundingClientRect().height);
    const mainBefore = await mainOf();
    await post.click(".fluid-edit-ai-toggle");
    await new Promise(resolve => setTimeout(resolve, 110));
    const mainSliding = await mainOf();
    await post.waitForFunction(() => document.querySelector(".fluid-edit-ai").hidden, {timeout: 5000});
    expect(mainSliding > mainBefore + 20, "As it slides closed after its bar was dragged, what edits the page grows into its place: " +
        mainBefore + " -> " + mainSliding);
    expect(true, "The sparkles withdraw it");
    const mainHeight = await post.$eval(".fluid-edit-main", node => node.getBoundingClientRect().height);
    const panelHeight = await post.$eval(".fluid-edit-panel", node => node.getBoundingClientRect().height);
    expect(mainHeight > panelHeight * 0.75, "Withdrawn, what edits the page takes the panel: " + mainHeight + " of " + panelHeight);
    await post.click(".fluid-edit-ai-toggle");
    await post.waitForFunction(() => !document.querySelector(".fluid-edit-ai").hidden, {timeout: 5000});
    // Measured once it has popped out, its animation over
    await new Promise(resolve => setTimeout(resolve, 400));
    boxes = await aiBoxes(post);
    expect(Math.abs(boxes.ai.height - grown) <= 4, "Popped out again, it has the share its bar last gave it: " + grown + " -> " + boxes.ai.height);
    expect(await post.$eval(".fluid-edit-ai", node => node.getAttribute("data-test-made") === "once" && node.classList.contains("ask-anything")),
        "It is shown again as it was, not made afresh");

    // 2. The site's configuration, with Ask me anything shown
    await post.click(".fluid-edit-framing");
    await post.waitForSelector(".fluid-edit-config:not([hidden])", {timeout: 15000});
    await post.click(".fluid-edit-config");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-tab[aria-selected=true]")?.getAttribute("data-fluid-tab-kind") === "config" &&
        document.querySelector(".fluid-edit-panel").getAttribute("data-fluid-edit-ready") === "true", {timeout: 15000});
    tabs = await tabsOf(post);
    expect(tabs.length === 2 && tabs[1].kind === "config" && tabs[1].selected && tabs[0].colour !== tabs[1].colour,
        "The configuration opens in a tab of its own, coloured by its kind: " + JSON.stringify(tabs));
    expect(await post.evaluate(() => !document.querySelector(".fluid-edit-config").hidden &&
        document.activeElement && document.activeElement.getAttribute("data-fluid-tab-kind") === "config"), "Its button stays, and its tab has the focus");
    // Clicked again, with another tab shown, it shows the configuration's tab, opening no other
    await post.click(".fluid-edit-tab[data-fluid-tab-kind=\"content\"]");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-tab[aria-selected=true]")?.getAttribute("data-fluid-tab-kind") === "content", {timeout: 15000});
    await post.click(".fluid-edit-config");
    await post.waitForFunction(() => document.activeElement?.getAttribute("data-fluid-tab-kind") === "config" &&
        document.querySelector(".fluid-edit-tab[aria-selected=true]")?.getAttribute("data-fluid-tab-kind") === "config", {timeout: 15000});
    expect((await tabsOf(post)).length === 2, "Clicked again, it shows and focuses the configuration's tab, opening no other");
    await new Promise(resolve => setTimeout(resolve, 500));
    boxes = await aiBoxes(post);
    expect(visible(boxes, "ai") && boxes.ai.height > 150, "Ask me anything stays in view, beneath the configuration's long source: " + JSON.stringify(boxes));
    expect(await post.evaluate(() => {
        const scroller = document.querySelector(".fluid-edit-source-view .cm-scroller");
        return scroller.scrollHeight > scroller.clientHeight;
    }), "The editor shrinks to show a scrollbar of its own instead");
    const buttonsInView = () => post.evaluate(() => {
        const button = document.querySelector(".fluid-edit-commit").getBoundingClientRect();
        const main = document.querySelector(".fluid-edit-main");
        const bar = document.querySelector(".fluid-edit-ai-bar").getBoundingClientRect();
        const editor = document.querySelector(".fluid-edit-source-view").getBoundingClientRect();
        // Beneath the editor and what scrolls, directly above the bar - within the gap between the panel's rows
        return button.height > 0 && button.top >= editor.bottom - 1 && !main.contains(document.querySelector(".fluid-edit-commit"))
            && button.bottom <= bar.top && bar.top - button.bottom <= 12;
    });
    expect(await buttonsInView(), "The Commit button is in view, beneath the editor, directly above the bar");
    // The bar dragged far up shrinks the editor, never hiding the Commit button
    const high = await post.$eval(".fluid-edit-ai-bar", node => {
        const rect = node.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    });
    await post.mouse.move(high.x, high.y);
    await post.mouse.down();
    await post.mouse.move(high.x, 40, {steps: 8});
    await post.mouse.up();
    expect(await buttonsInView(), "With the bar dragged far up, the Commit button is still in view");
    const joined = await post.evaluate(() => document.querySelector(".fluid-edit-tabs").nextElementSibling.classList.contains("fluid-edit-source-host"));
    expect((await tabsOf(post)).every(tab => tab.selected === (tab.kind === "config")) && joined, "The tabs are joined to the top of the editor");

    // 3. The footer's tab, spotted once edited
    await post.click("footer");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-tab[aria-selected=true]")?.getAttribute("data-fluid-tab-kind") === "framing" &&
        document.querySelector(".fluid-edit-panel").getAttribute("data-fluid-edit-ready") === "true", {timeout: 15000});
    expect(!(await tabsOf(post)).some(tab => tab.dirty), "No tab is spotted before any edit");
    const buttonLook = () => post.$eval(".fluid-edit-commit", node => ({disabled: node.disabled,
        opacity: Number(getComputedStyle(node).opacity), cursor: getComputedStyle(node).cursor}));
    const idle = await buttonLook();
    expect(idle.disabled && idle.opacity < 0.5 && idle.cursor === "not-allowed",
        "With nothing to commit, Commit is plainly disabled: " + JSON.stringify(idle));
    await harness.editSource(post, text => text.replace("</template>", "<!-- edited in its tab -->\n</template>"));
    await post.waitForFunction(() => !!document.querySelector(".fluid-edit-tab[aria-selected=true] .fluid-edit-tab-dirty"), {timeout: 15000});
    tabs = await tabsOf(post);
    expect(tabs.length === 3 && tabs.filter(tab => tab.dirty).length === 1 && tabs[2].kind === "framing" && tabs[2].dirty,
        "The footer's tab is spotted, holding its edit: " + JSON.stringify(tabs));
    await post.waitForFunction(() => !document.querySelector(".fluid-edit-commit").disabled, {timeout: 15000});
    const ready = await buttonLook();
    expect(!ready.disabled && ready.opacity === 1 && ready.cursor === "pointer", "With an edit held, Commit is offered, with the hand: " + JSON.stringify(ready));
    // 3a. Navigating between the footer and its source
    const sourceText = () => post.$eval(".fluid-edit-panel textarea", node => node.value);
    const head = () => post.evaluate(() => window.fluidEditBridge.editor.controller.source.view.state.selection.main.head);
    let footerSource = await sourceText();
    const templateAt = footerSource.indexOf("<template>");
    await post.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector("footer"), NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.nodeValue.includes("Theme")) {
            node = walker.nextNode();
        }
        document.getSelection().collapse(node, node.nodeValue.indexOf("Theme"));
    });
    await post.waitForFunction(at => window.fluidEditBridge.editor.controller.source.view.state.selection.main.head === at, {timeout: 5000},
        footerSource.indexOf("Theme", templateAt)).catch(() => null);
    expect(await head() === footerSource.indexOf("Theme", templateAt), "A caret placed in the footer's text moves the source's cursor to where it is written: " +
        await head() + " for " + footerSource.indexOf("Theme", templateAt));
    expect(await post.evaluate(() => {
        const source = window.fluidEditBridge.editor.controller.source.getText();
        const walker = document.createTreeWalker(document.querySelector("footer"), NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.nodeValue.includes("Theme")) {
            node = walker.nextNode();
        }
        const range = fluid.staticEditing.carriedRange(node, source);
        return !!range && source.substring(range.from, range.to).includes("Theme");
    }), "It is placed by the range the renderer recorded on the text, found still valid");
    const authorAt = footerSource.indexOf("@{author.name}", templateAt);
    await post.evaluate(at => window.fluidEditBridge.editor.controller.source.view.dispatch({selection: {anchor: at}}), authorAt + 4);
    await post.waitForFunction(() => CSS.highlights.has("fluid-framing-cursor"), {timeout: 5000}).catch(() => null);
    const highlighted = await post.evaluate(() => {
        const highlight = CSS.highlights.get("fluid-framing-cursor");
        return highlight ? [...highlight][0].toString() : null;
    });
    const authorName = await post.$eval("footer .copyright a", node => node.textContent.trim());
    expect(highlighted === authorName && authorName !== "", "The source's cursor within a reference highlights the text it renders: " +
        JSON.stringify([highlighted, authorName]));
    // 3b. Typing into the second of two spans holding the same text
    await post.evaluate(() => {
        const span = document.querySelectorAll("footer .dup span")[1];
        const text = span.firstChild;
        document.getSelection().collapse(text, text.nodeValue.length);
        document.execCommand("insertText", false, " again");
    });
    await post.waitForFunction(() => window.fluidEditBridge.editor.controller.source.getText().includes("Say hello again"), {timeout: 10000}).catch(() => null);
    footerSource = await sourceText();
    expect(/<span>Say hello<\/span>\s*<span>Say hello again<\/span>/.test(footerSource),
        "Text typed into the second of two spans with the same text is written into the second alone: " +
        JSON.stringify((footerSource.match(/<p class="credits dup">[^]*?<\/p>/) || [])[0]));

    // Completing a context in scope, then a member of it
    const optionsShown = () => post.$$eval(".cm-tooltip-autocomplete li", nodes => nodes.map(node => node.textContent));
    // Once shown - and a moment after, since CodeMirror takes no choice in the first moments a list is shown
    const awaitOption = label => post.waitForFunction(label => [...document.querySelectorAll(".cm-tooltip-autocomplete li")]
        .some(node => node.textContent.startsWith(label)), {timeout: 5000}, label).then(() => new Promise(resolve => setTimeout(() => resolve(true), 200)), () => false);
    await post.evaluate(at => {
        const view = window.fluidEditBridge.editor.controller.source.view;
        view.focus();
        view.dispatch({selection: {anchor: at}});
    }, footerSource.indexOf("</footer>", templateAt));
    await post.keyboard.type("@{{sit");
    expect(await awaitOption("site"), "Typing @{{ offers the contexts in scope: " + JSON.stringify(await optionsShown()));
    await post.keyboard.press("Enter");
    expect(await awaitOption("buildYear"), "Choosing one offers its members: " + JSON.stringify(await optionsShown()));
    await post.keyboard.type("buil");
    await awaitOption("buildYear");
    await post.keyboard.press("Enter");
    footerSource = await sourceText();
    expect(footerSource.split("@{{site}.buildYear}").length === 3, "The reference is completed, its braces closed: " +
        JSON.stringify(footerSource.substring(footerSource.lastIndexOf("@{{"), footerSource.lastIndexOf("@{{") + 30)));
    await post.keyboard.type(" @{au");
    expect(await awaitOption("author.name"), "Typing @{ offers the footer's own members, and theirs: " + JSON.stringify(await optionsShown()));
    await post.keyboard.press("Escape");

    const status = await post.$eval(".fluid-edit-status", node => node.textContent);
    expect(!/^Editing /.test(status), "The panel no longer notes what it edits - its tabs show it: " + status);

    // 4. Committing closes every tab but the page's own
    await post.click(".fluid-edit-commit");
    await post.waitForFunction(() => document.querySelectorAll(".fluid-edit-tab").length === 1, {timeout: 15000});
    tabs = await tabsOf(post);
    expect(tabs.length === 1 && tabs[0].path === contentPath && tabs[0].selected, "Committed, only the page's own tab is left: " + JSON.stringify(tabs));
    expect(mock.commits.length === 1, "The footer's edit is committed");

    // 5. Tooltips
    const insertDisabled = await post.$eval(".fluid-edit-widget-insert", node => node.disabled);
    expect(insertDisabled, "Insert is not offered until a widget is chosen");
    await post.hover(".fluid-edit-ai-toggle");
    const tooltip = await post.waitForSelector(".fl-tooltip-holder.fluid-edit-tooltip:not([hidden])", {timeout: 5000}).then(() => post.evaluate(() => ({
        text: document.querySelector(".fl-tooltip-holder.fluid-edit-tooltip").textContent,
        popper: !!window.Popper,
        title: document.querySelector(".fluid-edit-ai-toggle").getAttribute("title")
    })), () => null);
    expect(tooltip && tooltip.popper && tooltip.text.startsWith("Ask me anything") && tooltip.title === null,
        "Hovered, a control's title is shown as a tooltip placed by Popper, in place of the browser's: " + JSON.stringify(tooltip));
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {
    prepareRepo: repoDir => {
        const footer = fs.readFileSync(themeFooter, "utf8").replace("            </div>\n        </div>\n    </footer>",
            "                <p class=\"credits dup\"><span>Say hello</span> <span>Say hello</span></p>\n            </div>\n        </div>\n    </footer>");
        fs.mkdirSync(path.join(repoDir, path.dirname(forkPath)), {recursive: true});
        fs.writeFileSync(path.join(repoDir, forkPath), footer);
    }
});
