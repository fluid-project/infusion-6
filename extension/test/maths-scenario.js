"use strict";

// Scenario: maths typed into a post is shown typeset as it is typed - against a mock GitHub hosting the test site (see
// mock-github.js), built with no switch of KaTeX's, so that its pages, holding no maths, link no stylesheet of KaTeX's:
//  1. Maths is typed into the post's source, inline and displayed - the page shows it typeset by the site's markdown
//     pipeline, which typesets maths with KaTeX as the build does (see `maths` in wend's js/markdown.js)
//  2. The editor links the stylesheet of KaTeX published beside the pipeline, with its fonts, so that the maths is shown
//     as it will be published (see linkRendererStylesheets in bridge.js)
// Run with: node extension/test/maths-scenario.js

const fs = require("fs"),
    path = require("path");
const harness = require("./harness.js");

harness.scenario("Previewing maths as it is typed", async function ({mock, browser, worker, expect}) {
    const post = await harness.openPage(browser, mock, "post/2025-03-20-ui-as-code/");
    const linkedBefore = await post.evaluate(() => !!document.querySelector("link[rel=stylesheet][href*=\"katex\"]"));
    expect(!linkedBefore, "A page holding no maths links no stylesheet of KaTeX's");
    await harness.activate(worker, post);
    await post.waitForSelector(".fluid-edit-panel textarea", {timeout: 30000});

    // 1. Maths typed into the source is typeset in the page
    await harness.editSource(post, text => text.replace(/\n\n/, "\n\nInline \\\\( O(n^2) \\\\) and displayed:\n\n\\\\[ \\sum_{i=1}^{n} i \\\\]\n\n"));
    await harness.waitForState(post, "uncommitted");
    const typeset = await post.waitForFunction(() => document.querySelectorAll(".katex").length === 2 && document.querySelectorAll(".katex-display").length === 1,
        {timeout: 15000}).then(() => true, () => false);
    expect(typeset, "The maths is typeset in the page, inline and displayed");

    // 2. ... and shown with KaTeX's stylesheet and fonts
    const shown = await post.waitForFunction(() => [...document.fonts].some(font => font.family === "KaTeX_Main" && font.status === "loaded"),
        {timeout: 15000}).then(() => true, () => false);
    const styled = await post.evaluate(() => {
        const sheet = document.querySelector("link[rel=stylesheet][href*=\"katex\"]");
        const katex = document.querySelector(".katex");
        return {sheet: sheet && sheet.getAttribute("href"), font: katex && getComputedStyle(katex).fontFamily,
            mathmlHidden: !!katex && getComputedStyle(katex.querySelector(".katex-mathml")).position === "absolute"};
    });
    expect(/\/js\/fluid-markdown\/katex-[0-9a-f]+\.css$/.test(styled.sheet || "") && styled.font.startsWith("KaTeX_Main") && styled.mathmlHidden && shown,
        "The editor links KaTeX's stylesheet published beside the pipeline, whose fonts show the maths: " + JSON.stringify(styled));
    expect(post.errors.length === 0, "No errors in the page: " + post.errors.join("; "));
}, {
    // The test site switches KaTeX on for every page - here it is left to what each page holds
    prepareRepo: repoDir => {
        const file = path.join(repoDir, "wend.json");
        const descriptor = JSON.parse(fs.readFileSync(file, "utf8"));
        delete descriptor.features.katex;
        fs.writeFileSync(file, JSON.stringify(descriptor, null, 4) + "\n");
    }
});
