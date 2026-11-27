<!-- The "Ask me anything" panel itself, with the machinery of conversing with a model and the protocol of an arena -->
<fluid-import src="../../askAnything/fluid-askAnything.vue"></fluid-import>

<script>
// The "Ask me anything" panel as the editing panel of a wend site hosts it, disclosed at the panel's foot - see
// fluid.staticEditing.toggleAI. What it converses about is the page edited: its widgets, the live components of the
// elements its source holds, form the arena (see fluid-ai-arena.js), and the source itself, its markdown, is sent with
// them, marked with the user's cursor as <fluid-infusion-cursor/>. Where the tldraw demo places a fresh widget on its
// canvas, here it is pasted into the source at the cursor, as a block of its own - never within the element of another
// widget, whose component tree it would corrupt - and an altered widget's element is rewritten in the source. Every
// change is made to the source, as the user's own edit of it, which the page then renders, so that it is held in the
// claim, and committed, as any other.
// See FLUID-7022

fluid.registerNamespace("fluid.staticEditing.ai");

fluid.def("fluid.staticEditing.askAnything", {
    $layers: "fluid.askAnything",
    // Made as the panel is disclosed - see fluid.staticEditing.toggleAI
    assistant: "fluid.staticEditing.ai.assistant"
});

// The marker of the user's cursor in the source sent to the AI - an element, which a model reads as a point in the
// markup rather than as text to be repeated, and which can't be mistaken for anything the source holds
fluid.staticEditing.ai.cursorMarker = "<fluid-infusion-cursor/>";

// The markers of the text the user has selected in the source sent to the AI, in place of the cursor's, the first
// bearing the id issued for the selection - see markedSource
fluid.staticEditing.ai.selectionMarkers = [id => `<fluid-infusion-selection id="${id}">`, () => "</fluid-infusion-selection>"];

fluid.staticEditing.ai.introduction = `You are an assistant embedded in the editor of a page of a website built with wend, a \
static site generator built on Fluid Infusion 6, a framework in which an application is made of named layers of \
declarative configuration which any party may add to or override. The page is written in markdown, which may hold \
widgets - live Infusion components, each written into the markdown as an element bearing \`fluid-layers\`, naming its \
layers, \`fluid-id\`, its id, and \`fluid-potentia\`, its configuration. Besides answering the user's questions about the \
page and its widgets, you can reflect on its widgets and alter them - adapting them, composing them and creating new \
ones - by replying with a document in Infusion's Potentia Transmission Format (PTF), which is applied directly to the \
page. The documentation of the framework follows, then the rules for your response and some strategy hints, and \
finally the current state of the page, its widgets and the user's selection.`;

fluid.staticEditing.ai.placingRules = `## Placing widgets in the page

The workspace ends with a \`markdown\` part holding the page's markdown source as it stands, in which the user's cursor \
is marked by the element ${fluid.staticEditing.ai.cursorMarker}. A fresh widget is pasted into the markdown where the \
cursor stands, as a block of its own - several fresh widgets one after another - so that "put a widget here" means at \
the cursor. The cursor never stands within a widget's element. The marker is not part of the page: never write it \
yourself. Never send a \`markdown\` part. Your changes to widgets are written into the markdown for you: a fresh widget \
is inserted, a widget deleted by a \`delete\` part naming its id is removed from it, and a widget altered is written \
back into it - so never patch a widget's element. To change any other text of the page, send a \`patch\` part whose \
\`Target\` is \`file:\` followed by the markdown part's filename, e.g. \`Target: file:content/post/first.md\`. Copy \
each SEARCH text from the markdown as shown, which may include the cursor's or the selection's markers - these are \
not part of the page, and are dropped from whatever you write.`;

fluid.staticEditing.ai.selectionRules = `## The user's selection

Should the user have selected text in the source, the workspace's source part encloses it between \
${fluid.staticEditing.ai.selectionMarkers[0]("s1")} and ${fluid.staticEditing.ai.selectionMarkers[1]()}, in place of \
the cursor's marker, its \`id\` naming the selection - "the selection", "the selected markup", "this" and the like \
refer to it. The source may be the \
page's markdown, or another source of the site the user edits, e.g. an SFC of its framing, named by the part's \
filename. To replace the selected text, e.g. to convert selected HTML markup to its equivalent in markdown, to reword \
it, or to correct it, reply with a PTF document holding a \`replace\` part with \`Target: selection:\` followed by \
the selection's id, e.g. \`Target: selection:s1\`, Content-Type \`text/plain; charset=utf-8\`, any filename, and as \
its body exactly the text which is to stand in place of the selection - nothing of the text around it, and never the \
markers. An empty body deletes the selected text. Every change to the source is applied directly to it, as the \
user's own edit, which they can see and undo - unless the source has changed since it was sent, when it is refused.`;

fluid.staticEditing.ai.pageHints = `* A widget is a fluid.topLevelWidget, sized by the page's layout rather than by any \
\`preferredSize\`. It is saved into the page with its live state, and published with the site once the user commits.`;

// The system prompt of an assistant conversing about the page - Infusion's, with the stanzas of a wend page merged in
fluid.def("fluid.staticEditing.ai.systemPrompt", {
    $layers: "fluid.ai.arena.systemPrompt",
    stanzas: {
        introduction: {text: fluid.staticEditing.ai.introduction},
        placingRules: {order: 35, text: fluid.staticEditing.ai.placingRules},
        selectionRules: {order: 37, text: fluid.staticEditing.ai.selectionRules},
        pageHints: {order: 45, text: fluid.staticEditing.ai.pageHints}
    },
    workspaceCaption: "The following PTF document holds every Infusion widget of the page, with the definitions of the "
        + "layers they use, followed by the source the user edits, marked with the user's cursor or selection:",
    docUrls: [
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-integration-language.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-view.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-ptf.md"
    ]
});

/**
 * Find where a widget pasted at a position of the source would be inserted - at the position itself, unless it lies
 * within the element of a widget, when just after that element, since a widget pasted into another's would corrupt the
 * tree of its components
 * @param {Object} source - The source view, as made by fluid.sourceView.bind
 * @param {Number} pos - The position
 * @return {Number} The position at which to insert
 */
fluid.staticEditing.ai.pastePosition = function (source, pos) {
    const doc = source.view.state.doc;
    const island = fluid.sourceView.islandBlockAt(doc, doc.lineAt(pos).number);
    return island && pos > island.from && pos < island.to ? island.to : pos;
};

/**
 * The source as sent to the AI, marked with the user's selection, should they have selected text, or else with their
 * cursor - see fluid.staticEditing.ai.selectionMarkers and fluid.staticEditing.ai.cursorMarker
 * @param {Object} source - The source view
 * @param {String} [selectionId] - The id issued for the selection, should text be selected
 * @return {String} The marked source
 */
fluid.staticEditing.ai.markedSource = function (source, selectionId = "s1") {
    const text = source.getText();
    const {from, to} = source.view.state.selection.main;
    let togo;
    if (to > from) {
        const [open, close] = fluid.staticEditing.ai.selectionMarkers;
        togo = text.substring(0, from) + open(selectionId) + text.substring(from, to) + close() + text.substring(to);
    } else {
        const pos = fluid.staticEditing.ai.pastePosition(source, source.view.state.selection.main.head);
        togo = text.substring(0, pos) + fluid.staticEditing.ai.cursorMarker + text.substring(pos);
    }
    return togo;
};

/**
 * The source as it was last sent to the AI, by which the changes a reply makes to it are planned and checked
 * @typedef {Object} SentSource
 * @property {Object} source - The source view it was taken from
 * @property {String} path - Its path, as the workspace's part names it, e.g. "content/post/first.md"
 * @property {String} text - Its text, unmarked
 * @property {Number} from - The start of the selection, or the cursor's position should no text be selected
 * @property {Number} to - The end of the selection, or the cursor's position
 * @property {String|null} selectionId - The id issued for the selection, e.g. "s1", or null if no text was selected
 */

// The record of the sources sent to the AI from each editing panel, by the panel's controller
fluid.staticEditing.ai.sentRecords = new WeakMap();

/**
 * The record of the sources sent to the AI from the panel, made on first use - see `makeSentRecord`
 * @param {Object} edit - The controller of the editing panel
 * @return {Object} The record, `{mark, sent}`
 */
fluid.staticEditing.ai.sentRecordOf = function (edit) {
    if (!fluid.staticEditing.ai.sentRecords.has(edit)) {
        fluid.staticEditing.ai.sentRecords.set(edit, fluid.staticEditing.ai.makeSentRecord(edit));
    }
    return fluid.staticEditing.ai.sentRecords.get(edit);
};

/**
 * Make the record of the sources sent to the AI from the source the panel edits. A fresh id is issued for the
 * selection whenever it differs from the last sent, in its source, range or text
 * @param {Object} edit - The controller of the editing panel
 * @return {Object} `{mark, sent}` - `mark` returns the source marked for sending, recording it, and `sent` returns the
 * {SentSource} last sent, or null if none has been
 */
fluid.staticEditing.ai.makeSentRecord = function (edit) {
    let sent = null, count = 0;
    const mark = function () {
        const source = edit.source;
        const text = source.getText();
        const {from, to, head} = source.view.state.selection.main;
        const selected = text.substring(from, to);
        const previous = sent && sent.selectionId && sent.source === source && sent.from === from && sent.to === to
            && sent.text.substring(from, to) === selected ? sent.selectionId : null;
        const selectionId = to > from ? previous || "s" + (++count) : null;
        const at = to > from ? from : fluid.staticEditing.ai.pastePosition(source, head);
        sent = {source, path: edit.targetPath || "page.md", text, from: at, to: to > from ? to : at, selectionId};
        return fluid.staticEditing.ai.markedSource(source, selectionId || undefined);
    };
    return {mark, sent: () => sent};
};

// Characters standing for the markers of the source sent to the AI in the working copy of it which a reply's changes
// are applied to, so that a SEARCH text copied from the marked source matches, and the selection can be found after
// patches - from Unicode's private use area, which the source can't be expected to hold
fluid.staticEditing.ai.sentinels = {open: "\uE000", close: "\uE001", cursor: "\uE002"};

/**
 * Put the sentinels in place of any markers in a text of the AI's, written against the marked source
 * @param {String} text - The text, e.g. a SEARCH text of a patch
 * @return {String} The text with sentinels for markers
 */
fluid.staticEditing.ai.toSentinels = function (text) {
    const {open, close, cursor} = fluid.staticEditing.ai.sentinels;
    return text.replace(/<fluid-infusion-selection(\s[^>]*)?>/g, open).split("</fluid-infusion-selection>").join(close)
        .split(fluid.staticEditing.ai.cursorMarker).join(cursor);
};

/**
 * Remove the sentinels from a working copy of the source
 * @param {String} text - The working copy
 * @return {String} The text without them
 */
fluid.staticEditing.ai.stripSentinels = function (text) {
    return text.replace(/[\uE000-\uE002]/g, "");
};

/**
 * Apply the changes a reply makes to the source sent - its patches of the source, and its replacement of the selection,
 * in order - to a working copy of it marked with sentinels
 * @param {SentSource} sent - The source as sent
 * @param {Object[]} edits - The changes, each `{op: "patch", blocks}` or `{op: "replaceSelection", text}`
 * @param {String[]} problems - Accumulates descriptions of any changes which could not be made
 * @return {Object|null} `{text, selection}` - the changed text, and the range `{from, to}` of the selection's
 * replacement, if any - or null if any change could not be made, when none is
 */
fluid.staticEditing.ai.applySourceEdits = function (sent, edits, problems) {
    const {open, close, cursor} = fluid.staticEditing.ai.sentinels;
    const name = JSON.stringify("file:" + sent.path);
    const initialCount = problems.length;
    let working = sent.text.substring(0, sent.from) + (sent.selectionId ? open + sent.text.substring(sent.from, sent.to) + close : cursor)
        + sent.text.substring(sent.to);
    let replaced = false;
    edits.forEach(edit => {
        if (problems.length > initialCount) {
            // An earlier change failed, so none is made
        } else if (edit.op === "patch") {
            const blocks = edit.blocks.map(block => ({search: fluid.staticEditing.ai.toSentinels(block.search),
                replace: fluid.staticEditing.ai.toSentinels(block.replace)}));
            working = fluid.ai.arena.applyPatch(working, blocks, name, problems) ?? working;
        } else {
            const start = working.indexOf(open), end = working.indexOf(close);
            if (start !== -1 && end > start) {
                working = working.substring(0, start + 1) + edit.text + working.substring(end);
                replaced = true;
            } else {
                problems.push(`The selection ${sent.selectionId} could not be replaced, since a patch you sent before it removed its markers`);
            }
        }
    });
    let togo = null;
    if (problems.length === initialCount) {
        const start = working.indexOf(open), end = working.indexOf(close);
        const selection = replaced && start !== -1 && end > start ? {
            from: fluid.staticEditing.ai.stripSentinels(working.substring(0, start)).length,
            to: fluid.staticEditing.ai.stripSentinels(working.substring(0, end)).length
        } : null;
        togo = {text: fluid.staticEditing.ai.stripSentinels(working), selection};
    }
    return togo;
};

/**
 * Write the changed source into the source view, as the user's own edit of it - as one change spanning what differs,
 * so that it is undone at once - provided the source is still as it was sent
 * @param {SentSource} sent - The source as sent
 * @param {Object} changed - The changed text and selection, as by `applySourceEdits`
 * @return {Boolean} `true` if the source was as sent, and so changed
 */
fluid.staticEditing.ai.writeSource = function (sent, changed) {
    const source = sent.source;
    const togo = source.getText() === sent.text;
    if (togo) {
        const old = sent.text, text = changed.text;
        let prefix = 0;
        while (prefix < old.length && prefix < text.length && old[prefix] === text[prefix]) {
            ++prefix;
        }
        let suffix = 0;
        while (suffix < old.length - prefix && suffix < text.length - prefix && old[old.length - 1 - suffix] === text[text.length - 1 - suffix]) {
            ++suffix;
        }
        source.view.dispatch({
            changes: {from: prefix, to: old.length - suffix, insert: text.substring(prefix, text.length - suffix)},
            ...(changed.selection ? {selection: {anchor: changed.selection.from, head: changed.selection.to}} : {})
        });
    }
    return togo;
};

/**
 * Find the widgets of the page as edited - each widget's element in the blocks the panel edits, with its component
 * @param {Object} edit - The controller of the editing panel
 * @return {Map<String, Object>} `{record, island, component}` by the widget's `fluid-id`
 */
fluid.staticEditing.ai.pageWidgets = function (edit) {
    const widgets = new Map();
    edit.blocks.forEach(block => {
        const record = fluid.blockEditor.records.get(block);
        if (record) {
            block.querySelectorAll("[fluid-layers][fluid-id]").forEach(island => {
                widgets.set(island.getAttribute("fluid-id"), {record, island, component: fluid.blockEditor.islandComponent(record, island)});
            });
        }
    });
    return widgets;
};

/**
 * Make the host of the arena the page's widgets form - see ArenaHost in fluid-ai-arena.js - which sends the page's
 * marked source after the widgets, and plans the replacement of the selection it was sent with
 * @param {Object} edit - The controller of the editing panel
 * @param {Object} [sentRecord] - The record of the sources sent - by default the panel's, as by `sentRecordOf`
 * @return {ArenaHost} The host
 */
fluid.staticEditing.ai.makeHost = function (edit, sentRecord = fluid.staticEditing.ai.sentRecordOf(edit)) {
    const isMarkdown = () => !edit.targetPath || /\.md$/.test(edit.targetPath);
    const sourceRefusal = "The source part cannot be sent - change the source with a `patch` part whose Target is "
        + "`file:` and its path, or replace the user's selection with a `replace` part whose Target is `selection:` and its id";
    const sourceEdit = (plan, edit) => {
        plan.sourceEdits = [...plan.sourceEdits || [], edit];
    };
    return {
        itemNoun: "widget",
        workspaceParts: () => [{
            kind: isMarkdown() ? "markdown" : "source",
            contentType: isMarkdown() ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
            filename: edit.targetPath || "page.md",
            body: sentRecord.mark()
        }],
        kinds: {
            markdown: {refusal: sourceRefusal},
            source: {refusal: sourceRefusal}
        },
        targets: {
            selection: {
                rule: "the text the user has selected in the source, by the id its marker bears",
                ops: {
                    replace: (id, part, plan) => {
                        const sent = sentRecord.sent();
                        if (!sent || !sent.selectionId) {
                            plan.problems.push("No text was selected in the source sent to you, so there is no selection to "
                                + "replace - ask the user to select the text they want changed, or patch the source instead");
                        } else if (id === sent.selectionId) {
                            sourceEdit(plan, {op: "replaceSelection", text: part.body});
                        } else {
                            plan.problems.push(`The replace part's Target names the selection ${JSON.stringify(id)}, which is not `
                                + `the user's selection, ${JSON.stringify(sent.selectionId)}`);
                        }
                    }
                }
            },
            file: {
                rule: "the source the user edits, as the workspace's last part holds it, by the path which is its filename",
                ops: {
                    patch: (id, part, plan) => {
                        const sent = sentRecord.sent();
                        const blocks = sent && id === sent.path ? fluid.ai.arena.patchBlocks(part, JSON.stringify("file:" + id), plan.problems) : null;
                        if (!sent || id !== sent.path) {
                            plan.problems.push(`The patch part's Target names the file ${JSON.stringify(id)}, which is not the `
                                + `source sent to you${sent ? ", " + JSON.stringify(sent.path) : ""}`);
                        } else if (blocks) {
                            sourceEdit(plan, {op: "patch", blocks});
                        }
                    }
                }
            }
        }
    };
};

/**
 * Replace the element of a widget in the source, or remove it, as the user's edit of the source
 * @param {Object} edit - The controller of the editing panel
 * @param {String} id - The widget's `fluid-id`
 * @param {String} markup - The element to replace it, or "" to remove it, with the blank line following it
 * @return {Boolean} `true` if the widget's element was found
 */
fluid.staticEditing.ai.replaceIsland = function (edit, id, markup) {
    const source = edit.source;
    const doc = source.view.state.doc;
    const found = fluid.blockEditor.islandsOf(doc.toString(), fluid.staticEditing.ai.rendererOf(edit)).find(one => one.id === id);
    const island = found ? {from: doc.line(found.startLine + 1).from, to: doc.line(Math.max(found.startLine + 1, found.endLine)).to} : null;
    if (island) {
        const following = markup === "" && island.to < doc.length ? doc.lineAt(Math.min(island.to + 1, doc.length)) : null;
        const to = following && following.text.trim() === "" ? following.to : island.to;
        source.view.dispatch({changes: {from: island.from, to, insert: markup}});
    }
    return !!island;
};

/**
 * The global name of the markdown pipeline rendering the blocks the panel edits, as their block editor holds it
 * @param {Object} edit - The controller of the editing panel
 * @return {String} The name, e.g. "wendMarkdown"
 */
fluid.staticEditing.ai.rendererOf = function (edit) {
    const record = edit.blocks.map(block => fluid.blockEditor.records.get(block)).find(one => one);
    return record ? record.renderer : "wendMarkdown";
};

/**
 * Wait until the page renders the widgets of the given ids, as the source edited is shown in it, or until a time passes
 * @param {Object} edit - The controller of the editing panel
 * @param {String[]} ids - The widgets' ids
 * @param {Number} [timeout] - How long to wait, in ms
 * @return {Promise<Map<String, Object>>} The page's widgets, as by `pageWidgets`, once they are found or the time passes
 */
fluid.staticEditing.ai.awaitWidgets = async function (edit, ids, timeout = 8000) {
    let widgets = fluid.staticEditing.ai.pageWidgets(edit);
    for (let waited = 0; waited < timeout && !ids.every(id => widgets.get(id) && widgets.get(id).component); waited += 200) {
        await new Promise(resolve => setTimeout(resolve, 200));
        widgets = fluid.staticEditing.ai.pageWidgets(edit);
    }
    return widgets;
};

/**
 * Make the bridge through which the panel reflects on and alters the page - see ArenaBridge in fluid-ai-arena.js
 * @param {Object} edit - The controller of the editing panel
 * @param {Object} [sentRecord] - The record of the sources sent - by default the panel's, as by `sentRecordOf`
 * @return {ArenaBridge} The bridge
 */
fluid.staticEditing.ai.makeBridge = function (edit, sentRecord = fluid.staticEditing.ai.sentRecordOf(edit)) {
    const componentsOf = widgets => new Map([...widgets].filter(([, widget]) => widget.component).map(([id, widget]) => [id, widget.component]));
    const isAvailable = (widgets, id) => !!widgets.get(id) && !fluid.isUnavailable(fluid.ptf.componentToShadow(widgets.get(id)).availableInstance.get());
    const gatherWorkspace = function () {
        const widgets = fluid.staticEditing.ai.pageWidgets(edit);
        const selected = [...widgets].filter(([, widget]) => widget.record.selectedIsland === widget.island).map(([id]) => id);
        return {
            widgets: [...widgets].map(([id, widget]) => ({id, layerName: widget.island.getAttribute("fluid-layers").split(/\s+/)[0], component: widget.component})),
            selectedIds: selected,
            availableLayers: (edit.state.widgetLayers || []).map(entry => entry.layer)
        };
    };
    const applyPlan = async function (plan) {
        const summary = [], problems = [];
        const target = fluid.staticEditing.target(edit);
        const widgetChanges = plan.layers.length + plan.deletions.length + plan.updates.length + plan.creations.length > 0;
        // The selected text is replaced in whichever source the panel edits, the framing's too
        // The source is changed first, whichever the panel edits, the framing's too, as it was sent
        if (plan.sourceEdits) {
            const sent = sentRecord.sent();
            const changed = fluid.staticEditing.ai.applySourceEdits(sent, plan.sourceEdits, problems);
            if (changed && fluid.staticEditing.ai.writeSource(sent, changed)) {
                plan.sourceEdits.forEach(sourceEdit => summary.push(sourceEdit.op === "patch" ?
                    `Patched ${sent.path}, in ${sourceEdit.blocks.length} place${sourceEdit.blocks.length === 1 ? "" : "s"}` :
                    `Replaced the selected text ${sent.selectionId} of ${sent.path}`));
            } else if (changed) {
                problems.push(`The source ${sent.path} has changed since it was sent to you, so your changes to it were not `
                    + "made - tell the user, who may ask again");
            }
        }
        if (widgetChanges && (!target || target.framing)) {
            problems.push("The panel is editing no page's own content, into which widgets could be written - the user must choose the page's content to edit");
        } else if (widgetChanges) {
            const before = fluid.staticEditing.ai.pageWidgets(edit);
            const existingProblems = new Set(fluid.ai.arena.diagnoseAll(componentsOf(before)));
            const constructedIds = new Set();
            fluid.ai.arena.registerLayers(plan, summary, problems);
            // The layers defined are held to be committed with the source, as those of a widget pasted are
            await fluid.staticEditing.addFiles(edit, fluid.blockEditor.layerFiles(plan.layers));
            plan.deletions.forEach(id => {
                if (fluid.staticEditing.ai.replaceIsland(edit, id, "")) {
                    summary.push(`Deleted widget ${id}`);
                } else {
                    problems.push(`The page holds no widget ${id} to be deleted`);
                }
            });
            for (const change of plan.updates) {
                const widget = before.get(change.key);
                if (change.rebuild) {
                    // Its element is written afresh from the parts, under its own id
                    const {markup, files} = fluid.blockEditor.widgetFromParts(change.parts, edit.source.getText(), change.key);
                    await fluid.staticEditing.addFiles(edit, files);
                    fluid.staticEditing.ai.replaceIsland(edit, change.key, markup);
                    constructedIds.add(change.key);
                    summary.push(`Replaced widget ${change.key} with one constructed from layer ${change.layerName}`);
                } else if (widget && widget.component) {
                    await fluid.ai.arena.applyInPlace(widget.component, change.key, change, problems, () => isAvailable(componentsOf(fluid.staticEditing.ai.pageWidgets(edit)), change.key));
                    // Its state, as altered, is written back into its element, as when the user leaves it
                    fluid.blockEditor.saveIsland(widget.record, widget.island);
                    summary.push(`Updated widget ${change.key}`);
                } else {
                    problems.push(`The page holds no widget ${change.key}, or it has not yet been constructed, so your parts could not be applied to it`);
                }
            }
            // Fresh widgets are pasted at the cursor, one after another
            let pos = fluid.staticEditing.ai.pastePosition(edit.source, edit.source.view.state.selection.main.head);
            for (const change of plan.creations) {
                try {
                    const {markup, files, id} = fluid.blockEditor.widgetFromParts(change.parts, edit.source.getText());
                    await fluid.staticEditing.addFiles(edit, files);
                    edit.source.insertBetween(markup, pos, edit.source.view.state.doc.lineAt(pos));
                    pos = fluid.staticEditing.ai.pastePosition(edit.source, edit.source.view.state.selection.main.head);
                    constructedIds.add(id);
                    summary.push(`Created widget ${JSON.stringify(change.key)} as ${id} from layer ${change.layerName}, pasted at the cursor`);
                } catch (error) {
                    problems.push(`The widget ${JSON.stringify(change.key)} could not be pasted: ${fluid.ai.describeError(error)}`);
                }
            }
            const after = await fluid.staticEditing.ai.awaitWidgets(edit, [...constructedIds]);
            [...constructedIds].filter(id => !after.get(id) || !after.get(id).component).forEach(id => problems.push(`The widget ${id} was not rendered by the page`));
            const components = componentsOf(after);
            problems.push(...await fluid.ai.arena.diagnoseSettled(components, constructedIds, existingProblems, id => isAvailable(components, id)));
        }
        return {summary, problems: [...new Set(problems)]};
    };
    return {gatherWorkspace, applyPlan, isReady: () => !!edit.source};
};

/**
 * Make the assistant through which the panel reflects on and alters the page - see `fluid.ai.arena.makeAssistant`
 * @param {Object} edit - The controller of the editing panel
 * @return {AIAssistant} The assistant
 */
fluid.staticEditing.ai.makeAssistant = function (edit) {
    return fluid.ai.arena.makeAssistant(fluid.staticEditing.ai.makeBridge(edit),
        {promptLayer: "fluid.staticEditing.ai.systemPrompt", host: fluid.staticEditing.ai.makeHost(edit)});
};

// The assistant offered to the panel, made as it is disclosed - see fluid.staticEditing.toggleAI
fluid.staticEditing.ai.assistant = null;
</script>
