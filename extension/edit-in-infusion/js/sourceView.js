"use strict";

// The source view of "Edit in Infusion" - a CodeMirror 6 editor of the source being edited, markdown, an SFC or the
// site's configuration, in the editing panel beside the page. A content script, loaded after lib/codemirror6.js (the
// vendored bundle - see extension/codemirror/build.js) and before edit.js, which makes one with `fluidSourceView.create`.
//
// Beside the page's own blocks edited in place (sfc/fluid-blockEditor.vue), the view follows the block in hand: the
// lines of a block focused in the page are highlighted and scrolled into view, and the block holding the view's cursor
// is marked in the page - so that the markdown and its rendering may be read side by side.
//
// The view mirrors its text into a hidden <textarea>, and takes text written into it (with an "input" event) as an edit
// - so that what is outside the extension's world, e.g. a test driving the page, can read and write the source.

(function () {
    const CM = window.fluidCodeMirror;
    const fluidSourceView = {};

    // The decoration of the lines of the block in hand
    const setBlockLines = CM.StateEffect.define();
    const blockLinesField = CM.StateField.define({
        create: () => CM.Decoration.none,
        update: function (decorations, transaction) {
            let togo = decorations.map(transaction.changes);
            transaction.effects.filter(effect => effect.is(setBlockLines)).forEach(effect => {
                const builder = new CM.RangeSetBuilder();
                const doc = transaction.state.doc;
                const range = effect.value;
                if (range) {
                    for (let line = range.startLine + 1; line <= Math.min(range.endLine, doc.lines); line++) {
                        builder.add(doc.line(line).from, doc.line(line).from, CM.Decoration.line({class: "fluid-source-block-line"}));
                    }
                }
                togo = builder.finish();
            });
            return togo;
        },
        provide: field => CM.EditorView.decorations.from(field)
    });

    /**
     * Choose the language of a source by its path
     * @param {String} path - The source's path
     * @return {Object} The CodeMirror language extension
     */
    fluidSourceView.languageOf = function (path) {
        return path.endsWith(".vue") ? CM.vue() : path.endsWith(".json") ? CM.json() : CM.markdown();
    };

    /**
     * Find the change turning one text into another - the span between their common prefix and suffix - so that
     * replacing a text keeps the cursor and history of what is unchanged
     * @param {String} from - The text before
     * @param {String} to - The text after
     * @return {Object} The change, `{from, to, insert}`
     */
    fluidSourceView.diff = function (from, to) {
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
    fluidSourceView.relativePath = function (fromPage, to) {
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
    fluidSourceView.resolvePath = function (fromPage, target) {
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
    fluidSourceView.headingOptions = function (site, pathPart) {
        const path = fluidSourceView.resolvePath(site.page, pathPart);
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
    fluidSourceView.linkCompletions = function (getSite) {
        return function (context) {
            const match = context.matchBefore(/(!?)\[[^\]\n]*\]\(([^)\s]*)$/);
            const site = getSite();
            let togo = null;
            if (match && site) {
                const isImage = match.text.startsWith("!");
                const typed = match.text.substring(match.text.indexOf("](") + 2);
                const hash = typed.indexOf("#");
                const relative = /^\.\.?(\/|$)/.test(typed);
                const express = target => relative ? fluidSourceView.relativePath(site.page, target) : target;
                const options = hash >= 0 && !isImage ? fluidSourceView.headingOptions(site, typed.substring(0, hash)) : isImage ? site.assets.map(asset => ({
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
     * Make a source view
     * @param {Element} parent - The element to hold it
     * @param {Object} options - Its options
     * @param {Function} options.onChange - Receives the whole text when the user edits it
     * @param {Function} [options.onCursorLine] - Receives the line, counting from 0, of the cursor when it moves
     * @param {Function} [options.getSite] - Returns what is known of the site, for completing links - see
     * `linkCompletions`
     * @param {Function} [options.onPaste] - Receives the text of a paste, and returns `true` if it has taken it
     * @param {Function} [options.onDrop] - Receives the files of a drop, once the cursor is set where they were dropped,
     * and returns `true` if it has taken them
     * @return {Object} The view - `setText(text)`, `getText()`, `setLanguage(path)`, `showBlock({startLine, endLine})`,
     * `insertBlock(text)`, `focus()` and `mirror`, the hidden <textarea>
     */
    fluidSourceView.create = function (parent, {onChange, onCursorLine, getSite, onPaste, onDrop}) {
        const language = new CM.Compartment();
        const mirror = document.createElement("textarea");
        mirror.className = "fluid-edit-source-mirror";
        mirror.hidden = true;
        mirror.setAttribute("aria-hidden", "true");
        parent.appendChild(mirror);
        let applying = false;
        let lastCursorLine = -1;
        const view = new CM.EditorView({
            parent,
            state: CM.EditorState.create({
                doc: "",
                extensions: [
                    CM.lineNumbers(),
                    CM.highlightActiveLineGutter(),
                    CM.history(),
                    CM.drawSelection(),
                    CM.indentOnInput(),
                    CM.bracketMatching(),
                    CM.highlightActiveLine(),
                    CM.highlightSelectionMatches(),
                    CM.syntaxHighlighting(CM.defaultHighlightStyle, {fallback: true}),
                    CM.EditorView.lineWrapping,
                    CM.autocompletion({override: [fluidSourceView.linkCompletions(getSite || (() => null))], icons: false}),
                    CM.keymap.of([...CM.completionKeymap, ...CM.defaultKeymap, ...CM.historyKeymap, ...CM.searchKeymap, CM.indentWithTab]),
                    language.of(CM.markdown()),
                    blockLinesField,
                    // A paste may be taken by the extension, e.g. a widget held on the clipboard as PTF
                    CM.EditorView.domEventHandlers({
                        paste: event => {
                            const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
                            const taken = !!(onPaste && text && onPaste(text));
                            if (taken) {
                                event.preventDefault();
                            }
                            return taken;
                        },
                        // A drop of files may be taken by the extension, e.g. a widget as a ZIP file, or an image
                        drop: (event, dropView) => {
                            const files = event.dataTransfer ? [...event.dataTransfer.files] : [];
                            let taken = false;
                            if (onDrop && files.length > 0) {
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
                    CM.EditorView.updateListener.of(update => {
                        if (update.docChanged) {
                            mirror.value = update.state.doc.toString();
                            if (!applying) {
                                onChange(mirror.value);
                            }
                        }
                        if (update.selectionSet && onCursorLine && !applying) {
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
                    view.dispatch({changes: fluidSourceView.diff(current, text)});
                } catch (error) {
                    console.error("Edit in Infusion: the source view could not take the source", error);
                } finally {
                    applying = false;
                }
            }
            mirror.value = text;
        };
        that.setLanguage = path => view.dispatch({effects: language.reconfigure(fluidSourceView.languageOf(path))});
        that.showBlock = function (range) {
            const doc = view.state.doc;
            const effects = [setBlockLines.of(range)];
            if (range && range.startLine < doc.lines) {
                effects.push(CM.EditorView.scrollIntoView(doc.line(range.startLine + 1).from, {y: "center"}));
            }
            view.dispatch({effects});
        };
        that.focus = () => view.focus();
        // Insert text at the cursor, as its own block - set off by blank lines, splitting the line the cursor is within -
        // as the user's edit
        that.insertBlock = function (text) {
            const doc = view.state.doc;
            const head = view.state.selection.main.head;
            const line = doc.lineAt(head);
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
                view.dispatch({changes: fluidSourceView.diff(that.getText(), mirror.value)});
            }
        });
        return that;
    };

    window.fluidSourceView = fluidSourceView;
})();
