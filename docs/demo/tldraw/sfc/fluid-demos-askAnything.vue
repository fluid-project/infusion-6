<script>
// The "Ask me anything" panel, through which the user may converse with an AI which can reflect on and alter the
// widgets in the workspace - ported from the AI chat sidebar of the Aarhus "Stund" prototype.
// The protocol is in js/ai-protocol.js and the machinery acting on the canvas in js/tldraw-ai.js.
// See https://github.com/fluid-project/infusion-6/issues/22

fluid.registerNamespace("fluid.demos.askAnything");

// Keys under which the panel's settings are remembered in this browser
fluid.demos.askAnything.storageKeys = {
    token: "fluid.demos.askAnything.token"
};

// The name of the DOM event, dispatched on the panel's container, through which the canvas offers the panel text
// pasted onto it which is not a PTF document, or a problem found in a paste - see fluid.demos.askAnything.offer
fluid.demos.askAnything.offerEvent = "askanythingoffer";

/**
 * Read one of the panel's settings as remembered in this browser
 * @param {String} key - The setting's key in `fluid.demos.askAnything.storageKeys`
 * @return {String} The remembered value, or an empty string if there is none
 */
fluid.demos.askAnything.readStored = function (key) {
    let stored = null;
    try {
        stored = window.localStorage.getItem(fluid.demos.askAnything.storageKeys[key]);
    } catch (e) {
        console.log("Browser storage is unavailable - settings will not be remembered");
    }
    return stored || "";
};

/**
 * Remember one of the panel's settings in this browser, or forget it
 * @param {String} key - The setting's key in `fluid.demos.askAnything.storageKeys`
 * @param {String} value - The value to be remembered, or an empty string to forget it
 */
fluid.demos.askAnything.writeStored = function (key, value) {
    try {
        if (value) {
            window.localStorage.setItem(fluid.demos.askAnything.storageKeys[key], value);
        } else {
            window.localStorage.removeItem(fluid.demos.askAnything.storageKeys[key]);
        }
    } catch (e) {
        console.log("Browser storage is unavailable - settings will not be remembered");
    }
};

fluid.def("fluid.demos.askAnything", {
    $layers: "fluid.component",
    state: {
        $reactiveRoot: {
            // The conversation's entries, as rendered
            entries: [],
            direction: "",
            password: "",
            // Remembered from an earlier visit, if any
            token: fluid.demos.askAnything.readStored("token"),
            // Displayed read-only, since the proxy offers no means of listing the models it can forward to
            model: fluid.tldraw.ai.defaultModel,
            busy: false,
            loginError: "",
            // Whilst sent directions are being recalled into the direction with the arrow keys, the index of the one
            // recalled amongst them, and the direction as it was before recall began - see
            // fluid.demos.askAnything.recallDirection
            recallIndex: null,
            recallDraft: ""
        }
    },
    busy: "{self}.state.busy",
    hasToken: "$compute:fluid.demos.askAnything.isPresent({self}.state.token)",
    needsPassword: "$compute:fluid.demos.askAnything.isAbsent({self}.state.token)",
    cannotSend: "$compute:fluid.demos.askAnything.cannotSend({self}.state.direction, {self}.busy)",
    sendLabel: "$compute:fluid.demos.askAnything.sendLabel({self}.busy)",
    entryList: {
        $component: {
            $layers: "fluid.demos.askAnythingEntry",
            $for: {
                source: "{askAnything}.state.entries",
                valueAs: "entry"
            }
        }
    },
    passwordKeyDown: {
        $method: {
            func: (self, e) => {
                if (e.key === "Enter") {
                    self.login();
                }
            },
            args: ["{self}", "{0}:event"]
        }
    },
    directionKeyDown: {
        $method: {
            func: "fluid.demos.askAnything.directionKeyDown",
            args: ["{self}", "{0}:event"]
        }
    },
    login: {
        $method: {
            func: "fluid.demos.askAnything.login",
            args: ["{self}.state"]
        }
    },
    logout: {
        $method: {
            func: "fluid.demos.askAnything.logout",
            args: ["{self}.state"]
        }
    },
    send: {
        $method: {
            func: "fluid.demos.askAnything.send",
            args: ["{self}.state"]
        }
    },
    receiveOffer: {
        $method: {
            func: "fluid.demos.askAnything.receiveOffer",
            args: ["{self}.state", "{0}:event"]
        }
    }
});

// The conversation's history, as sent to the AI - this is kept out of the reactive state since it is never rendered
fluid.demos.askAnything.history = [];

fluid.demos.askAnything.isPresent = value => !!value;

fluid.demos.askAnything.isAbsent = value => !value;

fluid.demos.askAnything.cannotSend = (direction, busy) => busy || !direction.trim();

fluid.demos.askAnything.sendLabel = busy => busy ? "Thinking..." : "Send";

/**
 * Derive the proxy token from the typed password and remember it. Whether the password is correct is only discovered
 * on the first send.
 * @param {Object} state - The panel's reactive state
 * @return {Promise} A promise which resolves once the token has been derived
 */
fluid.demos.askAnything.login = async function (state) {
    const password = state.password;
    if (password && !state.busy) {
        state.busy = true;
        state.loginError = "";
        try {
            const token = await fluid.tldraw.ai.deriveToken(password);
            fluid.demos.askAnything.writeStored("token", token);
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
fluid.demos.askAnything.logout = function (state) {
    fluid.demos.askAnything.writeStored("token", "");
    state.token = "";
};

/**
 * Append an entry to the panel's conversation, and scroll it into view
 * @param {Object} state - The panel's reactive state
 * @param {ChatEntry} entry - The entry to be appended
 */
fluid.demos.askAnything.addEntry = function (state, entry) {
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
 * @property {Number} cachedTokens - The number of the tokens sent which lie in the prefix of the prompt common to every
 * request, and so are assumed to be cached by the endpoint - see fluid.tldraw.ai.cachedTokens
 * @property {Number|null} outputTokens - The number of tokens received, or `null` whilst the request is pending
 * @property {Number|null} reasoningTokens - The number of the tokens received which were spent on reasoning, if reported
 * @property {Boolean} estimated - `true` if the numbers of tokens are estimated, since the endpoint did not report them
 * @property {String} outcome - Whilst pending, an empty string - then "PTF document" or "text" for the kind of reply
 * received, or "failed"
 */

/**
 * Make a request of the AI, tracking it with a metrics entry in the conversation which is added as the request is
 * sent and completed once the reply is received. The entry reports the request's elapsed time, which is shown ticking
 * whilst it is pending, and the numbers of tokens sent and received - as reported by the endpoint, or else estimated.
 * @param {Object} state - The panel's reactive state
 * @param {ChatMessage[]} messages - The messages being sent
 * @param {Function} invoke - Makes the request, returning a {Promise<AIReply|String>}
 * @return {Promise<AIReply>} A promise for the reply
 */
fluid.demos.askAnything.measureCall = async function (state, messages, invoke) {
    const index = state.entries.length;
    fluid.demos.askAnything.addEntry(state, {
        kind: "metrics",
        text: "",
        startedAt: Date.now(),
        finishedAt: null,
        inputTokens: fluid.tldraw.ai.estimateTokens(messages.map(message => message.content)),
        cachedTokens: fluid.tldraw.ai.cachedTokens(messages),
        outputTokens: null,
        reasoningTokens: null,
        estimated: true,
        outcome: ""
    });
    const complete = fields => {
        state.entries[index] = {...state.entries[index], finishedAt: Date.now(), ...fields};
    };
    let reply;
    try {
        const received = await invoke();
        // As for fluid.tldraw.ai.converse, a String is taken as the reply's content
        reply = typeof(received) === "string" ? {content: received} : received;
        const usage = reply.usage;
        complete({
            inputTokens: usage ? usage.inputTokens : state.entries[index].inputTokens,
            cachedTokens: fluid.tldraw.ai.cachedTokens(messages, usage?.inputTokens),
            outputTokens: usage ? usage.outputTokens : fluid.tldraw.ai.estimateTokens([reply.content, reply.reasoning]),
            reasoningTokens: usage?.reasoningTokens ?? null,
            estimated: !usage,
            outcome: fluid.tldraw.ai.parseResponse(reply.content).type === "text" ? "text" : "PTF document"
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
 * @return {Promise} A promise which resolves once the exchange has finished, successfully or not
 */
fluid.demos.askAnything.send = async function (state) {
    const direction = state.direction.trim();
    const bridge = fluid.tldraw.ai.bridge;
    if (direction && !state.busy && bridge) {
        fluid.demos.askAnything.addEntry(state, {kind: "user", text: direction});
        state.direction = "";
        state.recallIndex = null;
        state.recallDraft = "";
        state.busy = true;
        const model = state.model;
        try {
            fluid.demos.askAnything.history = await fluid.tldraw.ai.converse({
                direction,
                history: fluid.demos.askAnything.history,
                bridge,
                call: messages => fluid.demos.askAnything.measureCall(state, messages,
                    () => fluid.tldraw.ai.callEndpoint({token: state.token, model, messages})),
                report: entry => fluid.demos.askAnything.addEntry(state, entry)
            });
        } catch (error) {
            if (error.unauthorised) {
                fluid.demos.askAnything.logout(state);
                state.loginError = "The password was not accepted - please enter it again.";
            }
            fluid.demos.askAnything.addEntry(state, {kind: "error", text: fluid.tldraw.ai.describeError(error)});
        } finally {
            state.busy = false;
        }
    }
};

/**
 * Respond to a key pressed in the direction - Enter sends it, whereas Shift+Enter begins a fresh line, and the up and
 * down arrows recall sent directions as described for `fluid.demos.askAnything.recallDirection`
 * @param {fluid.component} self - The panel
 * @param {KeyboardEvent} e - The keystroke
 * @return {Promise|undefined} A promise for the completion of any direction sent
 */
fluid.demos.askAnything.directionKeyDown = function (self, e) {
    const modified = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
    let togo;
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        togo = self.send();
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !modified) {
        const recalled = fluid.demos.askAnything.recallDirection(self.state, e.key === "ArrowUp", e.target);
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
fluid.demos.askAnything.sentDirections = function (entries) {
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
fluid.demos.askAnything.recallDirection = function (state, back, textarea) {
    const sent = fluid.demos.askAnything.sentDirections(state.entries);
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
 * @property {String} [text] - Text pasted onto the canvas which is not a PTF document, to be appended to the direction
 * @property {String} [problem] - A description of a problem found in pasting onto the canvas, to be reported
 * @property {String} [detail] - Further material accompanying a problem, e.g. the text which was pasted
 */

/**
 * Offer the panel text pasted onto the canvas, or a problem found in a paste, by dispatching a DOM event on the
 * panel's container. This is how the canvas reaches the panel, which is booted from its container's markup.
 * @param {PanelOffer} offer - The offer
 * @param {Document} [dokkument] - The document holding the panel, by default the current one
 * @return {Boolean} `true` if a panel was found to receive the offer
 */
fluid.demos.askAnything.offer = function (offer, dokkument = document) {
    const panel = dokkument.querySelector(".ask-anything");
    if (panel) {
        panel.dispatchEvent(new CustomEvent(fluid.demos.askAnything.offerEvent, {detail: offer}));
    }
    return !!panel;
};

/**
 * Receive an offer made by `fluid.demos.askAnything.offer` - pasted text is appended to the direction, which is
 * focused, and a problem is reported as an entry in the conversation
 * @param {Object} state - The panel's reactive state
 * @param {CustomEvent} event - The event bearing the offer as its `detail`
 */
fluid.demos.askAnything.receiveOffer = function (state, event) {
    const offer = event.detail;
    if (offer.problem) {
        fluid.demos.askAnything.addEntry(state, {kind: "error", text: offer.problem, detail: offer.detail || ""});
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
        <!-- Shown and hidden by class rather than $if, so that each retains its DOM state, e.g. a half-typed direction -->
        <div class="ask-anything-login" @class="ask-anything-hidden:@{hasToken}">
            <div class="ask-anything-login-prompt">Enter the password for the AI service:</div>
            <div class="ask-anything-row">
                <input type="password" class="ask-anything-password" value="@{state.password}"
                       disabled="@{busy}" @onkeydown="{self}.passwordKeyDown({0})">
                <button class="ask-anything-button" disabled="@{busy}" @onclick="{self}.login()">Log In</button>
            </div>
            <div class="ask-anything-login-error">@{state.loginError}</div>
        </div>
        <div class="ask-anything-composer" @class="ask-anything-hidden:@{needsPassword}">
            <textarea class="ask-anything-direction" placeholder="Ask anything ... (↑ recalls earlier requests)"
                      value="@{state.direction}" @onkeydown="{self}.directionKeyDown({0})"></textarea>
            <div class="ask-anything-row">
                <label class="ask-anything-model">Model
                    <input type="text" value="@{state.model}" readonly>
                </label>
                <button class="ask-anything-link" disabled="@{busy}" @onclick="{self}.logout()">Log Out</button>
                <button class="ask-anything-button" disabled="@{cannotSend}" @onclick="{self}.send()">@{sendLabel}</button>
            </div>
        </div>
    </div>
</template>

<style>
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

.ask-anything-password, .ask-anything-model input {
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

.ask-anything-model input {
    flex: 1;
    min-width: 0;
    font-size: 12px;
}

.ask-anything-model input[readonly] {
    color: #757575;
    background-color: #F5F5F5;
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

.ask-anything-link {
    font: inherit;
    padding: 0;
    color: #1E88E5;
    background: none;
    border: none;
    cursor: pointer;
}
</style>
