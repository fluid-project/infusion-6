/* eslint-env browser, node */
"use strict";

// Serialises the DOM of one block of rendered markdown back into markdown - the inverse of the site's pipeline for the
// blocks a user may edit in place, e.g. paragraphs, headings, lists and quotations, holding emphasis, code, links and
// images. It is used only for a block the user has edited, and only for a block whose rendering it reproduces: a
// block is offered for editing in place only if the markdown it serialises to renders to what the block holds already
// (see `roundTrips`) - otherwise, e.g. for a block bearing markdown-it-attrs' `{.class}` or raw HTML, it is edited as
// source, so that editing in place never silently loses what the source said. See the block editor, fluid-blockEditor.vue.
// UMD: loaded into the page by the extension's bridge as `fluid.markdownSerializer`, and required in node by its tests.

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.fluidMarkdownSerializer = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {
    const serializer = {};

    // Tags of the blocks which may be edited in place, and serialised
    serializer.blockTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote"];

    // Classes of elements the pipeline adds, which are not the source's - e.g. the anchor by which a heading links to
    // itself - and are left out of the serialisation
    serializer.generatedClasses = ["infusion-docs-anchor"];

    /**
     * Escape text so that markdown reads it as the same text
     * @param {String} text - The text
     * @param {Boolean} atLineStart - Whether the text begins a line, where e.g. "#" or "1." would begin a block
     * @return {String} The escaped text
     */
    serializer.escapeText = function (text, atLineStart) {
        let togo = text.replace(/\\/g, "\\\\").replace(/([*_`[\]<])/g, "\\$1");
        if (atLineStart) {
            togo = togo.replace(/^(\s*)([#>+-])(?=\s)/, "$1\\$2").replace(/^(\s*)(\d+)([.)])(?=\s)/, "$1$2\\$3");
        }
        return togo;
    };

    /**
     * Determine whether a node is one the pipeline generated rather than the source held
     * @param {Node} node - The node
     * @return {Boolean} `true` if it is to be left out
     */
    serializer.isGenerated = node => node.nodeType === 1 && serializer.generatedClasses.some(cls => node.classList.contains(cls));

    /**
     * Serialise the inline content of an element
     * @param {Node} parent - The element
     * @return {String} Its content, as markdown
     */
    serializer.inline = function (parent) {
        let out = "";
        parent.childNodes.forEach(node => {
            if (node.nodeType === 3) {
                out += serializer.escapeText(node.nodeValue.replace(/\s+/g, " "), out === "" || out.endsWith("\n"));
            } else if (node.nodeType === 1 && !serializer.isGenerated(node)) {
                const tag = node.tagName.toLowerCase();
                const inner = () => serializer.inline(node);
                if (tag === "strong" || tag === "b") {
                    out += serializer.wrap("**", inner());
                } else if (tag === "em" || tag === "i") {
                    out += serializer.wrap("*", inner());
                } else if (tag === "code") {
                    const text = node.textContent;
                    const fence = text.includes("`") ? "`` " : "`";
                    out += fence + text + (fence === "`" ? "`" : " ``");
                } else if (tag === "a") {
                    const title = node.getAttribute("title");
                    out += "[" + inner() + "](" + serializer.url(node.getAttribute("href") || "") + (title ? " \"" + title.replace(/"/g, "\\\"") + "\"" : "") + ")";
                } else if (tag === "img") {
                    out += "![" + serializer.escapeText(node.getAttribute("alt") || "", false) + "](" + serializer.url(serializer.imageSource(node)) + ")";
                } else if (tag === "br") {
                    out += "\\\n";
                } else {
                    out += inner();
                }
            }
        });
        return out;
    };

    /**
     * Wrap inline markdown in a delimiter, keeping any whitespace at its ends outside it, as markdown requires
     * @param {String} delimiter - The delimiter, e.g. "**"
     * @param {String} text - The markdown
     * @return {String} The wrapped markdown, or the whitespace alone if it holds nothing else
     */
    serializer.wrap = function (delimiter, text) {
        const [, lead, body, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
        return body ? lead + delimiter + body + delimiter + trail : lead + trail;
    };

    /**
     * Render a URL as the destination of a link
     * @param {String} url - The URL
     * @return {String} The destination, bracketed if it holds spaces or parentheses
     */
    serializer.url = url => /[\s()]/.test(url) ? "<" + url + ">" : url;

    /**
     * Serialise a list
     * @param {Element} list - The <ul> or <ol>
     * @param {String} indent - The indent of its items
     * @return {String} The list, as markdown, without a trailing newline
     */
    serializer.list = function (list, indent) {
        const ordered = list.tagName.toLowerCase() === "ol";
        let number = ordered ? +(list.getAttribute("start") || 1) : 0;
        const items = [...list.children].filter(child => child.tagName.toLowerCase() === "li");
        // A list whose items hold paragraphs is loose - its items are separated by blank lines
        const loose = items.some(item => [...item.children].some(child => child.tagName.toLowerCase() === "p"));
        return items.map(item => {
            const marker = ordered ? (number++) + ". " : "- ";
            const childIndent = indent + " ".repeat(marker.length);
            const parts = [];
            // The item's inline content, serialised together, so that what begins a line is known
            let inlineNodes = [];
            const flush = () => {
                const holder = item.ownerDocument.createElement("span");
                inlineNodes.forEach(node => holder.appendChild(node.cloneNode(true)));
                const inline = serializer.inline(holder).trim();
                if (inline) {
                    parts.push(inline);
                }
                inlineNodes = [];
            };
            item.childNodes.forEach(node => {
                const tag = node.nodeType === 1 ? node.tagName.toLowerCase() : null;
                if (tag === "ul" || tag === "ol") {
                    flush();
                    parts.push(serializer.list(node, childIndent).replace(new RegExp("^" + childIndent), ""));
                } else if (tag === "p") {
                    flush();
                    parts.push(serializer.inline(node).trim());
                } else {
                    inlineNodes.push(node);
                }
            });
            flush();
            const lines = parts.join(loose ? "\n\n" : "\n").split("\n");
            return indent + marker + lines.map((line, i) => i === 0 || line === "" ? line : (line.startsWith(childIndent) ? line : childIndent + line)).join("\n");
        }).join(loose ? "\n\n" : "\n");
    };

    /**
     * Serialise a block
     * @param {Element} element - The block's element, one of `blockTags`
     * @return {String} The block, as markdown, without a trailing newline
     */
    serializer.block = function (element) {
        const tag = element.tagName.toLowerCase();
        let togo;
        if (tag === "p") {
            togo = serializer.inline(element).trim();
        } else if (/^h[1-6]$/.test(tag)) {
            togo = "#".repeat(+tag[1]) + " " + serializer.inline(element).trim();
        } else if (tag === "ul" || tag === "ol") {
            togo = serializer.list(element, "");
        } else if (tag === "blockquote") {
            const inner = [...element.children].map(child => serializer.blockTags.includes(child.tagName.toLowerCase()) ?
                serializer.block(child) : serializer.inline(child).trim()).join("\n\n");
            togo = inner.split("\n").map(line => line ? "> " + line : ">").join("\n");
        } else {
            togo = serializer.inline(element).trim();
        }
        return togo;
    };

    /**
     * Render a node canonically, for comparison - its attributes sorted, whitespace collapsed, and the pipeline's
     * generated nodes, the ids of headings, and the editor's own attributes, disregarded
     * @param {Node} node - The node
     * @return {String} The canonical rendering
     */
    serializer.canonical = function (node) {
        let togo = "";
        if (node.nodeType === 3) {
            togo = node.nodeValue.replace(/\s+/g, " ");
        } else if (node.nodeType === 1 && !serializer.isGenerated(node)) {
            const tag = node.tagName.toLowerCase();
            const attrs = [...node.attributes].filter(attr => !attr.name.startsWith("data-fluid-block") && attr.name !== "contenteditable" &&
                !(attr.name === "id" && /^h[1-6]$/.test(tag))).map(attr => attr.name + "=" + JSON.stringify(attr.value)).sort();
            togo = "<" + [tag, ...attrs].join(" ") + ">" + [...node.childNodes].map(serializer.canonical).join("") + "</" + tag + ">";
        }
        return togo;
    };

    /**
     * Render the content of a node canonically, trimming whitespace between elements
     * @param {Node} parent - The node
     * @return {String} The canonical rendering of its children
     */
    serializer.canonicalChildren = parent => [...parent.childNodes].map(serializer.canonical).join("").replace(/>\s+</g, "><").trim();

    /**
     * Read the URL an image's source gives it - that which the extension previews it from, if it is not yet published,
     * stands in its `src` instead - see `previewImages` in bridge.js
     * @param {Element} img - The image's element
     * @return {String} The URL
     */
    serializer.imageSource = img => img.getAttribute("data-fluid-preview-of") || img.getAttribute("src") || "";

    /**
     * Determine whether a block may be edited in place - whether the markdown it serialises to renders, by the site's
     * own pipeline, to what it holds already
     * @param {Element} element - The block's element
     * @param {Function} render - Renders markdown to HTML, by the site's pipeline
     * @return {Boolean} `true` if it round-trips
     */
    serializer.roundTrips = function (element, render) {
        let togo = false;
        if (serializer.blockTags.includes(element.tagName.toLowerCase())) {
            try {
                // Both are compared as DOM, so that they are compared alike, e.g. in their entities and attributes' order
                const holder = element.ownerDocument.createElement("div");
                holder.innerHTML = render(serializer.block(element));
                const own = element.ownerDocument.createElement("div");
                own.appendChild(element.cloneNode(true));
                // An image previewed before it is published is compared as the source gives it
                own.querySelectorAll("img[data-fluid-preview-of]").forEach(img => {
                    img.setAttribute("src", serializer.imageSource(img));
                    img.removeAttribute("data-fluid-preview-of");
                });
                togo = serializer.canonicalChildren(holder) === serializer.canonicalChildren(own);
            } catch (error) {
                togo = false;
            }
        }
        return togo;
    };

    /**
     * Wrap a paragraph of markdown at a width, as its source was wrapped - breaking only between words, and never before
     * a word which would begin a block if it began a line, e.g. "#", "-" or "1."
     * @param {String} markdown - The paragraph, as one line, or several separated by hard breaks
     * @param {Number} width - The width at which to wrap
     * @return {String} The wrapped paragraph
     */
    serializer.wrapParagraph = function (markdown, width) {
        const beginsBlock = word => /^([#>+*=-]|\d+[.)]|```|~~~|\|)/.test(word);
        return markdown.split("\n").map(line => {
            const words = line.split(" ");
            const lines = [];
            let current = "";
            words.forEach(word => {
                if (current !== "" && current.length + 1 + word.length > width && !beginsBlock(word) && !current.endsWith("\\")) {
                    lines.push(current);
                    current = word;
                } else {
                    current = current === "" ? word : current + " " + word;
                }
            });
            lines.push(current);
            return lines.join("\n");
        }).join("\n");
    };

    return serializer;
});
