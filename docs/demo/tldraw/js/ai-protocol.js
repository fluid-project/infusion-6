"use strict";

// The protocol by which the "Ask me anything" panel converses with an AI about the workspace - assembling its prompt
// from documentation and a PTF dump of the workspace, and interpreting its response either as text for the user or
// as a PTF document altering the workspace. Nothing here touches tldraw, so that it can be tested without it - the
// parts of the conversation which act on the canvas are in tldraw-ai.js.
// See https://github.com/fluid-project/infusion-6/issues/22

fluid.registerNamespace("fluid.tldraw.ai");

// A password-protected proxy which swaps a token derived from the password for the real key of the IFM endpoint
fluid.tldraw.ai.endpoint = "https://live.ponder.org.uk/ifm/v1/chat/completions";

// The proxy only forwards POSTs, so the models it offers cannot be listed - this may be overridden in the panel
fluid.tldraw.ai.defaultModel = "IFM/K2-Horizon-375B-A23B";

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
    "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-ptf.md"
];

// The number of times a response which could not be applied is reported back to the AI for it to correct
fluid.tldraw.ai.maxRepairs = 2;

// Layers which the host broadcasts onto every widget, which are part of the canvas rather than any widget and so are
// not transmitted as part of the workspace
fluid.tldraw.ai.hostLayers = ["fluid.tldrawViewComponent"];

// The number of earlier messages of the conversation which are sent along with each fresh direction
fluid.tldraw.ai.maxHistory = 8;

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
 * in top-level `layer` parts, followed by a nested `component` document for each widget, whose filename is its shape
 * id, holding a `shape` part recording where it is hosted followed by its potentia and live parts. A final `canvas`
 * part lists the native tldraw shapes. This is also the form in which the AI may reply - see `fluid.tldraw.ai.planChanges`.
 * @param {Workspace} workspace - The workspace to be encoded
 * @return {String} The text of the PTF document
 */
fluid.tldraw.ai.workspaceToPTF = function (workspace) {
    const layerParts = new Map();
    const componentParts = workspace.widgets.map(widget => {
        const parts = widget.component ? fluid.ptf.componentToParts(widget.component) : [];
        parts.filter(part => part.kind === "layer" && !fluid.tldraw.ai.hostLayers.includes(part.filename))
            .forEach(part => layerParts.set(part.filename, part));
        const shapePart = {
            kind: "shape",
            contentType: fluid.layerMimeTypes.json,
            filename: "shape",
            body: JSON.stringify({layerName: widget.layerName, ...fluid.tldraw.ai.roundBounds(widget.bounds)})
        };
        return {
            kind: "component",
            filename: widget.shapeId,
            parts: [shapePart, ...parts.filter(part => part.kind !== "layer")]
        };
    });
    const canvasPart = {
        kind: "canvas",
        contentType: fluid.layerMimeTypes.json,
        filename: "canvas",
        body: JSON.stringify(workspace.canvasShapes.map(shape => ({...shape, ...fluid.tldraw.ai.roundBounds(shape)})), null, 4)
    };
    return fluid.ptf.encode([...layerParts.values(), ...componentParts, canvasPart],
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
directly to the canvas. The documentation of the framework follows, and after it the current state of the workspace.`;

fluid.tldraw.ai.responseRules = `## How to respond

Your response must take EXACTLY ONE of the following two forms, and never mix them:

1. **Text addressed to the user**, for answering a question, explaining something, or asking for clarification if \
their direction is ambiguous. Plain text or light markdown, containing no PTF document.
2. **A single PTF document altering the workspace.** Your entire response is then the document, beginning with the \
line \`MIME-Version: 1.0\` - write nothing before or after it, no commentary and no code fences.

A PTF document altering the workspace has the same form as the workspace document above. Its top-level parts may be:

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

If your document cannot be decoded or applied, you will be told what went wrong and asked to send a corrected one.`;

fluid.tldraw.ai.strategyHints = `## Strategy hints

* Make the smallest change which achieves the user's direction. To change what a widget holds, prefer \`live\` \
values applied in place over replacing it.
* Reuse the existing layer definitions maximally. To adapt a widget, define a fresh layer which lists the existing \
layer in its \`$layers\` and holds only overrides, rather than copying and editing the existing layer's source, and \
replace the widget with one constructed from your fresh layer. Only redefine an existing layer when the user asks for \
every widget made from it to change.
* To compose two widgets, define a fresh "umbrella" layer with \`fluid.topLevelWidget\` amongst its \`$layers\`, \
holding each of them as a subcomponent by means of a \`$component\` record naming its existing layer. Choose the view of \
just one of them as the view of the umbrella with \`view: "{first}.view"\`, and cross-inject between them with \
references, e.g. \`second: {$component: {$layers: "my.second", input: "{first}.output"}}\`. If the second should share \
the view of the first rather than render its own, give it \`view: "{first}.view"\` too. Add to the existing layers \
only through overrides or composition directives in fresh layers. If both widgets must remain visible, the umbrella \
may instead have a template of its own holding an \`@id\` element for each subcomponent.
* A widget may reach the tldraw editor as \`{tldrawHost}.editor\`, and the bounds of its own shape as \
\`{self}.hostBounds\`. A widget layer may advertise the size at which it would like to be created as \
\`preferredSize: {w, h}\`.
* Give fresh layers distinctive dotted names, e.g. \`fluid.demos.ai.counterWithDoubler\`, and fresh SFC styles \
distinctive class names, since styles apply globally.`;

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
fluid.tldraw.ai.systemPrompt = function (docs, workspace) {
    const usedLayers = new Set(workspace.widgets.map(widget => widget.layerName));
    const libraryLayers = workspace.availableLayers.filter(layerName => !usedLayers.has(layerName));
    const library = libraryLayers.length === 0 ? "" :
        "\n\nThe following further widget layers are available to be instantiated, but are not currently in the workspace:\n\n"
            + fluid.tldraw.ai.layersToPTF(libraryLayers);
    return [
        fluid.tldraw.ai.introduction,
        "# Documentation\n\n" + docs.join("\n\n"),
        "# The workspace\n\nThe following PTF document holds every Infusion widget in the workspace, with the definitions of "
            + "the layers they use, where each is hosted on the canvas, and the native tldraw shapes alongside them:\n\n"
            + fluid.tldraw.ai.workspaceToPTF(workspace) + library,
        "# The user's selection\n\n" + fluid.tldraw.ai.describeSelection(workspace),
        fluid.tldraw.ai.responseRules,
        fluid.tldraw.ai.strategyHints
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
 * @typedef {Object} AIReply
 * @property {String} content - The content of the AI's reply
 * @property {String} [reasoning] - Any reasoning which the model reported separately from its content
 */

/**
 * Assemble the messages to be sent for a fresh direction from the user. The system prompt is assembled afresh
 * reflecting the current workspace, followed by recent messages of the conversation, and then the direction.
 * @param {String} systemPrompt - The system prompt, as assembled by `fluid.tldraw.ai.systemPrompt`
 * @param {ChatMessage[]} history - Earlier messages of the conversation, which have no system message
 * @param {String} direction - The user's direction
 * @return {ChatMessage[]} The messages to be sent
 */
fluid.tldraw.ai.buildMessages = function (systemPrompt, history, direction) {
    return [
        {role: "system", content: systemPrompt},
        ...history.slice(-fluid.tldraw.ai.maxHistory),
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
 * @param {String} options.token - The token derived from the user's password
 * @param {String} options.model - The model to be used
 * @param {ChatMessage[]} options.messages - The messages to be sent
 * @return {Promise<AIReply>} A promise for the AI's reply. On a rejected token, the promise rejects with an error whose
 * `unauthorised` member is `true`
 */
fluid.tldraw.ai.callEndpoint = async function ({token, model, messages}) {
    const response = await fetch(fluid.tldraw.ai.endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({model, messages, stream: false})
    });
    let togo;
    if (response.ok) {
        const payload = await response.json();
        const message = payload.choices?.[0]?.message;
        if (typeof(message?.content) === "string") {
            togo = typeof(message.reasoning) === "string" ? {content: message.content, reasoning: message.reasoning} : {content: message.content};
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
        }
    } else {
        problems.push(`The layer ${name} ${where} has unrecognised Content-Type ${part.contentType} - use `
            + `${fluid.layerMimeTypes.sfc} or ${fluid.layerMimeTypes.javascript}`);
    }
    return problems.length === initialCount;
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
    return plan;
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

/**
 * Describe any problem found within a component and its subcomponents - for example a layer which is not defined, a
 * reference which does not resolve, or a template which cannot be rendered. Unless `includePending` is set, components
 * which are still waiting on I/O, e.g. for a layer which is still loading, are not reported.
 * @param {fluid.component} component - The component to be diagnosed
 * @param {Boolean} [includePending] - If `true`, pending components are reported as well as failed ones
 * @return {String[]} Descriptions of each problem found
 */
fluid.tldraw.ai.diagnose = function (component, includePending) {
    const problems = [];
    const reportable = value => fluid.isUnavailable(value) && (includePending || fluid.unProxy(value).variety !== "pending");
    const report = function (shadow, unavailable, what) {
        fluid.unavailableToCauses(fluid.unProxy(unavailable)).forEach(cause => {
            const site = cause.site && !Array.isArray(cause.site) && cause.site.shadow ? cause.site : null;
            const siteText = site ? ` at ${fluid.renderSite(site)}` : "";
            const layer = site && fluid.layerForSite(site);
            problems.push(`${what} at path ${shadow.path}${cause.variety === "pending" ? " is still pending" : " failed"}: `
                + `${cause.message}${siteText}${layer ? " in layer " + layer : ""}`);
        });
    };
    const visit = function (shadow) {
        const instance = shadow.availableInstance.get();
        if (reportable(instance)) {
            report(shadow, instance, "Component");
        } else if (!fluid.isUnavailable(instance)) {
            const that = shadow.that;
            if (fluid.deSignal(that.$layers).includes("fluid.viewComponent")) {
                const container = fluid.deSignal(that.container);
                const vTree = fluid.deSignal(that.vTree);
                if (reportable(container)) {
                    report(shadow, container, "Container of view");
                } else if (reportable(vTree)) {
                    report(shadow, vTree, "Rendering of view");
                }
            }
            fluid.each(shadow.childComponents, (childShadow, memberName) => {
                // As for PTF, only visit components created in place rather than injected
                if (childShadow.path === fluid.composeSegment(shadow.path, memberName)) {
                    visit(childShadow);
                }
            });
        }
    };
    visit(fluid.ptf.componentToShadow(component));
    return problems;
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

/**
 * Carry out one exchange with the AI on the user's direction. If the AI responds with text, it is reported to the
 * user. If it responds with a PTF document, the document is applied to the workspace, and any problems in decoding
 * or applying it are reported back to the AI for it to correct, up to `fluid.tldraw.ai.maxRepairs` times. The system
 * prompt is assembled afresh for each request, so that it reflects any changes already made.
 * @param {Object} options - The exchange's options
 * @param {String} options.direction - The user's direction
 * @param {ChatMessage[]} options.history - Earlier messages of the conversation
 * @param {AIBridge} options.bridge - The bridge to the workspace, as constructed by `makeAIBridge` in tldraw-ai.js
 * @param {Function} options.call - Accepts a {ChatMessage[]} and returns a {Promise<AIReply|String>} for the AI's
 * response, a String being taken as its content
 * @param {Function} options.report - Accepts a {ChatEntry} to be shown to the user
 * @param {Function} [options.getDocs] - Returns a {Promise<String[]>} for the documentation to be included in the
 * prompt, defaulting to `fluid.tldraw.ai.fetchDocs`
 * @return {Promise<ChatMessage[]>} A promise for the conversation's history including this exchange, which rejects if
 * a request fails
 */
fluid.tldraw.ai.converse = async function ({direction, history, bridge, call, report, getDocs = fluid.tldraw.ai.fetchDocs}) {
    const docs = await getDocs();
    const messages = fluid.tldraw.ai.buildMessages("", history, direction);
    let repairs = 0;
    let done = false;
    while (!done) {
        messages[0].content = fluid.tldraw.ai.systemPrompt(docs, bridge.gatherWorkspace());
        const received = await call(messages);
        const reply = typeof(received) === "string" ? {content: received} : received;
        const response = fluid.tldraw.ai.parseResponse(reply.content);
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
    return messages.slice(1);
};
