<script>
// The "Ask me anything" panel, through which the user may converse with an AI which can reflect on and alter the
// widgets in the workspace - ported from the AI chat sidebar of the Aarhus "Stund" prototype.
// The protocol is in js/ai-protocol.js and the machinery acting on the canvas in js/tldraw-ai.js.
// See https://github.com/fluid-project/infusion-6/issues/22

fluid.registerNamespace("fluid.demos.askAnything");

// Keys under which the panel's settings are remembered in this browser
fluid.demos.askAnything.storageKeys = {
    token: "fluid.demos.askAnything.token",
    model: "fluid.demos.askAnything.model"
};

/**
 * Read one of the panel's settings as remembered in this browser
 * @param {String} key - The setting's key in `fluid.demos.askAnything.storageKeys`
 * @return {String} The remembered value, or a default if there is none - the default model, or an empty token
 */
fluid.demos.askAnything.readStored = function (key) {
    let stored = null;
    try {
        stored = window.localStorage.getItem(fluid.demos.askAnything.storageKeys[key]);
    } catch (e) {
        console.log("Browser storage is unavailable - settings will not be remembered");
    }
    return stored || (key === "model" ? fluid.tldraw.ai.defaultModel : "");
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
    // Held separately from the rest of the state since entries cannot yet be pushed onto an array nested within a
    // $reactiveRoot
    entries: {
        $reactiveRoot: []
    },
    state: {
        $reactiveRoot: {
            direction: "",
            password: "",
            // Remembered from an earlier visit, if any
            token: fluid.demos.askAnything.readStored("token"),
            model: fluid.demos.askAnything.readStored("model"),
            busy: false,
            loginError: ""
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
                source: "{askAnything}.entries",
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
            func: (self, e) => {
                // Enter sends, whereas Shift+Enter begins a fresh line
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    self.send();
                }
            },
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
            args: ["{self}.state", "{self}.entries"]
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
 * @param {Object[]} entries - The panel's reactive conversation entries
 * @param {ChatEntry} entry - The entry to be appended
 */
fluid.demos.askAnything.addEntry = function (entries, entry) {
    entries.push({detail: "", ...entry});
    // Scroll once the fresh entry has been rendered
    setTimeout(() => {
        const entries = document.querySelector(".ask-anything-entries");
        if (entries) {
            entries.scrollTop = entries.scrollHeight;
        }
    }, 0);
};

/**
 * Send the user's direction to the AI, and act on its response
 * @param {Object} state - The panel's reactive state
 * @param {Object[]} entries - The panel's reactive conversation entries
 * @return {Promise} A promise which resolves once the exchange has finished, successfully or not
 */
fluid.demos.askAnything.send = async function (state, entries) {
    const direction = state.direction.trim();
    const bridge = fluid.tldraw.ai.bridge;
    if (direction && !state.busy && bridge) {
        fluid.demos.askAnything.addEntry(entries, {kind: "user", text: direction});
        state.direction = "";
        state.busy = true;
        const model = state.model.trim() || fluid.tldraw.ai.defaultModel;
        fluid.demos.askAnything.writeStored("model", model);
        try {
            fluid.demos.askAnything.history = await fluid.tldraw.ai.converse({
                direction,
                history: fluid.demos.askAnything.history,
                bridge,
                call: messages => fluid.tldraw.ai.callEndpoint({token: state.token, model, messages}),
                report: entry => fluid.demos.askAnything.addEntry(entries, entry)
            });
        } catch (error) {
            if (error.unauthorised) {
                fluid.demos.askAnything.logout(state);
                state.loginError = "The password was not accepted - please enter it again.";
            }
            fluid.demos.askAnything.addEntry(entries, {kind: "error", text: fluid.tldraw.ai.describeError(error)});
        } finally {
            state.busy = false;
        }
    }
};
</script>

<template>
    <div class="ask-anything">
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
            <textarea class="ask-anything-direction" placeholder="Ask anything ..."
                      value="@{state.direction}" @onkeydown="{self}.directionKeyDown({0})"></textarea>
            <div class="ask-anything-row">
                <label class="ask-anything-model">Model
                    <input type="text" value="@{state.model}" disabled="@{busy}">
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
