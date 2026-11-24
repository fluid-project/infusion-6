
"use strict";

// Builds the data model to which beautifulWend.site is bound, from wend.json and content/. This is the part of Hugo which is
// not templating: configuration, front matter, markdown rendering, shortcodes, sections, taxonomies, pagination and
// summaries. Each page record is the data of one output document.

const fs = require("fs"),
    path = require("path"),
    vm = require("vm"),
    crypto = require("crypto");

const yaml = require("yaml"),
    markdownIt = require("markdown-it"),
    markdownItAttrs = require("markdown-it-attrs"),
    markdownItFootnote = require("markdown-it-footnote"),
    markdownItDeflist = require("markdown-it-deflist");
const wendMarkdown = require("./markdown.js");
const {parseHTML} = require("linkedom");

const wend = {siteModel: {}};

/**
 * Load the theme's highlight.js as a browser would - its languages register themselves through a global `hljs`, so
 * that it can't be required as a module. It is evaluated in a context of its own whose global object is its `window`
 * @param {String} file - The path of highlight.js
 * @return {Object} highlight.js
 */
wend.siteModel.loadHljs = function (file) {
    const sandbox = {};
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, {filename: file});
    return sandbox.hljs;
};

// The theme's highlight.js, which pages formerly loaded to highlight their code once loaded, and which the build
// publishes for the editing client with the rest of the pipeline - see trace.js
wend.siteModel.hljsFile = require("./site.js").staticFile("js/highlight.min.js");

// The site's markdown pipeline, shared with the editing client - see markdown.js
const markdown = wendMarkdown.make({markdownIt, attrs: markdownItAttrs, footnote: markdownItFootnote, deflist: markdownItDeflist,
    hljs: wend.siteModel.loadHljs(wend.siteModel.hljsFile),
    dokkument: parseHTML("<!DOCTYPE html><html><body></body></html>").document});

/**
 * List the files beneath a directory, recursively
 * @param {String} dir - The directory
 * @param {String} [prefix] - The path of `dir` relative to the directory originally listed
 * @return {String[]} The paths of the files, relative to the directory originally listed
 */
wend.siteModel.listFiles = function (dir, prefix = "") {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ?
        wend.siteModel.listFiles(path.join(dir, entry.name), path.join(prefix, entry.name)) : [path.join(prefix, entry.name)]);
};

/**
 * Group the elements of an array by a key computed from each - `Object.groupBy`, which node 18 lacks
 * @param {Array} array - The elements
 * @param {Function} keyOf - Computes the key of an element
 * @return {Object<String, Array>} The elements grouped by key, in order
 */
wend.siteModel.groupBy = function (array, keyOf) {
    const togo = {};
    array.forEach(element => (togo[keyOf(element)] ||= []).push(element));
    return togo;
};

/**
 * A page record, the data of one output document.
 * @typedef {Object} PageRecord
 * @property {String} kind - Hugo's page kind - "home", "section", "page", "taxonomy", "term" or "404"
 * @property {String} type - The content type - front matter `type`, or the section name, or "page"
 * @property {String} section - The top-level content directory holding the page
 * @property {String} title - The page title
 * @property {String} [date] - The page date in ISO 8601 form
 * @property {String} [lastmod] - The page's last modification date in ISO 8601 form
 * @property {String} relPermalink - The site-relative URL, e.g. "/post/2025-03-20-ui-as-code/"
 * @property {String} permalink - The absolute URL
 * @property {String} outputPath - The path of the output file, relative to the publish directory
 * @property {Object} params - The page's front matter
 * @property {String} [sourcePath] - For regular pages, the path of the content file, relative to the site's root and
 * with "/" separators, e.g. "content/post/x.md" - the key of its source in the build's trace, see buildSite.js
 * @property {String} content - The rendered HTML content
 * @property {String} summary - The rendered HTML summary
 * @property {String} summaryText - The plain text summary, for meta descriptions
 * @property {Boolean} truncated - `true` if the summary is shorter than the content
 * @property {Object} [paginator] - For list pages, `{pageNumber, pages, prev, next}` with `pages` a list of permalinks
 * @property {Object} [prevInSection] - For regular pages, `{title, relPermalink}` of the previous page in its section
 * @property {Object} [nextInSection] - For regular pages, `{title, relPermalink}` of the next page in its section
 * @property {Object} [data] - For taxonomy and term pages, `{singular, plural, terms}`
 */

/**
 * Split a content file into its YAML front matter and markdown body
 * @param {String} text - The text of the content file
 * @return {Object} The parsed front matter as `params`, and the remaining text as `body`
 */
wend.siteModel.splitFrontMatter = function (text) {
    const {frontMatter, body} = wendMarkdown.splitFrontMatter(text);
    return {params: frontMatter === null ? {} : yaml.parse(frontMatter) ?? {}, body};
};


/**
 * Compute the summary of rendered content - Hugo's manual `<!--more-->` divider, or else its first 70 words
 * @param {String} html - The rendered HTML content
 * @return {Object} `summary` HTML, `summaryText` plain text, and `truncated`
 */
wend.siteModel.summarise = function (html) {
    const divider = html.indexOf("<!--more-->");
    let togo;
    if (divider === -1) {
        // Hugo's summary - its first 70 words, extended to the end of the sentence holding the last of them
        const words = wend.siteModel.plainText(html).split(/\s+/).filter(word => word);
        const sentenceEnd = words.findIndex((word, i) => i >= 69 && /[.!?]["'’”)]*$/.test(word));
        const count = sentenceEnd === -1 ? words.length : sentenceEnd + 1;
        const summaryText = words.slice(0, count).join(" ");
        // The summary is HTML, so the text, whose entities plainText decoded, is escaped again
        togo = {summary: wend.siteModel.escapeHTML(summaryText), summaryText, truncated: words.length > count};
    } else {
        const summary = html.substring(0, divider);
        togo = {summary, summaryText: wend.siteModel.plainText(summary), truncated: true};
    }
    return togo;
};

/**
 * Strip markup from HTML
 * @param {String} html - Some HTML
 * @return {String} Its text, with runs of whitespace collapsed
 */
wend.siteModel.plainText = function (html) {
    const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    // Text, not markup - its entities are decoded, so that wherever it is written, e.g. into an attribute, it is
    // escaped once, as the browser escapes it on the client
    return wend.siteModel.decodeEntities(text);
};

/**
 * Escape text for HTML
 * @param {String} text - The text
 * @return {String} The text, with "&", "<" and ">" escaped
 */
wend.siteModel.escapeHTML = function (text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

// The named entities which the markdown pipeline writes
wend.siteModel.namedEntities = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0"};

/**
 * Decode the character references in text extracted from HTML
 * @param {String} text - The text
 * @return {String} The text with each `&name;`, `&#n;` and `&#xh;` replaced by its character
 */
wend.siteModel.decodeEntities = function (text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref) => ref[0] === "#" ?
        String.fromCodePoint(ref[1].toLowerCase() === "x" ? parseInt(ref.substring(2), 16) : +ref.substring(1)) :
        wend.siteModel.namedEntities[ref.toLowerCase()] ?? match);
};

/**
 * Hash the text of a source file as it is recorded in the build's trace, and as the editing client hashes the text of
 * a claim - so that a claim is recognised as published when the trace records its hash
 * @param {String} text - The text of the file
 * @return {String} Its hash, as "sha256-" followed by the hex digest of its UTF-8 encoding
 */
wend.siteModel.hashText = function (text) {
    return "sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("hex");
};

/**
 * Hash every content file of the site - the inputs of the build which the editing client may change
 * @param {String} siteDir - The directory holding the site
 * @param {String[]} [extraPaths] - Other sources an editing client may change, relative to `siteDir`, e.g. the SFCs
 * rendering the framing of every page - see `framing` in the site's editing configuration, e.g. wend/editing.json
 * @return {Object<String, String>} The hash of each content file, as by `hashText`, keyed by its path relative to
 * `siteDir` with "/" separators
 */
wend.siteModel.hashSources = function (siteDir, extraPaths = []) {
    const contentDir = path.join(siteDir, "content");
    const content = wend.siteModel.listFiles(contentDir).filter(file => file.endsWith(".md")).map(file =>
        [["content", ...file.split(path.sep)].join("/"), wend.siteModel.hashText(fs.readFileSync(path.join(contentDir, file), "utf8"))]);
    const extra = extraPaths.filter(file => fs.existsSync(path.join(siteDir, file))).map(file =>
        [file, wend.siteModel.hashText(fs.readFileSync(path.join(siteDir, file), "utf8"))]);
    return Object.fromEntries([...content, ...extra]);
};

/**
 * Read one regular content page
 * @param {String} contentDir - The content directory
 * @param {String} relPath - The path of the markdown file relative to `contentDir`
 * @param {String} baseURL - The site's base URL
 * @return {PageRecord} The page record
 */
wend.siteModel.readPage = function (contentDir, relPath, baseURL) {
    const {params, body} = wend.siteModel.splitFrontMatter(fs.readFileSync(path.join(contentDir, relPath), "utf8"));
    // Hugo's path sanitisation - spaces become hyphens, and characters other than letters, digits and -._~ are dropped
    const segments = relPath.replace(/\.md$/, "").split(path.sep)
        .map(segment => segment.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}\-._~]/gu, ""));
    const section = segments.length > 1 ? segments[0] : "";
    const relPermalink = "/" + segments.join("/") + "/";
    const content = wendMarkdown.renderBody(markdown, body);
    return {
        kind: "page",
        type: params.type ?? (section || "page"),
        section,
        title: params.title ?? "",
        date: params.date ? new Date(params.date).toISOString() : undefined,
        lastmod: params.lastmod ? new Date(params.lastmod).toISOString() : undefined,
        relPermalink,
        permalink: baseURL + relPermalink,
        outputPath: relPermalink + "index.html",
        params,
        sourcePath: ["content", ...relPath.split(path.sep)].join("/"),
        content,
        ...wend.siteModel.summarise(content)
    };
};

/**
 * Split a list of pages into paginated list pages
 * @param {Object} listPage - The record of the list page, lacking `paginator`
 * @param {PageRecord[]} pages - The pages to be listed, in order
 * @param {Number} pagerSize - The number of pages listed per page
 * @return {PageRecord[]} One record per page of the list, the first at the list page's own permalink and the others
 * at `page/N/` beneath it
 */
wend.siteModel.paginate = function (listPage, pages, pagerSize) {
    const count = Math.max(1, Math.ceil(pages.length / pagerSize));
    const permalinkOf = number => number === 1 ? listPage.relPermalink : listPage.relPermalink + "page/" + number + "/";
    return Array.from({length: count}, (unused, i) => {
        const number = i + 1;
        const relPermalink = permalinkOf(number);
        return {
            ...listPage,
            relPermalink,
            permalink: listPage.permalink.replace(/\/$/, "") + relPermalink.substring(listPage.relPermalink.length - 1),
            outputPath: relPermalink + "index.html",
            paginator: {
                pageNumber: number,
                pages: pages.slice(i * pagerSize, number * pagerSize).map(page => page.relPermalink),
                // Every page of the list, e.g. for its feed
                allPages: pages.map(page => page.relPermalink),
                prev: number > 1 ? permalinkOf(number - 1) : undefined,
                next: number < count ? permalinkOf(number + 1) : undefined
            }
        };
    });
};

// The site's configuration - a patch of the members of the root of its component tree, beautifulWend.site
wend.siteModel.patchFile = "wend.json";

/**
 * Read the site's configuration, wend.json. It is a patch of the members of beautifulWend.site, the root of the site's
 * component tree, as given to it when it is constructed: `config`, read throughout the site, `features`, the switches of
 * its optional features, and in time the options of any component beneath it, at its member's name - so that what
 * configures one component, e.g. a highlighter, is held as its own options rather than amongst the site's
 * @param {String} siteDir - The root of the site
 * @return {Object} The patch
 */
wend.siteModel.readPatch = function (siteDir) {
    return JSON.parse(fs.readFileSync(path.join(siteDir, wend.siteModel.patchFile), "utf8"));
};

/**
 * Convert the site's patch into the options with which beautifulWend.site is constructed - each member holding plain data,
 * e.g. `config` or `features`, becomes a reactive root, so that what reads it is traced, and an edit of it, e.g. in
 * place in the browser, propagates; one holding Infusion's own syntax, e.g. a `$component` record, is passed as it is
 * @param {Object} patch - The patch, as read by `readPatch`, or a page's slice of it
 * @return {Object} The options
 */
wend.siteModel.patchOptions = function (patch) {
    const isSyntax = value => !!value && typeof(value) === "object" && Object.keys(value).some(key => key.startsWith("$"));
    return Object.fromEntries(Object.entries(patch).map(([member, value]) => [member, isSyntax(value) ? value : {$reactiveRoot: value}]));
};

/**
 * Build the model of the whole site
 * @param {String} siteDir - The root of the site, holding wend.json and content/
 * @return {Object} The site model, with `config`, from wend.json, `patch`, the whole of wend.json, `pages`, a list of
 * {@link PageRecord}, and `data`
 */
wend.siteModel.load = function (siteDir) {
    const patch = wend.siteModel.readPatch(siteDir);
    const config = {...patch.config, baseURL: patch.config.baseURL.replace(/\/$/, "")};
    const contentDir = path.join(siteDir, "content");
    const files = wend.siteModel.listFiles(contentDir)
        .filter(file => file.endsWith(".md") && !path.basename(file).startsWith("_index"));
    const byDateDesc = (a, b) => (b.date ?? "").localeCompare(a.date ?? "");
    const regular = files.map(file => wend.siteModel.readPage(contentDir, file, config.baseURL))
        .filter(page => !page.params.draft).sort(byDateDesc);

    // Previous and next within each section, by date
    const sections = wend.siteModel.groupBy(regular, page => page.section);
    Object.values(sections).forEach(sectionPages => sectionPages.forEach((page, i) => {
        const link = other => other && {title: other.title, relPermalink: other.relPermalink};
        page.prevInSection = link(sectionPages[i + 1]);
        page.nextInSection = link(sectionPages[i - 1]);
    }));

    const pagerSize = config.pagerSize ?? 10;
    const listPage = (kind, title, relPermalink, extra) => ({
        kind, type: kind === "home" ? "page" : "list", section: "", title, relPermalink,
        permalink: config.baseURL + relPermalink, params: {}, content: "", summary: "", summaryText: "", ...extra
    });

    const homeIndex = wend.siteModel.splitFrontMatter(fs.readFileSync(path.join(contentDir, "_index.md"), "utf8"));
    const mainSections = config.mainSections ?? ["post"];
    const home = wend.siteModel.paginate(listPage("home", config.title, "/", {
        content: markdown.render(homeIndex.body)
    }), regular.filter(page => mainSections.includes(page.type)), pagerSize);

    const sectionLists = Object.entries(sections).filter(([section]) => section)
        .flatMap(([section, sectionPages]) =>
            wend.siteModel.paginate(listPage("section", section, "/" + section + "/"), sectionPages, pagerSize));

    // Hugo's default taxonomies
    const taxonomies = {tags: "tag", categories: "category"};
    const taxonomyPages = Object.entries(taxonomies).flatMap(([plural, singular]) => {
        const termMap = {};
        regular.forEach(page => (page.params[plural] ?? []).forEach(term => (termMap[term] ||= []).push(page)));
        const terms = Object.entries(termMap)
            .map(([name, termPages]) => ({name, count: termPages.length, pages: termPages.map(page => page.relPermalink)}))
            .sort((a, b) => b.count - a.count);
        const data = {singular, plural, terms};
        const termLists = Object.entries(termMap).flatMap(([name, termPages]) => wend.siteModel.paginate(
            listPage("term", name, "/" + plural + "/" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "/", {data}),
            termPages, pagerSize));
        return [{...listPage("taxonomy", plural, "/" + plural + "/", {data}), outputPath: "/" + plural + "/index.html"},
            ...termLists];
    });

    const notFound = {...listPage("404", "404 Page not found", "/404.html"), outputPath: "/404.html"};

    const pages = [...home, ...sectionLists, ...regular, ...taxonomyPages, notFound];
    // Hugo writes an alias at page/1/ beneath each paginated list, redirecting to the list itself
    const aliases = pages.filter(page => page.paginator?.pageNumber === 1 && page.kind !== "home")
        .map(page => ({permalink: page.permalink + "page/1/", outputPath: page.relPermalink + "page/1/index.html", target: page.permalink}))
        .concat({permalink: config.baseURL + "/page/1/", outputPath: "/page/1/index.html", target: config.baseURL + "/"});

    return {
        config,
        patch: {...patch, config},
        pages,
        aliases,
        data: {}
    };
};

module.exports = wend.siteModel;
