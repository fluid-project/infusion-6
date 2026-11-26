"use strict";

// Signing in to GitHub by its device flow - see fluidGitHub.startSignIn in github.js. The service worker asks GitHub
// for a code, which this page shows; the user enters it at GitHub and authorizes the App there, while the service
// worker polls GitHub, and tells this page how the sign-in ended - see fluidSignIn in background.js.

const statusNode = document.getElementById("status");
const input = document.getElementById("token");
const byId = id => document.getElementById(id);

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
 * Show whether the extension is signed in, and how
 * @return {Promise} Resolves once shown
 */
const showStatus = async function () {
    const [status, view] = await Promise.all([ask({type: "signin-status"}), ask({type: "signin-view"})]);
    byId("device").hidden = status.signedIn || !view;
    byId("signed-in").hidden = !status.signedIn;
    byId("signed-out").hidden = status.signedIn || !status.available || !!view;
    byId("login").textContent = status.login ? " as " + status.login : status.kind === "token" ? " by a personal access token" : "";
    if (view && !status.signedIn) {
        byId("user-code").textContent = view.userCode;
        byId("open-github").dataset.uri = view.verificationUri;
    }
    // Without signing in, e.g. in a copy with no client id, a token is the only way in
    byId("token-details").open = !status.signedIn && !status.available;
};

chrome.runtime.onMessage.addListener(message => {
    if (message.type === "signin-ended") {
        statusNode.textContent = {
            "signed-in": "Signed in" + (message.result.login ? " as " + message.result.login : ""),
            denied: "Signing in was cancelled at GitHub",
            expired: "The code has expired - sign in again for a new one",
            error: message.result.message || ""
        }[message.result.state] || "";
        showStatus();
    }
});

byId("signin").addEventListener("click", async function () {
    statusNode.textContent = "Asking GitHub for a code ...";
    try {
        await ask({type: "signin-start"});
        statusNode.textContent = "Waiting for you to authorize at GitHub ...";
        await showStatus();
    } catch (error) {
        statusNode.textContent = error.message;
    }
});

byId("open-github").addEventListener("click", async function () {
    // Copying may be refused, e.g. without focus - the code is shown regardless, to be typed
    await navigator.clipboard.writeText(byId("user-code").textContent).catch(() => null);
    chrome.tabs.create({url: this.dataset.uri});
});

byId("cancel").addEventListener("click", async function () {
    await ask({type: "signin-cancel"}).catch(() => null);
    statusNode.textContent = "";
    await showStatus();
});

byId("signout").addEventListener("click", async function () {
    await ask({type: "signout"});
    statusNode.textContent = "Signed out";
    await showStatus();
});

byId("save").addEventListener("click", async function () {
    await chrome.storage.local.set({githubToken: input.value.trim(), githubTokenKind: "token"});
    await chrome.storage.local.remove("githubLogin");
    input.value = "";
    await ask({type: "signin-refresh"});
    statusNode.textContent = "Token saved";
    await showStatus();
});

showStatus().catch(error => {
    statusNode.textContent = error.message;
});

/**
 * List the enlisted sites, each with a button to forget it
 */
const listSites = async function () {
    const reply = await chrome.runtime.sendMessage({type: "sites-list"});
    const sites = reply && reply.ok ? reply.result : [];
    const list = document.getElementById("sites");
    list.textContent = "";
    sites.forEach(pattern => {
        const item = list.appendChild(document.createElement("li"));
        item.appendChild(document.createElement("code")).textContent = pattern.replace(/\/\*$/, "");
        const button = item.appendChild(document.createElement("button"));
        button.textContent = "Forget";
        button.addEventListener("click", async function () {
            await chrome.runtime.sendMessage({type: "site-forget", pattern});
            listSites();
        });
    });
    document.getElementById("no-sites").hidden = sites.length > 0;
};

listSites();

/**
 * Offer the lasting access to a site asked for by the extension's panel, named in this page's URL as `grant` - the
 * access is asked of Chrome as the user clicks, which Chrome counts as their request. Should it be held already, that
 * is said instead
 * @return {Promise} Resolves once offered
 */
const offerGrant = async function () {
    const pattern = new URLSearchParams(location.search).get("grant");
    if (pattern) {
        const host = pattern.replace(/^[a-z]+:\/\//, "").replace(/\/\*$/, "");
        const holder = document.getElementById("grant-holder");
        const button = document.getElementById("grant");
        const grantStatus = document.getElementById("grant-status");
        const held = await chrome.permissions.contains({origins: [pattern]}).catch(() => false);
        if (held) {
            grantStatus.textContent = "Your edits already show on every page of " + host;
        } else {
            button.textContent = "Show my edits on every page of " + host;
            holder.hidden = false;
            button.addEventListener("click", async function () {
                const granted = await chrome.permissions.request({origins: [pattern]}).catch(() => false);
                holder.hidden = granted;
                grantStatus.textContent = granted ? "Your edits will show on every page of " + host + " - you may close this tab" :
                    "Access wasn't allowed - only pages you open the editor on will show your edits";
                // The site is enlisted once access is granted - see chrome.permissions.onAdded in background.js
                setTimeout(listSites, 500);
            });
            button.scrollIntoView({block: "center"});
        }
    }
};

offerGrant();
