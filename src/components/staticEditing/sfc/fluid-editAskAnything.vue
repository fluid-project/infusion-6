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
yourself. Never send a \`markdown\` part - the markdown is changed only by your changes to widgets: a fresh widget is \
inserted, a widget deleted by a \`delete\` part naming its id is removed from it, and a widget altered is written back \
into it. Text of the page other than its widgets can't be altered by PTF - if the user asks for it to change, reply \
with the markdown they should write, in text.`;

fluid.staticEditing.ai.pageHints = `* A widget is a fluid.topLevelWidget, sized by the page's layout rather than by any \
\`preferredSize\`. It is saved into the page with its live state, and published with the site once the user commits.`;

// The system prompt of an assistant conversing about the page - Infusion's, with the stanzas of a wend page merged in
fluid.def("fluid.staticEditing.ai.systemPrompt", {
    $layers: "fluid.ai.arena.systemPrompt",
    stanzas: {
        introduction: {text: fluid.staticEditing.ai.introduction},
        placingRules: {order: 35, text: fluid.staticEditing.ai.placingRules},
        pageHints: {order: 45, text: fluid.staticEditing.ai.pageHints}
    },
    workspaceCaption: "The following PTF document holds every Infusion widget of the page, with the definitions of the "
        + "layers they use, followed by the page's markdown source, marked with the user's cursor:",
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
 * The source as sent to the AI, marked with the user's cursor - see fluid.staticEditing.ai.cursorMarker
 * @param {Object} source - The source view
 * @return {String} The marked source
 */
fluid.staticEditing.ai.markedSource = function (source) {
    const text = source.getText();
    const pos = fluid.staticEditing.ai.pastePosition(source, source.view.state.selection.main.head);
    return text.substring(0, pos) + fluid.staticEditing.ai.cursorMarker + text.substring(pos);
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
 * marked source after the widgets
 * @param {Object} edit - The controller of the editing panel
 * @return {ArenaHost} The host
 */
fluid.staticEditing.ai.makeHost = function (edit) {
    return {
        itemNoun: "widget",
        workspaceParts: () => [{
            kind: "markdown",
            contentType: "text/markdown; charset=utf-8",
            filename: edit.targetPath || "page.md",
            body: fluid.staticEditing.ai.markedSource(edit.source)
        }],
        planWorkspacePart: (part, plan) => {
            const handled = part.kind === "markdown";
            if (handled) {
                plan.problems.push("The markdown part cannot be sent - the page's text is changed only by changing its widgets");
            }
            return handled;
        }
    };
};

/**
 * Replace the element of a widget in the source, or remove it, as the user's edit of the source
 * @param {Object} source - The source view
 * @param {String} id - The widget's `fluid-id`
 * @param {String} markup - The element to replace it, or "" to remove it, with the blank line following it
 * @return {Boolean} `true` if the widget's element was found
 */
fluid.staticEditing.ai.replaceIsland = function (source, id, markup) {
    const doc = source.view.state.doc;
    const at = doc.toString().indexOf(`fluid-id="${id}"`);
    const island = at >= 0 ? fluid.sourceView.islandBlockAt(doc, doc.lineAt(at).number) : null;
    if (island) {
        const following = markup === "" && island.to < doc.length ? doc.lineAt(Math.min(island.to + 1, doc.length)) : null;
        const to = following && following.text.trim() === "" ? following.to : island.to;
        source.view.dispatch({changes: {from: island.from, to, insert: markup}});
    }
    return !!island;
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
 * @return {ArenaBridge} The bridge
 */
fluid.staticEditing.ai.makeBridge = function (edit) {
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
        if (!target || target.framing) {
            problems.push("The panel is editing no page's own content, into which widgets could be written - the user must choose the page's content to edit");
        } else {
            const before = fluid.staticEditing.ai.pageWidgets(edit);
            const existingProblems = new Set(fluid.ai.arena.diagnoseAll(componentsOf(before)));
            const constructedIds = new Set();
            fluid.ai.arena.registerLayers(plan, summary, problems);
            // The layers defined are held to be committed with the source, as those of a widget pasted are
            await fluid.staticEditing.addFiles(edit, fluid.blockEditor.layerFiles(plan.layers));
            plan.deletions.forEach(id => {
                if (fluid.staticEditing.ai.replaceIsland(edit.source, id, "")) {
                    summary.push(`Deleted widget ${id}`);
                } else {
                    problems.push(`The page holds no widget ${id} to be deleted`);
                }
            });
            for (const change of plan.updates) {
                const widget = before.get(change.key);
                if (change.rebuild) {
                    // Its element is written afresh from the parts, under its own id
                    const {markup, files} = fluid.blockEditor.widgetFromParts(change.parts, edit.source.getText().replace(`fluid-id="${change.key}"`, ""));
                    await fluid.staticEditing.addFiles(edit, files);
                    fluid.staticEditing.ai.replaceIsland(edit.source, change.key, markup.replace(/fluid-id="[^"]*"/, `fluid-id="${change.key}"`));
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
                    const {markup, files} = fluid.blockEditor.widgetFromParts(change.parts, edit.source.getText());
                    await fluid.staticEditing.addFiles(edit, files);
                    const id = markup.match(/fluid-id="([^"]*)"/)[1];
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
