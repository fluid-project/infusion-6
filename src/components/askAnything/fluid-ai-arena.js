"use strict";

// The protocol by which an assistant reflects on and alters an *arena* - the widgets of a page held beneath one root
// component, as `fluid.history.arenaRoot` designates it, each a child of that root named by its id - by conversing with
// an AI model in Infusion's Potentia Transmission Format (PTF). The workspace is encoded as a PTF document for the
// system prompt, which is itself a component (fluid.ai.arena.systemPrompt) of ordered stanzas into which a derived
// layer merges its own; a response is either text for the user or a PTF document, whose changes are planned, checked,
// stamped with their provenance, and applied by a *bridge* to the arena, after which every widget is diagnosed and any
// problems reported back to the AI for repair. Used by the "Ask me anything" panel, fluid-askAnything.vue beside this
// file, with an assistant made by `fluid.ai.arena.makeAssistant`.
//
// What differs between hosts of an arena is gathered in an *arena host* (ArenaHost, below): e.g. Infusion's tldraw demo,
// whose arena is the widgets hosted in the shapes of a canvas, contributes the shape part placing each widget and the
// canvas part listing the native shapes, plans the shape parts the AI sends, and applies its changes through the
// editor - see demo/tldraw/js/ai-protocol.js and tldraw-ai.js. A page booted from a static build, e.g. one edited in place
// by the "Edit in Infusion" extension, is an arena with no host of its own - see `fluid.ai.arena.makeBridge`.
// Nothing here reads fluid.ai as it loads, since fluid-ai.js may load after it.
// See FLUID-7022

fluid.registerNamespace("fluid.ai.arena");

/**
 * @typedef {Object} WidgetRec
 * @property {String} id - The widget's id - the member name of its component beneath the root of the arena
 * @property {String} layerName - The layer from which the widget was constructed
 * @property {fluid.component} [component] - The widget's component, if it has been constructed
 */

/**
 * @typedef {Object} Workspace
 * @property {WidgetRec[]} widgets - The widgets of the arena
 * @property {String[]} [selectedIds] - The ids of what the user has selected
 * @property {String[]} [availableLayers] - The names of all widget layers which may be instantiated
 */

/**
 * @typedef {Object} AIResponse
 * @property {String} type - "text" for text addressed to the user, "ptf" for a decoded PTF document, or "invalid" for
 * a response which appears to hold a PTF document which could not be decoded
 * @property {String} text - The text of the response with any reasoning removed
 * @property {PTFPart[]} [parts] - For a "ptf" response, the decoded parts of the document
 * @property {String} [error] - For an "invalid" response, why it could not be decoded
 */

/**
 * What a host of an arena contributes to the protocol, all optional
 * @typedef {Object} ArenaHost
 * @property {String} [itemNoun] - What the user selects and the AI deletes, e.g. "shape" - by default "widget"
 * @property {Function} [componentParts] - Accepts a {WidgetRec} and returns the {PTFPart[]} of its component - by
 * default `fluid.ptf.componentToParts`, to which a host may e.g. remove what it supplied to the widget
 * @property {Function} [widgetParts] - Accepts a {WidgetRec} and returns {PTFPart[]} leading its component part, e.g.
 * a part recording where it is placed
 * @property {Function} [workspaceParts] - Accepts the {Workspace} and returns {PTFPart[]} following the widgets
 * @property {Function} [describeOther] - Accepts an id selected which is not a widget's, and the {Workspace}, and
 * returns a line describing it
 * @property {Object<String, Function>} [nestedParts] - Planners of the host's own kinds of part within a component
 * part, each accepting the part, the {WidgetChange} it belongs to, where it was found, and the problems
 * @property {Function} [initChange] - Initialises the host's members of a fresh {WidgetChange}
 * @property {Object<String, PartKind>} [kinds] - The host's own kinds of top-level part, by the Content-Description
 * which names them, merged with Infusion's own `fluid.ai.arena.partKinds` - e.g. a refusal of a part it sends
 * @property {Object<String, TargetScheme>} [targets] - The host's own schemes of target of `patch` and `replace`
 * parts, merged with Infusion's own `fluid.ai.arena.targetSchemes` - e.g. the user's selection
 * @property {Function} [notWidget] - Accepts the quoted id of something which can't hold a widget, and describes it
 */

// The host of an arena which contributes nothing of its own
fluid.ai.arena.defaultHost = {
    itemNoun: "widget",
    componentParts: widget => fluid.ptf.componentToParts(widget.component)
};
// The stanzas of the system prompt common to every arena. Escaped as a template literal, since they hold the syntax of
// Infusion's configuration and of PTF

fluid.ai.arena.introduction = `You are an assistant embedded in a page whose content is made of widgets, each a live component of \
Fluid Infusion 6, a framework in which an application is made of named layers of declarative configuration which any \
party may add to or override. Besides answering the user's questions, you can reflect on the widgets in the workspace \
and alter them - adapting them, composing them and creating new ones - by replying with a document in Infusion's \
Potentia Transmission Format (PTF), which is applied directly to the workspace. The documentation of the framework \
follows, then the rules for your response and some strategy hints, and finally the current state of the workspace and \
the user's selection.`;

fluid.ai.arena.responseRules = `## How to respond

Your response must take ONE of the following two forms:

1. **Text addressed to the user**, for answering a question, explaining something, or asking for clarification if \
their direction is ambiguous. Plain text or light markdown, containing no PTF document.
2. **A single PTF document altering the workspace.** Your entire response is then the document, beginning with the \
line \`MIME-Version: 1.0\` - write nothing before or after it, no commentary and no code fences. Anything you want \
to say to the user alongside your changes goes in \`text\` parts of the document - see below.

The outermost boundary of your document must be the one given with the user's direction, which changes with each \
direction - a document with any other is refused. The boundary "outer-1" of the examples below stands in its place. \
Nested documents choose their own boundaries, as before.

A PTF document altering the workspace has the same form as the workspace document at the end of this prompt. Its top-level parts may be:

* \`layer\` parts, each holding a layer definition whose filename is the layer name, with Content-Type \`text/x-vue\` \
for a Single File Component or \`text/javascript\` for a \`fluid.def(...)\` call. This replaces any existing \
definition of that layer, and every widget using it updates live. Send only layers which you create or change - \
never echo back unchanged layers.
* \`component\` parts, each a nested \`multipart/mixed\` document whose filename is the id of a widget:
    * If the filename is the id of an existing widget and the nested document has NO potentia part for "/", its \
\`live\` and \`potentia\` parts are applied to the existing widget in place, retaining the rest of its state. This is \
the way to change a widget's state, e.g. a \`live\` part for "/" holding \`{"state.count": 5}\`. Each key of a \`live\` \
part is a path, which may reach within a member such as \`state\` to change just one of its values, whereas writing \
the member as a whole replaces all of its values.
    * If the filename is the id of an existing widget and the nested document has a potentia part for "/", the \
widget is replaced by a fresh one constructed from the nested document. Its existing state is not retained, so \
include \`live\` parts for any which should be carried over - e.g. for an umbrella holding the existing widget as its \
subcomponent \`counter\`, a \`live\` part for "/counter".
    * If the filename is not the id of anything in the workspace (choose any fresh name, e.g. "new-1"), a fresh widget \
is created in the workspace. Its nested document must hold a potentia part for "/" whose \`$layers\` names the layer to \
construct, e.g. \`{"$layers": ["fluid.demos.counter"]}\`, and the layer must have \`fluid.topLevelWidget\` amongst \
its layers, directly or through a parent layer.
* \`delete\` parts, each with an empty body, whose filename is the id of a widget to be removed.
* \`patch\` parts, each changing a text shown in the workspace without sending the whole of it - e.g. the \
definition of a layer. Its \`Target\` header, following its Content-Description, names the text, e.g. \
\`Target: layer:fluid.demos.counter\` - see the schemes of target listed below - its filename is any name, its \
Content-Type \`text/plain; charset=utf-8\`, and its body one or more blocks of the form

<<<<<<< SEARCH
text copied exactly from the layer's definition as shown
=======
the text to stand in its place
>>>>>>> REPLACE

  each SEARCH text occurring exactly once in the text, with enough lines around what changes to make it so. \
Prefer a patch to resending a long layer for a small change, and a \`layer\` part where most of it changes.
* \`replace\` parts, whose body stands in place of the whole of the text their \`Target\` header names, for those \
schemes of target which admit it.
* \`text\` parts, Content-Type \`text/markdown; charset=utf-8\`, any filename, holding markdown addressed to the \
user - e.g. a short account of what you changed and why, or a question. It is shown to the user beside your changes.

In the workspace document, the \`component\` part of a widget in which problems have been found also holds a \
\`problems\` part listing them - e.g. a reference which does not resolve, a template which cannot be rendered, or a \
view which renders nothing at all. These are what the user sees reported on the widget. When asked to fix a widget, \
address every one of its problems. Never send a \`problems\` part yourself.

**Every widget you synthesize must apply \`fluid.topLevelWidget\` at its top level.** Whenever you define a layer in \
your document and construct a fresh or replacement widget from it, the top-level \`$layers\` of that layer's \
\`fluid.def\` must name \`fluid.topLevelWidget\` explicitly - even if it is already inherited from a parent layer - \
and as the FIRST of its layers, so that it is weaker than any other layer it names. \
For example \`$layers: "fluid.topLevelWidget"\` for a widget made from scratch, or \
\`$layers: ["fluid.topLevelWidget", "fluid.demos.counter"]\` for one adapting the counter. A document which \
synthesizes a widget without naming \`fluid.topLevelWidget\` is rejected in its entirety, and nothing in it is applied.

Every multipart entity, nested ones included, must declare its own boundary in its Content-Type, distinct from that of \
any enclosing entity, and every part must have Content-Type, Content-Disposition (with filename) and \
Content-Description (the part's kind) headers. For example, a response setting the count of an existing counter \
widget with id "counter-1" to 5 and creating a fresh "hello world" widget is:

MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer-1"

--outer-1
Content-Type: multipart/mixed; boundary="inner-1"
Content-Disposition: attachment; filename="counter-1"
Content-Description: component

--inner-1
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="/"
Content-Description: live

{"state.count": 5}
--inner-1--
--outer-1
Content-Type: multipart/mixed; boundary="inner-2"
Content-Disposition: attachment; filename="new-1"
Content-Description: component

--inner-2
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="/"
Content-Description: potentia

{"$layers": ["fluid.demos.helloWorld"]}
--inner-2--
--outer-1--

A response defining a fresh layer and creating a widget from it holds a \`layer\` part followed by a \`component\` \
part. Note that every delimiter line WITHIN the nested document uses the nested document's own boundary ("inner-1" \
below), and that the nested document is closed with its own close delimiter before the outer document resumes:

MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer-1"

--outer-1
Content-Type: text/x-vue; charset=utf-8
Content-Disposition: attachment; filename="fluid.demos.ai.greeter"
Content-Description: layer

<script>
fluid.def("fluid.demos.ai.greeter", {
    $layers: "fluid.topLevelWidget",
    preferredSize: {w: 260, h: 110},
    state: {
        $reactiveRoot: {
            greeting: "Hello",
            colour: "teal"
        }
    },
    setGreeting: {
        $method: {
            func: (state, greeting) => {
                state.greeting = greeting;
            },
            args: ["{self}.state", "{0}:greeting"]
        }
    }
});
</script>

<template>
    <div class="ai-greeter">
        <span class="ai-greeter-text" style="color: @{state.colour}">@{state.greeting}</span>
        <button @onclick="{self}.setGreeting(Goodbye)">Wave</button>
        <button @onclick="{self}.state.colour = crimson">Blush</button>
    </div>
</template>

<style>
.ai-greeter {
    display: flex;
    gap: 8px;
    padding: 12px;
}
</style>
--outer-1
Content-Type: multipart/mixed; boundary="inner-1"
Content-Disposition: attachment; filename="new-1"
Content-Description: component

--inner-1
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="/"
Content-Description: potentia

{"$layers": ["fluid.demos.ai.greeter"]}
--inner-1--
--outer-1--

## Template syntax

Templates are not Vue templates, and the values in them are not JavaScript:

* \`@{reference}\` interpolates a value into text or into any attribute, e.g. \`style="color: @{state.colour}"\` - except \
for a plain \`class\` attribute, which is never interpolated. Toggle classes with \
\`@class="className:@{reference}, otherName:!@{reference}"\` instead.
* \`@onclick\` and the other \`@on\` attributes hold either a method invocation such as \`{self}.setGreeting(Goodbye)\` \
or an assignment such as \`{self}.state.colour = crimson\`. A literal argument or assigned value is written WITHOUT \
quotes - quotes would become part of the string. Numbers, \`true\`, \`false\` and \`null\` are converted to their \
values, and \`{0}\` passes the DOM event.
* \`value="@{state.text}"\` on an input or textarea binds it two-way to the referenced value.

A view's template is either the \`<template>\` block of a Single File Component, or markup held as the view's \
\`template\` member, e.g. \`view: {$component: {$layers: "fluid.templateViewComponent", template: "<div>...</div>"}}\`, \
which may be computed as a string of markup, e.g. \`template: "$compute:my.render({myWidget}.state.board)"\`. Never \
both - an SFC holding a \`<template>\` block whose layer also writes \`view.$component.template\` is rejected. A \
computed template is parsed afresh whenever it changes, and the syntax above applies within it, e.g. \
\`@onclick="{self}.play(2, 3)"\`, where \`{self}\` designates the widget. However, within the \`$compute\` record \
itself, which is written in the view's \`$component\` record, \`{self}\` designates the view - so refer to the \
widget by its context name, e.g. \`{myWidget}.state.board\` for a layer named \`my.myWidget\`, as for any \
\`$component\` record. A template's markup must have a single top-level element, since only the first is rendered.

A layer's text is kept exactly as you send it, including any functions which it assigns alongside its \
\`fluid.def\` call, e.g. \`fluid.demos.othello.legalMoves = function (board) {...}\`. Their namespace does not \
exist until the \`fluid.def\` call creates it - so either assign them after that call, or create the namespace \
first with \`fluid.registerNamespace("fluid.demos.othello")\` if the definition itself calls any of them.

A layer in the workspace may record the model, prompt and date from which it was generated in a \`<provenance>\` \
block - in an SFC, as a block of its own, and in a \`text/javascript\` layer, in line comments at its end. The \
workspace maintains these records itself - never write one, and leave any you find unchanged.

If your document cannot be decoded or applied, you will be told what was applied, what went wrong, and asked to send \
a corrected document holding only what is still required.`;

fluid.ai.arena.strategyHints = `## Strategy hints

* Make the smallest change which achieves the user's direction. To change what a widget holds, prefer \`live\` \
values applied in place over replacing it.
* Reuse the existing layer definitions maximally. To adapt a widget, define a fresh layer which lists the existing \
layer in its \`$layers\`, preceded by \`fluid.topLevelWidget\`, and holds only overrides, rather than copying and \
editing the existing layer's source, and replace the widget with one constructed from your fresh layer. Only redefine an existing layer when the user asks for \
every widget made from it to change.
* To compose two widgets, define a fresh "umbrella" layer with \`fluid.topLevelWidget\` as the first of its \`$layers\`, \
holding each of them as a subcomponent by means of a \`$component\` record naming its existing layer. Choose the view of \
just one of them as the view of the umbrella with \`view: "{first}.view"\`, and cross-inject between them with \
references, e.g. \`second: {$component: {$layers: "my.second", input: "{first}.output"}}\`. A reference may equally \
override a single member of a widget's reactive state, e.g. \`state: {prompt: "{first}.text"}\`, even though the \
existing layer holds \`state: {$reactiveRoot: {...}}\`: the reference merges alongside that record, the member then \
takes the referenced value whenever that changes, and may still be written as before, whilst the other members of \
the state are retained. If the second should share \
the view of the first rather than render its own, give it \`view: "{first}.view"\` too. Add to the existing layers \
only through overrides or composition directives in fresh layers. If both widgets must remain visible, the umbrella \
may instead have a template of its own holding an \`@id\` element for each subcomponent.
* Often one widget of a composition is **dominant** - it shows the result which the user wants to see and act on - \
whilst the other only **supplies** a value to it, e.g. a widget finding some text which the dominant widget should \
act on. The most economical geometry is then a fresh layer which extends the dominant widget's layer directly and \
mixes in the supplier as a hidden subcomponent, with three ingredients and nothing else:
    1. \`$layers\` naming \`fluid.topLevelWidget\` followed by the dominant widget's existing layer, so that the fresh \
widget IS the dominant widget, with all of its template, state and methods.
    2. A subcomponent constructed from the supplier's existing layer, whose \`view\` is a reference to the fresh \
widget's own view, e.g. \`view: "{showsResult}.view"\` for a fresh layer named \`my.ai.showsResult\` - a layer's \
context name is the last segment of its name. The supplier then has no view of its own, so neither it nor any of its \
subcomponents renders anything, whilst all of its computation continues - including any which depends on where the \
widget is placed, since it automatically takes whatever its host supplies to the widget enclosing it. Never wire \
these yourself.
    3. Wiring from the supplier's output to the dominant widget's input, as a reference written at the path of that \
input - which may be a member of its reactive state.

  For example, where \`my.resultShower\` holds \`state: {$reactiveRoot: {query: "", ...}}\`, whose \`query\` is \
bound to an input and acted on by its button, and \`my.textFinder\` computes a member \`foundText\`:

        fluid.def("my.ai.showsFoundResult", {
            $layers: ["fluid.topLevelWidget", "my.resultShower"],
            finder: {
                $component: {
                    $layers: "my.textFinder",
                    view: "{showsFoundResult}.view"
                }
            },
            state: {
                query: "{finder}.foundText"
            }
        });

  Such a layer has no template, style or functions of its own - copying any of these from the existing layers, or \
writing an \`$effect\` or \`$method\` to shuttle values between them, is never necessary. Its source is sent as a \
\`text/javascript\` layer part. Construct a single fresh widget from it, and leave the widgets it was composed from \
in place unless the user asks for them to be replaced.
* Within a \`$component\` record, \`{self}\` designates the subcomponent itself, not the widget holding the record - \
refer to that by its context name instead, e.g. \`{showsFoundResult}\`, and never write a member as a reference to \
itself such as \`state: "{self}.state"\`. A widget layer may advertise the size at which it would like to be created as \
\`preferredSize: {w, h}\`.
* Give fresh layers distinctive dotted names, e.g. \`fluid.demos.ai.counterWithDoubler\`, and fresh SFC styles \
distinctive class names, since styles apply globally.
* Write all of a widget's CSS in the \`<style>\` block of its SFC - never in the body of a JavaScript function, \
including one computing a template's markup as a string, whether as a \`style\` attribute or a \`<style>\` element. \
Such a function chooses amongst class names defined in the \`<style>\` block instead, e.g. \
\`class="othello-cell othello-legal"\`. A widget which needs any CSS is therefore sent as a \`text/x-vue\` layer, \
since a \`text/javascript\` layer has nowhere to hold it.`;

/**
 * @typedef {Object} PromptStanza
 * @property {Number} order - Where the stanza stands amongst the others - the stanzas are assembled in increasing order
 * @property {String} [text] - The stanza's text
 * @property {Boolean} [documentation] - `true` for the stanza holding the documentation of the framework, which is
 * fetched as the prompt is assembled, in place of a text of its own
 */

// The system prompt through which an assistant converses about an arena - its stanzas, keyed by name, as ordered
// layers of text into which a derived layer merges its own, e.g. the rules for placing widgets on a canvas, or replaces
// one, e.g. the introduction, by writing a stanza of the same name. The workspace and the user's selection follow them
// all - see fluid.ai.arena.systemPrompt.assemble
fluid.def("fluid.ai.arena.systemPrompt", {
    $layers: "fluid.component",
    stanzas: {
        introduction: {order: 10, text: fluid.ai.arena.introduction},
        documentation: {order: 20, documentation: true},
        responseRules: {order: 30, text: fluid.ai.arena.responseRules},
        strategyHints: {order: 40, text: fluid.ai.arena.strategyHints}
    },
    // Introduces the PTF document of the workspace
    workspaceCaption: "The following PTF document holds every Infusion widget in the workspace, with the definitions of the layers they use:",
    // The documents of the framework's documentation, fetched for the documentation stanza
    docUrls: [
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-integration-language.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-view.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-ptf.md"
    ]
});

/**
 * Assemble the stanzas of a system prompt, in their order, with the documentation in place of its stanza
 * @param {Object<String, PromptStanza>} stanzas - The stanzas, keyed by name - any which is null is omitted
 * @param {String[]} docs - The text of each document of the framework's documentation
 * @return {String} The stanzas' text
 */
fluid.ai.arena.systemPrompt.assemble = function (stanzas, docs) {
    return Object.values(stanzas).filter(stanza => stanza && (stanza.text || stanza.documentation))
        .sort((a, b) => a.order - b.order)
        .map(stanza => stanza.documentation ? "# Documentation\n\n" + docs.join("\n\n") : stanza.text).join("\n\n");
};

/**
 * Read the stanzas, caption and documentation of a system prompt component as plain values
 * @param {fluid.component} prompt - The component, a fluid.ai.arena.systemPrompt
 * @return {Object} `{stanzas, workspaceCaption, docUrls}`
 */
fluid.ai.arena.systemPrompt.read = function (prompt) {
    const stanzas = Object.fromEntries(Object.keys(prompt.stanzas).map(name => {
        const stanza = prompt.stanzas[name];
        return [name, stanza ? {order: stanza.order, text: stanza.text, documentation: !!stanza.documentation} : null];
    }));
    return {stanzas, workspaceCaption: prompt.workspaceCaption, docUrls: [...prompt.docUrls]};
};

/**
 * Assemble the whole system prompt - its stanzas, then the workspace as a PTF document, with the further widget layers
 * which may be instantiated, and the user's selection
 * @param {Object} prompt - The prompt, as read by `fluid.ai.arena.systemPrompt.read`
 * @param {String[]} docs - The text of each document of the framework's documentation
 * @param {Workspace} workspace - The current state of the workspace
 * @param {ArenaHost} [host] - What the arena's host contributes to the workspace's description
 * @return {String} The system prompt
 */
fluid.ai.arena.systemPrompt.compose = function (prompt, docs, workspace, host = fluid.ai.arena.defaultHost) {
    const usedLayers = new Set(workspace.widgets.map(widget => widget.layerName));
    const libraryLayers = (workspace.availableLayers || []).filter(layerName => !usedLayers.has(layerName));
    const library = libraryLayers.length === 0 ? "" :
        "\n\nThe following further widget layers are available to be instantiated, but are not currently in the workspace:\n\n"
            + fluid.ai.arena.layersToPTF(libraryLayers);
    const stanzas = {...prompt.stanzas, partKinds: {order: 31, text: fluid.ai.arena.kindsStanza(host)}};
    return [
        fluid.ai.arena.systemPrompt.assemble(stanzas, docs),
        fluid.ai.arena.workspaceHeading + "\n\n" + prompt.workspaceCaption + "\n\n" + fluid.ai.arena.workspaceToPTF(workspace, host) + library,
        "# The user's selection\n\n" + fluid.ai.arena.describeSelection(workspace, host)
    ].join("\n\n");
};

/**
 * Fetch the documents of a prompt's documentation, once for each list of them
 * @param {String[]} docUrls - The URLs of the documents
 * @return {Promise<String[]>} A promise for the text of each, in order
 */
fluid.ai.arena.fetchDocs = function (docUrls) {
    const key = JSON.stringify(docUrls);
    fluid.ai.arena.docsPromises[key] = fluid.ai.arena.docsPromises[key] || Promise.all(docUrls.map(url => fetch(url).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to fetch documentation from ${url}: ${response.status} ${response.statusText}`);
        }
        return response.text();
    })));
    // A failure is not remembered, so that the next request tries again
    fluid.ai.arena.docsPromises[key].catch(() => {
        delete fluid.ai.arena.docsPromises[key];
    });
    return fluid.ai.arena.docsPromises[key];
};

fluid.ai.arena.docsPromises = {};

/**
 * Encode the workspace as a PTF document. The definitions of all user layers used by any widget are held once each
 * in top-level `layer` parts, sorted as by `fluid.ptf.sortLayerNames`, followed by a nested `component` document for
 * each widget, whose filename is its id, holding any parts its host contributes, e.g. where it is placed, followed by
 * its potentia and live parts, and finally a `problems` part listing any problems diagnosed in it by
 * `fluid.ai.arena.diagnose`. Any parts the host contributes for the workspace as a whole, e.g. what else is on a
 * canvas, follow. This is also the form in which the AI may reply - see `fluid.ai.arena.planChanges`.
 * @param {Workspace} workspace - The workspace to be encoded
 * @param {ArenaHost} [host] - What the arena's host contributes to the document
 * @return {String} The text of the PTF document
 */
fluid.ai.arena.workspaceToPTF = function (workspace, host = fluid.ai.arena.defaultHost) {
    const layerParts = new Map();
    const componentParts = workspace.widgets.map(widget => {
        const parts = widget.component ? (host.componentParts || fluid.ai.arena.defaultHost.componentParts)(widget) : [];
        parts.filter(part => part.kind === "layer").forEach(part => layerParts.set(part.filename, part));
        const problems = widget.component ? fluid.ai.arena.diagnose(widget.component) : [];
        const problemsPart = problems.length === 0 ? [] : [{
            kind: "problems",
            contentType: "text/plain",
            filename: "problems",
            body: problems.map(problem => "* " + problem).join("\n")
        }];
        return {
            kind: "component",
            filename: widget.id,
            parts: [...host.widgetParts ? host.widgetParts(widget) : [], ...parts.filter(part => part.kind !== "layer"), ...problemsPart]
        };
    });
    const sortedLayerParts = fluid.ptf.sortLayerNames([...layerParts.keys()]).map(layerName => layerParts.get(layerName));
    const trailing = host.workspaceParts ? host.workspaceParts(workspace) : [];
    return fluid.ptf.encode([...sortedLayerParts, ...componentParts, ...trailing],
        "This is a Potentia Transmission Format (PTF) document holding the Infusion widgets in the workspace.");
};

/**
 * The layer parts which the system prompt shows the AI - those of the workspace's widgets, followed by those of the
 * further layers available to be instantiated - which it may patch
 * @param {Workspace} workspace - The workspace
 * @param {ArenaHost} [host] - What the arena's host contributes to the document
 * @return {Map<String, PTFPart>} The layer parts, by layer name
 */
fluid.ai.arena.shownLayerParts = function (workspace, host = fluid.ai.arena.defaultHost) {
    const layerParts = new Map();
    workspace.widgets.filter(widget => widget.component).forEach(widget => {
        (host.componentParts || fluid.ai.arena.defaultHost.componentParts)(widget).filter(part => part.kind === "layer")
            .forEach(part => layerParts.set(part.filename, part));
    });
    (workspace.availableLayers || []).filter(layerName => !layerParts.has(layerName)).forEach(layerName => {
        layerParts.set(layerName, fluid.ptf.layerToPart(layerName));
    });
    return layerParts;
};

/**
 * Describe the user's current selection in terms of the widgets of the workspace, and whatever else its host holds
 * @param {Workspace} workspace - The workspace
 * @param {ArenaHost} [host] - What the arena's host contributes - its noun for what may be selected, and the
 * description of anything selected which is not a widget
 * @return {String} A description of the selection
 */
fluid.ai.arena.describeSelection = function (workspace, host = fluid.ai.arena.defaultHost) {
    const noun = host.itemNoun || fluid.ai.arena.defaultHost.itemNoun;
    const lines = (workspace.selectedIds || []).map(id => {
        const widget = workspace.widgets.find(oneWidget => oneWidget.id === id);
        const other = widget ? null : host.describeOther && host.describeOther(id, workspace);
        return widget ? `* ${id} - an Infusion widget constructed from layer ${widget.layerName}, whose component is held in the `
            + `"component" part with filename ${id}` : other || `* ${id} - a ${noun} of another kind`;
    });
    return lines.length === 0 ? `The user has no ${noun}s selected.` :
        `The user has selected the following ${noun}s, and when they refer to "this" or "these" they are most `
            + "likely referring to them:\n" + lines.join("\n");
};







/**
 * Encode the definitions of the named layers as a PTF document of layer parts
 * @param {String[]} layerNames - The names of the layers to be encoded
 * @return {String} The text of the PTF document
 */
fluid.ai.arena.layersToPTF = function (layerNames) {
    return fluid.ptf.encode(layerNames.map(layerName => fluid.ptf.layerToPart(layerName)),
        "This is a Potentia Transmission Format (PTF) document holding layer definitions.");
};

/**
 * Assemble the system prompt describing the AI's situation and role, the framework and the workspace
 * @param {String[]} docs - The text of each document of the framework's documentation
 * @param {Workspace} workspace - The current state of the workspace
 * @return {String} The system prompt
 */
// The heading of the section of the system prompt describing the workspace. All that precedes it - the stanzas of the
// prompt, e.g. the introduction, the documentation, the response rules and the strategy hints - is the same for every
// request, and so may be assumed to be cached by the endpoint. The workspace and the selection, which vary, are placed
// last for this reason.
fluid.ai.arena.workspaceHeading = "# The workspace";


/**
 * Assemble the message reporting back to the AI that its response could not be fully applied - what of it was applied,
 * and what went wrong
 * @param {String[]} problems - Descriptions of what went wrong
 * @param {String[]} [results] - Descriptions of the changes which were applied
 * @param {String} [boundary] - The boundary which the corrected document must use
 * @return {ChatMessage} The message to be sent
 */
fluid.ai.arena.repairMessage = function (problems, results = [], boundary) {
    const applied = results.length === 0 ? "Nothing of your response was applied to the workspace." :
        "These changes of your response were applied to the workspace, and have been kept:\n\n" + results.map(result => "* " + result).join("\n");
    return {
        role: "user",
        content: applied + "\n\nBut these problems were found:\n\n" + problems.map(problem => "* " + problem).join("\n")
            + "\n\nPlease respond again with a corrected PTF document, following the same rules, holding only what is "
            + "still required." + (boundary ? " " + fluid.ai.arena.boundaryAdvice(boundary) : "")
    };
};

/**
 * Allocate the boundary which the document of a response must use - a fresh one for each direction, so that no
 * document quoted in the workspace, or in an earlier response, can be taken for the response
 * @return {String} The boundary
 */
fluid.ai.arena.issueBoundary = function () {
    return "reply-" + Math.random().toString(36).substring(2, 10);
};

/**
 * Tell the AI the boundary its document must use
 * @param {String} boundary - The boundary
 * @return {String} The advice
 */
fluid.ai.arena.boundaryAdvice = function (boundary) {
    return `If you respond with a PTF document, its outermost boundary must be "${boundary}", i.e. its Content-Type `
        + `header is \`multipart/mixed; boundary="${boundary}"\`.`;
};

/**
 * The boundary declared by a document's Content-Type
 * @param {String} text - Text beginning with a PTF document, with LF line endings
 * @return {String|undefined} The boundary, if one is declared
 */
fluid.ai.arena.documentBoundary = function (text) {
    const {headers} = fluid.ptf.splitHeaders(text);
    return fluid.ptf.parseHeaderValue(headers["content-type"]).params.boundary;
};

// Matches the line beginning a PTF document anywhere in a response
const ptfStartRE = /^[ \t]*MIME-Version:/im;

/**
 * Interpret a response from the AI. A response is taken to be a PTF document if any line of it begins with
 * `MIME-Version:`, in which case any text before that line and after the document's close delimiter, such as code
 * fences or commentary in violation of the rules, is discarded. Should a boundary have been issued for the response,
 * a document with any other is refused.
 * @param {String} raw - The content of the AI's response
 * @param {String} [boundary] - The boundary issued for the response, which its document must use
 * @return {AIResponse} The interpreted response
 */
fluid.ai.arena.parseResponse = function (raw, boundary) {
    const text = fluid.ai.stripReasoning(raw);
    const match = ptfStartRE.exec(text);
    let togo;
    if (match) {
        const documentText = fluid.ai.arena.trimDocument(text.substring(match.index).replace(/\r\n/g, "\n"));
        const parts = fluid.ptf.decode(documentText);
        const declared = fluid.isUnavailable(parts) ? undefined : fluid.ai.arena.documentBoundary(documentText);
        if (fluid.isUnavailable(parts)) {
            togo = {type: "invalid", text, error: "Your response begins a MIME document but is not a valid PTF document - "
                + "check that its Content-Type header is multipart/mixed and declares a boundary"};
        } else if (boundary && declared !== boundary) {
            togo = {type: "invalid", text, error: `Your PTF document's outermost boundary is ${JSON.stringify(declared)} `
                + "rather than the one given with the direction, so it was refused. " + fluid.ai.arena.boundaryAdvice(boundary)};
        } else if (parts.length === 0) {
            togo = {type: "invalid", text, error: "Your PTF document has no parts - check that each part begins with a "
                + "delimiter line consisting of two hyphens followed by the boundary declared in the Content-Type header"};
        } else {
            togo = {type: "ptf", text, parts};
        }
    } else {
        togo = {type: "text", text};
    }
    return togo;
};

/**
 * Discard anything following the close delimiter of a PTF document. A document whose last line is a plain delimiter
 * rather than the close delimiter - a slip models make, which would otherwise open an empty part at its end - is
 * closed with the close delimiter in its place.
 * @param {String} text - Text beginning with a PTF document, with LF line endings
 * @return {String} The text of the document alone
 */
fluid.ai.arena.trimDocument = function (text) {
    const {headers} = fluid.ptf.splitHeaders(text);
    const boundary = fluid.ptf.parseHeaderValue(headers["content-type"]).params.boundary;
    const close = boundary ? text.indexOf("\n--" + boundary + "--") : -1;
    const delimiter = "\n--" + boundary;
    const trimmed = text.trimEnd();
    let togo;
    if (close !== -1) {
        togo = text.substring(0, close + boundary.length + 5) + "\n";
    } else if (boundary && trimmed.endsWith(delimiter)) {
        togo = trimmed + "--\n";
    } else {
        togo = text;
    }
    return togo;
};

/**
 * @typedef {Object} WidgetChange
 * @property {String} key - For an update, the id of the existing widget - for a creation, the filename chosen by the AI
 * @property {PTFPart[]} parts - The parts of the component's nested document, other than those its host plans itself,
 * e.g. a part placing the widget on a canvas, which the host records in members of its own on the change
 * @property {Boolean} rebuild - For an update, `true` if the widget is to be replaced, rather than altered in place
 * @property {String} [layerName] - For a rebuild or creation, the layer from which the widget is to be constructed
 */

/**
 * @typedef {Object} ChangePlan
 * @property {PTFPart[]} layers - Layer parts to be registered, overriding any existing definitions
 * @property {WidgetChange[]} updates - Changes to existing widgets
 * @property {WidgetChange[]} creations - Fresh widgets to be created
 * @property {String[]} deletions - The ids of the widgets, or other items of the workspace, to be deleted
 * @property {String[]} texts - The bodies of the text parts, addressed to the user
 * @property {String[]} problems - Descriptions of any parts which were rejected
 */

// The advice given when a part of a document has no headers - most often since the document ends with a plain
// delimiter rather than the close delimiter, opening an empty part
fluid.ai.arena.headerlessPartAdvice = "Each part must begin with its Content-Type, Content-Disposition and "
    + "Content-Description headers. If you did not mean to send this part, check that the document ends with the close "
    + "delimiter - two hyphens, the boundary, and two hyphens more, e.g. --my-boundary-- - rather than a plain "
    + "delimiter, which opens a fresh part";

/**
 * Determine whether a part of a document has no headers naming it, as a part opened by a stray delimiter has not
 * @param {PTFPart} part - The part
 * @return {Boolean} `true` if the part has neither a filename nor a kind
 */
fluid.ai.arena.isHeaderlessPart = part => !part.filename && !part.kind;

/**
 * Check that the body of a JSON part parses
 * @param {PTFPart} part - The part to be checked
 * @param {String} where - A description of where the part was found, for any problem reported
 * @param {String[]} problems - Accumulates a description of the part's problem, if any
 * @return {any} The parsed body, or `undefined` if it did not parse
 */
fluid.ai.arena.parseJSONPart = function (part, where, problems) {
    let togo;
    try {
        togo = JSON.parse(part.body);
    } catch (e) {
        problems.push(`The ${part.kind} part with filename ${JSON.stringify(part.filename)} ${where} is not valid JSON: ${e.message}`);
    }
    return togo;
};

/**
 * Check a layer part, so far as can be done without registering it. A JavaScript layer is compiled, which reveals
 * any syntax error without executing it.
 * @param {PTFPart} part - The layer part to be checked
 * @param {String} where - A description of where the part was found, for any problem reported
 * @param {String[]} problems - Accumulates a description of the part's problem, if any
 * @return {Boolean} `true` if the part passed its checks
 */
fluid.ai.arena.checkLayerPart = function (part, where, problems) {
    const initialCount = problems.length;
    const name = JSON.stringify(part.filename);
    if (!part.filename) {
        problems.push(`A layer part ${where} has no filename - it must be the name of the layer it defines`);
    } else if (part.contentType === fluid.layerMimeTypes.javascript) {
        try {
            // Constructing a function compiles its body without executing it
            // eslint-disable-next-line no-new
            new Function("fluid", part.body);
        } catch (e) {
            problems.push(`The JavaScript layer ${name} ${where} has a syntax error: ${e.message}`);
        }
    } else if (part.contentType === fluid.layerMimeTypes.json) {
        fluid.ai.arena.parseJSONPart(part, where, problems);
    } else if (part.contentType === fluid.layerMimeTypes.sfc) {
        if (!/<script[\s>]/.test(part.body)) {
            problems.push(`The SFC layer ${name} ${where} has no <script> block defining the layer`);
        } else if (fluid.ai.arena.hasTemplateConflict(part)) {
            problems.push(`The SFC layer ${name} ${where} could not be registered: ${fluid.sfcTemplateConflictMessage(part.filename)}`);
        }
    } else {
        problems.push(`The layer ${name} ${where} has unrecognised Content-Type ${part.contentType} - use `
            + `${fluid.layerMimeTypes.sfc} or ${fluid.layerMimeTypes.javascript}`);
    }
    return problems.length === initialCount;
};

/**
 * Determine whether an SFC layer part defines its view's template twice, as both a `<template>` block and
 * `view.$component.template` - which the framework would reject on registering it. This is checked in advance so that
 * the problem is reported at once rather than surfacing as a widget which never becomes available. The part's scripts
 * are evaluated without registering what they define - see `fluid.sfcDryRunDefs`.
 * @param {PTFPart} part - The SFC layer part
 * @return {Boolean} `true` if the template is defined twice
 */
fluid.ai.arena.hasTemplateConflict = function (part) {
    let togo = false;
    try {
        const defs = fluid.sfcDryRunDefs(fluid.parseHTMLToTree(part.body), part.filename);
        const ourDef = fluid.isUnavailable(defs) ? undefined : defs[part.filename];
        togo = fluid.isUnavailable(ourDef) && ourDef.message === fluid.sfcTemplateConflictMessage(part.filename);
    } catch (e) {
        // A script which cannot be evaluated is reported when the layer is registered
        togo = false;
    }
    return togo;
};

/**
 * What is known in planning the parts of a document sent by the AI
 * @typedef {Object} PlanContext
 * @property {String[]} widgetIds - The ids of the widgets currently in the workspace
 * @property {String[]} otherIds - The ids of anything else in the workspace which may be deleted
 * @property {ArenaHost} host - The arena's host
 * @property {String} noun - The host's noun for what may be selected and deleted
 * @property {Map<String, PTFPart>} layerParts - The layer parts shown to the AI, by layer name, which it may patch
 */

/**
 * A kind of top-level part of a document sent by the AI, named by its Content-Description
 * @typedef {Object} PartKind
 * @property {String} [rule] - A line describing the kind, listed in the system prompt amongst those which may be sent
 * @property {Function} [plan] - Accepts the part, the {ChangePlan} and the {PlanContext}, and plans the part, reporting
 * any problems in the plan's
 * @property {String} [refusal] - In place of `plan` and `rule`, for a kind which the AI is shown but may not send,
 * the problem reported should it send one
 */

/**
 * A scheme of the targets which `patch` and `replace` parts name in their `Target` header, e.g. `layer:my.layer`
 * @typedef {Object} TargetScheme
 * @property {String} rule - What the scheme's ids name, listed in the system prompt
 * @property {Object<String, Function>} ops - The planner of each operation the scheme's targets admit, "patch" or
 * "replace", accepting the target's id, the part, the {ChangePlan} and the {PlanContext}
 */

// The schemes of target known to every arena. A host adds its own - see `targets` of ArenaHost
fluid.ai.arena.targetSchemes = {
    layer: {
        rule: "the definition of a layer shown in the workspace, by its name - to send a fresh definition whole, use a `layer` part",
        ops: {
            patch: (id, part, plan, context) => fluid.ai.arena.planLayerPatch(id, part, plan, context)
        }
    }
};

/**
 * The schemes of target known to an arena - Infusion's own, with its host's
 * @param {ArenaHost} [host] - The arena's host
 * @return {Object<String, TargetScheme>} The schemes, by name
 */
fluid.ai.arena.targetsOf = function (host = fluid.ai.arena.defaultHost) {
    return {...fluid.ai.arena.targetSchemes, ...host.targets};
};

/**
 * Plan a `patch` or `replace` part, by the scheme of the target its `Target` header names
 * @param {String} op - The operation, "patch" or "replace"
 * @param {PTFPart} part - The part
 * @param {ChangePlan} plan - The plan
 * @param {PlanContext} context - What is known in planning
 */
fluid.ai.arena.planTargeted = function (op, part, plan, context) {
    const schemes = fluid.ai.arena.targetsOf(context.host);
    const target = part.target || "";
    const colon = target.indexOf(":");
    const schemeName = colon === -1 ? target : target.substring(0, colon);
    const scheme = Object.hasOwn(schemes, schemeName) ? schemes[schemeName] : null;
    const examples = Object.keys(schemes).map(name => name + ":...").join(", ");
    if (!target) {
        plan.problems.push(`The ${op} part with filename ${JSON.stringify(part.filename)} has no Target header naming what it `
            + `changes - one of ${examples}`);
    } else if (!scheme || colon === -1) {
        plan.problems.push(`The ${op} part's Target ${JSON.stringify(target)} is not of a known scheme - expected one of ${examples}`);
    } else if (!scheme.ops[op]) {
        plan.problems.push(`A ${schemeName} target cannot be changed by a ${op} part - only by `
            + Object.keys(scheme.ops).join(" or ") + ` - see the rule for ${schemeName} targets`);
    } else {
        scheme.ops[op](target.substring(colon + 1), part, plan, context);
    }
};

// The kinds of top-level part which the AI may send to any arena, by their Content-Description, in the order in
// which they are listed in the prompt. A host adds its own - see `kinds` of ArenaHost
fluid.ai.arena.partKinds = {
    layer: {
        rule: "a layer's whole definition, replacing any existing one",
        plan: (part, plan) => {
            if (fluid.ai.arena.checkLayerPart(part, "at the top level", plan.problems)) {
                plan.layers.push(part);
            }
        }
    },
    patch: {
        rule: "search/replace blocks changing the text its `Target` header names",
        plan: (part, plan, context) => fluid.ai.arena.planTargeted("patch", part, plan, context)
    },
    replace: {
        rule: "the text to stand in place of the whole of what its `Target` header names",
        plan: (part, plan, context) => fluid.ai.arena.planTargeted("replace", part, plan, context)
    },
    component: {
        rule: "a nested document creating, replacing or changing a widget",
        plan: (part, plan, context) => {
            const change = fluid.ai.arena.planWidgetChange(part, context.widgetIds, context.otherIds, plan.problems, context.host);
            if (change && context.widgetIds.includes(part.filename)) {
                plan.updates.push(change);
            } else if (change) {
                plan.creations.push(change);
            }
        }
    },
    delete: {
        rule: "the removal of the item whose id is its filename",
        plan: (part, plan, context) => {
            if (context.widgetIds.includes(part.filename) || context.otherIds.includes(part.filename)) {
                plan.deletions.push(part.filename);
            } else {
                plan.problems.push(`The delete part with filename ${JSON.stringify(part.filename)} does not name a ${context.noun} in the workspace`);
            }
        }
    },
    text: {
        rule: "markdown addressed to the user, shown beside your changes",
        plan: (part, plan) => {
            plan.texts.push(part.body);
        }
    },
    problems: {
        refusal: "A problems part cannot be sent - it is how the workspace reports the problems it finds in a widget"
    }
};

/**
 * The kinds of top-level part known to an arena - Infusion's own, with its host's
 * @param {ArenaHost} [host] - The arena's host
 * @return {Object<String, PartKind>} The kinds, by Content-Description
 */
fluid.ai.arena.kindsOf = function (host = fluid.ai.arena.defaultHost) {
    return {...fluid.ai.arena.partKinds, ...host.kinds};
};

/**
 * The stanza of the system prompt listing the kinds of top-level part which may be sent, as the arena's planning
 * knows them, so that the prompt can't disagree with what is accepted
 * @param {ArenaHost} [host] - The arena's host
 * @return {String} The stanza's text
 */
fluid.ai.arena.kindsStanza = function (host) {
    const kinds = fluid.ai.arena.kindsOf(host);
    const sendable = Object.keys(kinds).filter(name => !kinds[name].refusal);
    const schemes = fluid.ai.arena.targetsOf(host);
    return "## The kinds of top-level part\n\nThe Content-Description of each top-level part of your document must be one of:\n\n"
        + sendable.map(name => `* \`${name}\` - ${kinds[name].rule}`).join("\n")
        + "\n\nThe `Target` header of a `patch` or `replace` part, following its Content-Description, is a scheme and an id, "
        + "e.g. `Target: layer:fluid.demos.counter`. The schemes are:\n\n"
        + Object.keys(schemes).map(name => `* \`${name}:\` - ${schemes[name].rule} - by ${Object.keys(schemes[name].ops).join(" or ")}`).join("\n");
};

/**
 * Plan the changes to the workspace described by a PTF document sent by the AI, checking each of its parts. Parts
 * which fail their checks are omitted from the plan and their problems reported, so that the remainder can be applied.
 * Each part is planned by its kind, as `fluid.ai.arena.kindsOf` gives them.
 * @param {PTFPart[]} parts - The decoded parts of the document
 * @param {String[]} widgetIds - The ids of the widgets currently in the workspace
 * @param {String[]} [otherIds] - The ids of anything else in the workspace which may be deleted, e.g. the native shapes
 * of a canvas, which can't hold a widget
 * @param {ArenaHost} [host] - What the arena's host contributes to planning - its own kinds of part
 * @param {Map<String, PTFPart>} [layerParts] - The layer parts shown to the AI, by layer name, which it may patch
 * @return {ChangePlan} The planned changes
 */
fluid.ai.arena.planChanges = function (parts, widgetIds, otherIds = [], host = fluid.ai.arena.defaultHost, layerParts = new Map()) {
    const plan = {layers: [], updates: [], creations: [], deletions: [], texts: [], problems: []};
    const kinds = fluid.ai.arena.kindsOf(host);
    const context = {widgetIds, otherIds, host, layerParts, noun: host.itemNoun || fluid.ai.arena.defaultHost.itemNoun};
    const sendable = Object.keys(kinds).filter(name => !kinds[name].refusal);
    parts.forEach(part => {
        const kind = Object.hasOwn(kinds, part.kind) ? kinds[part.kind] : null;
        if (kind && kind.refusal) {
            plan.problems.push(kind.refusal);
        } else if (kind) {
            kind.plan(part, plan, context);
        } else if (fluid.ai.arena.isHeaderlessPart(part)) {
            plan.problems.push("Your document holds a part with no headers. " + fluid.ai.arena.headerlessPartAdvice);
        } else {
            plan.problems.push(`The part with filename ${JSON.stringify(part.filename)} has unrecognised kind ${JSON.stringify(part.kind)} in its `
                + "Content-Description - expected one of " + sendable.join(", "));
        }
    });
    fluid.ai.arena.checkTopLevelWidget(parts, plan);
    return plan;
};

/**
 * Determine whether a document sent by the AI changes anything, rather than only holding text for the user
 * @param {PTFPart[]} parts - The document's parts
 * @return {Boolean} `true` if any part is of a kind other than `text`
 */
fluid.ai.arena.isActing = function (parts) {
    return parts.some(part => part.kind !== "text");
};

// The lines delimiting a block of a patch part
fluid.ai.arena.patchMarkers = ["<<<<<<< SEARCH", "=======", ">>>>>>> REPLACE"];

/**
 * Read the blocks of a patch part's body
 * @param {String} body - The body, one or more blocks each of a SEARCH text and its replacement - see patchMarkers
 * @return {Object[]|null} The blocks, each `{search, replace}`, or null if the body is not a sequence of whole blocks
 */
fluid.ai.arena.parsePatch = function (body) {
    const [open, divider, close] = fluid.ai.arena.patchMarkers;
    const blocks = [];
    let block = null, state = "outside", malformed = false;
    body.replace(/\r\n/g, "\n").split("\n").forEach(line => {
        const trimmed = line.trim();
        if (state === "outside") {
            if (trimmed === open) {
                block = {search: [], replace: []};
                state = "search";
            } else if (trimmed !== "") {
                malformed = true;
            }
        } else if (state === "search") {
            if (trimmed === divider) {
                state = "replace";
            } else {
                block.search.push(line);
            }
        } else if (trimmed === close) {
            blocks.push({search: block.search.join("\n"), replace: block.replace.join("\n")});
            state = "outside";
        } else {
            block.replace.push(line);
        }
    });
    return state === "outside" && !malformed && blocks.length > 0 ? blocks : null;
};

/**
 * Apply the blocks of a patch to a text, each in turn. Each SEARCH text must occur exactly once in the text as it then
 * stands, and is replaced there.
 * @param {String} text - The text to be patched
 * @param {Object[]} blocks - The blocks, as read by `fluid.ai.arena.parsePatch`
 * @param {String} name - The quoted name of what is patched, for any problem reported
 * @param {String[]} problems - Accumulates descriptions of any blocks which could not be applied
 * @return {String|undefined} The patched text, or `undefined` if any block could not be applied
 */
fluid.ai.arena.applyPatch = function (text, blocks, name, problems) {
    const initialCount = problems.length;
    let patched = text.replace(/\r\n/g, "\n");
    blocks.forEach((block, i) => {
        const where = `Block ${i + 1} of the patch of ${name}`;
        const first = block.search === "" ? -1 : patched.indexOf(block.search);
        if (block.search === "") {
            problems.push(`${where} has an empty SEARCH text`);
        } else if (first === -1) {
            problems.push(`${where} has a SEARCH text which does not occur in it - copy it exactly, `
                + "including its indentation, from the text as shown in the workspace");
        } else if (patched.indexOf(block.search, first + 1) !== -1) {
            problems.push(`${where} has a SEARCH text which occurs more than once in it - include enough `
                + "of the lines around it to make it unique");
        } else {
            patched = patched.substring(0, first) + block.replace + patched.substring(first + block.search.length);
        }
    });
    return problems.length === initialCount ? patched : undefined;
};

/**
 * Read the blocks of a patch part, reporting a body which is not made of them
 * @param {PTFPart} part - The patch part
 * @param {String} name - The quoted name of its target, for any problem reported
 * @param {String[]} problems - Accumulates a description of the problem, if any
 * @return {Object[]|null} The blocks, as by `fluid.ai.arena.parsePatch`, or null
 */
fluid.ai.arena.patchBlocks = function (part, name, problems) {
    const blocks = fluid.ai.arena.parsePatch(part.body || "");
    if (!blocks) {
        problems.push(`The body of the patch part for ${name} is not a sequence of whole blocks, each a line `
            + fluid.ai.arena.patchMarkers.join(", a SEARCH text, a line ") + ", with nothing between them but blank lines");
    }
    return blocks;
};

/**
 * Plan a patch of a layer - as shown to the AI, patched, and checked as a layer part sent whole would be
 * @param {String} layerName - The layer's name, the id of its target
 * @param {PTFPart} part - The patch part
 * @param {ChangePlan} plan - The plan, to whose layers the patched layer is added
 * @param {PlanContext} context - What is known in planning
 */
fluid.ai.arena.planLayerPatch = function (layerName, part, plan, context) {
    const name = JSON.stringify(layerName);
    const shown = context.layerParts.get(layerName);
    const blocks = shown ? fluid.ai.arena.patchBlocks(part, name, plan.problems) : null;
    if (!shown) {
        plan.problems.push(`The patch part's Target names the layer ${name}, whose definition is not shown in the `
            + "workspace - send its whole definition in a layer part instead");
    } else if (blocks) {
        const patched = fluid.ai.arena.applyPatch(shown.body, blocks, name, plan.problems);
        const layerPart = patched === undefined ? null : {...shown, body: patched};
        if (layerPart && fluid.ai.arena.checkLayerPart(layerPart, "as patched", plan.problems)) {
            plan.layers.push(layerPart);
        }
    }
};

/**
 * Record the provenance of a layer part sent by the AI - in a `<provenance>` block of an SFC, or in line comments at
 * the end of a JavaScript layer. A layer which is not yet defined is stamped with the provenance of the response
 * defining it, replacing any the AI wrote itself. A layer which is already defined keeps the provenance recorded in
 * its current source, if any, whatever the AI sent - so that a layer resent with changes, e.g. in correcting a
 * response, is still attributed to the exchange which created it. Other parts are returned unchanged.
 * @param {PTFPart} part - The layer part
 * @param {SFCProvenance} provenance - The provenance of the response holding the part
 * @param {Function} isDefined - Accepts a layer name and returns `true` if the layer is currently defined
 * @return {PTFPart} The part, with its provenance recorded
 */
fluid.ai.arena.stampLayerPart = function (part, provenance, isDefined) {
    let togo = part;
    if (part.kind === "layer") {
        try {
            if (!isDefined(part.filename)) {
                togo = fluid.ptf.writeLayerProvenance(part, provenance);
            } else {
                const current = fluid.ptf.readLayerProvenance(fluid.ptf.layerToPart(part.filename));
                if (current) {
                    togo = fluid.ptf.writeLayerProvenance(part, current);
                }
            }
        } catch (e) {
            // Markup which cannot be parsed is reported when the layer is registered
            togo = part;
        }
    }
    return togo;
};

/**
 * Record the provenance of every layer part of the changes planned from a response of the AI, at the top level
 * of its document and within its component parts - see `fluid.ai.arena.stampLayerPart`
 * @param {ChangePlan} plan - The planned changes, whose layer parts are replaced by ones recording their provenance
 * @param {SFCProvenance} provenance - The provenance of the response
 * @param {Function} [isDefined] - Accepts a layer name and returns `true` if the layer is currently defined,
 * defaulting to `fluid.ptf.isLayerDefined`
 */
fluid.ai.arena.stampProvenance = function (plan, provenance, isDefined = fluid.ptf.isLayerDefined) {
    const stamp = part => fluid.ai.arena.stampLayerPart(part, provenance, isDefined);
    plan.layers = plan.layers.map(stamp);
    [...plan.creations, ...plan.updates].forEach(change => {
        change.parts = change.parts.map(stamp);
    });
};

// The layer which every widget synthesized by the AI must apply at its top level
fluid.ai.arena.topLevelWidgetLayer = "fluid.topLevelWidget";

/**
 * Check that a document which synthesizes a widget - that is, constructs a fresh or replacement widget from a layer
 * which it defines - names `fluid.topLevelWidget` somewhere in its layer definitions, as the AI is instructed to. This
 * is a simple search of their text rather than an analysis of the layers. If the check fails, the whole document is
 * rejected for correction, by emptying the plan of all of its changes and reporting the problem.
 * @param {PTFPart[]} parts - The decoded parts of the document
 * @param {ChangePlan} plan - The changes planned from the document, which are cleared if the check fails
 */
fluid.ai.arena.checkTopLevelWidget = function (parts, plan) {
    const layerParts = [...parts, ...parts.flatMap(part => part.kind === "component" && part.parts ? part.parts : [])]
        .filter(part => part.kind === "layer");
    const definedLayers = new Set(layerParts.map(part => part.filename));
    const synthesized = [...plan.creations, ...plan.updates.filter(change => change.rebuild)]
        .filter(change => definedLayers.has(change.layerName));
    const named = layerParts.some(part => part.body.includes(fluid.ai.arena.topLevelWidgetLayer));
    if (synthesized.length > 0 && !named) {
        const layerNames = [...new Set(synthesized.map(change => change.layerName))].join(", ");
        plan.layers = [];
        plan.updates = [];
        plan.creations = [];
        plan.deletions = [];
        plan.problems.push(`Your document synthesizes widgets from the layers ${layerNames} which you define, but does not `
            + `name ${fluid.ai.arena.topLevelWidgetLayer} - every widget you synthesize must name it as the first of the `
            + "$layers of its layer's definition, even if it is inherited. None of your document has been applied, so "
            + "send all of it again with this corrected.");
    }
};

/**
 * Plan the change to a single widget described by a `component` part sent by the AI
 * @param {PTFPart} part - The component part
 * @param {String[]} widgetIds - The ids of the widgets currently in the workspace
 * @param {String[]} otherIds - The ids of anything else in the workspace, which can't hold a widget
 * @param {String[]} problems - Accumulates descriptions of any problems found
 * @param {ArenaHost} [host] - What the arena's host contributes - its own kinds of nested part, e.g. one placing the widget
 * @return {WidgetChange|null} The planned change, or `null` if the part was rejected
 */
fluid.ai.arena.planWidgetChange = function (part, widgetIds, otherIds, problems, host = fluid.ai.arena.defaultHost) {
    const name = JSON.stringify(part.filename);
    const where = `within the component part ${name}`;
    const initialCount = problems.length;
    const hostKinds = Object.keys(host.nestedParts || {});
    let togo = null;
    if (!part.parts) {
        problems.push(`The component part ${name} is not a nested multipart/mixed document with its own boundary`);
    } else if (!widgetIds.includes(part.filename) && otherIds.includes(part.filename)) {
        problems.push(host.notWidget ? host.notWidget(name) : `The component part ${name} names something which cannot hold a widget`);
    } else {
        const change = {key: part.filename, parts: [], rebuild: false, layerName: undefined};
        if (host.initChange) {
            host.initChange(change);
        }
        part.parts.forEach(nestedPart => {
            if (hostKinds.includes(nestedPart.kind)) {
                host.nestedParts[nestedPart.kind](nestedPart, change, where, problems);
            } else if (nestedPart.kind === "layer") {
                if (fluid.ai.arena.checkLayerPart(nestedPart, where, problems)) {
                    change.parts.push(nestedPart);
                }
            } else if (nestedPart.kind === "potentia" || nestedPart.kind === "live") {
                if (fluid.ai.arena.parseJSONPart(nestedPart, where, problems) !== undefined) {
                    change.parts.push(nestedPart);
                }
            } else if (nestedPart.kind === "problems") {
                // Problems are diagnosed afresh in the workspace, so any echoed back are ignored
            } else if (fluid.ai.arena.isHeaderlessPart(nestedPart)) {
                problems.push(`The document ${where} holds a part with no headers. ` + fluid.ai.arena.headerlessPartAdvice);
            } else {
                problems.push(`The part with filename ${JSON.stringify(nestedPart.filename)} ${where} has unrecognised kind `
                    + `${JSON.stringify(nestedPart.kind)} - expected ${[...hostKinds, "layer", "potentia", "live"].join(", ").replace(/, (\w+)$/, " or $1")}`);
            }
        });
        const rootPart = change.parts.find(fluid.ptf.isRootPotentiaPart);
        const layerName = rootPart && fluid.makeArray(JSON.parse(rootPart.body).$layers)[0];
        const isUpdate = widgetIds.includes(part.filename);
        if (rootPart && !layerName) {
            problems.push(`The potentia part for "/" ${where} has no $layers naming the layer to construct`);
        } else if (!isUpdate && !rootPart) {
            problems.push(`The component part ${name} does not name an existing widget, so it must hold a potentia part `
                + "for \"/\" whose $layers names the layer from which to construct a fresh widget");
        }
        if (problems.length === initialCount) {
            togo = Object.assign(change, {rebuild: !!rootPart, layerName});
        }
    }
    return togo;
};

// Elements which are visible without holding any text or child elements
fluid.ai.arena.visibleElements = "img, svg, canvas, video, iframe, input, button, select, textarea, object, embed";

// The number of characters of a widget's markup quoted in reporting that it renders nothing
fluid.ai.arena.maxQuotedMarkup = 200;

/**
 * Determine whether an element onto which a widget has rendered shows nothing - it holds no text, no child elements,
 * and is not itself an element which is visible without them. Such a widget has rendered without any failure, yet
 * shows the user just an empty box - for example, since the template which was rendered is not the one intended.
 * @param {Element} element - The element onto which the widget has rendered
 * @return {Boolean} `true` if the element shows nothing
 */
fluid.ai.arena.rendersNothing = function (element) {
    return element.textContent.trim() === "" && element.children.length === 0 && !element.matches(fluid.ai.arena.visibleElements);
};

/**
 * Find the causes of an unavailable value - those it records itself, or else, since a value may be unavailable without
 * recording why, e.g. one which was never computed since a value it depends on was unavailable, those found upstream
 * of the cell which holds it by `fluid.cell.explainUnavailable`
 * @param {Unavailable} unavailable - The unavailable value
 * @param {Cell} [cell] - The cell holding the value, if known
 * @return {UnavailableCause[]} The causes which bear messages, which is empty if none could be found
 */
fluid.ai.arena.causesOf = function (unavailable, cell) {
    // A cause may itself hold causes, e.g. where an unavailable value was merged into another as one of its causes
    const flatten = causes => causes.flatMap(cause => cause.causes ? flatten(cause.causes) : [cause]);
    const recorded = flatten(fluid.unavailableToCauses(fluid.unProxy(unavailable))).filter(cause => cause.message !== undefined);
    return recorded.length > 0 || !cell ? recorded : fluid.cell.explainUnavailable(cell);
};

/**
 * @typedef {Object} TemplateProblem
 * @property {String} what - A description of the part of the template which failed
 * @property {Unavailable} [unavailable] - The unavailable value of the part, if it failed in this way
 * @property {Cell} [cell] - The cell holding the unavailable value
 * @property {String} [message] - A description of the failure, if it did not fail with an unavailable value
 */

/**
 * Check whether the method designated by an event handler written in a template, e.g. `@onclick="{self}.play(1, 2)"`,
 * can be resolved - otherwise the failure is only discovered when the user triggers the event
 * @param {VNode} vnode - The rendered node bearing the handler
 * @param {String} onKey - The name of the handler's event, with any modifiers, e.g. "click"
 * @param {String} onValue - The handler as written in the template
 * @return {TemplateProblem|null} The problem with the handler, or `null` if it is sound
 */
fluid.ai.arena.checkHandler = function (vnode, onKey, onValue) {
    const what = `The handler @on${onKey}="${onValue}"`;
    let togo = null;
    try {
        // An assignment such as `{self}.open = true` is checked through the reference on its right hand side, if any
        const assigned = onValue.includes("=") ? onValue.split("=")[1].trim().replace(/^!/, "") : null;
        const ref = assigned === null ? fluid.compactStringToRec(onValue, "DOMEventBind").func : assigned;
        if (fluid.isILReference(ref)) {
            const cell = fluid.fetchContextReference(ref, vnode.shadow);
            const value = fluid.deSignal(cell);
            if (fluid.isUnavailable(value)) {
                togo = {what, unavailable: value, cell};
            } else if (assigned === null && typeof(value) !== "function") {
                togo = {what, message: `${ref} is not a method, but ${JSON.stringify(value)?.substring(0, 100)}`};
            }
        }
    } catch (e) {
        togo = {what, message: `It could not be parsed: ${fluid.ai.describeError(e)}`};
    }
    return togo;
};

/**
 * Find the problems in a view's rendered tree which do not prevent it from rendering, and so would otherwise pass
 * silently - text and attributes whose references fail to resolve, which render as nothing, and event handlers
 * designating methods which cannot be resolved, which fail only once triggered
 * @param {VNode} vTree - The view's rendered tree
 * @param {Boolean} includePending - If `true`, references which are still pending are reported
 * @return {TemplateProblem[]} The problems found
 */
fluid.ai.arena.templateProblems = function (vTree, includePending) {
    const problems = [];
    const checkBound = function (bound, what) {
        if (fluid.isSignal(bound)) {
            const value = fluid.deSignal(bound);
            if (fluid.isUnavailable(value) && (includePending || !fluid.isPending(value))) {
                problems.push({what, unavailable: value, cell: bound});
            }
        }
    };
    const visit = function (vnode) {
        if (vnode.text !== undefined) {
            checkBound(vnode.text, `The text "${fluid.getSignalSource(vnode.text)}"`);
        } else {
            fluid.each(vnode.attrs, (value, key) => checkBound(value, `The attribute ${key}="${fluid.getSignalSource(value)}"`));
            fluid.each(vnode["class"], (value, key) => checkBound(value, `The class ${key}`));
            (vnode.on || []).forEach(({onKey, onValue}) => {
                const problem = fluid.ai.arena.checkHandler(vnode, onKey, onValue);
                if (problem) {
                    problems.push(problem);
                }
            });
            (vnode.children || []).forEach(visit);
        }
    };
    visit(vTree);
    return problems;
};

/**
 * Determine whether an unavailable value of a member is a failure to be reported. Besides a member which has failed
 * outright, this is one unavailable for reasons of configuration due to a reference which designates a member which
 * does not exist - such a value is otherwise merely awaited, since the member might yet appear, and would go
 * unnoticed until something reads it.
 * @param {Unavailable} unavailable - The member's unavailable value
 * @param {Cell} cell - The cell holding the member's value
 * @return {Boolean} `true` if the member's value is a failure
 */
fluid.ai.arena.isFailedMember = function (unavailable, cell) {
    const variety = fluid.unProxy(unavailable).variety;
    return variety === "error" || variety === "config" && fluid.ai.arena.causesOf(unavailable, cell).some(cause => !!cause.site);
};

/**
 * Describe any problem found within a component and its subcomponents - for example a layer which is not defined, a
 * reference which does not resolve, a template which cannot be rendered, or a widget which renders nothing at all.
 * Unless `includePending` is set, components which are still waiting on I/O, e.g. for a layer which is still loading,
 * are not reported.
 * @param {fluid.component} component - The component to be diagnosed
 * @param {Boolean} [includePending] - If `true`, pending components are reported as well as failed ones
 * @return {String[]} Descriptions of each problem found
 */
fluid.ai.arena.diagnose = function (component, includePending) {
    const problems = [];
    // Each cause is reported once, at the first place it is found, rather than at every value it propagates to
    const reportedCauses = new Set();
    const reportable = value => fluid.isUnavailable(value) && (includePending || fluid.unProxy(value).variety !== "pending");
    // Hints accompanying the causes reported, each of which is reported once after all the problems
    const hints = new Set();
    // Components for which some cause has been reported, whose failures without a cause of their own need no report
    const explainedShadows = new Set();
    const report = function (shadow, unavailable, what, cell) {
        const causes = fluid.ai.arena.causesOf(unavailable, cell);
        if (causes.length === 0 && !reportedCauses.has(what) && !explainedShadows.has(shadow)) {
            reportedCauses.add(what);
            problems.push(`${what} at path ${shadow.path} failed, but no cause was recorded`);
        }
        if (causes.length > 0) {
            explainedShadows.add(shadow);
        }
        causes.filter(cause => !reportedCauses.has(cause.message)).forEach(cause => {
            reportedCauses.add(cause.message);
            if (cause.hint) {
                hints.add(cause.hint);
            }
            const site = cause.site && !Array.isArray(cause.site) && cause.site.shadow ? cause.site : null;
            const siteText = site ? ` (at ${fluid.renderSite(site)})` : "";
            const layer = site && fluid.layerForSite(site);
            problems.push(`${what} at path ${shadow.path}${cause.variety === "pending" ? " is still pending" : " failed"}: `
                + `${cause.message}${siteText}${layer ? " in layer " + layer : ""}`);
        });
    };
    // A component whose view is cross-injected from another, e.g. by `view: "{first}.view"`, has its own template
    // hidden - so that any view beneath it which would have rendered into that template has no container, which is
    // not a problem. This holds until some view beneath it is supplied with a container from elsewhere.
    const visit = function (shadow, hidden) {
        // The component's signal is dispensed when it has no unavailable layers, but its value may still have failed,
        // e.g. when its layers could not be merged
        const instance = fluid.deSignal(shadow.availableInstance.get());
        // A failure to merge the component's layers explains any consequent failure of the component itself
        const merged = fluid.deSignal(shadow.flatMerged);
        if (reportable(merged)) {
            report(shadow, merged, "Merging the layers of component", shadow.flatMerged);
        } else if (reportable(instance)) {
            report(shadow, instance, "Component", shadow.availableInstance);
        } else if (!fluid.isUnavailable(instance)) {
            const that = shadow.that;
            // Any member whose value has failed, e.g. a reference which designates its own value, or a member which
            // does not exist, which would otherwise go unnoticed until something reads it. The container and rendering
            // of a view are judged below.
            // Members defined by user layers are visited first, so that a failure is reported at the member which the
            // user wrote, rather than one derived from it by a framework layer, e.g. at a view's template rather than
            // its templateTree
            const memberNames = Object.keys(fluid.deSignal(merged));
            const userLayerMember = function (memberName) {
                const layerName = fluid.layerForSite({shadow, segs: [memberName]});
                return !!layerName && fluid.isUserLayer(layerName);
            };
            const [userMembers, otherMembers] = fluid.partition(memberNames, userLayerMember);
            [...userMembers, ...otherMembers].forEach(memberName => {
                if (!memberName.startsWith("$") && !shadow.childComponents?.[memberName] && !["container", "vTree"].includes(memberName)) {
                    const cell = fluid.getForComponent(shadow, memberName);
                    const value = fluid.deSignal(cell);
                    if (fluid.isUnavailable(value) && fluid.ai.arena.isFailedMember(value, cell)) {
                        report(shadow, value, `Member ${memberName} of component`, cell);
                    }
                }
            });
            let childHidden = hidden;
            if (fluid.deSignal(that.$layers).includes("fluid.viewComponent")) {
                const container = fluid.deSignal(that.container);
                const vTree = fluid.deSignal(that.vTree);
                // A view rendered by its parent, e.g. that of a member of a list whose items are spliced into the
                // list's container by fluid.listViewTree, has no container of its own, but is rendered nonetheless
                const rendered = !fluid.isUnavailable(fluid.deSignal(that.renderedContainer));
                if (reportable(container) && !hidden && !rendered) {
                    report(shadow, container, "Container of view", fluid.getForComponent(shadow, "container"));
                } else if (reportable(vTree)) {
                    report(shadow, vTree, "Rendering of view", fluid.getForComponent(shadow, "vTree"));
                } else if (!fluid.isUnavailable(vTree)) {
                    const templateTree = fluid.deSignal(that.templateTree);
                    (templateTree?.warnings || []).forEach(warning => problems.push(`Template of view at path ${shadow.path}: ${warning}`));
                    fluid.ai.arena.templateProblems(vTree, includePending).forEach(problem => {
                        if (problem.unavailable) {
                            report(shadow, problem.unavailable, `${problem.what} in the template of view`, problem.cell);
                        } else {
                            problems.push(`${problem.what} in the template of view at path ${shadow.path} failed: ${problem.message}`);
                        }
                    });
                }
                childHidden = hidden && fluid.isUnavailable(container);
            }
            const viewShadow = shadow.childComponents?.view;
            if (viewShadow && viewShadow.path !== fluid.composeSegment(shadow.path, "view")) {
                childHidden = true;
            }
            fluid.each(shadow.childComponents, (childShadow, memberName) => {
                // As for PTF, only visit components created in place rather than injected
                if (childShadow.path === fluid.composeSegment(shadow.path, memberName)) {
                    visit(childShadow, childHidden);
                }
            });
        }
    };
    const rootShadow = fluid.ptf.componentToShadow(component);
    visit(rootShadow, false);
    // A widget which has rendered without failure may still show nothing at all, e.g. having rendered a template other
    // than the one intended
    const rendered = problems.length === 0 ? fluid.renderedContainerFor(rootShadow) : undefined;
    if (rendered && !fluid.isUnavailable(rendered) && fluid.ai.arena.rendersNothing(rendered)) {
        const markup = rendered.outerHTML;
        const quoted = markup.length > fluid.ai.arena.maxQuotedMarkup ? markup.substring(0, fluid.ai.arena.maxQuotedMarkup) + "..." : markup;
        problems.push(`The view of component at path ${rootShadow.path} rendered without failure, but shows nothing - `
            + `its rendered markup ${quoted} holds no text, child elements or images`);
    }
    hints.forEach(hint => problems.push("Hint: " + hint));
    return problems.map(problem => fluid.ai.arena.relativisePaths(problem, rootShadow.path));
};

/**
 * Render the paths of components within a widget, as they appear in a description of a problem, relative to the
 * widget, as the parts of the PTF document transmitting it are - e.g. the widget's view is at `/view`, and the widget
 * itself at `/`, wherever it is constructed
 * @param {String} text - The description
 * @param {String} rootPath - The path of the widget's root component
 * @return {String} The description, with every path within the widget made relative to it
 */
fluid.ai.arena.relativisePaths = function (text, rootPath) {
    const escaped = rootPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A path continues through any further member names, each preceded by "."
    const pathRE = new RegExp(escaped + "((?:\\.[\\w$-]+)*)(?![\\w$-])", "g");
    return text.replace(pathRE, (match, rest) => fluid.ptf.segsToFilename(rest.split(".").filter(seg => seg !== "")));
};

// The longest that `fluid.ai.arena.awaitSettled` will wait for the reactive graph to settle - work which is pending
// forever, e.g. a request which never completes, would otherwise leave it unsettled
fluid.ai.arena.settleTimeout = 8000;

/**
 * Await the settling of the reactive graph - see `fluid.cell.settle` - once nothing is queued and no work issued from
 * within it is pending, nothing further can happen without some external event, and so the state of each widget is
 * final and can be diagnosed. The settling is begun in a fresh task, so that this may be called from within an effect.
 * @param {Number} [timeout] - The longest to wait, in milliseconds
 * @return {Promise<Boolean>} A promise resolving to `true` once the graph has settled, or to `false` if it did not
 * within `timeout`
 */
fluid.ai.arena.awaitSettled = function (timeout = fluid.ai.arena.settleTimeout) {
    let timer = null;
    const timedOut = new Promise(resolve => {
        timer = setTimeout(() => resolve(false), timeout);
    });
    const settled = new Promise(resolve => setTimeout(resolve, 0)).then(() => fluid.cell.settle()).then(() => true);
    return Promise.race([settled, timedOut]).finally(() => clearTimeout(timer));
};

/**
 * Await the definition of a layer - e.g. a layer's creator function will not exist until its SFC has been parsed and
 * its script evaluated. Whilst its SFC is being parsed or injected, the layer store holds a pending record for it, which
 * holds the graph unsettled. A layer which is not available once the graph has settled never will be, e.g. since its
 * SFC was rejected, and the reason is resolved straight away rather than after any timeout.
 * @param {String} layerName - The name of the layer to wait for
 * @param {Number} [timeout] - The longest to wait for the graph to settle, in milliseconds
 * @return {Promise<Unavailable|null>} A promise resolving to `null` once the layer is available, or to the reason it
 * is not once the graph has settled without its becoming so
 */
fluid.ai.arena.awaitLayer = function (layerName, timeout) {
    const layerSignal = fluid.readLayer(layerName);
    let togo;
    if (fluid.layerRecToUnavailable(layerSignal.get()) === null) {
        togo = Promise.resolve(null);
    } else {
        togo = new Promise(resolve => {
            // Pending whilst the layer is, so that the graph does not settle before it is defined
            const watcher = fluid.cell.effect(layerRec => {
                const unavailable = fluid.layerRecToUnavailable(layerRec);
                if (unavailable === null) {
                    resolve(null);
                }
                return fluid.isPending(unavailable) ? unavailable : true;
            }, [layerSignal], {name: `awaitLayer for ${layerName}`, isFree: true});
            watcher.get();
            fluid.ai.arena.awaitSettled(timeout).then(() => {
                watcher.dispose();
                resolve(fluid.layerRecToUnavailable(layerSignal.get()));
            });
        });
    }
    return togo;
};

/**
 * Diagnose a widget as it is hosted - as by `fluid.ai.arena.diagnose`, save that a widget which is not available
 * although it has no problem other than waiting, e.g. on a request which never completes, has what it waits on reported
 * @param {fluid.component} component - The widget's root component
 * @return {String[]} Descriptions of each problem found
 */
fluid.ai.arena.diagnoseHosted = function (component) {
    const problems = fluid.ai.arena.diagnose(component, false);
    const available = !fluid.isUnavailable(fluid.ptf.componentToShadow(component).availableInstance.get());
    let togo;
    if (problems.length === 0 && !available) {
        const pending = fluid.ai.arena.diagnose(component, true);
        togo = pending.length > 0 ? pending : ["The widget did not become available, although no problem with it could be diagnosed"];
    } else {
        togo = problems;
    }
    return togo;
};

/**
 * @typedef {Object} BoundDiagnosis
 * @property {Function} refresh - Reports the diagnosis once more once the reactive graph has settled, whether or not
 * it has changed
 * @property {Function} dispose - Ends the diagnosis, which must be done before the component is destroyed
 */

/**
 * Keep a widget diagnosed by `fluid.ai.arena.diagnoseHosted`, reporting its problems whenever they change. The
 * diagnosis is held in a computed cell, which is reevaluated whenever anything it read changes, and is reported once
 * the reactive graph has settled, so that the transient states of a widget under construction are not reported, and
 * the problems of one which can progress no further are reported at once.
 * @param {fluid.component} component - The widget's root component
 * @param {Function} onProblems - Called with the {String[]} problems diagnosed each time they change, beginning with
 * the first diagnosis, which may be empty
 * @param {Number} [timeout] - The longest to wait for the graph to settle before reporting, in milliseconds
 * @return {BoundDiagnosis} The diagnosis, which may be refreshed and must be disposed
 */
fluid.ai.arena.bindDiagnosis = function (component, onProblems, timeout) {
    const path = fluid.ptf.componentToShadow(component).path;
    const diagnosis = fluid.cell(undefined, {name: `Diagnosis of component at path ${path}`})
        .computed(() => fluid.ai.arena.diagnoseHosted(component));
    let disposed = false;
    let reported = null;
    const reportSettled = function (force) {
        fluid.ai.arena.awaitSettled(timeout).then(() => {
            if (!disposed) {
                // Read afresh, since the diagnosis may have changed again whilst the graph settled
                const problems = diagnosis.get();
                const key = JSON.stringify(problems);
                if (force || key !== reported) {
                    reported = key;
                    onProblems(problems);
                }
            }
        });
    };
    const reporter = fluid.cell.effect(() => reportSettled(false), [diagnosis], {
        name: `Reporter of diagnosis of component at path ${path}`
    });
    return {
        refresh: () => reportSettled(true),
        dispose: () => {
            disposed = true;
            reporter.dispose();
        }
    };
};

// What precedes each of the user's directions, reminding the AI of the forms its response may take - followed by the
// boundary its document must use, as `fluid.ai.arena.boundaryAdvice` gives it
fluid.ai.arena.directionPreamble = "The user's direction follows. Attend to it carefully, and respond in one of the "
    + "two forms described above.";

/**
 * @typedef {Object} ArenaBridge
 * @property {Function} gatherWorkspace - Returns the current {Workspace}
 * @property {Function} applyPlan - Accepts a {ChangePlan} and returns a {Promise<AppliedChanges>}
 */

/**
 * @typedef {Object} AppliedChanges
 * @property {String[]} summary - A description of each change which was made to the workspace
 * @property {String[]} problems - A description of each problem found in applying the changes, or in the widgets
 * afterwards, suitable for reporting back to the AI
 */

/**
 * Make the assistant through which the "Ask me anything" panel reflects on and alters an arena - see AIAssistant in
 * fluid-ai.js. Its system prompt holds the prompt's stanzas, with the documentation, and the workspace as it stands. A
 * reply in text is shown to the user, and one holding a PTF document - whose boundary must be the one issued with
 * the direction - is applied to the workspace through the bridge, its text parts being shown to the user, and any
 * problems in decoding or applying it reported back to the AI for it to correct, with what of it was applied.
 * @param {ArenaBridge} bridge - The bridge to the arena
 * @param {Object} [options] - Options
 * @param {String} [options.promptLayer] - The layer of the system prompt, a fluid.ai.arena.systemPrompt or one derived
 * from it - by default fluid.ai.arena.systemPrompt itself
 * @param {ArenaHost} [options.host] - What the arena's host contributes
 * @param {Function} [options.getDocs] - Accepts the URLs of the documentation and returns a {Promise<String[]>} for it -
 * by default `fluid.ai.arena.fetchDocs`
 * @return {AIAssistant} The assistant
 */
fluid.ai.arena.makeAssistant = function (bridge, {promptLayer = "fluid.ai.arena.systemPrompt", host = fluid.ai.arena.defaultHost,
    getDocs = fluid.ai.arena.fetchDocs} = {}) {
    // The prompt's stanzas, as its layers merge them - read once, as the assistant is made
    const promptComponent = fluid.initFreeComponent(promptLayer);
    const prompt = fluid.ai.arena.systemPrompt.read(promptComponent);
    promptComponent.destroy();
    // The boundary issued with the direction being responded to - see fluid.ai.arena.issueBoundary
    let boundary = null;
    return {
        prompt,
        directionPreamble: () => {
            boundary = fluid.ai.arena.issueBoundary();
            return fluid.ai.arena.directionPreamble + " " + fluid.ai.arena.boundaryAdvice(boundary);
        },
        cachePrefixMarker: fluid.ai.arena.workspaceHeading,
        repairMessage: (problems, results) => fluid.ai.arena.repairMessage(problems, results, boundary),
        isReady: () => !bridge.isReady || bridge.isReady(),
        systemPrompt: async () => fluid.ai.arena.systemPrompt.compose(prompt, await getDocs(prompt.docUrls), bridge.gatherWorkspace(), host),
        describeOutcome: content => fluid.ai.arena.parseResponse(content).type === "text" ? "text" : "PTF document",
        interpret: async function (content, {model, direction}) {
            const response = fluid.ai.arena.parseResponse(content, boundary);
            let togo;
            if (response.type === "text") {
                togo = {entries: [{kind: "assistant", text: response.text}], problems: [], results: []};
            } else if (response.type === "invalid") {
                togo = {entries: [], problems: [response.error], results: []};
            } else {
                const workspace = bridge.gatherWorkspace();
                const widgetIds = workspace.widgets.map(widget => widget.id);
                const otherIds = host.otherIds ? host.otherIds(workspace) : [];
                const plan = fluid.ai.arena.planChanges(response.parts, widgetIds, otherIds, host, fluid.ai.arena.shownLayerParts(workspace, host));
                const texts = plan.texts.map(text => ({kind: "assistant", text}));
                if (fluid.ai.arena.isActing(response.parts)) {
                    fluid.ai.arena.stampProvenance(plan, {model, prompt: direction, datestamp: new Date().toISOString()});
                    const applied = await bridge.applyPlan(plan);
                    togo = {
                        entries: [...texts, {
                            kind: "change",
                            text: applied.summary.length > 0 ? applied.summary.join("\n") : "No changes were made to the workspace",
                            detail: response.text
                        }],
                        problems: [...plan.problems, ...applied.problems],
                        results: applied.summary
                    };
                } else {
                    togo = {entries: texts, problems: plan.problems, results: []};
                }
            }
            return togo;
        }
    };
};

/*** Applying changes to an arena - the steps common to every bridge, and the bridge of an arena with no host ***/

/**
 * Register the layers defined at the top level of a plan
 * @param {ChangePlan} plan - The planned changes
 * @param {String[]} summary - Accumulates descriptions of the changes made
 * @param {String[]} problems - Accumulates descriptions of the problems found
 */
fluid.ai.arena.registerLayers = function (plan, summary, problems) {
    plan.layers.forEach(part => {
        try {
            fluid.ptf.registerLayerPart(part);
            summary.push(`Defined layer ${part.filename}`);
        } catch (error) {
            problems.push(`The layer ${part.filename} could not be registered: ${fluid.ai.describeError(error)}`);
        }
    });
};

/**
 * Apply a change to a widget in place - its nested layers registered, and its potentia and live parts applied, once it
 * is available, or reported if it never becomes so
 * @param {fluid.component} that - The widget's component
 * @param {String} id - The widget's id
 * @param {WidgetChange} change - The change
 * @param {String[]} problems - Accumulates descriptions of the problems found
 * @param {Function} isAvailable - Returns `true` if the widget is available
 * @return {Promise} Resolves once the change has been applied, or its failure reported
 */
fluid.ai.arena.applyInPlace = async function (that, id, change, problems, isAvailable) {
    try {
        fluid.ptf.registerLayerParts(change.parts, true);
        const applying = fluid.ptf.applyParts(that, change.parts);
        // A widget which is not available once the graph has settled never will be
        const settled = fluid.ai.arena.awaitSettled().then(() => isAvailable() ? applying : null);
        const unresolved = await Promise.race([applying, settled]);
        if (unresolved === null) {
            problems.push(`The widget ${id} did not become available to apply your parts to: `
                + fluid.ai.arena.diagnose(that, true).join("; "));
        } else {
            unresolved.forEach(filename => problems.push(`The widget ${id} has no subcomponent at path ${filename} to which your parts could be applied`));
        }
    } catch (error) {
        problems.push(`Your parts could not be applied to the widget ${id}: ${fluid.ai.describeError(error)}`);
    }
};

/**
 * Diagnose every widget of an arena, other than those listed
 * @param {Map<String, fluid.component>} widgets - The widgets' components, by id
 * @param {Set<String>} [exclude] - The ids of any widgets which are not to be diagnosed
 * @return {String[]} Descriptions of any problems found
 */
fluid.ai.arena.diagnoseAll = function (widgets, exclude = new Set()) {
    const problems = [];
    widgets.forEach((that, id) => {
        if (!exclude.has(id)) {
            fluid.ai.arena.diagnose(that).forEach(problem => problems.push(`The widget ${id}: ${problem}`));
        }
    });
    return problems;
};

/**
 * Report the problems of the widgets once an arena has settled after changes - those of the widgets constructed, and
 * any of the others not found before the changes, since redefining a layer may have broken any widget using it
 * @param {Map<String, fluid.component>} widgets - The widgets' components, by id, after the changes
 * @param {Set<String>} constructedIds - The ids of the widgets constructed by the changes
 * @param {Set<String>} existingProblems - The problems found before the changes, which are not reported again
 * @param {Function} isAvailable - Accepts a widget's id, and returns `true` if it is available
 * @return {Promise<String[]>} Descriptions of the problems
 */
fluid.ai.arena.diagnoseSettled = async function (widgets, constructedIds, existingProblems, isAvailable) {
    await fluid.ai.arena.awaitSettled();
    const problems = fluid.ai.arena.diagnoseAll(widgets, constructedIds).filter(problem => !existingProblems.has(problem));
    // A fresh widget may become available whilst some of its members have failed, e.g. a reference to its own value
    constructedIds.forEach(id => {
        if (isAvailable(id) && widgets.get(id)) {
            fluid.ai.arena.diagnose(widgets.get(id)).forEach(problem => problems.push(`The widget ${id}: ${problem}`));
        }
    });
    return problems;
};

/**
 * Find the widgets of an arena - the children of its root component, each by its member name
 * @param {fluid.component} root - The root of the arena
 * @return {Map<String, fluid.component>} The widgets' components, by id
 */
fluid.ai.arena.widgetsOf = function (root) {
    const shadow = fluid.ptf.componentToShadow(root);
    // Each as the proxy through which a component is addressed - a child constructed at run time, e.g. by the AI, is
    // not a member of its parent's configuration, so is not read through the parent
    return new Map(Object.entries(shadow.childComponents || {}).filter(([, childShadow]) => childShadow.computer)
        .map(([id, childShadow]) => [id, fluid.proxyMat(childShadow.computer, childShadow, [])]));
};

/**
 * Make the bridge to an arena with no host of its own - whose widgets are the children of its root component, created
 * by constructing them as children of the root from their parts, and deleted by destroying them. e.g. a page booted
 * from a static build, whose components are the children of its document
 * @param {Function} getRoot - Returns the root component of the arena, or null if it is not yet available
 * @param {Object} [options] - Options
 * @param {Function} [options.availableLayers] - Returns the names of the layers which may be instantiated as widgets
 * @param {Function} [options.selectedIds] - Returns the ids of the widgets the user has selected
 * @return {ArenaBridge} The bridge, which is ready once the root is available
 */
fluid.ai.arena.makeBridge = function (getRoot, {availableLayers = () => [], selectedIds = () => []} = {}) {
    const isAvailable = (widgets, id) => !!widgets.get(id) &&
        !fluid.isUnavailable(fluid.ptf.componentToShadow(widgets.get(id)).availableInstance.get());
    const gatherWorkspace = function () {
        const widgets = fluid.ai.arena.widgetsOf(getRoot());
        return {
            widgets: [...widgets].map(([id, component]) => ({id, layerName: fluid.peek(fluid.makeArray(component.$layers)), component})),
            selectedIds: selectedIds(),
            availableLayers: availableLayers()
        };
    };
    const applyPlan = async function (plan) {
        const root = getRoot();
        const summary = [], problems = [];
        const before = fluid.ai.arena.widgetsOf(root);
        const existingProblems = new Set(fluid.ai.arena.diagnoseAll(before));
        const constructedIds = new Set();
        fluid.ai.arena.registerLayers(plan, summary, problems);
        plan.deletions.forEach(id => {
            before.get(id)?.destroy();
            summary.push(`Deleted widget ${id}`);
        });
        const construct = function (change, id) {
            try {
                fluid.ptf.constructParts(change.parts, {parent: root, memberName: id, overrideLayers: true});
                constructedIds.add(id);
            } catch (error) {
                problems.push(`The widget ${JSON.stringify(change.key)} could not be constructed: ${fluid.ai.describeError(error)}`);
            }
        };
        for (const change of plan.updates) {
            if (change.rebuild) {
                before.get(change.key)?.destroy();
                construct(change, change.key);
                summary.push(`Replaced widget ${change.key} with one constructed from layer ${change.layerName}`);
            } else {
                await fluid.ai.arena.applyInPlace(before.get(change.key), change.key, change, problems, () => isAvailable(fluid.ai.arena.widgetsOf(root), change.key));
                summary.push(`Updated widget ${change.key}`);
            }
        }
        plan.creations.forEach(change => {
            // The AI's name for a fresh widget is kept as its id, unless it is taken
            const taken = fluid.ai.arena.widgetsOf(root);
            let id = change.key, suffix = 1;
            while (taken.has(id)) {
                id = change.key + "-" + (++suffix);
            }
            construct(change, id);
            summary.push(`Created widget ${JSON.stringify(change.key)} as ${id} from layer ${change.layerName}`);
        });
        const after = fluid.ai.arena.widgetsOf(root);
        const found = await fluid.ai.arena.diagnoseSettled(after, constructedIds, existingProblems, id => isAvailable(after, id));
        return {summary, problems: [...new Set([...problems, ...found])]};
    };
    return {gatherWorkspace, applyPlan, isReady: () => !!getRoot()};
};
