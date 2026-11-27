"use strict";

// Scenario: the home page, and material a page shows which other sources supply. Against a mock GitHub hosting the test
// site (packages/wend-test-site), whose editing configuration is given its navbar as framing too - see mock-github.js:
//  1. The home page's own content, content/_index.md, is edited in place, as any page's own source is
//  2. Editing the framing marks what the site's configuration and other pages supply through the page's templates - the
//     site's title in its header, and the title of a post listed - with a halo and a tooltip; the navbar, fixed to the
//     top of the window, keeps its own position as it is marked
//  3. Shift-click on what the configuration supplies opens the configuration with the value selected - found by the
//     path from which the page draws it, though the configuration writes the same value elsewhere
//  4. The panel's tooltips are drawn outside the body, which contains its paint while the panel is docked, in view
//  5. Closed, the panel leaves the page unmarked - its blocks, its framing and what other sources supply
//  6. Shift-click on what another page supplies opens that page, its source shown in the editor
// Run with: node extension/test/home-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

harness.scenario("The home page, and what other sources supply to a page", async function ({mock, browser, worker, expect}) {
    const home = await harness.openPage(browser, mock, "");
    await harness.activate(worker, home);

    // 1. The home page's own content
    await home.waitForSelector("[data-fluid-block=\"editable\"]", {timeout: 30000});
    const provenance = JSON.parse(await home.$eval("#fluid-provenance", node => node.textContent));
    expect(provenance.source && provenance.source.path === "content/_index.md", "The home page records its own source: " + JSON.stringify(provenance.source));
    expect(await home.$eval("[data-fluid-block=\"editable\"]", node => node.textContent.includes("The site which the scenario tests")),
        "Its content is edited in place");

    // 2. What other sources supply, once the framing is edited
    const navPosition = () => home.$eval("nav.navbar", node => getComputedStyle(node).position);
    expect(await navPosition() === "fixed", "The navbar is fixed to the top of the window");
    await home.click(".fluid-edit-framing");
    await home.waitForSelector("[data-fluid-sourced=\"config\"]", {timeout: 15000});
    await home.waitForSelector("[data-fluid-sourced=\"page\"]", {timeout: 15000});
    const sourced = await home.$$eval("[data-fluid-sourced]", nodes => nodes.map(node => ({kind: node.getAttribute("data-fluid-sourced"),
        text: node.textContent.trim().substring(0, 40), title: node.getAttribute("title") || node.getAttribute("data-fl-title")})));
    const titled = sourced.find(one => one.kind === "config" && one.text === "wend test site");
    const listed = sourced.find(one => one.kind === "page" && one.text === "A second post" && one.title.includes("A second post"));
    const menu = sourced.find(one => one.text === "About");
    expect(titled && titled.title.includes("site configuration"), "The site's title is marked as the configuration's: " + JSON.stringify(sourced));
    expect(listed, "A post listed is marked as its page's: " + JSON.stringify(sourced));
    expect(menu && menu.kind === "config" && menu.title.endsWith("From the site configuration - shift-click to edit it there"),
        "An item of the menu, though it links to a page, is marked as the configuration's, which writes it: " + JSON.stringify(menu));
    expect(await home.$eval("nav.navbar", node => node.hasAttribute("data-fluid-framing")) && await navPosition() === "fixed",
        "The navbar, marked as framing, keeps its own position");

    // 3. Shift-click on the site's title
    const titleElement = await home.evaluateHandle(() => [...document.querySelectorAll("[data-fluid-sourced=\"config\"]")]
        .find(node => node.textContent.trim() === "wend test site"));
    await home.keyboard.down("Shift");
    await titleElement.click();
    await home.keyboard.up("Shift");
    await home.waitForFunction(() => document.querySelector(".fluid-edit-tab[aria-selected=true]")?.getAttribute("data-fluid-tab-kind") === "config" &&
        document.querySelector(".fluid-edit-panel").getAttribute("data-fluid-edit-ready") === "true", {timeout: 15000});
    await home.waitForFunction(() => {
        const view = window.fluidEditBridge.editor.controller.source.view;
        const {from, to} = view.state.selection.main;
        return view.state.sliceDoc(from, to) === "wend test site";
    }, {timeout: 5000}).catch(() => null);
    const selected = await home.evaluate(() => {
        const view = window.fluidEditBridge.editor.controller.source.view;
        const {from, to} = view.state.selection.main;
        return {text: view.state.sliceDoc(from, to), line: view.state.doc.lineAt(from).text.trim()};
    });
    expect(selected.text === "wend test site" && selected.line.startsWith("\"title\""),
        "Shift-click opens the configuration with the value selected: " + JSON.stringify(selected));

    // The author's name, written in the configuration as the site's title is, is found at its own path
    const author = await home.evaluateHandle(() => document.querySelector("footer [data-fluid-sourced=\"config\"]"));
    await home.keyboard.down("Shift");
    await author.click();
    await home.keyboard.up("Shift");
    await home.waitForFunction(() => {
        const view = window.fluidEditBridge.editor.controller.source.view;
        return view.state.doc.lineAt(view.state.selection.main.from).text.trim().startsWith("\"name\"");
    }, {timeout: 5000}).catch(() => null);
    const authorSelected = await home.evaluate(() => {
        const view = window.fluidEditBridge.editor.controller.source.view;
        const {from, to} = view.state.selection.main;
        return {text: view.state.sliceDoc(from, to), line: view.state.doc.lineAt(from).text.trim()};
    });
    expect(authorSelected.text === "wend test site" && authorSelected.line.startsWith("\"name\""),
        "A value written twice in the configuration is selected where the page draws it from: " + JSON.stringify(authorSelected));

    // 4. A tooltip of the panel, in view
    // The panel may still be rendering the tab opened above, and a control appearing beneath a pointer at rest is
    // entered only once the pointer moves, so the pointer is moved across it until the tooltip shows
    const configBox = await (await home.$(".fluid-edit-config")).boundingBox();
    let shown = null;
    for (let i = 0; i < 10 && !shown; ++i) {
        await home.mouse.move(configBox.x + 4 + i, configBox.y + configBox.height / 2);
        shown = await home.waitForSelector(".fl-tooltip-holder:not([hidden])", {timeout: 500}).catch(() => null);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    const tooltip = await home.evaluate(() => {
        const node = document.querySelector(".fl-tooltip-holder:not([hidden])");
        const rect = node.getBoundingClientRect();
        const panel = document.querySelector(".fluid-edit-panel").getBoundingClientRect();
        return {outsideBody: node.parentElement === document.documentElement, width: rect.width, left: rect.left, right: rect.right,
            top: rect.top, bottom: rect.bottom, vw: innerWidth, vh: innerHeight, panelLeft: panel.left, text: node.textContent,
            drawn: getComputedStyle(node).position === "fixed" && getComputedStyle(node).zIndex === "2147483000"};
    });
    expect(tooltip.outsideBody && tooltip.drawn && tooltip.width > 0 && tooltip.left >= 0 && tooltip.right <= tooltip.vw && tooltip.bottom <= tooltip.vh &&
        tooltip.text.startsWith("Site configuration"), "The tooltip of a control of the panel is drawn outside the body, in view: " + JSON.stringify(tooltip));

    // 5. Closing the panel
    await home.click(".fluid-edit-close");
    await home.waitForFunction(() => !document.querySelector(".fluid-block-editing") && !document.querySelector("[data-fluid-sourced]") &&
        !document.querySelector("[data-fluid-framing]"), {timeout: 10000}).catch(() => null);
    const left = await home.evaluate(() => ({editing: !!document.querySelector(".fluid-block-editing"),
        sourced: document.querySelectorAll("[data-fluid-sourced]").length, framing: document.querySelectorAll("[data-fluid-framing]").length}));
    expect(!left.editing && left.sourced === 0 && left.framing === 0, "Closed, the panel leaves the page unmarked: " + JSON.stringify(left));

    // 6. Shift-click on a post listed
    await harness.activate(worker, home);
    if (!await home.$eval(".fluid-edit-framing", node => node.checked)) {
        await home.click(".fluid-edit-framing");
    }
    await home.waitForSelector("article [data-fluid-sourced=\"page\"]", {timeout: 15000});
    const target = await home.evaluate(() => new URL(document.querySelector("article [data-fluid-sourced=\"page\"]").closest("article")
        .querySelector("a[href]").getAttribute("href"), location.href).pathname);
    await Promise.all([
        home.waitForNavigation({waitUntil: "load"}),
        (async () => {
            await home.keyboard.down("Shift");
            await home.click("article [data-fluid-sourced=\"page\"]");
            await home.keyboard.up("Shift");
        })()
    ]);
    await home.waitForSelector(".fluid-edit-panel[data-fluid-edit-ready=\"true\"]:not([hidden])", {timeout: 30000});
    const arrived = await home.evaluate(() => ({path: location.pathname, open: document.querySelector(".fluid-edit-source").open,
        source: JSON.parse(document.getElementById("fluid-provenance").textContent).source?.path}));
    expect(arrived.path === target && arrived.open && /^content\/post\//.test(arrived.source || ""),
        "Shift-click on a post listed opens its page, its source shown: " + JSON.stringify([arrived, target]));
    expect(home.errors.length === 0, "No errors in the page: " + home.errors.join("; "));
}, {
    prepareRepo: repoDir => {
        // The navbar, fixed to the top of the window, is framing too
        const editingPath = path.join(repoDir, "wend/editing.json");
        const editing = JSON.parse(fs.readFileSync(editingPath, "utf8"));
        editing.framing.splice(1, 0, {module: "beautifulWend", file: "sfc/beautifulWend-navbar.vue", layer: "beautifulWend.navbar", label: "Navigation bar"});
        fs.writeFileSync(editingPath, JSON.stringify(editing, null, 4) + "\n");
        // The author's name is the site's title too, so that the configuration writes the value twice
        const configPath = path.join(repoDir, "wend.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        config.config.author.name = config.config.title;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + "\n");
    }
});
