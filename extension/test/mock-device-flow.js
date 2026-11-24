"use strict";

// A mock of GitHub's device flow of signing in, for scenario tests of the "Edit in Infusion" extension's sign-in - see
// fluidGitHub.startSignIn in edit-in-infusion/js/github.js. It serves, beneath a web base:
//  - POST /login/device/code - issues a device code and a code for the user, for the right client id
//  - GET /login/device - a page standing for GitHub's, at which the user enters their code and authorizes or cancels
//  - POST /login/oauth/access_token - polled by the extension: "authorization_pending" until the user has decided,
//    once "slow_down" if asked to, then the token, or "access_denied"
// and, beneath an API base, GET /user, naming the user the token was issued to.

const mockDeviceFlow = {};

/**
 * Read the form-encoded body of a request
 * @param {http.IncomingMessage} req - The request
 * @return {Promise<URLSearchParams>} Its fields
 */
mockDeviceFlow.readForm = async function (req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
};

/**
 * Create a mock of the device flow
 * @param {Object} options - The mock's configuration
 * @param {String} options.clientId - The client id of the OAuth App, which alone is accepted
 * @param {String} [options.login] - The login of the user who signs in
 * @param {Number} [options.interval] - The interval between polls it asks for, in seconds
 * @param {Boolean} [options.slowDownOnce] - Whether to reply "slow_down" to the first poll after each code is issued
 * @return {Object} The mock - its `handle` serves a request, and it records each `request` and `sign-in`
 */
mockDeviceFlow.create = function (options) {
    const mock = {
        login: options.login || "mock-user",
        // Each code issued, by its device code: {userCode, scope, decision, polls, token}
        signIns: new Map(),
        requests: [],
        issued: 0
    };

    const reply = (res, status, body, type = "application/json") => {
        res.writeHead(status, {"Content-Type": type, "Cache-Control": "no-store"});
        res.end(type === "application/json" ? JSON.stringify(body) : body);
    };

    /**
     * Find the sign-in to which a user's code belongs
     * @param {String} userCode - The code, as the user typed it
     * @return {Object|undefined} The sign-in
     */
    const byUserCode = userCode => [...mock.signIns.values()].find(signIn => signIn.userCode === userCode.trim().toUpperCase());

    /**
     * The page standing for GitHub's page for devices
     * @param {String} message - A message shown above the form, if any
     * @return {String} The page's markup
     */
    const devicePage = message => `<!DOCTYPE html><html><head><title>Device activation</title></head><body>
        <h1>Device activation</h1><p class="message">${message}</p>
        <form method="POST" action="device"><label>Code <input name="user_code" id="user-code"></label>
        <button name="decision" value="authorize" id="authorize">Authorize</button>
        <button name="decision" value="cancel" id="cancel">Cancel</button></form></body></html>`;

    /**
     * Serve a request, if it is one of the device flow's
     * @param {http.IncomingMessage} req - The request
     * @param {http.ServerResponse} res - The response
     * @param {String} webPath - The request's path beneath the web base, or null if beneath the API base
     * @param {String} apiPath - The request's path beneath the API base, or null if beneath the web base
     * @return {Promise<Boolean>} `true` if it was served
     */
    mock.handle = async function (req, res, webPath, apiPath) {
        let served = true;
        mock.requests.push({method: req.method, path: webPath || apiPath});
        if (webPath === "/login/device/code" && req.method === "POST") {
            const form = await mockDeviceFlow.readForm(req);
            if (form.get("client_id") === options.clientId) {
                ++mock.issued;
                const deviceCode = "device-" + mock.issued;
                const userCode = "MOCK-" + String(1000 + mock.issued);
                mock.signIns.set(deviceCode, {userCode, scope: form.get("scope"), decision: null, polls: 0, token: null});
                reply(res, 200, {device_code: deviceCode, user_code: userCode, verification_uri: options.verificationUri,
                    expires_in: 900, interval: options.interval || 1});
            } else {
                reply(res, 200, {error: "unauthorized_client", error_description: "Unknown client id"});
            }
        } else if (webPath === "/login/oauth/access_token" && req.method === "POST") {
            const form = await mockDeviceFlow.readForm(req);
            const signIn = mock.signIns.get(form.get("device_code"));
            if (!signIn || form.get("client_id") !== options.clientId ||
                form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:device_code") {
                reply(res, 200, {error: "incorrect_device_code"});
            } else {
                ++signIn.polls;
                if (options.slowDownOnce && signIn.polls === 1) {
                    reply(res, 200, {error: "slow_down", interval: (options.interval || 1) + 1});
                } else if (signIn.decision === "authorize") {
                    signIn.token = signIn.token || "gho_mock" + mock.issued;
                    reply(res, 200, {access_token: signIn.token, token_type: "bearer", scope: signIn.scope});
                } else if (signIn.decision === "cancel") {
                    reply(res, 200, {error: "access_denied"});
                } else {
                    reply(res, 200, {error: "authorization_pending"});
                }
            }
        } else if (webPath === "/login/device" && req.method === "GET") {
            reply(res, 200, devicePage(""), "text/html");
        } else if (webPath === "/login/device" && req.method === "POST") {
            const form = await mockDeviceFlow.readForm(req);
            const signIn = byUserCode(form.get("user_code") || "");
            if (signIn) {
                signIn.decision = form.get("decision");
                reply(res, 200, devicePage(signIn.decision === "authorize" ? "Your device is now connected." : "Authorization cancelled."), "text/html");
            } else {
                reply(res, 200, devicePage("That code isn't valid."), "text/html");
            }
        } else if (apiPath === "/user" && req.method === "GET") {
            const token = (req.headers.authorization || "").replace(/^Bearer /, "");
            const known = [...mock.signIns.values()].some(signIn => signIn.token && signIn.token === token);
            if (known) {
                reply(res, 200, {login: mock.login});
            } else {
                reply(res, 401, {message: "Bad credentials"});
            }
        } else {
            served = false;
        }
        return served;
    };

    return mock;
};

module.exports = mockDeviceFlow;
