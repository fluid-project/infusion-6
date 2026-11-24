/* global QUnit */

"use strict";

fluid.registerNamespace("fluid.tests.markdownSerializer");

QUnit.module("fluid.markdownSerializer Tests");

/**
 * Make an element from markup, in the test's document
 * @param {String} markup - The markup of one element
 * @return {Element} The element
 */
fluid.tests.markdownSerializer.element = function (markup) {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder.firstElementChild;
};

/**
 * Render markdown as the site's pipeline renders a paragraph - enough to check the round trip of a paragraph holding
 * no markup, without a markdown renderer, which Infusion does not depend upon
 * @param {String} markdown - The markdown of one paragraph
 * @return {String} Its rendering
 */
fluid.tests.markdownSerializer.renderParagraph = markdown => markdown === "" ? "" : "<p>" + markdown + "</p>";

QUnit.test("An empty paragraph made by Enter keeps its non-breaking space, and may be edited in place", function (assert) {
    // The block editor writes the paragraph Enter makes at the end of a block as "&nbsp;" - see fluid.blockEditor.beforeInput.
    // It used to serialise to nothing, since \s matches a non-breaking space, and so failed to round trip, which left
    // it marked as edited through the source alone, and unable to be typed into
    const empty = fluid.tests.markdownSerializer.element("<p>&nbsp;</p>");
    assert.equal(fluid.markdownSerializer.block(empty), "&nbsp;", "An empty paragraph serialises to its non-breaking space");
    assert.ok(fluid.markdownSerializer.roundTrips(empty, fluid.tests.markdownSerializer.renderParagraph),
        "An empty paragraph round trips, and so is edited in place");
    const heading = fluid.tests.markdownSerializer.element("<h2>&nbsp;</h2>");
    assert.equal(fluid.markdownSerializer.block(heading), "## &nbsp;", "An empty heading serialises to its non-breaking space");
});

QUnit.test("Non-breaking spaces within text are ordinary spaces", function (assert) {
    // As the browser inserts them for spaces typed in a run, or at the end of a line - e.g. once text is typed into
    // the empty paragraph above
    const typed = fluid.tests.markdownSerializer.element("<p>Some  text </p>");
    assert.equal(fluid.markdownSerializer.block(typed), "Some text", "Non-breaking spaces within and after text are collapsed");
    const filled = fluid.tests.markdownSerializer.element("<p>Typed </p>");
    assert.equal(fluid.markdownSerializer.block(filled), "Typed", "Text typed into an empty paragraph loses its non-breaking space");
    const plain = fluid.tests.markdownSerializer.element("<p>   </p>");
    assert.equal(fluid.markdownSerializer.block(plain), "", "A paragraph of ordinary whitespace alone serialises to nothing");
});
