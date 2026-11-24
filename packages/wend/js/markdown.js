"use strict";

// The site's markdown pipeline - goldmark as Hugo configures it for this site, rebuilt over markdown-it - shared by the
// build and the editing client, so that what an editor previews is what the build will publish.
//
// Under node, packages/wend/js/siteModel.js requires it, passing it the markdown-it modules it requires. In the browser the
// build publishes it, together with the same versions of markdown-it and its plugins, beneath js/fluid-markdown/ - see
// trace.js - and each page's provenance record names those scripts; loaded in order, they define the global
// `wendMarkdown`. It holds no state of its own, so it may be loaded any number of times.

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.wendMarkdown = factory();
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    const wendMarkdown = {};

    /**
     * Compute the id of a heading as goldmark's autoHeadingID does by default - its text, lower-cased, with spaces
     * turned to hyphens and other punctuation dropped
     * @param {String} text - The text of the heading
     * @return {String} The heading's id
     */
    wendMarkdown.headingId = function (text) {
        return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    };

    // The levels of heading which bear an anchor linking to themselves - see `headingIds`
    wendMarkdown.anchoredHeadings = ["h2", "h3", "h4"];

    /**
     * Escape text for an HTML attribute
     * @param {String} text - The text
     * @return {String} The escaped text
     */
    wendMarkdown.escapeAttr = function (text) {
        return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    };

    /**
     * Render the anchor by which a heading links to itself, as the site's theme styles it
     * @param {String} id - The heading's id
     * @param {String} label - The heading's text
     * @return {String} The anchor's markup
     */
    wendMarkdown.headingAnchor = function (id, label) {
        return `<a class="infusion-docs-anchor" aria-label="${wendMarkdown.escapeAttr(label)}" href="#${wendMarkdown.escapeAttr(id)}">` +
            `<span class="octicon octicon-link" aria-hidden="true"></span></a>`;
    };

    /**
     * A markdown-it plugin giving each heading an id, as goldmark does, unless it is given one by an attribute. Ids
     * repeated within a document are suffixed -1, -2, ... Each heading of the levels `anchoredHeadings` begins with an
     * anchor linking to itself - rendered here, rather than added by a script once the page has loaded, so that it is
     * part of the content as built, previewed and rendered live alike
     * @param {Object} md - The markdown-it instance
     */
    wendMarkdown.headingIds = function (md) {
        md.core.ruler.push("heading_ids", state => {
            const used = {};
            state.tokens.forEach((token, i) => {
                if (token.type === "heading_open") {
                    const inline = state.tokens[i + 1];
                    if (!token.attrGet("id")) {
                        const base = wendMarkdown.headingId(inline.children.map(child => child.content).join(""));
                        const count = used[base] = (used[base] ?? -1) + 1;
                        token.attrSet("id", count === 0 ? base : base + "-" + count);
                    }
                    if (wendMarkdown.anchoredHeadings.includes(token.tag)) {
                        // The heading's text alone, as its textContent would be, without any markup it holds
                        const label = inline.children.filter(child => child.type === "text" || child.type === "code_inline")
                            .map(child => child.content).join("");
                        const anchor = new state.Token("html_inline", "", 0);
                        anchor.content = wendMarkdown.headingAnchor(token.attrGet("id"), label);
                        inline.children.unshift(anchor);
                    }
                }
            });
        });
    };

    /**
     * A markdown-it plugin removing the options of Hugo's code fences, e.g. `{lineNos=inline}`, which Hugo's highlighter
     * consumes, from the attributes markdown-it-attrs applies to a fence's <pre>. Code is highlighted in the browser by
     * highlight.js rather than on the server by Hugo's chroma, so these are not honoured.
     * @param {Object} md - The markdown-it instance
     */
    wendMarkdown.stripFenceOptions = function (md) {
        const hugoOptions = ["linenos", "linenostart", "hl_lines", "anchorlinenos", "lineanchors", "style", "noclasses", "tabindex"];
        md.core.ruler.push("strip_fence_options", state => {
            state.tokens.filter(token => token.type === "fence" && token.attrs).forEach(token => {
                token.attrs = token.attrs.filter(([name]) => !hugoOptions.includes(name.toLowerCase()));
            });
        });
    };

    /**
     * A markdown-it plugin highlighting each fenced block of code with highlight.js, as the site's theme formerly did
     * once each page had loaded (`hljs.initHighlightingOnLoad`) - by the library's own `highlightBlock`, applied to the
     * block's element, so that the language it chooses, its detection where it knows no language named, and the classes
     * it writes are exactly as before. Rendered here, rather than by a script once the page has loaded, so that the
     * highlighting is part of the content as built, previewed and rendered live alike
     * @param {Object} hljs - highlight.js
     * @param {Document} dokkument - A document in which to build the block's element - under node, one of linkedom's
     * @return {Function} The plugin
     */
    wendMarkdown.highlightFences = function (hljs, dokkument) {
        return function (md) {
            const defaultFence = md.renderer.rules.fence;
            md.renderer.rules.fence = function (...args) {
                const holder = dokkument.createElement("div");
                holder.innerHTML = defaultFence(...args);
                const code = holder.querySelector("pre > code");
                if (code) {
                    hljs.highlightBlock(code);
                }
                return holder.innerHTML;
            };
        };
    };

    // The layer of the live examples which a fence marked "live" renders as - Infusion's, see
    // src/components/sfc/fluid-liveExample.vue in Infusion 6
    wendMarkdown.liveExampleLayer = "fluid.liveExample";

    // The kinds of code a live example takes, by the language of its fence
    wendMarkdown.liveExampleKinds = {js: "js", javascript: "js", html: "vue", vue: "vue"};

    // The modes of a live example, by the flag following the language of its fence - "live", a complete, runnable
    // example, edited and run, or "syntax", one indicative of syntax alone, shown linted but neither editable nor run
    wendMarkdown.liveExampleModes = new Set(["live", "syntax"]);

    /**
     * Determine the mode of a fence which is a live example - one whose info string names its language followed by
     * "live" or "syntax", e.g. "js live", which other renderers of markdown show as a block of code in that language
     * @param {Object} token - A token of markdown-it
     * @return {String|null} Its mode, "live" or "syntax", or null if it is not a live example
     */
    wendMarkdown.liveFenceMode = function (token) {
        const [lang, flag] = (token.info || "").trim().split(/\s+/);
        return token.type === "fence" && wendMarkdown.liveExampleModes.has(flag) && wendMarkdown.liveExampleKinds[lang] ? flag : null;
    };

    /**
     * Determine the kind of the code of a fence which is a live example
     * @param {Object} token - A token of markdown-it
     * @return {String|null} The kind of its code, "js" or "vue", or null if it is not a live example
     */
    wendMarkdown.liveFenceKind = function (token) {
        const [lang] = (token.info || "").trim().split(/\s+/);
        return wendMarkdown.liveFenceMode(token) ? wendMarkdown.liveExampleKinds[lang] : null;
    };

    /**
     * A markdown-it plugin rendering each fence marked "live" or "syntax", e.g. a fence opened by three backticks and "js live", as an island of a live example -
     * an element bearing `fluid-layers`, whose potentia holds the fence's code - which Infusion renders statically as
     * the code alone, and in the browser as an editor of it, linted as it is edited, run beside its console and any
     * view it defines
     * @param {Object} md - The markdown-it instance
     */
    wendMarkdown.liveFences = function (md) {
        const fence = md.renderer.rules.fence;
        md.renderer.rules.fence = function (tokens, index, ...rest) {
            const kind = wendMarkdown.liveFenceKind(tokens[index]);
            // The code is configuration of the example, in which a String beginning with "{" or "$" would be read as a
            // reference or a directive - escaped by a backslash, it is taken literally
            const code = tokens[index].content.replace(/\n$/, "");
            const mode = wendMarkdown.liveFenceMode(tokens[index]);
            const potentia = JSON.stringify({code: /^[{$\\]/.test(code) ? "\\" + code : code, kind, mode});
            return kind ? `<div fluid-layers="${wendMarkdown.liveExampleLayer}" fluid-potentia='${potentia.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'></div>\n` :
                fence(tokens, index, ...rest);
        };
    };

    /**
     * Split a content file into the text of its YAML front matter and its markdown body. The front matter is not
     * parsed here, so that the browser needs no YAML parser to render a body
     * @param {String} text - The text of the content file
     * @return {Object} The text of the front matter as `frontMatter`, or null if it has none, and the rest as `body`
     */
    wendMarkdown.splitFrontMatter = function (text) {
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        return match ? {frontMatter: match[1], body: match[2]} : {frontMatter: null, body: text};
    };

    /**
     * Translate Hugo shortcodes into component islands - elements bearing `fluid-layers`, which are booted as
     * components within otherwise verbatim content.
     * @param {String} body - The markdown body of a content file
     * @return {String} The body with each `{{< name key="value" >}}` replaced by an island element
     */
    wendMarkdown.expandShortcodes = function (body) {
        return body.replace(/\{\{<\s*(\w+)([^>]*?)\s*>\}\}/g, (match, name, args) => {
            const attrs = [...args.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => ` data-${key}="${value}"`).join("");
            // As many lines as the shortcode spanned, so that the lines of the expanded body are those of the source -
            // see wendMarkdown.segment
            return `<div fluid-layers="wend.shortcode.${name}"${attrs}></div>` + "\n".repeat((match.match(/\n/g) || []).length);
        });
    };

    // The elements which have no closing tag
    wendMarkdown.voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

    /**
     * Count the elements which markup leaves open - those it opens less those it closes
     * @param {String} html - The markup
     * @return {Number} The number left open, which is negative if it closes more than it opens
     */
    wendMarkdown.openElements = function (html) {
        let count = 0;
        [...html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)].forEach(([, closing, tag, selfClosing]) => {
            if (!wendMarkdown.voidElements.has(tag.toLowerCase()) && !selfClosing) {
                count += closing ? -1 : 1;
            }
        });
        return count;
    };

    /**
     * List the headings of a markdown body, with the ids the pipeline gives them - so that a link to one may be
     * completed, e.g. by an editor of the source
     * @param {Object} md - The renderer, as made by `make`
     * @param {String} body - The markdown body
     * @return {Object[]} The headings, in order, each `{id, text, level}`
     */
    wendMarkdown.headings = function (md, body) {
        const tokens = md.parse(wendMarkdown.expandShortcodes(body), {});
        return tokens.map((token, i) => token.type === "heading_open" ? {
            id: token.attrGet("id"),
            text: tokens[i + 1].children.filter(child => child.type === "text" || child.type === "code_inline").map(child => child.content).join(""),
            level: +token.tag.substring(1)
        } : null).filter(heading => heading && heading.id);
    };

    /**
     * @typedef {Object} MarkdownBlock
     * @property {String} kind - The kind of block, from the type of its first token, e.g. "paragraph", "heading",
     * "bullet_list", "fence", "html_block", or "island" for an html_block holding a shortcode's island, or a fence of a
     * live example
     * @property {String} [tag] - The tag of its element, e.g. "h2", "p", "ul"
     * @property {Number|null} startLine - The first line of the block within the body, counting from 0, or null for a
     * block with no source of its own, e.g. the footnotes gathered at the end of a document
     * @property {Number|null} endLine - The line after its last, or null
     * @property {String} html - Its rendering
     * @property {Number[]} [lines] - For the block of footnotes, the lines of the body defining them, which no other
     * block holds
     */

    /**
     * Split a markdown body into its top-level blocks, each with the range of lines of the body it was parsed from, and
     * its rendering. The body is parsed whole, and each block rendered from its slice of the whole token stream, with the
     * whole document's environment - so that what is resolved across the document, e.g. the ids of headings, footnotes,
     * reference links, is as in a rendering of the whole, and the renderings of the blocks, concatenated, are that of
     * the whole. An editor may then edit one block's lines, and render the body again, finding every other block as it
     * was
     * @param {Object} md - The renderer, as made by `make`
     * @param {String} body - The markdown body
     * @return {MarkdownBlock[]} The blocks, in order
     */
    wendMarkdown.segment = function (md, body) {
        const env = {};
        const tokens = md.parse(wendMarkdown.expandShortcodes(body), env);
        const lines = body.split("\n");
        const blocks = [];
        let start = 0;
        let depth = 0;
        // Blocks are delimited by nesting, rather than by tokens' levels, which some plugins' tokens do not keep
        tokens.forEach((token, i) => {
            depth += token.nesting;
            if (depth === 0) {
                const first = tokens[start];
                const slice = tokens.slice(start, i + 1);
                const kind = first.type.replace(/_open$/, "");
                const block = {
                    kind: kind === "html_block" && /fluid-layers=/.test(first.content) || wendMarkdown.liveFenceKind(first) ? "island" : kind,
                    tag: first.tag || undefined,
                    startLine: first.map ? first.map[0] : null,
                    endLine: first.map ? first.map[1] : null,
                    html: md.renderer.render(slice, md.options, env)
                };
                // An island's source is its shortcode, which may span several lines, to the one closing it
                if (block.kind === "island" && first.type === "html_block") {
                    const closing = lines.findIndex((line, index) => index >= block.startLine && line.includes(">}}"));
                    block.endLine = Math.max(block.endLine, closing + 1);
                }
                blocks.push(block);
                start = i + 1;
            }
        });
        // Raw HTML may open an element in one block and close it in a later one, e.g. a <div> wrapping paragraphs of
        // markdown - such blocks are merged into one, so that each block's rendering holds whole elements. A comment
        // standing alone, which is no content of its own, is merged into the block before it
        const merged = [];
        let open = 0;
        // A block holding nothing but comments is no content of its own, and is merged into the one before it
        const commentOnly = block => block.kind === "html_block" && block.html.replace(/<!--[\s\S]*?-->/g, "").trim() === "";
        blocks.forEach(block => {
            const previous = merged[merged.length - 1];
            if (previous && commentOnly(block)) {
                previous.endLine = block.endLine ?? previous.endLine;
                previous.html += block.html;
            } else if (open > 0) {
                previous.kind = "html_block";
                previous.endLine = block.endLine ?? previous.endLine;
                previous.html += block.html;
            } else {
                merged.push(block);
            }
            open = Math.max(0, open + wendMarkdown.openElements(block.kind === "html_block" || open > 0 ? block.html : ""));
        });
        blocks.length = 0;
        blocks.push(...merged);
        // The definitions of footnotes are taken from the stream of tokens, and rendered in a block of their own at its
        // end - their lines are that block's source
        const covered = new Set(blocks.filter(block => block.startLine !== null)
            .flatMap(block => Array.from({length: block.endLine - block.startLine}, (unused, index) => block.startLine + index)));
        const footnotes = blocks.find(block => block.kind === "footnote_block");
        if (footnotes) {
            footnotes.lines = lines.map((line, index) => index).filter(index => !covered.has(index) && lines[index].trim() !== "");
        }
        return blocks;
    };

    /**
     * Make the site's markdown renderer: goldmark's options as Hugo configures them - `unsafe = true`, block attributes
     * `{.class}`, and its default extensions, typographer, linkify, footnotes, definition lists and heading ids
     * @param {Object} libs - markdown-it and its plugins, as modules under node or the globals of their browser builds
     * @param {Function} libs.markdownIt - markdown-it
     * @param {Function} libs.attrs - markdown-it-attrs
     * @param {Function} libs.footnote - markdown-it-footnote
     * @param {Function} libs.deflist - markdown-it-deflist
     * @param {Object} libs.hljs - highlight.js, the theme's static/js/highlight.min.js
     * @param {Document} libs.dokkument - A document in which code blocks are highlighted - see `highlightFences`
     * @return {Object} The markdown-it instance
     */
    wendMarkdown.make = function ({markdownIt, attrs, footnote, deflist, hljs, dokkument}) {
        return markdownIt({html: true, typographer: true, linkify: true})
            .use(attrs).use(footnote).use(deflist).use(wendMarkdown.headingIds).use(wendMarkdown.stripFenceOptions)
            .use(wendMarkdown.highlightFences(hljs, dokkument)).use(wendMarkdown.liveFences);
    };

    /**
     * Find markdown-it and its plugins as the globals their browser builds define
     * @param {Object} scope - The global object
     * @return {Object} The libraries, as `make` takes them
     */
    wendMarkdown.browserLibs = function (scope) {
        return {markdownIt: scope.markdownit, attrs: scope.markdownItAttrs, footnote: scope.markdownitFootnote, deflist: scope.markdownitDeflist,
            hljs: scope.hljs, dokkument: scope.document};
    };

    /**
     * Render a markdown body to the HTML of its content, with its shortcodes as islands
     * @param {Object} md - The renderer, as made by `make`
     * @param {String} body - The markdown body
     * @return {String} The HTML
     */
    wendMarkdown.renderBody = function (md, body) {
        return md.render(wendMarkdown.expandShortcodes(body));
    };

    /**
     * Render the whole text of a content file, front matter and all, to the HTML of its content - what the editing
     * client renders a claim with
     * @param {Object} md - The renderer, as made by `make`
     * @param {String} text - The text of the content file
     * @return {String} The HTML
     */
    wendMarkdown.renderSource = function (md, text) {
        return wendMarkdown.renderBody(md, wendMarkdown.splitFrontMatter(text).body);
    };

    return wendMarkdown;
});
