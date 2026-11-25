<script>
// The source view of a page being edited in place - a CodeMirror 6 editor of the source being edited, markdown, an SFC
// or the site's configuration, in the editing panel beside the page - see fluid-staticEditor.vue. It uses Infusion's
// one copy of CodeMirror 6, the bundle of fluid-lint, src/lib/fluid-lint/fluid-lint.js, which must be loaded first.
//
// Beside the page's own blocks edited in place (fluid-blockEditor.vue), the view follows the block in hand: the lines of
// a block focused in the page are highlighted and scrolled into view, and the block holding the view's cursor is
// marked in the page - so that the markdown and its rendering may be read side by side.
//
// The view mirrors its text into a hidden <textarea>, and takes text written into it (with an "input" event) as an edit
// - so that what drives the page from outside, e.g. a test, can read and write the source.

fluid.def("fluid.sourceView", {
    $layers: "fluid.component",
    controller: {
        $bindable: {
            bind: "fluid.sourceView.bind({self}.view.renderedContainer)",
            unbind: "fluid.sourceView.unbind({boundValue})"
        }
    }
});

// CodeMirror 6, as Infusion's bundle of fluid-lint exports it
fluid.sourceView.CM = fluid.codemirror6;

// The decoration of the lines of the block in hand
fluid.sourceView.setBlockLines = fluid.sourceView.CM.StateEffect.define();
fluid.sourceView.blockLinesField = fluid.sourceView.CM.StateField.define({
    create: () => fluid.sourceView.CM.Decoration.none,
    update: function (decorations, transaction) {
        let togo = decorations.map(transaction.changes);
        transaction.effects.filter(effect => effect.is(fluid.sourceView.setBlockLines)).forEach(effect => {
            const builder = new fluid.sourceView.CM.RangeSetBuilder();
            const doc = transaction.state.doc;
            const range = effect.value;
            if (range) {
                for (let line = range.startLine + 1; line <= Math.min(range.endLine, doc.lines); line++) {
                    builder.add(doc.line(line).from, doc.line(line).from, fluid.sourceView.CM.Decoration.line({class: "fluid-source-block-line"}));
                }
            }
            togo = builder.finish();
        });
        return togo;
    },
    provide: field => fluid.sourceView.CM.EditorView.decorations.from(field)
});

/**
 * Choose the language of a source by its path
 * @param {String} path - The source's path
 * @return {Object} The CodeMirror language extension
 */
fluid.sourceView.languageOf = function (path) {
    return path.endsWith(".vue") ? fluid.sourceView.CM.vue() : path.endsWith(".json") ? fluid.sourceView.CM.json() : fluid.sourceView.CM.markdown();
};

/**
 * Find the change turning one text into another - the span between their common prefix and suffix - so that
 * replacing a text keeps the cursor and history of what is unchanged
 * @param {String} from - The text before
 * @param {String} to - The text after
 * @return {Object} The change, `{from, to, insert}`
 */
fluid.sourceView.diff = function (from, to) {
    let start = 0;
    while (start < from.length && start < to.length && from[start] === to[start]) {
        start++;
    }
    let end = 0;
    while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) {
        end++;
    }
    return {from: start, to: from.length - end, insert: to.substring(start, to.length - end)};
};

/**
 * Express a path of the site relative to the directory of a page, as "./" or "../" followed by the rest
 * @param {String} fromPage - The page's path from the root of the site, e.g. "/post/x/"
 * @param {String} to - The path linked to, from the root of the site, e.g. "/img/y.png" or "/docs/"
 * @return {String} The relative path, e.g. "../../img/y.png"
 */
fluid.sourceView.relativePath = function (fromPage, to) {
    const fromSegs = fromPage.split("/").filter(seg => seg);
    // A page's own path is a directory, holding its index.html
    const toSegs = to.split("/").filter(seg => seg);
    let common = 0;
    while (common < fromSegs.length && common < toSegs.length - (to.endsWith("/") ? 0 : 1) && fromSegs[common] === toSegs[common]) {
        common++;
    }
    const up = fromSegs.length - common;
    const rest = toSegs.slice(common).join("/") + (to.endsWith("/") && toSegs.length > common ? "/" : "");
    return (up === 0 ? "./" : "../".repeat(up)) + rest;
};

/**
 * Resolve the path part of a link's destination to the path of a page of the site, from the root
 * @param {String} fromPage - The path of the page holding the link, e.g. "/post/x/"
 * @param {String} target - The path part, e.g. "../y/", "/docs/z/" or "" for the page itself
 * @return {String} The page's path, e.g. "/post/y/"
 */
fluid.sourceView.resolvePath = function (fromPage, target) {
    const resolved = new URL(target || "./", "http://site" + fromPage).pathname;
    return resolved.endsWith("/") ? resolved : resolved + "/";
};

/**
 * Offer the headings of a page as completions of the fragment of a link to it - those of the page edited, as its
 * source now stands, for a link begun "#", or those of another page as published
 * @param {Object} site - What is known of the site - see `linkCompletions`
 * @param {String} pathPart - What precedes the "#" in the destination typed
 * @return {Object[]} The completions, each of the whole destination
 */
fluid.sourceView.headingOptions = function (site, pathPart) {
    const path = fluid.sourceView.resolvePath(site.page, pathPart);
    const page = site.pages.find(one => one.path === path);
    const headings = path === site.page && site.ownHeadings ? site.ownHeadings : page ? page.headings || [] : [];
    return headings.map((heading, index) => ({
        label: pathPart + "#" + heading.id,
        displayLabel: "  ".repeat(Math.max(0, heading.level - 2)) + heading.text,
        detail: "#" + heading.id,
        type: "property",
        // In the order of the page
        boost: -index / headings.length
    }));
};

/**
 * Make the source of completions for the destinations of markdown links and images - `[text](` offers the site's
 * pages, by title, and `![alt](` its images; after a "#", e.g. `[text](#` or `[text](/post/x/#`, the headings of
 * the page named, or of the page edited, are offered. A destination begun "/" or nothing is completed from the root of the
 * site, as `/post/x/`; one begun "./" or "../" relative to the page edited, as its build resolves either
 * @param {Function} getSite - Returns what is known of the site, `{pages, assets, page, ownHeadings}` - its pages,
 * each `{path, title, kind, headings}`, the paths of its images, the path of the page edited, and the headings of
 * its source as edited, if learned - or null if nothing is yet
 * @return {Function} The completion source
 */
fluid.sourceView.linkCompletions = function (getSite) {
    return function (context) {
        const match = context.matchBefore(/(!?)\[[^\]\n]*\]\(([^)\s]*)$/);
        const site = getSite();
        let togo = null;
        if (match && site) {
            const isImage = match.text.startsWith("!");
            const typed = match.text.substring(match.text.indexOf("](") + 2);
            const hash = typed.indexOf("#");
            const relative = /^\.\.?(\/|$)/.test(typed);
            const express = target => relative ? fluid.sourceView.relativePath(site.page, target) : target;
            const options = hash >= 0 && !isImage ? fluid.sourceView.headingOptions(site, typed.substring(0, hash)) : isImage ? site.assets.map(asset => ({
                label: express(asset),
                displayLabel: asset.substring(asset.lastIndexOf("/") + 1),
                detail: express(asset),
                type: "image",
                // A destination holding spaces is bracketed, as markdown requires
                apply: /\s/.test(asset) ? "<" + express(asset) + ">" : express(asset)
            })) : site.pages.filter(page => page.path !== site.page).map(page => ({
                label: express(page.path),
                displayLabel: page.title || page.path,
                detail: express(page.path),
                info: page.kind,
                type: page.kind === "page" ? "text" : "class",
                // Pages of content before lists of them
                boost: page.kind === "page" ? 1 : 0
            }));
            // Matched, as typed, against the paths offered - shown with their pages' titles
            togo = {from: context.pos - typed.length, options, validFor: /^[^)\s]*$/};
        }
        return togo;
    };
};

/**
 * Make the source view in its rendered container - a CodeMirror 6 editor, and a hidden <textarea> mirroring its text.
 * What happens in it is announced as DOM events on the container, which bubble: "fluidsourcechange" {text} on each
 * edit; "fluidsourcecursor" {line} as the cursor moves to another line; "fluidsourcepaste" {text} and
 * "fluidsourcedrop" {files}, cancelable, a listener preventing the default to take the paste or drop, e.g. a widget
 * held on the clipboard as PTF; and "fluidsourcesite" {site}, into whose detail a listener writes what is known of the
 * site, for completing links - see `linkCompletions`
 * @param {Element} parent - The view's rendered container
 * @return {Object} The view - `setText(text)`, `getText()`, `setLanguage(path)`, `showBlock({startLine, endLine})`,
 * `insertBlock(text)`, `focus()`, `view`, the CodeMirror view, and `mirror`, the hidden <textarea>
 */
fluid.sourceView.bind = function (parent) {
    const announce = (type, detail, cancelable) => {
        const event = new CustomEvent(type, {bubbles: true, cancelable: !!cancelable, detail});
        parent.dispatchEvent(event);
        return event;
    };
    const onChange = text => announce("fluidsourcechange", {text});
    const onCursorLine = line => announce("fluidsourcecursor", {line});
    const getSite = () => announce("fluidsourcesite", {site: null}).detail.site;
    const onPaste = text => announce("fluidsourcepaste", {text}, true).defaultPrevented;
    const onDrop = files => announce("fluidsourcedrop", {files}, true).defaultPrevented;
    const language = new fluid.sourceView.CM.Compartment();
    const mirror = document.createElement("textarea");
    mirror.className = "fluid-edit-source-mirror";
    mirror.hidden = true;
    mirror.setAttribute("aria-hidden", "true");
    parent.appendChild(mirror);
    let applying = false;
    let lastCursorLine = -1;
    const view = new fluid.sourceView.CM.EditorView({
        parent,
        state: fluid.sourceView.CM.EditorState.create({
            doc: "",
            extensions: [
                fluid.sourceView.CM.lineNumbers(),
                fluid.sourceView.CM.highlightActiveLineGutter(),
                fluid.sourceView.CM.history(),
                fluid.sourceView.CM.drawSelection(),
                fluid.sourceView.CM.indentOnInput(),
                fluid.sourceView.CM.bracketMatching(),
                fluid.sourceView.CM.highlightActiveLine(),
                fluid.sourceView.CM.highlightSelectionMatches(),
                fluid.sourceView.CM.syntaxHighlighting(fluid.sourceView.CM.defaultHighlightStyle, {fallback: true}),
                fluid.sourceView.CM.EditorView.lineWrapping,
                fluid.sourceView.CM.autocompletion({override: [fluid.sourceView.linkCompletions(getSite)], icons: false}),
                fluid.sourceView.CM.keymap.of([...fluid.sourceView.CM.completionKeymap, ...fluid.sourceView.CM.defaultKeymap, ...fluid.sourceView.CM.historyKeymap, ...fluid.sourceView.CM.searchKeymap, fluid.sourceView.CM.indentWithTab]),
                language.of(fluid.sourceView.CM.markdown()),
                fluid.sourceView.blockLinesField,
                // A paste may be taken by the extension, e.g. a widget held on the clipboard as PTF
                fluid.sourceView.CM.EditorView.domEventHandlers({
                    paste: event => {
                        const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
                        const taken = !!(text && onPaste(text));
                        if (taken) {
                            event.preventDefault();
                        }
                        return taken;
                    },
                    // A drop of files may be taken by the extension, e.g. a widget as a ZIP file, or an image
                    drop: (event, dropView) => {
                        const files = event.dataTransfer ? [...event.dataTransfer.files] : [];
                        let taken = false;
                        if (files.length > 0) {
                            const pos = dropView.posAtCoords({x: event.clientX, y: event.clientY});
                            if (pos !== null) {
                                dropView.dispatch({selection: {anchor: pos}});
                            }
                            taken = !!onDrop(files);
                        }
                        if (taken) {
                            event.preventDefault();
                        }
                        return taken;
                    }
                }),
                fluid.sourceView.CM.EditorView.updateListener.of(update => {
                    if (update.docChanged) {
                        mirror.value = update.state.doc.toString();
                        if (!applying) {
                            onChange(mirror.value);
                        }
                    }
                    if (update.selectionSet && !applying) {
                        const line = update.state.doc.lineAt(update.state.selection.main.head).number - 1;
                        if (line !== lastCursorLine) {
                            lastCursorLine = line;
                            onCursorLine(line);
                        }
                    }
                })
            ]
        })
    });
    // CodeMirror's styles are written into a <style> element of its own in the head - it is the extension's, which
    // the bridge keeps out of the page while the page's tree claims the head as it boots (see bridge.js)
    [...document.head.querySelectorAll("style")].filter(style => /\.cm-editor|\.cm-scroller/.test(style.textContent))
        .forEach(style => style.setAttribute("data-fluid-edit-ui", ""));
    const that = {view, mirror};
    that.getText = () => view.state.doc.toString();
    that.setText = function (text) {
        const current = that.getText();
        if (text !== current) {
            applying = true;
            try {
                view.dispatch({changes: fluid.sourceView.diff(current, text)});
            } catch (error) {
                console.error("Edit in Infusion: the source view could not take the source", error);
            } finally {
                applying = false;
            }
        }
        mirror.value = text;
    };
    that.setLanguage = path => view.dispatch({effects: language.reconfigure(fluid.sourceView.languageOf(path))});
    that.showBlock = function (range) {
        const doc = view.state.doc;
        const effects = [fluid.sourceView.setBlockLines.of(range)];
        if (range && range.startLine < doc.lines) {
            effects.push(fluid.sourceView.CM.EditorView.scrollIntoView(doc.line(range.startLine + 1).from, {y: "center"}));
        }
        view.dispatch({effects});
    };
    that.focus = () => view.focus();
    // Insert text at the cursor, as its own block - set off by blank lines, splitting the line the cursor is within -
    // as the user's edit. A widget inserted within another widget's element takes its place, rather than splitting it
    that.insertBlock = function (text) {
        const doc = view.state.doc;
        const head = view.state.selection.main.head;
        const line = doc.lineAt(head);
        const island = fluid.sourceView.isIsland(text) ? fluid.sourceView.islandBlockAt(doc, line.number) : null;
        if (island) {
            view.dispatch({changes: {from: island.from, to: island.to, insert: text}, selection: {anchor: island.from + text.length}});
        } else {
            that.insertBetween(text, head, line);
        }
    };
    /**
     * Insert text at a position, as its own block, splitting the line holding it
     * @param {String} text - The text
     * @param {Number} head - The position
     * @param {Line} line - The line holding it
     */
    that.insertBetween = function (text, head, line) {
        const doc = view.state.doc;
        const before = doc.sliceString(line.from, head);
        const after = doc.sliceString(head, line.to);
        const previous = line.number > 1 ? doc.line(line.number - 1).text : "";
        const next = line.number < doc.lines ? doc.line(line.number + 1).text : "";
        // Whitespace beside the cursor is replaced, so that the block begins its line
        const from = before.trim() ? head - (before.length - before.trimEnd().length) : line.from;
        const to = after.trim() ? head + (after.length - after.trimStart().length) : line.to;
        const lead = before.trim() ? "\n\n" : previous.trim() ? "\n" : "";
        const trail = after.trim() ? "\n\n" : next.trim() ? "\n" : "";
        const insert = lead + text + trail;
        view.dispatch({changes: {from, to, insert}, selection: {anchor: from + lead.length + text.length}});
    };
    // Text written into the mirror from outside is taken as the user's edit
    mirror.addEventListener("input", () => {
        if (mirror.value !== that.getText()) {
            view.dispatch({changes: fluid.sourceView.diff(that.getText(), mirror.value)});
        }
    });
    return that;
};

// The opening of an element bearing `fluid-layers` - a widget's island, as fluid.ptf.islandMarkup writes it
fluid.sourceView.islandOpening = /^\s*<[a-zA-Z][\w-]*\s[^>]*\bfluid-layers\s*=/;

/**
 * Determine whether text to be inserted is a widget's element alone - a single block opening with an element bearing
 * `fluid-layers`
 * @param {String} text - The text
 * @return {Boolean} `true` if it is
 */
fluid.sourceView.isIsland = text => fluid.sourceView.islandOpening.test(text) && !/\n\s*\n/.test(text.trim());

/**
 * Find the widget's element a line lies within - the block of lines, unbroken by a blank line, holding the line and
 * opening with an element bearing `fluid-layers`, as markdown takes an HTML block
 * @param {Text} doc - The CodeMirror document
 * @param {Number} lineNumber - The line's number, counting from 1
 * @return {Object|null} `{from, to}`, the positions of the block, or null if the line is in no widget's element
 */
fluid.sourceView.islandBlockAt = function (doc, lineNumber) {
    let togo = null;
    if (doc.line(lineNumber).text.trim() !== "") {
        let first = lineNumber;
        while (first > 1 && doc.line(first - 1).text.trim() !== "") {
            --first;
        }
        let last = lineNumber;
        while (last < doc.lines && doc.line(last + 1).text.trim() !== "") {
            ++last;
        }
        if (fluid.sourceView.islandOpening.test(doc.line(first).text)) {
            togo = {from: doc.line(first).from, to: doc.line(last).to};
        }
    }
    return togo;
};

/**
 * Destroy a source view
 * @param {Object} that - The view, as made by `fluid.sourceView.bind`
 */
fluid.sourceView.unbind = function (that) {
    that.view.destroy();
    that.mirror.remove();
};
</script>

<template>
    <div class="fluid-edit-source-view"></div>
</template>

<style>
/* The source view - CodeMirror 6 - filling the unfolded source of the editing panel */
/* Its height is given, since a <details> lays out its content apart from the panel's flexbox */
.fluid-edit-source-view {
    height: calc(100vh - 280px);
    min-height: 200px;
    display: flex;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    overflow: hidden;
}

.fluid-edit-source-view .cm-editor {
    flex: 1;
    height: 100%;
    font-size: 13px;
}

.fluid-edit-source-view .cm-scroller {
    font-family: ui-monospace, monospace;
}

.fluid-edit-source-view .cm-editor.cm-focused {
    outline: 2px solid #2b6cb0;
}

.fluid-edit-source-view .fluid-source-block-line {
    background-color: rgba(43, 108, 176, 0.09);
}
</style>
