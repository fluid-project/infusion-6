/*
Copyright The Infusion copyright holders
See the AUTHORS.md file at the top-level directory of this distribution and at
https://github.com/fluid-project/infusion/raw/main/AUTHORS.md.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/main/Infusion-LICENSE.txt
*/

/* eslint-env node */
"use strict";

// Runs a browser QUnit HTML driver file such as FluidViewTests.html under node. Each driver gets a fresh V8 context
// holding a lightweight linkedom mockup of a browser window and document. The scripts in the driver are loaded into it
// in document order, and the inner QUnit's lifecycle is reported through the fQUnit reporter of the outer context.

const fs = require("fs"),
    path = require("path"),
    vm = require("vm"),
    {pathToFileURL, fileURLToPath} = require("url"),
    linkedom = require("linkedom"),
    nodeFetch = require("../../../../src/framework/server/node-fetch-wrapper.js");

const fQUnit = fluid.registerNamespace("fQUnit");

/**
 * Event classes which linkedom does not supply, built on its own `Event` so that they can be dispatched to its nodes.
 * Only the members of their init dictionaries are supported - there is no hit testing or default action.
 * @return {Object} A map of class names to classes
 */
fQUnit.makeEventClasses = function () {
    const Event = linkedom.Event;
    const makeInitClass = function (defaults) {
        return class extends Event {
            constructor(type, init = {}) {
                super(type, init);
                Object.keys(defaults).forEach(key => {
                    this[key] = key in init ? init[key] : defaults[key];
                });
            }
        };
    };
    const modifiers = {ctrlKey: false, shiftKey: false, altKey: false, metaKey: false};
    const UIEvent = makeInitClass({detail: 0, view: null});
    const MouseEvent = makeInitClass({...modifiers, button: 0, buttons: 0, clientX: 0, clientY: 0, detail: 0});
    const KeyboardEvent = makeInitClass({...modifiers, key: "", code: "", repeat: false});
    const FocusEvent = makeInitClass({relatedTarget: null});
    const ErrorEvent = makeInitClass({message: "", filename: "", lineno: 0, colno: 0, error: null});
    return {UIEvent, MouseEvent, PointerEvent: MouseEvent, KeyboardEvent, FocusEvent, ErrorEvent};
};

fQUnit.eventClasses = fQUnit.makeEventClasses();

/**
 * Members of the node global which are copied into each inner context. Note that node's `globalThis` is never
 * reachable from the inner context, so that the `fluid` which src/framework/server/fluid.js exports into it cannot
 * pollute the context's own `fluid`.
 */
fQUnit.contextGlobals = ["console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
    "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "AbortController", "performance"];

/**
 * Members of linkedom's exports which are copied into each inner context as DOM interface globals.
 */
fQUnit.linkedomGlobals = Object.keys(linkedom).filter(key => /^[A-Z]/.test(key) && typeof(linkedom[key]) === "function");

/**
 * Track documents whose inline script elements are executed on connection, mapped to their inner context
 * @type {WeakMap<Document, Object>}
 */
fQUnit.liveDocuments = new WeakMap();

/**
 * Script elements which have already been executed - corresponding to the HTML spec's "already started" flag, a script
 * element executes at most once, even if it is subsequently moved or reinserted
 * @type {WeakSet<Element>}
 */
fQUnit.startedScripts = new WeakSet();

/**
 * Execute a script element in the context of its document, as a browser does when an inline script is connected.
 * Errors are reported through the window's "error" event, as a browser does, rather than thrown to the inserter.
 * @param {Element} script - The script element which has just been connected
 */
fQUnit.executeConnectedScript = function (script) {
    const context = fQUnit.liveDocuments.get(script.ownerDocument);
    if (context && !fQUnit.startedScripts.has(script) && !script.getAttribute("src") && script.isConnected) {
        fQUnit.startedScripts.add(script);
        const text = script.textContent;
        const match = text.match(/\/\/#\s*sourceURL=(.+)$/m);
        try {
            vm.runInContext(text, context, {filename: match ? match[1] : "inline script"});
        } catch (error) {
            console.error(error);
            const event = new fQUnit.eventClasses.ErrorEvent("error", {error, message: error.message});
            context.dispatchEvent(event);
        }
    }
};

/**
 * Patch the node insertion methods of linkedom so that inline script elements inserted into a live document are
 * executed. This affects only documents registered in `fQUnit.liveDocuments`. Since linkedom defines these methods
 * on several prototypes, some of them (e.g. ParentNode) not exported, every prototype which owns one is patched.
 */
fQUnit.patchScriptExecution = function () {
    const methods = ["appendChild", "insertBefore", "replaceChild", "replaceWith", "before", "after", "append", "prepend"];
    const {document} = linkedom.parseHTML("<html><head></head><body></body></html>");
    const samples = [document, document.createElement("div"), document.createDocumentFragment()];
    const patched = new Set();
    samples.forEach(sample => {
        for (let proto = Object.getPrototypeOf(sample); proto; proto = Object.getPrototypeOf(proto)) {
            methods.forEach(method => {
                const original = Object.prototype.hasOwnProperty.call(proto, method) ? proto[method] : null;
                if (original && !patched.has(original)) {
                    const patchedMethod = function (...args) {
                        const togo = original.apply(this, args);
                        args.forEach(arg => {
                            if (arg && arg.localName === "script") {
                                fQUnit.executeConnectedScript(arg);
                            }
                        });
                        return togo;
                    };
                    patched.add(original);
                    patched.add(patchedMethod);
                    proto[method] = patchedMethod;
                }
            });
        }
    });
};

fQUnit.patchScriptExecution();

/**
 * Construct a fresh V8 context holding a linkedom mockup of a browser window and document for an HTML file
 * @param {String} htmlPath - The absolute path of the HTML file
 * @return {Object} The global object of the new context, which also serves as its `window`
 */
fQUnit.makeBrowserContext = function (htmlPath) {
    const text = fs.readFileSync(htmlPath, "utf8");
    const {document} = linkedom.parseHTML(text);
    const location = new URL(pathToFileURL(htmlPath).href);
    const sandbox = {};
    fQUnit.contextGlobals.forEach(key => {
        sandbox[key] = global[key];
    });
    fQUnit.linkedomGlobals.forEach(key => {
        sandbox[key] = linkedom[key];
    });
    Object.assign(sandbox, fQUnit.eventClasses);
    const eventTarget = new linkedom.EventTarget();
    Object.assign(sandbox, {
        document,
        location,
        navigator: {userAgent: "fqunit-html (linkedom)"},
        // As in the browser, relative URLs are resolved against the document's location
        fetch: (url, options) => nodeFetch(new URL(url, location).href, options),
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
        dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
        MutationObserver: document.defaultView.MutationObserver
    });
    const context = vm.createContext(sandbox, {name: htmlPath});
    context.window = context;
    context.self = context;
    // linkedom's own defaultView is a proxy onto node's globalThis - substitute the inner window
    Object.defineProperty(document, "defaultView", {value: context});
    Object.defineProperty(document, "location", {value: location});
    fQUnit.liveDocuments.set(document, context);
    return context;
};

/**
 * Determine whether a script URL from an HTML driver refers to a local file which should be loaded. Remote libraries
 * and server-relative URLs which are served by a test server (e.g. /testem.js) are skipped.
 * @param {String} src - The `src` attribute of a script element
 * @return {Boolean} `true` if the script should be loaded
 */
fQUnit.isLoadableScript = function (src) {
    return !/^([a-z]+:)?\/\//i.test(src) && !src.startsWith("/");
};

/**
 * Load the scripts of an HTML driver file into its context in document order
 * @param {Object} context - The context constructed by `fQUnit.makeBrowserContext`
 * @param {String} htmlPath - The absolute path of the HTML file
 */
fQUnit.loadDocumentScripts = function (context, htmlPath) {
    const scripts = [...context.document.querySelectorAll("script")];
    scripts.forEach(script => {
        const src = script.getAttribute("src");
        if (src) {
            if (fQUnit.isLoadableScript(src)) {
                const scriptPath = fileURLToPath(new URL(src, context.location));
                vm.runInContext(fs.readFileSync(scriptPath, "utf8"), context, {filename: scriptPath});
            } else {
                fQUnit.log("Skipping script " + src + " in " + path.basename(htmlPath));
            }
        } else {
            vm.runInContext(script.textContent, context, {filename: htmlPath});
        }
    });
};

/**
 * Run the QUnit fixtures held in an HTML driver file in a fresh browser-like context
 * @param {String} htmlPath - The path of the HTML file
 * @return {Promise<Object>} A promise for QUnit's summary record of the run
 */
fQUnit.runHtmlFile = function (htmlPath) {
    const fullPath = path.resolve(htmlPath);
    fQUnit.log("Running HTML test driver " + fullPath);
    const failed = {passed: 0, failed: 1, total: 1, runtime: 0};
    return new Promise(resolve => {
        let QUnit;
        try {
            const context = fQUnit.makeBrowserContext(fullPath);
            fQUnit.loadDocumentScripts(context, fullPath);
            QUnit = context.QUnit;
            if (QUnit) {
                if (context.fluid !== undefined && context.fluid === global.fluid) {
                    fluid.fail("Inner context for " + fullPath + " has been polluted by the node global fluid");
                }
                fQUnit.attachReporter(QUnit, resolve);
                // QUnit's browser bootstrap awaits the window's load event
                context.dispatchEvent(new linkedom.Event("load"));
            } else {
                fQUnit.log("No QUnit found after loading " + fullPath + " - " + fQUnit.passFail(1));
                resolve(failed);
            }
        } catch (error) {
            fQUnit.log("Error loading HTML test driver " + fullPath + " - " + fQUnit.passFail(1), error);
            resolve(failed);
        }
    });
};

module.exports = fQUnit.runHtmlFile;
