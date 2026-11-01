"use strict";

// The protocol by which the "Ask me anything" panel converses with an AI about the workspace - assembling its prompt
// from documentation and a PTF dump of the workspace, and interpreting its response either as text for the user or
// as a PTF document altering the workspace. Nothing here touches tldraw, so that it can be tested without it - the
// parts of the conversation which act on the canvas are in tldraw-ai.js.
// See FLUID-7022

fluid.registerNamespace("fluid.tldraw.ai");

// A password-protected proxy which swaps a token derived from the password for the real key of the IFM endpoint
fluid.tldraw.ai.endpoint = "https://live.ponder.org.uk/ifm/v1/chat/completions";

// The proxy only forwards POSTs, so the models it offers cannot be listed - the panel displays this model read-only
fluid.tldraw.ai.defaultModel = "IFM/K2-Horizon-375B-A23B";

// An OpenAI-compatible service which is used in place of the IFM proxy if a key for it is found beside the page, as
// it is when the demo is served locally - the key's file is gitignored, so that it is never committed or deployed.
// Unlike the proxy, it lists the models it offers, from which the user chooses.
fluid.tldraw.ai.localService = {
    name: "CAVI",
    // Relative to the page, holding JSON of the form {"key": "<key>"}
    keyUrl: "cavi-key.json",
    endpoint: "https://ai.cavi.au.dk/v1/chat/completions",
    modelsUrl: "https://ai.cavi.au.dk/v1/models",
    // Chosen unless the user has chosen another, if the service offers it
    defaultModel: "natai/glm"
};

// Parameters for deriving the proxy token from the password, which must agree with those used to configure the proxy
fluid.tldraw.ai.tokenDerivation = {
    salt: "live.ponder.org.uk/ifm",
    iterations: 600000,
    bytes: 32
};

// The documentation of the framework included in every prompt, in this order
fluid.tldraw.ai.docUrls = [
    "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-integration-language.md",
    "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-view.md",
    "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-ptf.md",
    "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-tldraw.md"
];

// The number of times a response which could not be applied is reported back to the AI for it to correct
fluid.tldraw.ai.maxRepairs = 2;

// The most messages of earlier exchanges of the conversation which are sent along with each fresh direction - only
// whole exchanges are sent, so that fewer may be - see fluid.tldraw.ai.recentExchanges
fluid.tldraw.ai.maxHistory = 8;

// The number of tokens, including reasoning, which the AI may produce in one reply. Without this, the endpoint cuts off
// replies at 8192 tokens, which a reply reasoning at length about a composition may exceed before it begins its document
fluid.tldraw.ai.maxOutputTokens = 32768;

/**
 * Derive the token presented to the proxy from a typed password, as lowercase hex of PBKDF2-HMAC-SHA256
 * @param {String} password - The password as typed by the user
 * @return {Promise<String>} A promise for the token
 */
fluid.tldraw.ai.deriveToken = async function (password) {
    const {salt, iterations, bytes} = fluid.tldraw.ai.tokenDerivation;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt: encoder.encode(salt),
        iterations
    }, key, bytes * 8);
    return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * Fetch the documentation included in every prompt. This is fetched once per page load.
 * @return {Promise<String[]>} A promise for the text of each document in `fluid.tldraw.ai.docUrls`
 */
fluid.tldraw.ai.fetchDocs = function () {
    if (!fluid.tldraw.ai.docsPromise) {
        fluid.tldraw.ai.docsPromise = Promise.all(fluid.tldraw.ai.docUrls.map(url => fetch(url).then(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`Failed to fetch documentation from ${url}: ${response.status} ${response.statusText}`);
            }
        })));
        // Allow a failed fetch to be retried on the next send
        fluid.tldraw.ai.docsPromise.catch(() => {
            fluid.tldraw.ai.docsPromise = null;
        });
    }
    return fluid.tldraw.ai.docsPromise;
};

/**
 * @typedef {Object} LocalService
 * @property {String} name - The service's name, for display
 * @property {String} endpoint - The URL of the service's chat completions endpoint
 * @property {String} key - The key presented to the service
 * @property {String[]} models - The models offered by the service which can converse, sorted by name
 * @property {String} defaultModel - The model chosen unless the user chooses another
 */

/**
 * Fetch the key of `fluid.tldraw.ai.localService`, if one is held beside the page
 * @return {Promise<String|null>} A promise for the key, or `null` if none could be found
 */
fluid.tldraw.ai.fetchLocalKey = async function () {
    let togo = null;
    try {
        const response = await fetch(fluid.tldraw.ai.localService.keyUrl, {cache: "no-store"});
        if (response.ok) {
            const parsed = await response.json();
            togo = typeof(parsed?.key) === "string" && parsed.key.trim() ? parsed.key.trim() : null;
        }
    } catch (e) {
        // A missing key, or unparseable JSON, simply leaves the IFM proxy in use
        togo = null;
    }
    return togo;
};

/**
 * Determine whether a model listed by an OpenAI-compatible endpoint can converse - those whose mode is not "chat",
 * e.g. for speech, are excluded, as are those whose names show them to be embedding models, which are listed as "chat"
 * @param {Object} model - The model's record as listed by the endpoint
 * @return {Boolean} `true` if the model can converse
 */
fluid.tldraw.ai.isChatModel = function (model) {
    return (model.mode === undefined || model.mode === "chat") && !/embed/i.test(model.id);
};

/**
 * List the models offered by an OpenAI-compatible endpoint which can converse
 * @param {String} modelsUrl - The URL of the endpoint's model listing
 * @param {String} key - The key presented to the endpoint
 * @return {Promise<String[]>} A promise for the ids of the models, sorted
 */
fluid.tldraw.ai.fetchModels = async function (modelsUrl, key) {
    const response = await fetch(modelsUrl, {
        headers: {"Authorization": "Bearer " + key}
    });
    let togo;
    if (response.ok) {
        const payload = await response.json();
        togo = (payload.data || []).filter(fluid.tldraw.ai.isChatModel).map(model => model.id).sort();
    } else {
        throw new Error(`Failed to list models from ${modelsUrl}: ${response.status} ${response.statusText}`);
    }
    return togo;
};

/**
 * Look for a key for `fluid.tldraw.ai.localService` beside the page, and if one is found, list the models it offers
 * @return {Promise<LocalService|null>} A promise for the service, or `null` if no key was found or its models could
 * not be listed
 */
fluid.tldraw.ai.findLocalService = async function () {
    const service = fluid.tldraw.ai.localService;
    const key = await fluid.tldraw.ai.fetchLocalKey();
    let togo = null;
    if (key) {
        try {
            const models = await fluid.tldraw.ai.fetchModels(service.modelsUrl, key);
            if (models.length > 0) {
                togo = {
                    name: service.name,
                    endpoint: service.endpoint,
                    key,
                    models,
                    defaultModel: models.includes(service.defaultModel) ? service.defaultModel : models[0]
                };
            } else {
                console.log(`${service.name} offers no models which can converse - using the IFM proxy`);
            }
        } catch (e) {
            console.log(`Found a key for ${service.name} but could not list its models - using the IFM proxy: `, e);
        }
    }
    return togo;
};

/**
 * @typedef {Object} WidgetRec
 * @property {String} shapeId - The id of the tldraw shape hosting the widget
 * @property {String} layerName - The layer from which the shape's widget was constructed
 * @property {ShapeBounds} bounds - The shape's bounds in page space
 * @property {fluid.component} [component] - The widget's component, if it has been constructed
 */

/**
 * @typedef {Object} CanvasShapeRec
 * @property {String} id - The shape's id
 * @property {String} type - The shape's tldraw type, e.g. "note" or "geo"
 * @property {Number} x - The x coordinate of the shape's top left corner in page space
 * @property {Number} y - The y coordinate of the shape's top left corner in page space
 * @property {Number} w - The shape's width
 * @property {Number} h - The shape's height
 * @property {String} [text] - The shape's plain text, if it has any
 */

/**
 * @typedef {Object} Workspace
 * @property {WidgetRec[]} widgets - The Infusion widgets on the current page
 * @property {CanvasShapeRec[]} canvasShapes - The native tldraw shapes on the current page
 * @property {String[]} selectedIds - The ids of the shapes currently selected
 * @property {String[]} availableLayers - The names of all top-level widget layers which may be instantiated
 */

/**
 * Encode the workspace as a PTF document. The definitions of all user layers used by any widget are held once each
 * in top-level `layer` parts, sorted as by `fluid.ptf.sortLayerNames`, followed by a nested `component` document for each widget, whose filename is its shape
 * id, holding a `shape` part recording where it is hosted followed by its potentia and live parts, and finally a
 * `problems` part listing any problems diagnosed in it by `fluid.tldraw.ai.diagnose`. A final `canvas` part lists the
 * native tldraw shapes. This is also the form in which the AI may reply - see `fluid.tldraw.ai.planChanges`.
 * @param {Workspace} workspace - The workspace to be encoded
 * @return {String} The text of the PTF document
 */
fluid.tldraw.ai.workspaceToPTF = function (workspace) {
    const layerParts = new Map();
    const componentParts = workspace.widgets.map(widget => {
        // What the host supplied to the widget's view is described by its shape part instead
        const parts = widget.component ? fluid.tldraw.writeShapeConfig(fluid.ptf.componentToParts(widget.component), widget.layerName, null) : [];
        parts.filter(part => part.kind === "layer").forEach(part => layerParts.set(part.filename, part));
        const shapePart = {
            kind: "shape",
            contentType: fluid.layerMimeTypes.json,
            filename: "shape",
            body: JSON.stringify({layerName: widget.layerName, ...fluid.tldraw.ai.roundBounds(widget.bounds)})
        };
        const problems = widget.component ? fluid.tldraw.ai.diagnose(widget.component) : [];
        const problemsPart = problems.length === 0 ? [] : [{
            kind: "problems",
            contentType: "text/plain",
            filename: "problems",
            body: problems.map(problem => "* " + problem).join("\n")
        }];
        return {
            kind: "component",
            filename: widget.shapeId,
            parts: [shapePart, ...parts.filter(part => part.kind !== "layer"), ...problemsPart]
        };
    });
    const canvasPart = {
        kind: "canvas",
        contentType: fluid.layerMimeTypes.json,
        filename: "canvas",
        body: JSON.stringify(workspace.canvasShapes.map(shape => ({...shape, ...fluid.tldraw.ai.roundBounds(shape)})), null, 4)
    };
    const sortedLayerParts = fluid.ptf.sortLayerNames([...layerParts.keys()]).map(layerName => layerParts.get(layerName));
    return fluid.ptf.encode([...sortedLayerParts, ...componentParts, canvasPart],
        "This is a Potentia Transmission Format (PTF) document holding the Infusion widgets in the workspace.");
};

/**
 * Round the coordinates of a bounds record to whole numbers, for legibility
 * @param {ShapeBounds} [bounds] - The bounds to be rounded
 * @return {Object} A record holding whichever of `x`, `y`, `w` and `h` were present, rounded
 */
fluid.tldraw.ai.roundBounds = function (bounds) {
    const togo = {};
    ["x", "y", "w", "h"].forEach(key => {
        if (typeof(bounds?.[key]) === "number") {
            togo[key] = Math.round(bounds[key]);
        }
    });
    return togo;
};

/**
 * Describe the user's current selection in terms of the shapes of the workspace
 * @param {Workspace} workspace - The workspace
 * @return {String} A description of the selection
 */
fluid.tldraw.ai.describeSelection = function (workspace) {
    const lines = workspace.selectedIds.map(id => {
        const widget = workspace.widgets.find(oneWidget => oneWidget.shapeId === id);
        const shape = workspace.canvasShapes.find(oneShape => oneShape.id === id);
        let line;
        if (widget) {
            line = `* ${id} - an Infusion widget constructed from layer ${widget.layerName}, whose component is held in the `
                + `"component" part with filename ${id}`;
        } else if (shape) {
            line = `* ${id} - a native tldraw ${shape.type} shape` + (shape.text ? ` with text ${JSON.stringify(shape.text)}` : "");
        } else {
            line = `* ${id} - a shape of another kind`;
        }
        return line;
    });
    return lines.length === 0 ? "The user has no shapes selected." :
        "The user has selected the following shapes, and when they refer to \"this\" or \"these\" they are most "
            + "likely referring to them:\n" + lines.join("\n");
};

fluid.tldraw.ai.introduction = `You are an assistant embedded in a shared canvas, built with tldraw, on which a user arranges \
widgets. Each widget is a live component of Fluid Infusion 6, a framework in which an application is made of \
named layers of declarative configuration which any party may add to or override. Besides answering the user's \
questions, you can reflect on the widgets in the workspace and alter them - adapting them, composing them and \
creating new ones - by replying with a document in Infusion's Potentia Transmission Format (PTF), which is applied \
directly to the canvas. The documentation of the framework follows, then the rules for your response and some \
strategy hints, and finally the current state of the workspace and the user's selection.`;

fluid.tldraw.ai.responseRules = `## How to respond

Your response must take EXACTLY ONE of the following two forms, and never mix them:

1. **Text addressed to the user**, for answering a question, explaining something, or asking for clarification if \
their direction is ambiguous. Plain text or light markdown, containing no PTF document.
2. **A single PTF document altering the workspace.** Your entire response is then the document, beginning with the \
line \`MIME-Version: 1.0\` - write nothing before or after it, no commentary and no code fences.

A PTF document altering the workspace has the same form as the workspace document at the end of this prompt. Its top-level parts may be:

* \`layer\` parts, each holding a layer definition whose filename is the layer name, with Content-Type \`text/x-vue\` \
for a Single File Component or \`text/javascript\` for a \`fluid.def(...)\` call. This replaces any existing \
definition of that layer, and every widget using it updates live. Send only layers which you create or change - \
never echo back unchanged layers.
* \`component\` parts, each a nested \`multipart/mixed\` document whose filename is a shape id:
    * If the filename is the id of an existing widget and the nested document has NO potentia part for "/", its \
\`live\` and \`potentia\` parts are applied to the existing widget in place, retaining the rest of its state. This is \
the way to change a widget's state, e.g. a \`live\` part for "/" holding \`{"state.count": 5}\`. Each key of a \`live\` \
part is a path, which may reach within a member such as \`state\` to change just one of its values, whereas writing \
the member as a whole replaces all of its values.
    * If the filename is the id of an existing widget and the nested document has a potentia part for "/", the \
widget is replaced by a fresh one constructed from the nested document. Its existing state is not retained, so \
include \`live\` parts for any which should be carried over - e.g. for an umbrella holding the existing widget as its \
subcomponent \`counter\`, a \`live\` part for "/counter".
    * If the filename is not the id of an existing shape (choose any fresh name, e.g. "new-1"), a fresh widget is \
created on the canvas. Its nested document must hold a potentia part for "/" whose \`$layers\` names the layer to \
construct, e.g. \`{"$layers": ["fluid.demos.counter"]}\`, and the layer must have \`fluid.topLevelWidget\` amongst \
its layers, directly or through a parent layer.
    * Any nested document may hold a \`shape\` part with a JSON body \`{"x": ..., "y": ..., "w": ..., "h": ...}\`, \
any of whose members may be omitted, to place or resize the widget's shape in page coordinates. A fresh widget \
without one is placed beside the user's selection, at its layer's \`preferredSize\`.
* \`delete\` parts, each with an empty body, whose filename is the id of a shape to be removed.

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
widget with shape id "shape:abc" to 5 and creating a fresh "hello world" widget below it is:

MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer-1"

--outer-1
Content-Type: multipart/mixed; boundary="inner-1"
Content-Disposition: attachment; filename="shape:abc"
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
--inner-2
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="shape"
Content-Description: shape

{"x": 200, "y": 400}
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
--inner-1
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="shape"
Content-Description: shape

{"x": 500, "y": 300}
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

If your document cannot be decoded or applied, you will be told what went wrong and asked to send a corrected one.`;

fluid.tldraw.ai.strategyHints = `## Strategy hints

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
widget is placed, since it automatically takes the \`hostBounds\` and \`tldrawHost\` of the widget enclosing it. \
Never wire these yourself.
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
* A widget may reach the tldraw editor as \`{tldrawHost}.editor\`, and the bounds of its own shape as \
\`{self}.hostBounds\`. A subcomponent built from another widget's layer takes both from the widget enclosing it. \
Within a \`$component\` record, \`{self}\` designates the subcomponent itself, not the widget holding the record - \
refer to that by its context name instead, e.g. \`{showsFoundResult}\`, and never write a member as a reference to \
itself such as \`hostBounds: "{self}.hostBounds"\`. A widget layer may advertise the size at which it would like to be created as \
\`preferredSize: {w, h}\`.
* Give fresh layers distinctive dotted names, e.g. \`fluid.demos.ai.counterWithDoubler\`, and fresh SFC styles \
distinctive class names, since styles apply globally.
* Write all of a widget's CSS in the \`<style>\` block of its SFC - never in the body of a JavaScript function, \
including one computing a template's markup as a string, whether as a \`style\` attribute or a \`<style>\` element. \
Such a function chooses amongst class names defined in the \`<style>\` block instead, e.g. \
\`class="othello-cell othello-legal"\`. A widget which needs any CSS is therefore sent as a \`text/x-vue\` layer, \
since a \`text/javascript\` layer has nowhere to hold it.`;

/**
 * Encode the definitions of the named layers as a PTF document of layer parts
 * @param {String[]} layerNames - The names of the layers to be encoded
 * @return {String} The text of the PTF document
 */
fluid.tldraw.ai.layersToPTF = function (layerNames) {
    return fluid.ptf.encode(layerNames.map(layerName => fluid.ptf.layerToPart(layerName)),
        "This is a Potentia Transmission Format (PTF) document holding layer definitions.");
};

/**
 * Assemble the system prompt describing the AI's situation and role, the framework and the workspace
 * @param {String[]} docs - The text of each document of the framework's documentation
 * @param {Workspace} workspace - The current state of the workspace
 * @return {String} The system prompt
 */
// The heading of the section of the system prompt describing the workspace. All that precedes it - the introduction,
// the documentation, the response rules and the strategy hints - is the same for every request, and so may be assumed
// to be cached by the endpoint. The workspace and the selection, which vary, are placed last for this reason.
fluid.tldraw.ai.workspaceHeading = "# The workspace";

fluid.tldraw.ai.systemPrompt = function (docs, workspace) {
    const usedLayers = new Set(workspace.widgets.map(widget => widget.layerName));
    const libraryLayers = workspace.availableLayers.filter(layerName => !usedLayers.has(layerName));
    const library = libraryLayers.length === 0 ? "" :
        "\n\nThe following further widget layers are available to be instantiated, but are not currently in the workspace:\n\n"
            + fluid.tldraw.ai.layersToPTF(libraryLayers);
    return [
        fluid.tldraw.ai.introduction,
        "# Documentation\n\n" + docs.join("\n\n"),
        fluid.tldraw.ai.responseRules,
        fluid.tldraw.ai.strategyHints,
        fluid.tldraw.ai.workspaceHeading + "\n\nThe following PTF document holds every Infusion widget in the workspace, with the definitions of "
            + "the layers they use, where each is hosted on the canvas, and the native tldraw shapes alongside them:\n\n"
            + fluid.tldraw.ai.workspaceToPTF(workspace) + library,
        "# The user's selection\n\n" + fluid.tldraw.ai.describeSelection(workspace)
    ].join("\n\n");
};

/**
 * @typedef {Object} ChatMessage
 * @property {String} role - One of "system", "user" or "assistant"
 * @property {String} content - The text of the message
 * @property {String} [reasoning] - For an assistant message, the reasoning which the model produced with it. This is
 * sent back verbatim as part of the conversation's history, which some models (e.g. IFM's) require.
 */

/**
 * The messages of one exchange of a conversation - the user's direction, followed by each of the AI's replies, and
 * between them any problems with its replies which were reported back to it for repair
 * @typedef {ChatMessage[]} ChatExchange
 */

/**
 * @typedef {Object} AIReply
 * @property {String} content - The content of the AI's reply
 * @property {String} [reasoning] - Any reasoning which the model reported separately from its content
 * @property {TokenUsage} [usage] - The numbers of tokens consumed by the request, if the endpoint reported them. This
 * is not part of the conversation, and is not retained in its history
 * @property {Boolean} [truncated] - `true` if the reply was cut off on reaching `fluid.tldraw.ai.maxOutputTokens`. Like
 * `usage`, this is not retained in the conversation's history
 */

/**
 * @typedef {Object} TokenUsage
 * @property {Number} inputTokens - The number of tokens in the request's messages
 * @property {Number} outputTokens - The number of tokens in the reply, including any reasoning
 * @property {Number} [reasoningTokens] - The number of the output tokens spent on reasoning, if reported
 * @property {Number} [cachedTokens] - The number of the input tokens which the endpoint served from its cache, if reported
 */

/**
 * Read the numbers of tokens consumed by a request from the response of an OpenAI-compatible endpoint
 * @param {Object} payload - The parsed body of the response
 * @return {TokenUsage|undefined} The numbers of tokens, or `undefined` if the response did not report them
 */
fluid.tldraw.ai.usageFromPayload = function (payload) {
    const usage = payload.usage;
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens;
    return typeof(usage?.prompt_tokens) === "number" && typeof(usage.completion_tokens) === "number" ? {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        ...(typeof(reasoningTokens) === "number" ? {reasoningTokens} : {}),
        ...(typeof(cachedTokens) === "number" ? {cachedTokens} : {})
    } : undefined;
};

// The average number of characters per token, by which token counts are estimated where they were not reported
fluid.tldraw.ai.charsPerToken = 4;

/**
 * Estimate the number of tokens in some texts, for use where an endpoint does not report them
 * @param {String[]} texts - The texts
 * @return {Number} The estimated number of tokens
 */
fluid.tldraw.ai.estimateTokens = function (texts) {
    return Math.ceil(texts.reduce((total, text) => total + (text || "").length, 0) / fluid.tldraw.ai.charsPerToken);
};

/**
 * Determine how many of the tokens sent in a request lie in the prefix of the prompt which is common to every request -
 * the part of the system prompt preceding the workspace - and so may be assumed to be cached by the endpoint. Given the
 * number of tokens which the endpoint reported, this is apportioned by the prefix's share of the request's text, and
 * otherwise it is estimated from the prefix's length.
 * @param {ChatMessage[]} messages - The messages sent
 * @param {Number} [inputTokens] - The number of tokens which the endpoint reported for the request, if any
 * @return {Number} The number of tokens assumed to be cached
 */
fluid.tldraw.ai.cachedTokens = function (messages, inputTokens) {
    const system = messages.find(message => message.role === "system")?.content || "";
    const prefixLength = Math.max(0, system.indexOf(fluid.tldraw.ai.workspaceHeading));
    const totalLength = messages.reduce((total, message) => total + (message.content || "").length, 0);
    return inputTokens === undefined ? Math.floor(prefixLength / fluid.tldraw.ai.charsPerToken) :
        totalLength === 0 ? 0 : Math.round(inputTokens * prefixLength / totalLength);
};

/**
 * Select the messages of the most recent exchanges of a conversation which are to be sent with a fresh direction - as
 * many whole exchanges as together hold no more than `maxMessages` messages. An exchange is never sent in part, since
 * a reply or a reported problem would make no sense without the direction it answers.
 * @param {ChatExchange[]} history - The earlier exchanges of the conversation
 * @param {Number} [maxMessages] - The most messages to be selected
 * @return {ChatMessage[]} The messages of the selected exchanges, in order
 */
fluid.tldraw.ai.recentExchanges = function (history, maxMessages = fluid.tldraw.ai.maxHistory) {
    const selected = [];
    let count = 0;
    let full = false;
    for (let i = history.length - 1; i >= 0 && !full; --i) {
        if (count + history[i].length <= maxMessages) {
            selected.unshift(history[i]);
            count += history[i].length;
        } else {
            // Exchanges are only ever dropped from the start of the conversation, so that those sent are contiguous
            full = true;
        }
    }
    return selected.flat();
};

/**
 * Assemble the messages to be sent for a fresh direction from the user. The system prompt is assembled afresh
 * reflecting the current workspace, followed by the most recent exchanges of the conversation, as selected by
 * `fluid.tldraw.ai.recentExchanges`, and then the direction.
 * @param {String} systemPrompt - The system prompt, as assembled by `fluid.tldraw.ai.systemPrompt`
 * @param {ChatExchange[]} history - The earlier exchanges of the conversation
 * @param {String} direction - The user's direction
 * @return {ChatMessage[]} The messages to be sent
 */
fluid.tldraw.ai.buildMessages = function (systemPrompt, history, direction) {
    return [
        {role: "system", content: systemPrompt},
        ...fluid.tldraw.ai.recentExchanges(history),
        {
            role: "user",
            content: "The user's direction follows. Attend to it carefully, and respond in exactly one of the two forms "
                + "described above.\n\n" + direction
        }
    ];
};

/**
 * Assemble the message reporting back to the AI that its response could not be applied
 * @param {String[]} problems - Descriptions of what went wrong
 * @return {ChatMessage} The message to be sent
 */
fluid.tldraw.ai.repairMessage = function (problems) {
    return {
        role: "user",
        content: "Your response could not be fully applied to the workspace:\n\n" + problems.map(problem => "* " + problem).join("\n")
            + "\n\nPlease respond again with a corrected PTF document, following the same rules. The changes which "
            + "were applied have been kept, so send only what is still required."
    };
};

/**
 * Call the AI endpoint with a conversation
 * @param {Object} options - The call's options
 * @param {String} [options.endpoint] - The endpoint to be called, by default the IFM proxy at `fluid.tldraw.ai.endpoint`
 * @param {String} options.token - The token derived from the user's password, or the key of a local service
 * @param {String} options.model - The model to be used
 * @param {ChatMessage[]} options.messages - The messages to be sent
 * @return {Promise<AIReply>} A promise for the AI's reply. On a rejected token, the promise rejects with an error whose
 * `unauthorised` member is `true`
 */
fluid.tldraw.ai.callEndpoint = async function ({endpoint = fluid.tldraw.ai.endpoint, token, model, messages}) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({model, messages, stream: false, max_tokens: fluid.tldraw.ai.maxOutputTokens})
    });
    let togo;
    if (response.ok) {
        const payload = await response.json();
        const choice = payload.choices?.[0];
        const message = choice?.message;
        const usage = fluid.tldraw.ai.usageFromPayload(payload);
        if (typeof(message?.content) === "string") {
            togo = {
                content: message.content,
                ...(typeof(message.reasoning) === "string" ? {reasoning: message.reasoning} : {}),
                ...(usage ? {usage} : {}),
                ...(choice.finish_reason === "length" ? {truncated: true} : {})
            };
        } else {
            throw new Error("The AI endpoint returned no message: " + JSON.stringify(payload).substring(0, 500));
        }
    } else {
        const text = await response.text();
        const error = new Error(`The AI endpoint responded ${response.status} ${response.statusText}: ${text.substring(0, 500)}`);
        error.unauthorised = response.status === 401;
        throw error;
    }
    return togo;
};

/**
 * Remove any reasoning which a reasoning model has included in the content of its response
 * @param {String} text - The content of the response
 * @return {String} The content with any reasoning removed
 */
fluid.tldraw.ai.stripReasoning = function (text) {
    const closeIndex = text.lastIndexOf("</think>");
    // Some models omit the opening tag, so everything up to the last closing tag is discarded
    const afterReasoning = closeIndex === -1 ? text : text.substring(closeIndex + "</think>".length);
    return afterReasoning.trim();
};

/**
 * @typedef {Object} AIResponse
 * @property {String} type - "text" for text addressed to the user, "ptf" for a decoded PTF document, or "invalid" for
 * a response which appears to hold a PTF document which could not be decoded
 * @property {String} text - The text of the response with any reasoning removed
 * @property {PTFPart[]} [parts] - For a "ptf" response, the decoded parts of the document
 * @property {String} [error] - For an "invalid" response, why it could not be decoded
 */

// Matches the line beginning a PTF document anywhere in a response
const ptfStartRE = /^[ \t]*MIME-Version:/im;

/**
 * Interpret a response from the AI. A response is taken to be a PTF document if any line of it begins with
 * `MIME-Version:`, in which case any text before that line and after the document's close delimiter, such as code
 * fences or commentary in violation of the rules, is discarded.
 * @param {String} raw - The content of the AI's response
 * @return {AIResponse} The interpreted response
 */
fluid.tldraw.ai.parseResponse = function (raw) {
    const text = fluid.tldraw.ai.stripReasoning(raw);
    const match = ptfStartRE.exec(text);
    let togo;
    if (match) {
        const documentText = fluid.tldraw.ai.trimDocument(text.substring(match.index).replace(/\r\n/g, "\n"));
        const parts = fluid.ptf.decode(documentText);
        if (fluid.isUnavailable(parts)) {
            togo = {type: "invalid", text, error: "Your response begins a MIME document but is not a valid PTF document - "
                + "check that its Content-Type header is multipart/mixed and declares a boundary"};
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
 * Discard anything following the close delimiter of a PTF document
 * @param {String} text - Text beginning with a PTF document, with LF line endings
 * @return {String} The text of the document alone
 */
fluid.tldraw.ai.trimDocument = function (text) {
    const {headers} = fluid.ptf.splitHeaders(text);
    const boundary = fluid.ptf.parseHeaderValue(headers["content-type"]).params.boundary;
    const close = boundary ? text.indexOf("\n--" + boundary + "--") : -1;
    return close === -1 ? text : text.substring(0, close + boundary.length + 5) + "\n";
};

/**
 * @typedef {Object} ShapeChange
 * @property {String} key - For an update, the id of the existing shape - for a creation, the filename chosen by the AI
 * @property {PTFPart[]} parts - The parts of the component's nested document, other than its shape part
 * @property {Object} shape - Members `x`, `y`, `w` and `h` read from its shape part, any of which may be absent
 * @property {Boolean} rebuild - For an update, `true` if the widget is to be replaced, rather than altered in place
 * @property {String} [layerName] - For a rebuild or creation, the layer from which the widget is to be constructed
 */

/**
 * @typedef {Object} ChangePlan
 * @property {PTFPart[]} layers - Layer parts to be registered, overriding any existing definitions
 * @property {ShapeChange[]} updates - Changes to existing widgets
 * @property {ShapeChange[]} creations - Fresh widgets to be created
 * @property {String[]} deletions - The ids of shapes to be deleted
 * @property {String[]} problems - Descriptions of any parts which were rejected
 */

/**
 * Check that the body of a JSON part parses
 * @param {PTFPart} part - The part to be checked
 * @param {String} where - A description of where the part was found, for any problem reported
 * @param {String[]} problems - Accumulates a description of the part's problem, if any
 * @return {any} The parsed body, or `undefined` if it did not parse
 */
fluid.tldraw.ai.parseJSONPart = function (part, where, problems) {
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
fluid.tldraw.ai.checkLayerPart = function (part, where, problems) {
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
        fluid.tldraw.ai.parseJSONPart(part, where, problems);
    } else if (part.contentType === fluid.layerMimeTypes.sfc) {
        if (!/<script[\s>]/.test(part.body)) {
            problems.push(`The SFC layer ${name} ${where} has no <script> block defining the layer`);
        } else if (fluid.tldraw.ai.hasTemplateConflict(part)) {
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
 * the problem is reported at once rather than surfacing as a widget which never becomes available.
 * @param {PTFPart} part - The SFC layer part
 * @return {Boolean} `true` if the template is defined twice
 */
fluid.tldraw.ai.hasTemplateConflict = function (part) {
    let togo = false;
    try {
        const vTree = fluid.parseHTMLToTree(part.body);
        const defMapList = fluid.parseSFCScripts(fluid.querySelectorAll(vTree, "script"));
        const ourDef = fluid.indexLayerDefs(defMapList)[part.filename];
        togo = !!ourDef && fluid.hasSFCTemplateConflict(vTree, defMapList[ourDef.scriptIndex], part.filename);
    } catch (e) {
        // A script which cannot be parsed is reported when the layer is registered
        togo = false;
    }
    return togo;
};

/**
 * Plan the changes to the workspace described by a PTF document sent by the AI, checking each of its parts. Parts
 * which fail their checks are omitted from the plan and their problems reported, so that the remainder can be applied.
 * @param {PTFPart[]} parts - The decoded parts of the document
 * @param {String[]} widgetIds - The shape ids of the widgets currently in the workspace
 * @param {String[]} shapeIds - The ids of all shapes currently in the workspace, including widgets
 * @return {ChangePlan} The planned changes
 */
fluid.tldraw.ai.planChanges = function (parts, widgetIds, shapeIds) {
    const plan = {layers: [], updates: [], creations: [], deletions: [], problems: []};
    const problems = plan.problems;
    parts.forEach(part => {
        const name = JSON.stringify(part.filename);
        if (part.kind === "layer") {
            if (fluid.tldraw.ai.checkLayerPart(part, "at the top level", problems)) {
                plan.layers.push(part);
            }
        } else if (part.kind === "delete") {
            if (shapeIds.includes(part.filename)) {
                plan.deletions.push(part.filename);
            } else {
                problems.push(`The delete part with filename ${name} does not name a shape in the workspace`);
            }
        } else if (part.kind === "component") {
            const change = fluid.tldraw.ai.planShapeChange(part, widgetIds, shapeIds, problems);
            if (change && widgetIds.includes(part.filename)) {
                plan.updates.push(change);
            } else if (change) {
                plan.creations.push(change);
            }
        } else if (part.kind === "canvas") {
            problems.push("The canvas part cannot be sent - native tldraw shapes cannot be altered");
        } else {
            problems.push(`The part with filename ${name} has unrecognised kind ${JSON.stringify(part.kind)} in its `
                + "Content-Description - expected layer, component or delete");
        }
    });
    fluid.tldraw.ai.checkTopLevelWidget(parts, plan);
    return plan;
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
fluid.tldraw.ai.stampLayerPart = function (part, provenance, isDefined) {
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
 * of its document and within its component parts - see `fluid.tldraw.ai.stampLayerPart`
 * @param {ChangePlan} plan - The planned changes, whose layer parts are replaced by ones recording their provenance
 * @param {SFCProvenance} provenance - The provenance of the response
 * @param {Function} [isDefined] - Accepts a layer name and returns `true` if the layer is currently defined,
 * defaulting to `fluid.ptf.isLayerDefined`
 */
fluid.tldraw.ai.stampProvenance = function (plan, provenance, isDefined = fluid.ptf.isLayerDefined) {
    const stamp = part => fluid.tldraw.ai.stampLayerPart(part, provenance, isDefined);
    plan.layers = plan.layers.map(stamp);
    [...plan.creations, ...plan.updates].forEach(change => {
        change.parts = change.parts.map(stamp);
    });
};

// The layer which every widget synthesized by the AI must apply at its top level
fluid.tldraw.ai.topLevelWidgetLayer = "fluid.topLevelWidget";

/**
 * Check that a document which synthesizes a widget - that is, constructs a fresh or replacement widget from a layer
 * which it defines - names `fluid.topLevelWidget` somewhere in its layer definitions, as the AI is instructed to. This
 * is a simple search of their text rather than an analysis of the layers. If the check fails, the whole document is
 * rejected for correction, by emptying the plan of all of its changes and reporting the problem.
 * @param {PTFPart[]} parts - The decoded parts of the document
 * @param {ChangePlan} plan - The changes planned from the document, which are cleared if the check fails
 */
fluid.tldraw.ai.checkTopLevelWidget = function (parts, plan) {
    const layerParts = [...parts, ...parts.flatMap(part => part.kind === "component" && part.parts ? part.parts : [])]
        .filter(part => part.kind === "layer");
    const definedLayers = new Set(layerParts.map(part => part.filename));
    const synthesized = [...plan.creations, ...plan.updates.filter(change => change.rebuild)]
        .filter(change => definedLayers.has(change.layerName));
    const named = layerParts.some(part => part.body.includes(fluid.tldraw.ai.topLevelWidgetLayer));
    if (synthesized.length > 0 && !named) {
        const layerNames = [...new Set(synthesized.map(change => change.layerName))].join(", ");
        plan.layers = [];
        plan.updates = [];
        plan.creations = [];
        plan.deletions = [];
        plan.problems.push(`Your document synthesizes widgets from the layers ${layerNames} which you define, but does not `
            + `name ${fluid.tldraw.ai.topLevelWidgetLayer} - every widget you synthesize must name it as the first of the `
            + "$layers of its layer's definition, even if it is inherited. None of your document has been applied, so "
            + "send all of it again with this corrected.");
    }
};

/**
 * Plan the change to a single widget described by a `component` part sent by the AI
 * @param {PTFPart} part - The component part
 * @param {String[]} widgetIds - The shape ids of the widgets currently in the workspace
 * @param {String[]} shapeIds - The ids of all shapes currently in the workspace, including widgets
 * @param {String[]} problems - Accumulates descriptions of any problems found
 * @return {ShapeChange|null} The planned change, or `null` if the part was rejected
 */
fluid.tldraw.ai.planShapeChange = function (part, widgetIds, shapeIds, problems) {
    const name = JSON.stringify(part.filename);
    const where = `within the component part ${name}`;
    const initialCount = problems.length;
    let togo = null;
    if (!part.parts) {
        problems.push(`The component part ${name} is not a nested multipart/mixed document with its own boundary`);
    } else if (!widgetIds.includes(part.filename) && shapeIds.includes(part.filename)) {
        problems.push(`The component part ${name} names a native tldraw shape, which cannot hold a widget`);
    } else {
        const shape = {};
        const nested = [];
        part.parts.forEach(nestedPart => {
            if (nestedPart.kind === "shape") {
                Object.assign(shape, fluid.tldraw.ai.roundBounds(fluid.tldraw.ai.parseJSONPart(nestedPart, where, problems)));
            } else if (nestedPart.kind === "layer") {
                if (fluid.tldraw.ai.checkLayerPart(nestedPart, where, problems)) {
                    nested.push(nestedPart);
                }
            } else if (nestedPart.kind === "potentia" || nestedPart.kind === "live") {
                if (fluid.tldraw.ai.parseJSONPart(nestedPart, where, problems) !== undefined) {
                    nested.push(nestedPart);
                }
            } else if (nestedPart.kind === "problems") {
                // Problems are diagnosed afresh in the workspace, so any echoed back are ignored
            } else {
                problems.push(`The part with filename ${JSON.stringify(nestedPart.filename)} ${where} has unrecognised kind `
                    + `${JSON.stringify(nestedPart.kind)} - expected shape, layer, potentia or live`);
            }
        });
        const rootPart = nested.find(fluid.ptf.isRootPotentiaPart);
        const layerName = rootPart && fluid.makeArray(JSON.parse(rootPart.body).$layers)[0];
        const isUpdate = widgetIds.includes(part.filename);
        if (rootPart && !layerName) {
            problems.push(`The potentia part for "/" ${where} has no $layers naming the layer to construct`);
        } else if (!isUpdate && !rootPart) {
            problems.push(`The component part ${name} does not name an existing widget, so it must hold a potentia part `
                + "for \"/\" whose $layers names the layer from which to construct a fresh widget");
        }
        if (problems.length === initialCount) {
            togo = {key: part.filename, parts: nested, shape, rebuild: !!rootPart, layerName};
        }
    }
    return togo;
};

// Elements which are visible without holding any text or child elements
fluid.tldraw.ai.visibleElements = "img, svg, canvas, video, iframe, input, button, select, textarea, object, embed";

// The number of characters of a widget's markup quoted in reporting that it renders nothing
fluid.tldraw.ai.maxQuotedMarkup = 200;

/**
 * Determine whether an element onto which a widget has rendered shows nothing - it holds no text, no child elements,
 * and is not itself an element which is visible without them. Such a widget has rendered without any failure, yet
 * shows the user just an empty box - for example, since the template which was rendered is not the one intended.
 * @param {Element} element - The element onto which the widget has rendered
 * @return {Boolean} `true` if the element shows nothing
 */
fluid.tldraw.ai.rendersNothing = function (element) {
    return element.textContent.trim() === "" && element.children.length === 0 && !element.matches(fluid.tldraw.ai.visibleElements);
};

/**
 * Find the causes of an unavailable value - those it records itself, or else, since a value may be unavailable without
 * recording why, e.g. one which was never computed since a value it depends on was unavailable, those found upstream
 * of the cell which holds it by `fluid.cell.explainUnavailable`
 * @param {Unavailable} unavailable - The unavailable value
 * @param {Cell} [cell] - The cell holding the value, if known
 * @return {UnavailableCause[]} The causes which bear messages, which is empty if none could be found
 */
fluid.tldraw.ai.causesOf = function (unavailable, cell) {
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
fluid.tldraw.ai.checkHandler = function (vnode, onKey, onValue) {
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
        togo = {what, message: `It could not be parsed: ${fluid.tldraw.ai.describeError(e)}`};
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
fluid.tldraw.ai.templateProblems = function (vTree, includePending) {
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
                const problem = fluid.tldraw.ai.checkHandler(vnode, onKey, onValue);
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
fluid.tldraw.ai.isFailedMember = function (unavailable, cell) {
    const variety = fluid.unProxy(unavailable).variety;
    return variety === "error" || variety === "config" && fluid.tldraw.ai.causesOf(unavailable, cell).some(cause => !!cause.site);
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
fluid.tldraw.ai.diagnose = function (component, includePending) {
    const problems = [];
    // Each cause is reported once, at the first place it is found, rather than at every value it propagates to
    const reportedCauses = new Set();
    const reportable = value => fluid.isUnavailable(value) && (includePending || fluid.unProxy(value).variety !== "pending");
    // Hints accompanying the causes reported, each of which is reported once after all the problems
    const hints = new Set();
    // Components for which some cause has been reported, whose failures without a cause of their own need no report
    const explainedShadows = new Set();
    const report = function (shadow, unavailable, what, cell) {
        const causes = fluid.tldraw.ai.causesOf(unavailable, cell);
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
                    if (fluid.isUnavailable(value) && fluid.tldraw.ai.isFailedMember(value, cell)) {
                        report(shadow, value, `Member ${memberName} of component`, cell);
                    }
                }
            });
            let childHidden = hidden;
            if (fluid.deSignal(that.$layers).includes("fluid.viewComponent")) {
                const container = fluid.deSignal(that.container);
                const vTree = fluid.deSignal(that.vTree);
                if (reportable(container) && !hidden) {
                    report(shadow, container, "Container of view", fluid.getForComponent(shadow, "container"));
                } else if (reportable(vTree)) {
                    report(shadow, vTree, "Rendering of view", fluid.getForComponent(shadow, "vTree"));
                } else if (!fluid.isUnavailable(vTree)) {
                    const templateTree = fluid.deSignal(that.templateTree);
                    (templateTree?.warnings || []).forEach(warning => problems.push(`Template of view at path ${shadow.path}: ${warning}`));
                    fluid.tldraw.ai.templateProblems(vTree, includePending).forEach(problem => {
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
    if (rendered && !fluid.isUnavailable(rendered) && fluid.tldraw.ai.rendersNothing(rendered)) {
        const markup = rendered.outerHTML;
        const quoted = markup.length > fluid.tldraw.ai.maxQuotedMarkup ? markup.substring(0, fluid.tldraw.ai.maxQuotedMarkup) + "..." : markup;
        problems.push(`The view of component at path ${rootShadow.path} rendered without failure, but shows nothing - `
            + `its rendered markup ${quoted} holds no text, child elements or images`);
    }
    hints.forEach(hint => problems.push("Hint: " + hint));
    return problems.map(problem => fluid.tldraw.ai.relativisePaths(problem, rootShadow.path));
};

/**
 * Render the paths of components within a widget, as they appear in a description of a problem, relative to the
 * widget, as the parts of the PTF document transmitting it are - e.g. the widget's view is at `/view`, and the widget
 * itself at `/`, wherever it is constructed
 * @param {String} text - The description
 * @param {String} rootPath - The path of the widget's root component
 * @return {String} The description, with every path within the widget made relative to it
 */
fluid.tldraw.ai.relativisePaths = function (text, rootPath) {
    const escaped = rootPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A path continues through any further member names, each preceded by "."
    const pathRE = new RegExp(escaped + "((?:\\.[\\w$-]+)*)(?![\\w$-])", "g");
    return text.replace(pathRE, (match, rest) => fluid.ptf.segsToFilename(rest.split(".").filter(seg => seg !== "")));
};

// The longest that `fluid.tldraw.ai.awaitSettled` will wait for the reactive graph to settle - work which is pending
// forever, e.g. a request which never completes, would otherwise leave it unsettled
fluid.tldraw.ai.settleTimeout = 8000;

/**
 * Await the settling of the reactive graph - see `fluid.cell.settle` - once nothing is queued and no work issued from
 * within it is pending, nothing further can happen without some external event, and so the state of each widget is
 * final and can be diagnosed. The settling is begun in a fresh task, so that this may be called from within an effect.
 * @param {Number} [timeout] - The longest to wait, in milliseconds
 * @return {Promise<Boolean>} A promise resolving to `true` once the graph has settled, or to `false` if it did not
 * within `timeout`
 */
fluid.tldraw.ai.awaitSettled = function (timeout = fluid.tldraw.ai.settleTimeout) {
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
fluid.tldraw.ai.awaitLayer = function (layerName, timeout) {
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
            fluid.tldraw.ai.awaitSettled(timeout).then(() => {
                watcher.dispose();
                resolve(fluid.layerRecToUnavailable(layerSignal.get()));
            });
        });
    }
    return togo;
};

/**
 * Diagnose a widget as it is hosted - as by `fluid.tldraw.ai.diagnose`, save that a widget which is not available
 * although it has no problem other than waiting, e.g. on a request which never completes, has what it waits on reported
 * @param {fluid.component} component - The widget's root component
 * @return {String[]} Descriptions of each problem found
 */
fluid.tldraw.ai.diagnoseHosted = function (component) {
    const problems = fluid.tldraw.ai.diagnose(component, false);
    const available = !fluid.isUnavailable(fluid.ptf.componentToShadow(component).availableInstance.get());
    let togo;
    if (problems.length === 0 && !available) {
        const pending = fluid.tldraw.ai.diagnose(component, true);
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
 * Keep a widget diagnosed by `fluid.tldraw.ai.diagnoseHosted`, reporting its problems whenever they change. The
 * diagnosis is held in a computed cell, which is reevaluated whenever anything it read changes, and is reported once
 * the reactive graph has settled, so that the transient states of a widget under construction are not reported, and
 * the problems of one which can progress no further are reported at once.
 * @param {fluid.component} component - The widget's root component
 * @param {Function} onProblems - Called with the {String[]} problems diagnosed each time they change, beginning with
 * the first diagnosis, which may be empty
 * @param {Number} [timeout] - The longest to wait for the graph to settle before reporting, in milliseconds
 * @return {BoundDiagnosis} The diagnosis, which may be refreshed and must be disposed
 */
fluid.tldraw.ai.bindDiagnosis = function (component, onProblems, timeout) {
    const path = fluid.ptf.componentToShadow(component).path;
    const diagnosis = fluid.cell(undefined, {name: `Diagnosis of component at path ${path}`})
        .computed(() => fluid.tldraw.ai.diagnoseHosted(component));
    let disposed = false;
    let reported = null;
    const reportSettled = function (force) {
        fluid.tldraw.ai.awaitSettled(timeout).then(() => {
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

/**
 * Describe an error, which may be an unavailable value, as text
 * @param {Error|Unavailable|any} error - The error
 * @return {String} A description of the error
 */
fluid.tldraw.ai.describeError = function (error) {
    let togo;
    if (fluid.isUnavailable(error)) {
        togo = fluid.unavailableToCauses(fluid.unProxy(error)).map(cause => cause.message).join("; ");
    } else if (error instanceof Error) {
        togo = error.message;
    } else {
        togo = String(error);
    }
    return togo;
};

/**
 * @typedef {Object} ChatEntry
 * @property {String} kind - "assistant" for text addressed to the user by the AI, "change" for a change it made to the
 * workspace, "problem" for problems it was asked to correct, or "error" for a failure which ended the exchange
 * @property {String} text - The text of the entry
 * @property {String} [detail] - Further material, e.g. the PTF document from which a change was made
 */

/**
 * Format a list of problems for display to the user
 * @param {String[]} problems - Descriptions of the problems
 * @return {String} The problems, one per line, each preceded by a bullet
 */
fluid.tldraw.ai.listProblems = function (problems) {
    return problems.map(problem => "\u2022 " + problem).join("\n");
};

// The problem reported to the AI when its reply was cut off on reaching fluid.tldraw.ai.maxOutputTokens
fluid.tldraw.ai.truncationProblem = `Your response was cut off on reaching the limit of ${fluid.tldraw.ai.maxOutputTokens} \
output tokens, before it was complete. Reason more briefly, and send only the parts which are required.`;

/**
 * Carry out one exchange with the AI on the user's direction. If the AI responds with text, it is reported to the
 * user. If it responds with a PTF document, the document is applied to the workspace, and any problems in decoding
 * or applying it are reported back to the AI for it to correct, up to `fluid.tldraw.ai.maxRepairs` times. The system
 * prompt is assembled afresh for each request, so that it reflects any changes already made.
 * @param {Object} options - The exchange's options
 * @param {String} options.direction - The user's direction
 * @param {ChatExchange[]} options.history - The earlier exchanges of the conversation
 * @param {String} [options.model] - The id of the model being conversed with, recorded in the `<provenance>` block of
 * any layer which it defines - see `fluid.tldraw.ai.stampProvenance`
 * @param {AIBridge} options.bridge - The bridge to the workspace, as constructed by `makeAIBridge` in tldraw-ai.js
 * @param {Function} options.call - Accepts a {ChatMessage[]} and returns a {Promise<AIReply|String>} for the AI's
 * response, a String being taken as its content
 * @param {Function} options.report - Accepts a {ChatEntry} to be shown to the user
 * @param {Function} [options.getDocs] - Returns a {Promise<String[]>} for the documentation to be included in the
 * prompt, defaulting to `fluid.tldraw.ai.fetchDocs`
 * @return {Promise<ChatExchange[]>} A promise for the conversation's history including this exchange, which rejects if
 * a request fails
 */
fluid.tldraw.ai.converse = async function ({direction, history, model, bridge, call, report, getDocs = fluid.tldraw.ai.fetchDocs}) {
    const docs = await getDocs();
    const messages = fluid.tldraw.ai.buildMessages("", history, direction);
    // The messages of this exchange begin with the direction, following the system prompt and earlier exchanges
    const exchangeStart = messages.length - 1;
    let repairs = 0;
    let done = false;
    while (!done) {
        messages[0].content = fluid.tldraw.ai.systemPrompt(docs, bridge.gatherWorkspace());
        const received = await call(messages);
        // Any token usage is not part of the conversation, and is reported by the caller - see measureCall
        // eslint-disable-next-line no-unused-vars
        const {usage, truncated, ...reply} = typeof(received) === "string" ? {content: received} : received;
        // A reply which was cut off is neither a complete answer nor a complete document, and may hold nothing but the
        // AI's reasoning, so it is never shown to the user as an answer
        const response = truncated ? {type: "invalid", error: fluid.tldraw.ai.truncationProblem} : fluid.tldraw.ai.parseResponse(reply.content);
        // The reply is retained verbatim, together with any reasoning, since some models reject a history in which
        // their earlier turns have been altered
        messages.push({role: "assistant", ...reply});
        let problems = [];
        if (response.type === "text") {
            report({kind: "assistant", text: response.text});
        } else if (response.type === "invalid") {
            problems = [response.error];
        } else {
            const workspace = bridge.gatherWorkspace();
            const widgetIds = workspace.widgets.map(widget => widget.shapeId);
            const shapeIds = [...widgetIds, ...workspace.canvasShapes.map(shape => shape.id)];
            const plan = fluid.tldraw.ai.planChanges(response.parts, widgetIds, shapeIds);
            fluid.tldraw.ai.stampProvenance(plan, {model, prompt: direction, datestamp: new Date().toISOString()});
            const applied = await bridge.applyPlan(plan);
            problems = [...plan.problems, ...applied.problems];
            report({
                kind: "change",
                text: applied.summary.length > 0 ? applied.summary.join("\n") : "No changes were made to the workspace",
                detail: response.text
            });
        }
        if (problems.length === 0) {
            done = true;
        } else if (repairs < fluid.tldraw.ai.maxRepairs) {
            ++repairs;
            report({kind: "problem", text: `Asking the AI to correct its response (attempt ${repairs} of ${fluid.tldraw.ai.maxRepairs}):\n`
                + fluid.tldraw.ai.listProblems(problems)});
            messages.push(fluid.tldraw.ai.repairMessage(problems));
        } else {
            report({kind: "error", text: "The AI's response could not be fully applied:\n" + fluid.tldraw.ai.listProblems(problems)});
            done = true;
        }
    }
    return [...history, messages.slice(exchangeStart)];
};
