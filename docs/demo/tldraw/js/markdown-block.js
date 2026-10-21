"use strict";

// A block of text which is rendered as markdown, used by the "Ask me anything" panel to render the AI's responses,
// which it likes to write in markdown. The markdown is converted to HTML by snarkdown, loaded from src/lib/snarkdown.
// See https://github.com/fluid-project/infusion-6/issues/24

/* global snarkdown */

fluid.registerNamespace("fluid.demos.markdownBlock");

/**
 * A block of text, rendered as markdown or as plain text. Its view writes the rendered HTML directly into its
 * container rather than rendering a template, since a template cannot hold markup produced at run time.
 */
fluid.def("fluid.demos.markdownBlock", {
    $layers: "fluid.component",
    text: "",
    // If false, the text is rendered as it stands
    asMarkdown: true,
    view: {
        $component: {
            $layers: "fluid.viewComponent",
            renderView: "$effect:fluid.demos.markdownBlock.renderInto({self}.container, {$parent}.text, {$parent}.asMarkdown)"
        }
    }
});

// Matches the URLs which may be linked or embedded by rendered markdown
fluid.demos.markdownBlock.safeURL = /^https?:\/\//i;

/**
 * Render text as markdown. Any markup in the text is escaped first, so that only the markup produced by snarkdown from
 * markdown syntax is rendered.
 * @param {String} text - The text to be rendered
 * @return {String} The rendered HTML
 */
fluid.demos.markdownBlock.toHTML = function (text) {
    // ">" is left alone, since it marks a blockquote in markdown and is harmless once "<" is escaped
    return snarkdown(String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"));
};

/**
 * Neutralise any links and images in rendered markdown whose URLs are not http(s), e.g. `javascript:` URLs, and open
 * links in a fresh tab, so that following one does not unload the workspace
 * @param {Element} element - The element holding the rendered markdown
 */
fluid.demos.markdownBlock.sanitise = function (element) {
    element.querySelectorAll("a").forEach(link => {
        if (fluid.demos.markdownBlock.safeURL.test(link.getAttribute("href") || "")) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
        } else {
            link.removeAttribute("href");
        }
    });
    [...element.querySelectorAll("img")].filter(image => !fluid.demos.markdownBlock.safeURL.test(image.getAttribute("src") || ""))
        .forEach(image => image.remove());
};

/**
 * Render text into a container, as markdown or as plain text
 * @param {Element} container - The container into which the text is rendered
 * @param {String} text - The text to be rendered
 * @param {Boolean} asMarkdown - `true` if the text is to be rendered as markdown
 */
fluid.demos.markdownBlock.renderInto = function (container, text, asMarkdown) {
    if (asMarkdown) {
        container.innerHTML = fluid.demos.markdownBlock.toHTML(text);
        fluid.demos.markdownBlock.sanitise(container);
    } else {
        container.textContent = text;
    }
};
