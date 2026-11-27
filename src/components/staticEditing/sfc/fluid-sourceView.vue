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

// The nodes of the source's syntax tree within which nothing is completed - code, whether markdown's or an SFC's scripts
// and styles, which only quotes what a link, a widget's element or a template's reference would be elsewhere
fluid.sourceView.codeNodes = new Set(["FencedCode", "CodeBlock", "InlineCode", "CodeText", "ScriptText", "StyleText", "Script", "Style", "StyleSheet"]);

/**
 * Determine whether the position completed stands within code, as the source's syntax tree parses it
 * @param {Object} context - CodeMirror's completion context
 * @return {Boolean} `true` if it does
 */
fluid.sourceView.inCode = function (context) {
    let node = fluid.sourceView.CM.syntaxTree(context.state).resolveInner(context.pos, -1);
    let togo = false;
    while (node && !togo) {
        togo = fluid.sourceView.codeNodes.has(node.name);
        node = node.parent;
    }
    return togo;
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
        const match = fluid.sourceView.inCode(context) ? null : context.matchBefore(/(!?)\[[^\]\n]*\]\(([^)\s]*)$/);
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
 * Make the source of completions of the layers of widgets, as one is typed into the `fluid-layers` attribute of a
 * widget's element - those of the site's widgets which may be inserted, whether published or held in the browser
 * @param {Function} getSite - Returns what is known of the site, as for `linkCompletions` - its `widgetLayers`, as
 * `{layer, note}`, are offered
 * @return {Function} The completion source, for CodeMirror's autocompletion
 */
fluid.sourceView.layerCompletions = function (getSite) {
    return function (context) {
        // Within the attribute's quotes, after any layers already named - the name being typed is completed
        const match = fluid.sourceView.inCode(context) ? null : context.matchBefore(/\sfluid-layers\s*=\s*"[^"\n]*$/);
        const site = match ? getSite() : null;
        let togo = null;
        if (match && site && site.widgetLayers) {
            const typed = match.text.substring(match.text.lastIndexOf("\"") + 1).split(/\s+/).pop();
            togo = {
                from: context.pos - typed.length,
                options: site.widgetLayers.map(({layer, note}) => ({label: layer, detail: note || "widget", type: "class"})),
                validFor: /^[\w.$-]*$/
            };
        }
        return togo;
    };
};

/**
 * Make the completion source of the references of a template, in two levels as Infusion's templates write them - a
 * context, `@{{context}.member}`, completed from the contexts in scope of the component rendering the template as
 * `@{{` is typed, and once its brace is closed and a `.` typed, from the members of that context; or a member of the
 * component itself, `@{member}`, e.g. `@{au` completing to `@{author.name}`
 * @param {Function} getScope - Returns what the template may refer to, as by fluid.staticEditing.templateScope -
 * `{contexts(), members(context)}` - or null where nothing is known of it
 * @return {Function} The completion source, for CodeMirror's autocompletion
 */
fluid.sourceView.templateCompletions = function (getScope) {
    return function (context) {
        const match = fluid.sourceView.inCode(context) ? null : context.matchBefore(/@\{(?:\{[\w.$-]*\}?\.?)?[\w.$-]*$/);
        const scope = match ? getScope() : null;
        let togo = null;
        if (match && scope) {
            const typed = match.text.substring(2);
            const contextual = /^\{([\w.$-]*)(\})?(\.)?([\w.$-]*)$/.exec(typed);
            // The closing brace of a reference, should it not follow already
            const closing = context.state.sliceDoc(context.pos, context.pos + 1) === "}" ? "" : "}";
            if (contextual && !contextual[2]) {
                // A context being named, after "@{{"
                togo = {
                    from: context.pos - contextual[1].length,
                    // Chosen, the context's members are offered at once
                    options: scope.contexts().map(name => ({label: name, detail: "context", type: "namespace", apply: (view, completion, from, to) => {
                        const insert = name + (view.state.sliceDoc(to, to + 2) === "}." ? "" : "}.");
                        view.dispatch({changes: {from, to, insert}, selection: {anchor: from + insert.length}});
                        // Once the completion accepted has closed
                        setTimeout(() => fluid.sourceView.CM.startCompletion(view));
                    }})),
                    validFor: /^[\w.$-]*$/
                };
            } else if (contextual && contextual[3] !== undefined) {
                // A member of the context named, after "@{{context}."
                togo = {
                    from: context.pos - contextual[4].length,
                    options: scope.members(contextual[1]).map(({name, detail}) => ({label: name, apply: name + closing, detail, type: "property"})),
                    validFor: /^[\w.$-]*$/
                };
            } else if (!contextual) {
                // A member of the component itself, after "@{"
                togo = {
                    from: context.pos - typed.length,
                    options: scope.members(null).map(({name, detail}) => ({label: name, apply: name + closing, detail, type: "property"})),
                    validFor: /^[\w.$-]*$/
                };
            }
        }
        return togo;
    };
};

/**
 * Make the source view in its rendered container - a CodeMirror 6 editor, and a hidden <textarea> mirroring its text.
 * What happens in it is announced as DOM events on the container, which bubble: "fluidsourcechange" {text} on each
 * edit; "fluidsourcecursor" {line, pos} as the cursor moves; "fluidsourcepaste" {text} and
 * "fluidsourcedrop" {files}, cancelable, a listener preventing the default to take the paste or drop, e.g. a widget
 * held on the clipboard as PTF; and "fluidsourcesite" {site, templateScope}, into whose detail a listener writes what is
 * known of the site, for completing links - see `linkCompletions` - and of the component rendering the source, for
 * completing its template's references - see `templateCompletions`
 * @param {Element} parent - The view's rendered container
 * @return {Object} The view - `setText(text)`, `getText()`, `setLanguage(path)`, `showBlock({startLine, endLine})`,
 * `showPosition(pos)`, `selection()`, `insertBlock(text)`, `focus()`, `view`, the CodeMirror view, and `mirror`, the
 * hidden <textarea>
 */
fluid.sourceView.bind = function (parent) {
    const announce = (type, detail, cancelable) => {
        const event = new CustomEvent(type, {bubbles: true, cancelable: !!cancelable, detail});
        parent.dispatchEvent(event);
        return event;
    };
    const onChange = text => announce("fluidsourcechange", {text});
    const onCursor = (line, pos) => announce("fluidsourcecursor", {line, pos});
    const getSite = () => announce("fluidsourcesite", {site: null, templateScope: null}).detail.site;
    const getScope = () => announce("fluidsourcesite", {site: null, templateScope: null}).detail.templateScope;
    const onPaste = text => announce("fluidsourcepaste", {text}, true).defaultPrevented;
    const onDrop = files => announce("fluidsourcedrop", {files}, true).defaultPrevented;
    const language = new fluid.sourceView.CM.Compartment();
    const mirror = document.createElement("textarea");
    mirror.className = "fluid-edit-source-mirror";
    mirror.hidden = true;
    mirror.setAttribute("aria-hidden", "true");
    parent.appendChild(mirror);
    let applying = false;
    let lastCursorPos = -1;
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
                fluid.sourceView.CM.autocompletion({override: [fluid.sourceView.linkCompletions(getSite), fluid.sourceView.layerCompletions(getSite),
                    fluid.sourceView.templateCompletions(getScope)], icons: false}),
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
                    // Files, or a widget dragged out of another page as PTF, show where they would land over the source -
                    // see fluid.sourceView.showDropCaret
                    dragover: (event, dropView) => {
                        const types = event.dataTransfer ? [...event.dataTransfer.types] : [];
                        const carries = types.includes("Files") || types.includes(fluid.sourceView.ptfDragType);
                        const pos = carries ? dropView.posAtCoords({x: event.clientX, y: event.clientY}) : null;
                        fluid.sourceView.showDropCaret(pos === null ? null : dropView.coordsAtPos(pos));
                        return false;
                    },
                    dragleave: (event, dropView) => {
                        if (!dropView.dom.contains(event.relatedTarget)) {
                            fluid.sourceView.showDropCaret(null);
                        }
                        return false;
                    },
                    // A drop of files may be taken by the extension, e.g. a widget as a ZIP file, or an image - and a widget
                    // dragged as PTF is taken as its paste would be
                    drop: (event, dropView) => {
                        fluid.sourceView.showDropCaret(null);
                        const files = event.dataTransfer ? [...event.dataTransfer.files] : [];
                        const ptf = event.dataTransfer && files.length === 0 ? event.dataTransfer.getData(fluid.sourceView.ptfDragType) : "";
                        let taken = false;
                        if (files.length > 0 || ptf) {
                            const pos = dropView.posAtCoords({x: event.clientX, y: event.clientY});
                            if (pos !== null) {
                                dropView.dispatch({selection: {anchor: pos}});
                            }
                            taken = files.length > 0 ? !!onDrop(files) : !!onPaste(ptf);
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
                        const head = update.state.selection.main.head;
                        const line = update.state.doc.lineAt(head).number - 1;
                        if (line !== lastCursorLine || head !== lastCursorPos) {
                            lastCursorLine = line;
                            lastCursorPos = head;
                            onCursor(line, head);
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
    // Show the lines of the block in hand in the page, highlighted and scrolled into view, with the cursor moved to their
    // start - announced as any move of the cursor is, so that the page marks the block as the one the cursor is in -
    // but without taking the focus from the page
    that.showBlock = function (range) {
        const doc = view.state.doc;
        const effects = [fluid.sourceView.setBlockLines.of(range)];
        const transaction = {effects};
        if (range && range.startLine < doc.lines) {
            const start = doc.line(range.startLine + 1).from;
            effects.push(fluid.sourceView.CM.EditorView.scrollIntoView(start, {y: "center"}));
            transaction.selection = {anchor: start};
        }
        view.dispatch(transaction);
    };
    that.focus = () => view.focus();
    // Move the cursor to a position, scrolled into view, as the user's selection elsewhere moves it - announcing no move
    // of the cursor, which is where that selection already stands, nor taking the focus from it
    that.showPosition = function (pos) {
        applying = true;
        try {
            const at = Math.min(pos, view.state.doc.length);
            view.dispatch({selection: {anchor: at}, effects: fluid.sourceView.CM.EditorView.scrollIntoView(at, {y: "nearest"})});
            lastCursorPos = at;
            lastCursorLine = view.state.doc.lineAt(at).number - 1;
        } finally {
            applying = false;
        }
    };
    // The text selected, and where - empty at the cursor, should nothing be selected
    that.selection = function () {
        const {from, to} = view.state.selection.main;
        return {from, to, text: view.state.doc.sliceString(from, to)};
    };
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
/**
 * Show where files dragged over the source would land if dropped - a caret, sliding as the drag moves - or show none
 * @param {Object|null} coords - The place, in the viewport, of the position they would land at, as CodeMirror's
 * `coordsAtPos` gives it `{left, top, bottom}`, or null to show none
 */
fluid.sourceView.showDropCaret = function (coords) {
    let caret = document.querySelector(".fluid-edit-source-drop-caret");
    if (coords) {
        if (!caret) {
            caret = document.createElement("div");
            caret.className = "fluid-edit-source-drop-caret";
            caret.setAttribute("data-fluid-edit-ui", "");
            caret.setAttribute("aria-hidden", "true");
            document.body.appendChild(caret);
        }
        Object.assign(caret.style, {left: coords.left + "px", top: coords.top + "px", height: (coords.bottom - coords.top) + "px"});
    } else if (caret) {
        caret.remove();
    }
};

// A drag ended anywhere leaves no caret behind
document.addEventListener("dragend", () => fluid.sourceView.showDropCaret(null));
document.addEventListener("drop", () => fluid.sourceView.showDropCaret(null));

// The type under which a widget dragged out of another page is carried as PTF - as fluid.blockEditor.ptfDragType
fluid.sourceView.ptfDragType = "application/x-ptf";

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
/* The source view - CodeMirror 6 - filling the unfolded source of the editing panel, which shares the panel's height
   with its other controls, the editor scrolling within what it is left */
.fluid-edit-source-view {
    flex: 1 1 0;
    min-height: 36px;
    display: flex;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    overflow: hidden;
}

/* Shrunk with the view, scrolling within it, rather than holding the height of its content */
.fluid-edit-source-view .cm-editor {
    flex: 1;
    min-height: 0;
    height: 100%;
    font-size: 13px;
}

/* The font of Infusion's code examples - see fluid-liveExample.vue */
.fluid-edit-source-view .cm-scroller {
    font-family: var(--fl-monospace, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace);
}

.fluid-edit-source-view .cm-editor.cm-focused {
    outline: 2px solid #2b6cb0;
}

.fluid-edit-source-view .fluid-source-block-line {
    background-color: rgba(43, 108, 176, 0.09);
}

/* Where files dragged over the source would land - see fluid.sourceView.showDropCaret */
.fluid-edit-source-drop-caret {
    position: fixed;
    z-index: 2147482001;
    width: 2px;
    margin-left: -1px;
    background: #2b6cb0;
    pointer-events: none;
    transition: left 0.08s ease-out, top 0.08s ease-out;
}
</style>
