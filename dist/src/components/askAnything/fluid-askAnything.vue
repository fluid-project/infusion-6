<!-- The machinery of conversing with a model, and the rendering of each entry of the conversation -->
<script src="fluid-ai.js"></script>
<!-- The protocol by which an assistant reflects on and alters an arena of widgets - see fluid.ai.arena.makeAssistant -->
<script src="fluid-ai-arena.js"></script>
<fluid-import src="fluid-askAnythingEntry.vue"></fluid-import>

<script>
// The "Ask me anything" panel, through which the user converses with an AI model - ported from the AI chat sidebar of
// the Aarhus "Stund" prototype. What the conversation is about is its host's: the host supplies an *assistant* (see
// AIAssistant in fluid-ai.js), which assembles the system prompt and interprets the AI's replies - e.g. Infusion's
// tldraw demo, whose assistant reflects on and alters the widgets on its canvas. With none, the panel is a plain chat.
// It depends on nothing of any host's, so that it may be hosted anywhere a container is offered for it, e.g. in the
// editing UI which the "Edit in Infusion" extension injects into a page.
// See FLUID-7022

fluid.registerNamespace("fluid.askAnything");

// Keys under which the panel's settings are remembered in this browser
fluid.askAnything.storageKeys = {
    // Their values are the keys of the panel when it was the tldraw demo's own, so that settings remembered then are kept
    token: "fluid.demos.askAnything.token",
    modelChoice: "fluid.demos.askAnything.modelChoice"
};

// The name of the DOM event, dispatched on the panel's container, through which its host offers the panel text, e.g.
// pasted onto a canvas but not taken by it, or a problem to report - see fluid.askAnything.offer
fluid.askAnything.offerEvent = "askanythingoffer";

/**
 * Read one of the panel's settings as remembered in this browser
 * @param {String} key - The setting's key in `fluid.askAnything.storageKeys`
 * @return {String} The remembered value, or an empty string if there is none
 */
fluid.askAnything.readStored = function (key) {
    let stored = null;
    try {
        stored = window.localStorage.getItem(fluid.askAnything.storageKeys[key]);
    } catch (e) {
        console.log("Browser storage is unavailable - settings will not be remembered");
    }
    return stored || "";
};

/**
 * Remember one of the panel's settings in this browser, or forget it
 * @param {String} key - The setting's key in `fluid.askAnything.storageKeys`
 * @param {String} value - The value to be remembered, or an empty string to forget it
 */
fluid.askAnything.writeStored = function (key, value) {
    try {
        if (value) {
            window.localStorage.setItem(fluid.askAnything.storageKeys[key], value);
        } else {
            window.localStorage.removeItem(fluid.askAnything.storageKeys[key]);
        }
    } catch (e) {
        console.log("Browser storage is unavailable - settings will not be remembered");
    }
};

fluid.def("fluid.askAnything", {
    $layers: "fluid.component",
    // The assistant through which the panel converses - see AIAssistant in fluid-ai.js. Either the assistant itself,
    // or the global name of one, read as each direction is sent, so that a host may make it once what it reflects on is
    // available - e.g. "fluid.tldraw.ai.assistant". If null, the panel is a plain chat - see fluid.ai.plainAssistant
    assistant: null,
    // Whether the panel shows, beneath its conversation, the attribution of the service whose model is chosen, if it
    // asks for one - a host which shows the attribution itself, e.g. as a banner beneath its own content, sets this false
    showAttribution: true,
    state: {
        $reactiveRoot: {
            // The conversation's entries, as rendered
            entries: [],
            direction: "",
            password: "",
            // Remembered from an earlier visit, if any
            token: fluid.askAnything.readStored("token"),
            // The model chosen in the dropdown, as the value of its option - see fluid.askAnything.modelChoices -
            // remembered from an earlier visit, if any. If empty, the IFM proxy's model is chosen.
            modelChoice: fluid.askAnything.readStored("modelChoice"),
            busy: false,
            loginError: "",
            // Whilst sent directions are being recalled into the direction with the arrow keys, the index of the one
            // recalled amongst them, and the direction as it was before recall began - see
            // fluid.askAnything.recallDirection
            recallIndex: null,
            recallDraft: ""
        }
    },
    // The local service whose models are offered beside that of the IFM proxy, if a key for it is found on startup, or
    // else `null`
    local: {
        $bindable: {
            bind: "fluid.askAnything.bindLocalService()"
        }
    },
    connection: "$compute:fluid.askAnything.connection({self}.local, {self}.state.token, {self}.state.modelChoice)",
    // Only the token for the IFM proxy may be forgotten, and only whilst it is held
    cannotLogOut: "$compute:fluid.askAnything.cannotLogOut({self}.connection)",
    busy: "{self}.state.busy",
    // A model of the Inference Co-op needs no token, so is always ready
    hasToken: "$compute:fluid.askAnything.isReady({self}.connection)",
    needsPassword: "$compute:fluid.askAnything.needsPassword({self}.connection)",
    cannotSend: "$compute:fluid.askAnything.cannotSend({self}.state.direction, {self}.busy)",
    sendLabel: "$compute:fluid.askAnything.sendLabel({self}.busy)",
    // The attribution of the service whose model is chosen, as `{text, linkText, url}`, or null if it asks for none -
    // the Inference Co-op's whilst one of its models is chosen
    attribution: "$compute:fluid.askAnything.attribution({self}.connection)",
    // Whether the chosen model is served from renewable energy, when a leaf is shown beside the dropdown - the leaf of
    // its option is a character, which a browser without a colour emoji font cannot show
    notRenewable: "$compute:fluid.askAnything.notRenewable({self}.connection)",
    leafTitle: "$compute:fluid.askAnything.leafTitle({self}.connection)",
    hideAttribution: "$compute:fluid.askAnything.hideAttribution({self}.attribution, {self}.showAttribution)",
    entryList: {
        $component: {
            $layers: "fluid.askAnythingEntry",
            $for: {
                source: "{askAnything}.state.entries",
                valueAs: "entry"
            }
        }
    },
    // A dropdown of the models which may be conversed with - the IFM proxy's first, then the Inference Co-op's, followed
    // by those of any local service
    modelSelect: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.viewComponent",
                    elideParent: false,
                    templateTree: "$compute:fluid.askAnything.modelSelectTree({askAnything}.local, {askAnything}.connection.choice)"
                }
            }
        }
    },
    chooseModel: {
        $method: {
            func: "fluid.askAnything.chooseModel",
            args: ["{self}.state", "{0}:event"]
        }
    },
    directionKeyDown: {
        $method: {
            func: "fluid.askAnything.directionKeyDown",
            args: ["{self}", "{0}:event"]
        }
    },
    login: {
        $method: {
            func: "fluid.askAnything.login",
            args: ["{self}.state"]
        }
    },
    logout: {
        $method: {
            func: "fluid.askAnything.logout",
            args: ["{self}.state"]
        }
    },
    send: {
        $method: {
            func: "fluid.askAnything.send",
            args: ["{self}.state", "{self}.connection", "{self}.assistant"]
        }
    },
    receiveOffer: {
        $method: {
            func: "fluid.askAnything.receiveOffer",
            args: ["{self}.state", "{0}:event"]
        }
    }
});

// The assistant of a panel whose host supplies none
fluid.askAnything.plainAssistant = fluid.ai.plainAssistant();

// The conversation's history, as the exchanges sent to the AI - this is kept out of the reactive state since it is
// never rendered
fluid.askAnything.history = [];

fluid.askAnything.cannotLogOut = connection => connection.local || connection.open || !connection.token;

fluid.askAnything.isReady = connection => connection.open || !!connection.token;

fluid.askAnything.needsPassword = connection => !fluid.askAnything.isReady(connection);

fluid.askAnything.cannotSend = (direction, busy) => busy || !direction.trim();

fluid.askAnything.sendLabel = busy => busy ? "Thinking..." : "Send";

/**
 * Find the attribution of the service through which the AI is reached, if it asks for one
 * @param {Connection} connection - The connection to the AI
 * @return {Object|null} The attribution, `{text, linkText, url}`, or null
 */
fluid.askAnything.attribution = connection => connection.open ? fluid.ai.coopService.attribution || null : null;

fluid.askAnything.hideAttribution = (attribution, showAttribution) => !attribution || !showAttribution;

fluid.askAnything.notRenewable = connection => !(connection.open && fluid.ai.isRenewable(connection.model));

fluid.askAnything.leafTitle = connection => fluid.askAnything.renewableTitle(connection.open ? fluid.ai.renewableProvider(connection.model) : null);

/**
 * Find the assistant through which the panel converses
 * @param {AIAssistant|String|null} assistant - The panel's `assistant` option
 * @return {AIAssistant|null} The assistant, or null if one named is not yet available
 */
fluid.askAnything.resolveAssistant = function (assistant) {
    return assistant === null ? fluid.askAnything.plainAssistant :
        typeof(assistant) === "string" ? fluid.getGlobalValue(assistant) || null : assistant;
};

/**
 * Bind a cell holding the local service, which is looked for once on startup by `fluid.ai.findLocalService`
 * @return {fluid.cell<LocalService|null>} A cell holding `null` until the local service, if any, has been found
 */
fluid.askAnything.bindLocalService = function () {
    const cell = fluid.cell(null, {name: "askAnything local service"});
    fluid.ai.findLocalService().then(service => {
        if (service) {
            console.log(`Offering ${service.models.length} models of ${service.name} at ${service.endpoint} beside the IFM proxy`);
            cell.set(service);
        }
    }, error => console.log("Failed to look for a local AI service: ", error));
    return cell;
};

/**
 * @typedef {Object} Connection
 * @property {String} endpoint - The URL of the chat completions endpoint to be called
 * @property {String} token - The token or key presented to the endpoint, or an empty string if none is held
 * @property {String} model - The model to be requested
 * @property {Boolean} local - `true` if the endpoint is that of a local service rather than the IFM proxy
 * @property {Boolean} open - `true` if the endpoint needs no token - that of the Inference Co-op
 * @property {String} choice - The value of the dropdown's option for the model - see fluid.askAnything.modelChoices
 */

// The prefix of the value of a dropdown option choosing a model of the local service, followed by the model's id
fluid.askAnything.localPrefix = "local:";

// The value of the dropdown option choosing the IFM proxy's model
fluid.askAnything.ifmChoice = "ifm";

// The prefix of the value of a dropdown option choosing a model of the Inference Co-op, followed by the model's id
fluid.askAnything.coopPrefix = "coop:";

/**
 * @typedef {Object} ModelChoiceGroup
 * @property {String} label - The label of the group of options, naming the service offering them
 * @property {Object[]} options - The options, each as `{value, text, renewable}`, `renewable` being the name of the
 * provider serving the model from renewable energy, if it is, when it is marked with a leaf
 */

/**
 * List the models which may be chosen in the dropdown, grouped by the service offering them - the IFM proxy's model
 * first, then those of the Inference Co-op, which are always offered, followed by those of the local service, if any
 * @param {LocalService|null} local - The local service, if any
 * @return {ModelChoiceGroup[]} The groups of options
 */
fluid.askAnything.modelChoices = function (local) {
    const ifm = {label: "IFM proxy", options: [{value: fluid.askAnything.ifmChoice, text: fluid.ai.defaultModel}]};
    const coop = fluid.ai.coopService;
    const coopGroup = {
        label: coop.name,
        options: coop.models.map(model => ({value: fluid.askAnything.coopPrefix + model, text: model, renewable: fluid.ai.renewableProvider(model)}))
    };
    const localGroup = local ? [{
        label: local.name,
        options: local.models.map(model => ({value: fluid.askAnything.localPrefix + model, text: model}))
    }] : [];
    return [ifm, coopGroup, ...localGroup];
};

/**
 * Determine how the AI is to be reached - through the Inference Co-op, needing no token, if one of its models is
 * chosen, through the local service if one of its models is chosen and it offers it, or else through the IFM proxy
 * with the token derived from the user's password, which is chosen by default
 * @param {LocalService|null} local - The local service, if any
 * @param {String} token - The token for the IFM proxy, or an empty string if none is held
 * @param {String} modelChoice - The value of the option chosen in the dropdown, or an empty string if none is chosen
 * @return {Connection} The connection to the AI
 */
fluid.askAnything.connection = function (local, token, modelChoice) {
    const prefix = fluid.askAnything.localPrefix;
    const localModel = modelChoice.startsWith(prefix) ? modelChoice.slice(prefix.length) : null;
    const coopPrefix = fluid.askAnything.coopPrefix;
    const coopModel = modelChoice.startsWith(coopPrefix) ? modelChoice.slice(coopPrefix.length) : null;
    const coop = fluid.ai.coopService;
    let togo;
    if (coop.models.includes(coopModel)) {
        togo = {
            endpoint: coop.endpoint,
            token: "",
            model: coopModel,
            local: false,
            open: true,
            choice: modelChoice
        };
    } else if (local && local.models.includes(localModel)) {
        togo = {
            endpoint: local.endpoint,
            token: local.key,
            model: localModel,
            local: true,
            open: false,
            choice: modelChoice
        };
    } else {
        togo = {
            endpoint: fluid.ai.endpoint,
            token,
            model: fluid.ai.defaultModel,
            local: false,
            open: false,
            choice: fluid.askAnything.ifmChoice
        };
    }
    return togo;
};

// The leaf marking a model served from renewable energy - in its colour emoji presentation, a green leaf, since an
// option holds text alone, which can't be coloured apart from the rest of its line - and the tooltip explaining it
fluid.askAnything.leaf = "\u{1F33F}\uFE0F";
fluid.askAnything.renewableTitle = provider => provider ? "Served from renewable energy by " + provider : "";

/**
 * Render the dropdown of the models which may be conversed with, as listed by `fluid.askAnything.modelChoices`
 * @param {LocalService|null} local - The local service, if any
 * @param {String} choice - The value of the option currently chosen
 * @return {VNode} The tree of the dropdown
 */
fluid.askAnything.modelSelectTree = function (local, choice) {
    return {
        tag: "select",
        attrs: {
            "class": "ask-anything-model-select",
            "@onchange": "{askAnything}.chooseModel({0})"
        },
        children: fluid.askAnything.modelChoices(local).map(group => ({
            tag: "optgroup",
            attrs: {label: group.label},
            // An option holds text alone, so its leaf is a character
            children: group.options.map(({value, text, renewable}) => ({
                tag: "option",
                attrs: {
                    value,
                    ...(renewable && {title: fluid.askAnything.renewableTitle(renewable), "class": "ask-anything-renewable"}),
                    ...(value === choice && {selected: "selected"})
                },
                children: [{text: renewable ? text + " " + fluid.askAnything.leaf : text}]
            }))
        }))
    };
};

/**
 * Choose a model in the dropdown, and remember the choice
 * @param {Object} state - The panel's reactive state
 * @param {Event} e - The change event of the dropdown
 */
fluid.askAnything.chooseModel = function (state, e) {
    state.modelChoice = e.target.value;
    fluid.askAnything.writeStored("modelChoice", e.target.value);
};

/**
 * Derive the proxy token from the typed password and remember it. Whether the password is correct is only discovered
 * on the first send.
 * @param {Object} state - The panel's reactive state
 * @return {Promise} A promise which resolves once the token has been derived
 */
fluid.askAnything.login = async function (state) {
    const password = state.password;
    if (password && !state.busy) {
        state.busy = true;
        state.loginError = "";
        try {
            const token = await fluid.ai.deriveToken(password);
            fluid.askAnything.writeStored("token", token);
            state.password = "";
            state.token = token;
        } catch (e) {
            state.loginError = "Could not derive a token from the password: " + e.message;
        } finally {
            state.busy = false;
        }
    }
};

/**
 * Forget the proxy token, so that the password must be entered again
 * @param {Object} state - The panel's reactive state
 */
fluid.askAnything.logout = function (state) {
    fluid.askAnything.writeStored("token", "");
    state.token = "";
};

/**
 * Append an entry to the panel's conversation, and scroll it into view
 * @param {Object} state - The panel's reactive state
 * @param {ChatEntry} entry - The entry to be appended
 */
fluid.askAnything.addEntry = function (state, entry) {
    state.entries.push({detail: "", ...entry});
    // Scroll once the fresh entry has been rendered
    setTimeout(() => {
        const entries = document.querySelector(".ask-anything-entries");
        if (entries) {
            entries.scrollTop = entries.scrollHeight;
        }
    }, 0);
};

/**
 * @typedef {ChatEntry} MetricsEntry
 * @property {Number} startedAt - When the request was sent, in milliseconds since the epoch
 * @property {Number|null} finishedAt - When the reply was received or the request failed, or `null` whilst it is pending
 * @property {Number} inputTokens - The number of tokens sent
 * @property {Number} cachedTokens - The number of the tokens sent which the endpoint served from its cache, as it
 * reported, or else those which lie in the prefix of the prompt common to every request, and so are assumed to be
 * cached by the endpoint - see fluid.ai.cachedTokens
 * @property {Number|null} outputTokens - The number of tokens received, or `null` whilst the request is pending
 * @property {Number|null} reasoningTokens - The number of the tokens received which were spent on reasoning, if reported
 * @property {Boolean} estimated - `true` if the numbers of tokens are estimated, since the endpoint did not report them
 * @property {ImpactEstimate|null} impact - The energy and emissions of the reply once it is received - as the provider
 * reported them, or else estimated for a model of the Inference Co-op, see fluid.ai.estimateImpact - or else `null`
 * @property {String} outcome - Whilst pending, an empty string - then the kind of reply, as the assistant describes it,
 * e.g. "text" or "PTF document", or "failed"
 */

/**
 * Make a request of the AI, tracking it with a metrics entry in the conversation which is added as the request is
 * sent and completed once the reply is received. The entry reports the request's elapsed time, which is shown ticking
 * whilst it is pending, and the numbers of tokens sent and received - as reported by the endpoint, or else estimated -
 * with the reply's energy and emissions as the provider reported them, or else estimated for a model of the Inference Co-op.
 * @param {Object} state - The panel's reactive state
 * @param {ChatMessage[]} messages - The messages being sent
 * @param {Function} invoke - Makes the request, returning a {Promise<AIReply|String>}
 * @param {String} model - The model being requested
 * @param {AIAssistant} [assistant] - The assistant conversing, which describes the reply's outcome, and marks the end of
 * the prompt's common prefix
 * @return {Promise<AIReply>} A promise for the reply
 */
fluid.askAnything.measureCall = async function (state, messages, invoke, model, assistant = fluid.askAnything.plainAssistant) {
    const index = state.entries.length;
    fluid.askAnything.addEntry(state, {
        kind: "metrics",
        text: "",
        startedAt: Date.now(),
        finishedAt: null,
        inputTokens: fluid.ai.estimateTokens(messages.map(message => message.content)),
        cachedTokens: fluid.ai.cachedTokens(messages, undefined, assistant.cachePrefixMarker),
        outputTokens: null,
        reasoningTokens: null,
        estimated: true,
        impact: null,
        outcome: ""
    });
    const complete = fields => {
        state.entries[index] = {...state.entries[index], finishedAt: Date.now(), ...fields};
    };
    let reply;
    try {
        const received = await invoke();
        // As for fluid.ai.converse, a String is taken as the reply's content
        reply = typeof(received) === "string" ? {content: received} : received;
        const usage = reply.usage;
        const outputTokens = usage ? usage.outputTokens : fluid.ai.estimateTokens([reply.content, reply.reasoning]);
        complete({
            inputTokens: usage ? usage.inputTokens : state.entries[index].inputTokens,
            cachedTokens: usage?.cachedTokens ?? fluid.ai.cachedTokens(messages, usage?.inputTokens, assistant.cachePrefixMarker),
            outputTokens,
            // A measurement reported by the provider is preferred to an estimate
            impact: reply.impact ?? fluid.ai.estimateImpact(model, outputTokens),
            reasoningTokens: usage?.reasoningTokens ?? null,
            estimated: !usage,
            outcome: assistant.describeOutcome ? assistant.describeOutcome(reply.content) : "text"
        });
    } catch (error) {
        complete({outcome: "failed"});
        throw error;
    }
    return reply;
};

/**
 * Send the user's direction to the AI, and act on its response
 * @param {Object} state - The panel's reactive state
 * @param {Connection} connection - How the AI is to be reached
 * @param {AIAssistant|String|null} assistantOption - The panel's `assistant` option - see fluid.askAnything.resolveAssistant
 * @return {Promise} A promise which resolves once the exchange has finished, successfully or not
 */
fluid.askAnything.send = async function (state, connection, assistantOption) {
    const direction = state.direction.trim();
    const assistant = fluid.askAnything.resolveAssistant(assistantOption);
    const ready = !!assistant && (!assistant.isReady || assistant.isReady());
    if (direction && !state.busy && ready) {
        fluid.askAnything.addEntry(state, {kind: "user", text: direction});
        state.direction = "";
        state.recallIndex = null;
        state.recallDraft = "";
        state.busy = true;
        const {endpoint, token, model} = connection;
        try {
            fluid.askAnything.history = await fluid.ai.converse({
                direction,
                history: fluid.askAnything.history,
                model,
                assistant,
                call: messages => fluid.askAnything.measureCall(state, messages,
                    () => fluid.ai.callEndpoint({endpoint, token, model, messages}), model, assistant),
                report: entry => fluid.askAnything.addEntry(state, entry)
            });
        } catch (error) {
            // Only the IFM proxy's token is derived from a password - the rejection of another is only reported
            if (error.unauthorised && !connection.local && !connection.open) {
                fluid.askAnything.logout(state);
                state.loginError = "The password was not accepted - please enter it again.";
            }
            fluid.askAnything.addEntry(state, {kind: "error", text: fluid.ai.describeError(error)});
        } finally {
            state.busy = false;
        }
    }
};

/**
 * Respond to a key pressed in the direction - Enter sends it, whereas Shift+Enter begins a fresh line, and the up and
 * down arrows recall sent directions as described for `fluid.askAnything.recallDirection`
 * @param {fluid.component} self - The panel
 * @param {KeyboardEvent} e - The keystroke
 * @return {Promise|undefined} A promise for the completion of any direction sent
 */
fluid.askAnything.directionKeyDown = function (self, e) {
    const modified = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
    let togo;
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        togo = self.send();
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !modified) {
        const recalled = fluid.askAnything.recallDirection(self.state, e.key === "ArrowUp", e.target);
        if (recalled) {
            e.preventDefault();
            // Once the recalled direction has been rendered into the textarea, the caret is placed at its end
            setTimeout(() => e.target.setSelectionRange(e.target.value.length, e.target.value.length), 0);
        }
    }
    return togo;
};

/**
 * The directions sent so far, oldest first, as held in the conversation's entries - consecutive repetitions of the
 * same direction are listed once
 * @param {Object[]} entries - The conversation's entries
 * @return {String[]} The directions sent
 */
fluid.askAnything.sentDirections = function (entries) {
    return entries.filter(entry => entry.kind === "user").map(entry => entry.text)
        .filter((text, i, texts) => i === 0 || text !== texts[i - 1]);
};

/**
 * Recall a sent direction into the direction, so that it may be resent, perhaps after editing - as for the history of
 * a shell. The up arrow recalls the direction sent before the one currently recalled, beginning with the most recent,
 * and the down arrow the one after it, returning finally to the direction as it was before recall began. So as not to
 * hinder moving the caret within a direction of several lines, the up arrow only recalls when the caret is on the
 * first line, and the down arrow when it is on the last - unless the direction is a recalled one which has not been
 * edited, in which case the arrows always recall, so that the history can be stepped through rapidly.
 * @param {Object} state - The panel's reactive state
 * @param {Boolean} back - `true` to recall an earlier direction, `false` a later one
 * @param {HTMLTextAreaElement} textarea - The textarea holding the direction, whose caret is consulted
 * @return {Boolean} `true` if a direction was recalled, in which case the arrow's default action should be prevented
 */
fluid.askAnything.recallDirection = function (state, back, textarea) {
    const sent = fluid.askAnything.sentDirections(state.entries);
    const recalling = state.recallIndex !== null;
    const unedited = recalling && state.direction === sent[state.recallIndex];
    const text = textarea.value;
    const caretOnEdge = back ? !text.substring(0, textarea.selectionStart).includes("\n") :
        !text.substring(textarea.selectionEnd).includes("\n");
    let togo = false;
    if (unedited || caretOnEdge) {
        if (back && sent.length > 0 && state.recallIndex !== 0) {
            if (!recalling) {
                state.recallDraft = state.direction;
            }
            state.recallIndex = recalling ? state.recallIndex - 1 : sent.length - 1;
            state.direction = sent[state.recallIndex];
            togo = true;
        } else if (!back && recalling) {
            const next = state.recallIndex + 1;
            state.direction = next < sent.length ? sent[next] : state.recallDraft;
            state.recallIndex = next < sent.length ? next : null;
            togo = true;
        }
    }
    return togo;
};

/**
 * @typedef {Object} PanelOffer
 * @property {String} [text] - Text to be appended to the direction, e.g. pasted onto a canvas but not taken by it
 * @property {String} [problem] - A description of a problem to be reported, e.g. one found in a paste
 * @property {String} [detail] - Further material accompanying a problem, e.g. the text which was pasted
 */

/**
 * Offer the panel text, or a problem to report, by dispatching a DOM event on the panel's container. This is how a host
 * reaches the panel, e.g. a canvas offering text pasted onto it, without holding the panel's component.
 * @param {PanelOffer} offer - The offer
 * @param {Document} [dokkument] - The document holding the panel, by default the current one
 * @return {Boolean} `true` if a panel was found to receive the offer
 */
fluid.askAnything.offer = function (offer, dokkument = document) {
    const panel = dokkument.querySelector(".ask-anything");
    if (panel) {
        panel.dispatchEvent(new CustomEvent(fluid.askAnything.offerEvent, {detail: offer}));
    }
    return !!panel;
};

/**
 * Receive an offer made by `fluid.askAnything.offer` - pasted text is appended to the direction, which is
 * focused, and a problem is reported as an entry in the conversation
 * @param {Object} state - The panel's reactive state
 * @param {CustomEvent} event - The event bearing the offer as its `detail`
 */
fluid.askAnything.receiveOffer = function (state, event) {
    const offer = event.detail;
    if (offer.problem) {
        fluid.askAnything.addEntry(state, {kind: "error", text: offer.problem, detail: offer.detail || ""});
    }
    if (offer.text) {
        state.direction = state.direction ? state.direction + "\n" + offer.text : offer.text;
        event.currentTarget.querySelector(".ask-anything-direction")?.focus();
    }
};
</script>

<template>
    <div class="ask-anything" @onaskanythingoffer="{self}.receiveOffer({0})">
        <div class="ask-anything-header">Ask me anything</div>
        <div class="ask-anything-entries" @id="entryList"></div>
        <div class="ask-anything-attribution" @class="ask-anything-hidden:@{hideAttribution}">
            @{attribution.text} <a href="@{attribution.url}" target="_blank" rel="noopener">@{attribution.linkText}</a>
        </div>
        <!-- Shown and hidden by class rather than $if, so that each retains its DOM state, e.g. a half-typed direction -->
        <!-- A form, as browsers expect of a password field, submitted by Enter or the button, and never sent anywhere -->
        <form class="ask-anything-login" @class="ask-anything-hidden:@{hasToken}" @onsubmit.prevent="{self}.login()">
            <div class="ask-anything-login-prompt">Enter the password for the AI service:</div>
            <div class="ask-anything-row">
                <!-- Not shown - names the account for a password manager, which saves the password under it -->
                <input type="text" name="username" value="ifm-proxy" autocomplete="username" hidden>
                <input type="password" class="ask-anything-password" value="@{state.password}"
                       autocomplete="current-password" disabled="@{busy}">
                <button type="submit" class="ask-anything-button" disabled="@{busy}">Log In</button>
            </div>
            <div class="ask-anything-login-error">@{state.loginError}</div>
        </form>
        <div class="ask-anything-composer">
            <textarea class="ask-anything-direction" placeholder="Ask anything ... (↑ recalls earlier requests)"
                      value="@{state.direction}" @onkeydown="{self}.directionKeyDown({0})"
                      @class="ask-anything-hidden:@{needsPassword}"></textarea>
            <!-- The model may be chosen whether or not a password is needed, since a model of a local service needs none -->
            <div class="ask-anything-row">
                <label class="ask-anything-model">Model
                    <select @id="modelSelect"></select>
                    <svg class="ask-anything-leaf" @class="ask-anything-hidden:@{notRenewable}" viewBox="0 0 24 24" width="16" height="16"
                         role="img" aria-label="@{leafTitle}">
                        <title>@{leafTitle}</title>
                        <path fill="#43A047" d="M17 8C8 10 5.9 16.2 3.8 21.3l1.9.7.9-2.3c.5.2 1 .3 1.4.3C19 20 22 3 22 3c-1 2-8 2.3-13 3.3S2 11.5 2 13.5 3.8 17.3 3.8 17.3C7 8 17 8 17 8z"/>
                    </svg>
                </label>
                <button class="ask-anything-link" disabled="@{busy}" @onclick="{self}.logout()"
                        @class="ask-anything-hidden:@{cannotLogOut}">Log Out</button>
                <button class="ask-anything-button" disabled="@{cannotSend}" @onclick="{self}.send()"
                        @class="ask-anything-hidden:@{needsPassword}">@{sendLabel}</button>
            </div>
        </div>
    </div>
</template>

<style>
/* Hides an element of the panel or of its entries whilst it is not wanted - held here, not with the entries, since the
   panel's SFC is loaded before any entry's */
.ask-anything-hidden {
    display: none;
}

.ask-anything {
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background-color: #FAFAFA;
    border-left: 1px solid #E0E0E0;
    font-family: var(--font-body);
}

.ask-anything-header {
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 600;
    color: #37474F;
    border-bottom: 1px solid #E0E0E0;
}

.ask-anything-entries {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    padding: 0 12px 12px 12px;
    overflow-y: auto;
}

.ask-anything-login, .ask-anything-composer {
    padding: 12px;
    border-top: 1px solid #E0E0E0;
    font-size: 13px;
}

.ask-anything-login-prompt {
    margin-bottom: 8px;
    color: #455A64;
}

.ask-anything-login-error {
    margin-top: 6px;
    color: #C62828;
}

.ask-anything-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.ask-anything-password {
    flex: 1;
    min-width: 0;
}

.ask-anything-password, .ask-anything-model select {
    font: inherit;
    padding: 6px 8px;
    border: 1px solid #BDBDBD;
    border-radius: 6px;
}

.ask-anything-direction {
    width: 100%;
    min-height: 72px;
    box-sizing: border-box;
    margin-bottom: 8px;
    padding: 8px 10px;
    font: inherit;
    font-size: 14px;
    border: 1px solid #BDBDBD;
    border-radius: 8px;
    resize: vertical;
}

.ask-anything-model {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 6px;
    align-items: center;
    color: #616161;
}

.ask-anything-leaf {
    flex: none;
}

.ask-anything-model select {
    flex: 1;
    min-width: 0;
    font-size: 12px;
}


.ask-anything-button {
    font: inherit;
    padding: 6px 14px;
    color: white;
    background-color: #1E88E5;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.ask-anything-button:disabled {
    background-color: #90CAF9;
    cursor: not-allowed;
}

.ask-anything-attribution {
    padding: 6px 12px;
    font-size: 11px;
    color: #607D8B;
    border-top: 1px solid #E0E0E0;
}

.ask-anything-attribution a {
    color: #1E88E5;
}

.ask-anything-link {
    font: inherit;
    padding: 0;
    color: #1E88E5;
    background: none;
    border: none;
    cursor: pointer;
}
</style>
