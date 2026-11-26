"use strict";

// Scenario: the layout of the editing panel - its tabs of the sources opened, and "Ask me anything" popped out from the
// sparkles at its foot. Against a mock GitHub hosting the test site (packages/wend-test-site) - see mock-github.js:
//  1. "Ask me anything" pops out from the sparkles at the panel's foot, and is withdrawn into them - made once, its
//     conversation kept, and given again the share of the panel's height its bar last gave it
//  2. With it shown, "Site configuration" opens the site's configuration in a coloured tab of its own, and its button
//     is no longer offered - "Ask me anything" stays in view, though the configuration's source is long
//  3. Editing the footer opens its tab, spotted once it holds an edit - the panel's tabs replacing its note of what it
//     edits
//  4. Committing closes every tab but the page's own
// Run with: node extension/test/panel-scenario.js

const harness = require("./harness.js");

const postPath = "post/2025-03-20-ui-as-code/";

/**
 * The tabs of the panel, as `{path, kind, selected, dirty}`
 * @param {Object} page - The page
 * @return {Promise<Object[]>} The tabs
 */
const tabsOf = page => page.$$eval(".fluid-edit-tab", tabs => tabs.map(tab => ({path: tab.getAttribute("data-fluid-tab-path"),
    kind: tab.getAttribute("data-fluid-tab-kind"), selected: tab.getAttribute("aria-selected") === "true",
    dirty: !!tab.querySelector(".fluid-edit-tab-dirty"), colour: getComputedStyle(tab).color})));

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
    await post.click(".fluid-edit-ai-toggle");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-ai").hidden, {timeout: 5000});
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
    expect(await post.$eval(".fluid-edit-config", node => node.hidden), "Its button is not offered while its tab is open");
    await new Promise(resolve => setTimeout(resolve, 500));
    boxes = await aiBoxes(post);
    expect(visible(boxes, "ai") && boxes.ai.height > 150, "Ask me anything stays in view, beneath the configuration's long source: " + JSON.stringify(boxes));
    expect(await post.$eval(".fluid-edit-main", node => node.scrollHeight > node.clientHeight), "The source scrolls within what edits the page instead");

    // 3. The footer's tab, spotted once edited
    await post.click("footer");
    await post.waitForFunction(() => document.querySelector(".fluid-edit-tab[aria-selected=true]")?.getAttribute("data-fluid-tab-kind") === "framing" &&
        document.querySelector(".fluid-edit-panel").getAttribute("data-fluid-edit-ready") === "true", {timeout: 15000});
    expect(!(await tabsOf(post)).some(tab => tab.dirty), "No tab is spotted before any edit");
    await harness.editSource(post, text => text.replace("</template>", "<!-- edited in its tab -->\n</template>"));
    await post.waitForFunction(() => !!document.querySelector(".fluid-edit-tab[aria-selected=true] .fluid-edit-tab-dirty"), {timeout: 15000});
    tabs = await tabsOf(post);
    expect(tabs.length === 3 && tabs.filter(tab => tab.dirty).length === 1 && tabs[2].kind === "framing" && tabs[2].dirty,
        "The footer's tab is spotted, holding its edit: " + JSON.stringify(tabs));
    const status = await post.$eval(".fluid-edit-status", node => node.textContent);
    expect(!/^Editing /.test(status), "The panel no longer notes what it edits - its tabs show it: " + status);

    // 4. Committing closes every tab but the page's own
    await post.click(".fluid-edit-commit");
    await post.waitForFunction(() => document.querySelectorAll(".fluid-edit-tab").length === 1, {timeout: 15000});
    tabs = await tabsOf(post);
    expect(tabs.length === 1 && tabs[0].path === contentPath && tabs[0].selected, "Committed, only the page's own tab is left: " + JSON.stringify(tabs));
    expect(mock.commits.length === 1, "The footer's edit is committed");
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
});
