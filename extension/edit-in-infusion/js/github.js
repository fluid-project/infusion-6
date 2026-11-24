"use strict";

// The GitHub Contents API, as used by "Edit in Infusion" - reading a file with the blob sha on which an edit will be
// based, and writing it back only if that is still the file's sha, which is the compare-and-swap of the optimistic
// concurrency - see a-scratch/reports/0-live-static-editing.md in Infusion 6, section 3.3. Run in the service worker,
// which holds the token.

const fluidGitHub = {
    // The base of GitHub's REST API - replaced, in a build for testing alone, by `githubApi` in the extension's
    // storage, pointing the extension at a mock GitHub
    api: "https://api.github.com",
    // The base of GitHub's web pages, which serve the device flow of signing in - replaced, in a build for testing
    // alone, by `githubWeb` in storage
    web: "https://github.com",
    // The client id of the OAuth App "Edit in Infusion", with its device flow enabled. It is public, and no secret
    // goes with it - see packages/wend/notes/github-sign-in.md of this repository. Were it empty, signing in would be offered as
    // unavailable, and only a personal access token taken in the options. Replaced, in a build for testing alone, by
    // `githubClientId` in storage
    clientId: "Ov23lignaxZLCR1CTDoX",
    // The scope asked of the user - writing to the public repositories they can write to
    scope: "public_repo"
};

/**
 * Find the base of the GitHub API in use
 * @return {Promise<String>} The base, without a trailing slash
 */
fluidGitHub.apiBase = async function () {
    // Replaced only in a build for testing, whose manifest bears `fluid_testing` - see extension/test/harness.js
    const api = await fluidGitHub.setting("githubApi", fluidGitHub.api);
    return api.replace(/\/$/, "");
};

/**
 * Find a setting of the extension, which a build for testing alone may replace from storage
 * @param {String} key - The key of its replacement in storage, e.g. "githubWeb"
 * @param {String} value - The setting
 * @return {Promise<String>} The setting in force
 */
fluidGitHub.setting = async function (key, value) {
    const stored = await chrome.storage.local.get(key);
    // A replacement held, even an empty one, e.g. a client id of "" to test a copy of the extension without one
    return chrome.runtime.getManifest().fluid_testing && stored[key] !== undefined ? stored[key] : value;
};

/**
 * Encode text as base64 of its UTF-8 encoding, as the Contents API requires
 * @param {String} text - The text
 * @return {String} Its encoding
 */
fluidGitHub.encode = function (text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
};

/**
 * Decode base64 of UTF-8, as the Contents API returns it
 * @param {String} encoded - The encoding, possibly broken across lines
 * @return {String} The text
 */
fluidGitHub.decode = function (encoded) {
    const binary = atob(encoded.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
};

/**
 * Make the headers of a request, bearing the token if one is saved
 * @return {Promise<Object>} The headers
 */
fluidGitHub.headers = async function () {
    const stored = await chrome.storage.local.get("githubToken");
    const headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"};
    if (stored.githubToken) {
        headers.Authorization = "Bearer " + stored.githubToken;
    }
    return headers;
};

/**
 * Compute the URL of a file in the Contents API
 * @param {String} repo - The repository, "owner/name"
 * @param {String} path - The path of the file
 * @return {Promise<String>} The URL
 */
fluidGitHub.contentsUrl = async (repo, path) => (await fluidGitHub.apiBase()) + "/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");

/**
 * Read a file of a repository
 * @param {String} repo - The repository
 * @param {String} branch - The branch
 * @param {String} path - The path of the file
 * @return {Promise<Object>} The file's `text` and blob `sha`
 */
fluidGitHub.read = async function (repo, branch, path) {
    const response = await fetch(await fluidGitHub.contentsUrl(repo, path) + "?ref=" + encodeURIComponent(branch),
        {headers: await fluidGitHub.headers(), cache: "no-store"});
    if (response.ok) {
        const body = await response.json();
        return {text: fluidGitHub.decode(body.content), sha: body.sha};
    } else {
        throw new Error("GitHub refused to read " + path + ": " + response.status + " " + (await response.text()));
    }
};

/**
 * Write a file of a repository, only if it is still the file with the given sha
 * @param {Object} options - The write
 * @param {String} options.repo - The repository
 * @param {String} options.branch - The branch
 * @param {String} options.path - The path of the file
 * @param {String} options.text - Its new text
 * @param {String} [options.baseSha] - The blob sha of the file it replaces - absent when creating a file
 * @param {String} options.message - The commit message
 * @return {Promise<Object>} `{ok: true, sha, commitSha}`, or `{ok: false, conflict, message}` if refused, with `conflict`
 * true if the file had changed since `baseSha`
 */
fluidGitHub.write = async function ({repo, branch, path, text, baseSha, message}) {
    const headers = await fluidGitHub.headers();
    let togo;
    if (headers.Authorization) {
        const body = {message, content: fluidGitHub.encode(text), branch};
        if (baseSha) {
            body.sha = baseSha;
        }
        const response = await fetch(await fluidGitHub.contentsUrl(repo, path), {method: "PUT", headers, body: JSON.stringify(body)});
        if (response.ok) {
            const result = await response.json();
            togo = {ok: true, sha: result.content.sha, commitSha: result.commit.sha};
        } else {
            // 409 when the sha given is not the file's, 422 when creating a file which exists
            const conflict = response.status === 409 || response.status === 422;
            togo = {ok: false, conflict, message: "GitHub refused the commit: " + response.status + " " + (await response.text())};
        }
    } else {
        togo = {ok: false, conflict: false, message: "Not signed in to GitHub - sign in from the extension's options"};
    }
    return togo;
};

/**
 * A file written, or removed, by a changeset
 * @typedef {Object} ChangesetFile
 * @property {String} path - The path of the file within the repository
 * @property {String|null} content - Its new content as base64, or null to remove it
 * @property {String} [baseSha] - The blob sha of the file it replaces - absent for a file created
 */

/**
 * Call the GitHub API with a JSON body, returning the parsed reply
 * @param {String} method - The method, e.g. "POST"
 * @param {String} url - The URL
 * @param {Object} [body] - The body
 * @return {Promise<Object>} `{ok, status, body}` - `body` the parsed reply, or its text if not JSON
 */
fluidGitHub.call = async function (method, url, body) {
    const response = await fetch(url, {method, headers: await fluidGitHub.headers(), cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body)});
    const text = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        parsed = text;
    }
    return {ok: response.ok, status: response.status, body: parsed};
};

/**
 * Commit several files at once, as one commit, through the Git Data API - e.g. a post and the image dropped into it,
 * or a rename of an image and every source linking it. The compare-and-swap of the optimistic concurrency is twofold:
 * each file's `baseSha` is checked against the branch head's tree, so that a conflict is reported for the files which
 * changed, and the branch is then moved to the new commit only if it is still at that head (`force: false`)
 * @param {Object} options - The commit
 * @param {String} options.repo - The repository
 * @param {String} options.branch - The branch
 * @param {ChangesetFile[]} options.files - The files written or removed
 * @param {String} options.message - The commit message
 * @return {Promise<Object>} `{ok: true, commitSha, shas}`, with the blob sha of each file written by path, or
 * `{ok: false, conflict, message, paths}`, with `paths` the files which changed since their bases
 */
fluidGitHub.commitChangeset = async function ({repo, branch, files, message}) {
    const headers = await fluidGitHub.headers();
    const base = (await fluidGitHub.apiBase()) + "/repos/" + repo + "/git";
    const refUrl = base + "/refs/heads/" + branch.split("/").map(encodeURIComponent).join("/");
    const fail = (conflict, text, paths = []) => ({ok: false, conflict, message: text, paths});
    let togo;
    if (!headers.Authorization) {
        togo = fail(false, "Not signed in to GitHub - sign in from the extension's options");
    } else {
        const ref = await fluidGitHub.call("GET", base + "/ref/heads/" + branch.split("/").map(encodeURIComponent).join("/"));
        const head = ref.ok ? await fluidGitHub.call("GET", base + "/commits/" + ref.body.object.sha) : null;
        const tree = head && head.ok ? await fluidGitHub.call("GET", base + "/trees/" + head.body.tree.sha + "?recursive=1") : null;
        if (!tree || !tree.ok) {
            const failed = [ref, head, tree].find(reply => reply && !reply.ok) || ref;
            togo = fail(false, "GitHub refused to read the branch " + branch + ": " + failed.status + " " + JSON.stringify(failed.body));
        } else {
            const current = Object.fromEntries(tree.body.tree.filter(entry => entry.type === "blob").map(entry => [entry.path, entry.sha]));
            // A file created must not exist yet, and one replaced or removed must be as it was read
            const changed = files.filter(file => (file.baseSha || null) !== (current[file.path] || null));
            if (changed.length > 0) {
                togo = fail(true, "Changed since this edit was begun: " + changed.map(file => file.path).join(", "), changed.map(file => file.path));
            } else {
                const shas = {};
                const entries = [];
                for (const file of files) {
                    if (file.content === null) {
                        entries.push({path: file.path, mode: "100644", type: "blob", sha: null});
                    } else {
                        const blob = await fluidGitHub.call("POST", base + "/blobs", {content: file.content, encoding: "base64"});
                        if (!blob.ok) {
                            throw new Error("GitHub refused the file " + file.path + ": " + blob.status + " " + JSON.stringify(blob.body));
                        }
                        shas[file.path] = blob.body.sha;
                        entries.push({path: file.path, mode: "100644", type: "blob", sha: blob.body.sha});
                    }
                }
                const newTree = await fluidGitHub.call("POST", base + "/trees", {base_tree: head.body.tree.sha, tree: entries});
                const commit = newTree.ok ? await fluidGitHub.call("POST", base + "/commits",
                    {message, tree: newTree.body.sha, parents: [ref.body.object.sha]}) : newTree;
                const moved = commit.ok ? await fluidGitHub.call("PATCH", refUrl, {sha: commit.body.sha, force: false}) : commit;
                if (moved.ok) {
                    togo = {ok: true, commitSha: commit.body.sha, shas};
                } else {
                    // 422 when the branch has moved on since its head was read - another commit was made meanwhile
                    togo = fail(moved.status === 422 || moved.status === 409, "GitHub refused the commit: " + moved.status + " " + JSON.stringify(moved.body));
                }
            }
        }
    }
    return togo;
};

// Signing in by GitHub's device flow, which needs only the OAuth App's public client id: the extension asks GitHub for
// a code, the user enters it at GitHub's page for devices and authorizes the App, and the extension polls until GitHub
// issues the token. No secret, and so no server of the extension's own, is needed - the service worker, holding
// GitHub among its host permissions, is not held to CORS. The pending sign-in is kept in session storage, since the
// service worker may be stopped between polls; the options page, which shows the code, drives the polling.

/**
 * A sign-in in progress, as shown to the user
 * @typedef {Object} SignInStart
 * @property {String} userCode - The code the user enters, e.g. "WDJB-MJHT"
 * @property {String} verificationUri - The page at which they enter it
 * @property {Number} interval - How long to wait between polls, in seconds
 * @property {Number} expiresIn - How long the code lasts, in seconds
 */

/**
 * Post a form to GitHub's web endpoints of signing in, which reply in JSON when asked
 * @param {String} endpoint - The path beneath GitHub's web base, e.g. "/login/device/code"
 * @param {Object} params - The form's fields
 * @return {Promise<Object>} The parsed reply
 */
fluidGitHub.postForm = async function (endpoint, params) {
    const web = (await fluidGitHub.setting("githubWeb", fluidGitHub.web)).replace(/\/$/, "");
    const response = await fetch(web + endpoint, {
        method: "POST",
        headers: {"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams(params).toString(),
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error("GitHub refused to sign in: " + response.status + " " + (await response.text()));
    }
    return response.json();
};

/**
 * Begin signing in - ask GitHub for a code for the user to enter
 * @return {Promise<SignInStart>} What the user is to be shown
 */
fluidGitHub.startSignIn = async function () {
    const clientId = await fluidGitHub.setting("githubClientId", fluidGitHub.clientId);
    if (!clientId) {
        throw new Error("Signing in through GitHub isn't set up in this copy of the extension - give a token below instead");
    }
    const reply = await fluidGitHub.postForm("/login/device/code", {client_id: clientId, scope: fluidGitHub.scope});
    if (!reply.device_code) {
        throw new Error("GitHub refused to sign in: " + (reply.error_description || reply.error || JSON.stringify(reply)));
    }
    const interval = reply.interval || 5, expiresIn = reply.expires_in || 900;
    await chrome.storage.session.set({githubSignIn: {deviceCode: reply.device_code, interval, expiresAt: Date.now() + expiresIn * 1000}});
    return {userCode: reply.user_code, verificationUri: reply.verification_uri, interval, expiresIn};
};

/**
 * The state of a sign-in, after a poll
 * @typedef {Object} SignInPoll
 * @property {String} state - "pending", "signed-in", "denied", "expired" or "none"
 * @property {Number} [interval] - While pending, how long to wait before polling again, in seconds
 * @property {String} [login] - Once signed in, the user's login
 */

/**
 * Ask GitHub once whether the user has authorized the App, saving the token if they have
 * @return {Promise<SignInPoll>} The state of the sign-in
 */
fluidGitHub.pollSignIn = async function () {
    const {githubSignIn: pending} = await chrome.storage.session.get("githubSignIn");
    let togo;
    if (!pending) {
        togo = {state: "none"};
    } else if (Date.now() > pending.expiresAt) {
        await chrome.storage.session.remove("githubSignIn");
        togo = {state: "expired"};
    } else {
        const clientId = await fluidGitHub.setting("githubClientId", fluidGitHub.clientId);
        const reply = await fluidGitHub.postForm("/login/oauth/access_token", {
            client_id: clientId,
            device_code: pending.deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        });
        if (reply.access_token) {
            await chrome.storage.session.remove("githubSignIn");
            await chrome.storage.local.set({githubToken: reply.access_token, githubTokenKind: "oauth"});
            const user = await fluidGitHub.call("GET", (await fluidGitHub.apiBase()) + "/user");
            const login = user.ok ? user.body.login : null;
            await chrome.storage.local.set({githubLogin: login});
            togo = {state: "signed-in", login};
        } else if (reply.error === "authorization_pending") {
            togo = {state: "pending", interval: pending.interval};
        } else if (reply.error === "slow_down") {
            // GitHub asks for a longer wait, which holds for the rest of this sign-in
            const interval = reply.interval || pending.interval + 5;
            await chrome.storage.session.set({githubSignIn: {...pending, interval}});
            togo = {state: "pending", interval};
        } else if (reply.error === "expired_token" || reply.error === "access_denied") {
            await chrome.storage.session.remove("githubSignIn");
            togo = {state: reply.error === "access_denied" ? "denied" : "expired"};
        } else {
            throw new Error("GitHub refused to sign in: " + (reply.error_description || reply.error || JSON.stringify(reply)));
        }
    }
    return togo;
};

/**
 * Whether, and how, the extension is signed in to GitHub
 * @return {Promise<Object>} `{signedIn, kind, login, available}` - `kind` "oauth" for signing in, or "token" for a
 * personal access token given in the options, and `available` whether signing in is set up in this copy
 */
fluidGitHub.signInStatus = async function () {
    const stored = await chrome.storage.local.get(["githubToken", "githubTokenKind", "githubLogin"]);
    const clientId = await fluidGitHub.setting("githubClientId", fluidGitHub.clientId);
    return {
        signedIn: !!stored.githubToken,
        kind: stored.githubToken ? stored.githubTokenKind || "token" : null,
        login: stored.githubToken && stored.githubLogin || null,
        available: !!clientId
    };
};

/**
 * Sign out - forget the token, and any sign-in in progress. The App's authorization stays with GitHub, which lists it
 * under Settings, Applications, until the user revokes it there
 * @return {Promise} Resolves once signed out
 */
fluidGitHub.signOut = async function () {
    await chrome.storage.local.remove(["githubToken", "githubTokenKind", "githubLogin"]);
    await chrome.storage.session.remove("githubSignIn");
};
