/* eslint-env node */
"use strict";

const fs = require("fs");

const linkedom = require("linkedom"),
    vm = require("vm"),
    he = require("he");

const fluid = global.fluid;

fluid.readTextFile = function (path) {
    const resolved = path;
    const stats = fs.statSync(resolved);
    console.log("Read " + stats.size + " bytes from " + resolved);
    const text = fs.readFileSync(resolved, "utf8");
    return text;
};

/**
 * Creates a memoized (cached) version of a single-argument function.
 *
 * @param {Function} fn - The function to cache.
 * @return {Function} The wrapped function with caching enabled.
 */
fluid.cached = function (fn) {
    const cache = Object.create(null);
    return function (key) {
        if (cache[key] !== undefined) {
            return cache[key];
        }
        return cache[key] = fn(key);
    };
};

fluid.decodeHtmlEntity = fluid.cached(he.decode);

fluid.serverDocument = linkedom.parseHTML("<html />").document;

fluid.serverDocumentParser = function (text) {
    return linkedom.parseHTML(text).document;
};

// Currently don't actually support script nodes contextualised by a document
fluid.loadScriptNodeInDocument = function (node /*, dokkument */) {
    const src = node.getAttribute("src");
    if (src) {
        const hydratedFrom = node.getAttribute("fluid-hydrated");
        // Don't reload Infusion which the server already has its own incarnation of
        if (hydratedFrom !== "%infusion-6") {
            fluid.loadInContext(src); // TODO: Convert file URLs, setc.
        }
    } else {
        const text = node.textContent;
        const match = text.match(/\/\/#\s*sourceURL=(.+)$/m);
        const sourceURL = match?.[1];
        vm.runInContext(text, fluid.V8Context, sourceURL);
    }
};

// TODO: This should be moved into the client side and listen to script node onload.
fluid.scriptLoadingIdle = fluid.cell(true, {name: "Script loading idle"});

/**
 * Server version of `fluid.applyScriptInjection` from FluidView.js. linkedom does not evaluate script elements on
 * connection, so after writing the same script node into the document as the browser would, its source is evaluated
 * directly and synchronously in the Fluid V8 context - using a MutationObserver would risk an async operation that is
 * hard to track in order to determine when the document can first be written.
 * @param {DocInjectionRecord} docInjRec - The injection payload, whose `material` holds members `text` and `sourceUrl`.
 * @param {Element|null} existing - Any existing node with the injection's id.
 * @return {Boolean|Unavailable} `true` if evaluation completed, otherwise an unavailable value describing the failure.
 */
fluid.applyServerScriptInjection = function ({dokkument, injRec, material}, existing) {
    let togo;
    const token = "fluid-injection-" + fluid.injectionId++;
    const wrapped = fluid.wrapScriptSource(material.text, material.sourceUrl, injRec.scope, token);
    const fresh = dokkument.createElement("script");
    fresh.text = wrapped;
    fresh.id = injRec.nodeId;
    fluid.swapInjectedNode(dokkument, existing, fresh);
    try {
        vm.runInContext(wrapped, fluid.V8Context, {filename: material.sourceUrl});
        togo = fluid.lastCompletedInjection === token ? true :
            fluid.unavailable({message: `Failure evaluating script at ${material.sourceUrl} - completion marker not reached`});
    } catch (error) {
        console.error(error);
        togo = fluid.unavailable({
            message: `Failure evaluating script at ${material.sourceUrl}`,
            cause: error
        });
    }
    return togo;
};

fluid.scriptInjectionStyles.literal.apply = fluid.applyServerScriptInjection;
fluid.scriptInjectionStyles.link.apply = fluid.applyServerScriptInjection;

fluid.activateDocument = function (dokkument) {
    const scriptQuery = fluid.liveQuerySelectorAll("script", dokkument, dokkument);
    let oldNodes = [];
    return fluid.cell.effect( (newNodes) => {
        fluid.scriptLoadingIdle.set(fluid.unavailable("Script loading in progress", "pending"));
        newNodes.forEach(newNode => {
            if (!oldNodes.find(node => node === newNode)) {
                fluid.loadScriptNodeInDocument(newNode, dokkument);
            }
        });
        oldNodes = newNodes;
        fluid.scriptLoadingIdle.set(true);
    }, [scriptQuery]);
};

fluid.loadAndBootDocument = function (filename) {
    const text = fluid.readTextFile(filename);

    const dokkument = fluid.serverDocumentParser(text);
    dokkument.location = new URL("file://" + filename);

    // fluid.activateDocument(dokkument);

    fluid.bootDocument(dokkument);
    return dokkument;
};
