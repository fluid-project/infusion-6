"use strict";

// The panel of "Edit in Infusion", opened by every click of its action - see fluidSignIn in background.js. Signed out, it talks the user through
// GitHub's device flow: connecting asks GitHub for a code, which is shown; the user copies it and goes to GitHub,
// which closes this panel, while the service worker polls GitHub; once they have authorized, it returns them to their
// tab and opens the panel again where Chrome allows. Signed in, it shows their account, and offers to edit the page -
// disabled, with a tooltip saying why, if the page can't be edited - and to sign out.

const byId = id => document.getElementById(id);
const statusNode = byId("status");

/**
 * Send a message to the service worker, and unwrap its reply
 * @param {Object} message - The message
 * @return {Promise<Any>} The reply's result - rejects with the error it reports
 */
const ask = async function (message) {
    const reply = await chrome.runtime.sendMessage(message);
    if (!reply || !reply.ok) {
        throw new Error(reply ? reply.error : "The extension did not answer");
    }
    return reply.result;
};

/**
 * Find the tab the panel was opened over - in a build for testing, which opens the panel as a page of its own, the
 * tab named by its `tab` parameter
 * @return {Promise<Object|null>} The tab
 */
const currentTab = async function () {
    const testTab = chrome.runtime.getManifest().fluid_testing && new URLSearchParams(location.search).get("tab");
    let togo;
    if (testTab) {
        togo = await chrome.tabs.get(Number(testTab));
    } else {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        togo = tab || null;
    }
    return togo;
};

/**
 * Show one of the panel's sections
 * @param {String} id - The section's id: "welcome", "code" or "ready"
 */
const show = function (id) {
    ["welcome", "code", "ready"].forEach(section => {
        byId(section).hidden = section !== id;
    });
    byId("cancel").hidden = id !== "code";
    byId("signout").hidden = id !== "ready";
};

/**
 * Show the code of a sign-in in progress
 * @param {SignInStart} view - The sign-in
 */
const showCode = function (view) {
    byId("user-code").textContent = view.userCode;
    byId("open-github").dataset.uri = view.verificationUri;
    show("code");
};

/**
 * Show the panel as the state of signing in requires
 * @return {Promise} Resolves once shown
 */
const render = async function () {
    const [status, view] = await Promise.all([ask({type: "signin-status"}), ask({type: "signin-view"})]);
    if (status.signedIn) {
        byId("login").textContent = status.login ? " as " + status.login : "";
        show("ready");
        const tab = await currentTab();
        const editable = tab ? await ask({type: "tab-editable", tabId: tab.id}) : {editable: false, reason: "There is no page to edit"};
        byId("start").disabled = !editable.editable;
        // The tooltip is held by the button's wrapper too, since a disabled button may show none of its own
        byId("start").title = byId("start-holder").title = editable.editable ? "Open the editor on this page" : editable.reason;
    } else if (view) {
        showCode(view);
    } else {
        show("welcome");
        if (!status.available) {
            byId("connect").disabled = true;
            statusNode.textContent = "Connecting isn't set up in this copy of the extension - use More options to give a token";
        }
    }
};

byId("connect").addEventListener("click", async function () {
    statusNode.textContent = "";
    this.disabled = true;
    try {
        const tab = await currentTab();
        showCode(await ask({type: "signin-start", tabId: tab && tab.id}));
    } catch (error) {
        statusNode.textContent = "GitHub couldn't be reached - " + error.message;
    }
    this.disabled = false;
});

byId("open-github").addEventListener("click", async function () {
    // Copying may be refused - the code is shown regardless, to be typed
    await navigator.clipboard.writeText(byId("user-code").textContent).catch(() => null);
    chrome.tabs.create({url: this.dataset.uri});
});

byId("cancel").addEventListener("click", async function () {
    await ask({type: "signin-cancel"});
    show("welcome");
});

byId("start").addEventListener("click", async function () {
    const tab = await currentTab();
    const url = tab && tab.url ? new URL(tab.url) : null;
    if (url && (url.protocol === "http:" || url.protocol === "https:")) {
        const pattern = url.protocol + "//" + url.hostname + "/*";
        // Declared first, since Chrome may close this panel while it asks for access - see panel-edit in background.js
        await ask({type: "panel-edit-intent", tabId: tab.id, pattern});
        // Asked here, while the click still counts as the user's - the service worker could not ask on its behalf
        const granted = await chrome.permissions.request({origins: [pattern]}).catch(() => false);
        const activated = await ask({type: "panel-edit", tabId: tab.id, granted});
        if (activated) {
            window.close();
        } else {
            statusNode.textContent = "The editor couldn't be opened on this page";
        }
    }
});

byId("signout").addEventListener("click", async function () {
    await ask({type: "signout"});
    statusNode.textContent = "Signed out";
    await render();
});

byId("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener(message => {
    if (message.type === "signin-ended") {
        render().then(() => {
            statusNode.textContent = {
                denied: "Connecting was cancelled at GitHub - you can try again",
                expired: "The code ran out of time - connect again for a new one",
                error: message.result.message || ""
            }[message.result.state] || "";
        });
    }
});

render().catch(error => {
    statusNode.textContent = error.message;
});
