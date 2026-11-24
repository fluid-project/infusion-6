"use strict";

// Serialises the DOM of one block of rendered markdown back into markdown - the inverse of the site's pipeline for the
// blocks a user may edit in place, e.g. paragraphs, headings, lists and quotations, holding emphasis, code, links and
// images. It is used only for a block the user has edited, and only for a block whose rendering it reproduces: a
// block is offered for editing in place only if the markdown it serialises to renders to what the block holds already
// (see `roundTrips`) - otherwise, e.g. for a block bearing markdown-it-attrs' `{.class}` or raw HTML, it is edited as
// source, so that editing in place never silently loses what the source said. See the block editor, fluid-blockEditor.vue.
// Defines the namespace `fluid.markdownSerializer`, once Infusion is loaded - e.g. by the "Edit in Infusion" extension's
// bridge, from the site's copy of Infusion.

const fluidMarkdownSerializerScope = function (fluid) {
    fluid.registerNamespace("fluid.markdownSerializer");

    // Tags of the blocks which may be edited in place, and serialised
    fluid.markdownSerializer.blockTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote"];

    // Classes of elements the pipeline adds, which are not the source's - e.g. the anchor by which a heading links to
    // itself - and are left out of the serialisation
    fluid.markdownSerializer.generatedClasses = ["infusion-docs-anchor"];

    /**
     * Escape text so that markdown reads it as the same text
     * @param {String} text - The text
     * @param {Boolean} atLineStart - Whether the text begins a line, where e.g. "#" or "1." would begin a block
     * @return {String} The escaped text
     */
    fluid.markdownSerializer.escapeText = function (text, atLineStart) {
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
    fluid.markdownSerializer.isGenerated = node => node.nodeType === 1 && fluid.markdownSerializer.generatedClasses.some(cls => node.classList.contains(cls));

    /**
     * Serialise the inline content of an element
     * @param {Node} parent - The element
     * @return {String} Its content, as markdown
     */
    fluid.markdownSerializer.inline = function (parent) {
        let out = "";
        parent.childNodes.forEach(node => {
            if (node.nodeType === 3) {
                out += fluid.markdownSerializer.escapeText(node.nodeValue.replace(/\s+/g, " "), out === "" || out.endsWith("\n"));
            } else if (node.nodeType === 1 && !fluid.markdownSerializer.isGenerated(node)) {
                const tag = node.tagName.toLowerCase();
                const inner = () => fluid.markdownSerializer.inline(node);
                if (tag === "strong" || tag === "b") {
                    out += fluid.markdownSerializer.wrap("**", inner());
                } else if (tag === "em" || tag === "i") {
                    out += fluid.markdownSerializer.wrap("*", inner());
                } else if (tag === "code") {
                    const text = node.textContent;
                    const fence = text.includes("`") ? "`` " : "`";
                    out += fence + text + (fence === "`" ? "`" : " ``");
                } else if (tag === "a") {
                    const title = node.getAttribute("title");
                    out += "[" + inner() + "](" + fluid.markdownSerializer.url(node.getAttribute("href") || "") + (title ? " \"" + title.replace(/"/g, "\\\"") + "\"" : "") + ")";
                } else if (tag === "img") {
                    out += "![" + fluid.markdownSerializer.escapeText(node.getAttribute("alt") || "", false) + "](" + fluid.markdownSerializer.url(fluid.markdownSerializer.imageSource(node)) + ")";
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
    fluid.markdownSerializer.wrap = function (delimiter, text) {
        const [, lead, body, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
        return body ? lead + delimiter + body + delimiter + trail : lead + trail;
    };

    /**
     * Render a URL as the destination of a link
     * @param {String} url - The URL
     * @return {String} The destination, bracketed if it holds spaces or parentheses
     */
    fluid.markdownSerializer.url = url => /[\s()]/.test(url) ? "<" + url + ">" : url;

    /**
     * Serialise a list
     * @param {Element} list - The <ul> or <ol>
     * @param {String} indent - The indent of its items
     * @return {String} The list, as markdown, without a trailing newline
     */
    fluid.markdownSerializer.list = function (list, indent) {
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
                const inline = fluid.markdownSerializer.inline(holder).trim();
                if (inline) {
                    parts.push(inline);
                }
                inlineNodes = [];
            };
            item.childNodes.forEach(node => {
                const tag = node.nodeType === 1 ? node.tagName.toLowerCase() : null;
                if (tag === "ul" || tag === "ol") {
                    flush();
                    parts.push(fluid.markdownSerializer.list(node, childIndent).replace(new RegExp("^" + childIndent), ""));
                } else if (tag === "p") {
                    flush();
                    parts.push(fluid.markdownSerializer.inline(node).trim());
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
     * Serialise the content of a paragraph or heading. Markdown holds no empty paragraph, so one the user makes, e.g. by
     * Enter at the end of a block, is written as "&nbsp;" - see fluid.blockEditor.beforeInput. Its non-breaking space
     * is kept, since otherwise it would serialise to nothing, render as nothing, and so fail `roundTrips`, leaving the
     * new paragraph unable to be edited in place. Within other text a non-breaking space is an ordinary space, as the
     * browser inserts them for spaces typed in a run, or at the end of a line
     * @param {Element} element - The paragraph's or heading's element
     * @return {String} Its content, as markdown
     */
    fluid.markdownSerializer.textBlock = function (element) {
        const inline = fluid.markdownSerializer.inline(element).trim();
        return inline === "" && element.textContent.includes(" ") ? "&nbsp;" : inline;
    };

    /**
     * Serialise a block
     * @param {Element} element - The block's element, one of `blockTags`
     * @return {String} The block, as markdown, without a trailing newline
     */
    fluid.markdownSerializer.block = function (element) {
        const tag = element.tagName.toLowerCase();
        let togo;
        if (tag === "p") {
            togo = fluid.markdownSerializer.textBlock(element);
        } else if (/^h[1-6]$/.test(tag)) {
            togo = "#".repeat(+tag[1]) + " " + fluid.markdownSerializer.textBlock(element);
        } else if (tag === "ul" || tag === "ol") {
            togo = fluid.markdownSerializer.list(element, "");
        } else if (tag === "blockquote") {
            const inner = [...element.children].map(child => fluid.markdownSerializer.blockTags.includes(child.tagName.toLowerCase()) ?
                fluid.markdownSerializer.block(child) : fluid.markdownSerializer.inline(child).trim()).join("\n\n");
            togo = inner.split("\n").map(line => line ? "> " + line : ">").join("\n");
        } else {
            togo = fluid.markdownSerializer.inline(element).trim();
        }
        return togo;
    };

    /**
     * Render a node canonically, for comparison - its attributes sorted, whitespace collapsed, and the pipeline's
     * generated nodes, the ids of headings, and the editor's own attributes, disregarded
     * @param {Node} node - The node
     * @return {String} The canonical rendering
     */
    fluid.markdownSerializer.canonical = function (node) {
        let togo = "";
        if (node.nodeType === 3) {
            togo = node.nodeValue.replace(/\s+/g, " ");
        } else if (node.nodeType === 1 && !fluid.markdownSerializer.isGenerated(node)) {
            const tag = node.tagName.toLowerCase();
            const attrs = [...node.attributes].filter(attr => !attr.name.startsWith("data-fluid-block") && attr.name !== "contenteditable" &&
                !(attr.name === "id" && /^h[1-6]$/.test(tag))).map(attr => attr.name + "=" + JSON.stringify(attr.value)).sort();
            togo = "<" + [tag, ...attrs].join(" ") + ">" + [...node.childNodes].map(fluid.markdownSerializer.canonical).join("") + "</" + tag + ">";
        }
        return togo;
    };

    /**
     * Render the content of a node canonically, trimming whitespace between elements
     * @param {Node} parent - The node
     * @return {String} The canonical rendering of its children
     */
    fluid.markdownSerializer.canonicalChildren = parent => [...parent.childNodes].map(fluid.markdownSerializer.canonical).join("").replace(/>\s+</g, "><").trim();

    /**
     * Read the URL an image's source gives it - that which the extension previews it from, if it is not yet published,
     * stands in its `src` instead - see `previewImages` in bridge.js
     * @param {Element} img - The image's element
     * @return {String} The URL
     */
    fluid.markdownSerializer.imageSource = img => img.getAttribute("data-fluid-preview-of") || img.getAttribute("src") || "";

    /**
     * Determine whether a block may be edited in place - whether the markdown it serialises to renders, by the site's
     * own pipeline, to what it holds already
     * @param {Element} element - The block's element
     * @param {Function} render - Renders markdown to HTML, by the site's pipeline
     * @return {Boolean} `true` if it round-trips
     */
    fluid.markdownSerializer.roundTrips = function (element, render) {
        let togo = false;
        if (fluid.markdownSerializer.blockTags.includes(element.tagName.toLowerCase())) {
            try {
                // Both are compared as DOM, so that they are compared alike, e.g. in their entities and attributes' order
                const holder = element.ownerDocument.createElement("div");
                holder.innerHTML = render(fluid.markdownSerializer.block(element));
                const own = element.ownerDocument.createElement("div");
                own.appendChild(element.cloneNode(true));
                // An image previewed before it is published is compared as the source gives it
                own.querySelectorAll("img[data-fluid-preview-of]").forEach(img => {
                    img.setAttribute("src", fluid.markdownSerializer.imageSource(img));
                    img.removeAttribute("data-fluid-preview-of");
                });
                togo = fluid.markdownSerializer.canonicalChildren(holder) === fluid.markdownSerializer.canonicalChildren(own);
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
    fluid.markdownSerializer.wrapParagraph = function (markdown, width) {
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

};

if (typeof(fluid) !== "undefined") {
    fluidMarkdownSerializerScope(fluid);
}
