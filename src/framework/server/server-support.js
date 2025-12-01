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
fluid.scriptLoadingIdle = fluid.global.signal(true);

// Patch these update rules from FluidView.js so that we can react to script injections synchronously -
// using a MutationObserver risks an async operation that is hard to track in order to determine when the
// document can first be written
fluid.scriptInjectionStyles.literal.update = function (node, rec, dokkument, absUrl) {
    node.firstChild.nodeValue = rec.text + `\n//# sourceURL=${absUrl}`;
    vm.runInContext(rec.text, fluid.V8Context, absUrl);
    return fluid.trueSignal;
};

// TODO: When we do package.json style "whole module imports" we need to add the fluid-hydrated attribute to the node here,
// as well as ignoring attempted import of %infusion-6
fluid.scriptInjectionStyles.link.update = function (node, rec, dokkument) {
    const togo = fluid.global.signal(fluid.unavailable(`Script at url {resolved} is loading`, "I/O"));
    const resolveRelative = fluid.module.resolveRelativePath(dokkument.location, rec.url);
    // The client is going to resolve it themselves again and we want it to look relative to them (especially since we
    // don't know what their absolute path is going to be)
    node.setAttribute("src", resolveRelative);
    const resolved = fluid.module.resolvePath(rec.url);
    const fetched = fluid.fetchText(resolved);
    fluid.effect(text => {
        vm.runInContext(text, fluid.V8Context, resolved);
        togo.value = true;
    }, [fetched]);
    return togo;
};

fluid.activateDocument = function (dokkument) {
    const scriptQuery = fluid.liveQuerySelectorAll("script", dokkument, dokkument);
    let oldNodes = [];
    return fluid.effect( (newNodes) => {
        fluid.scriptLoadingIdle.value = fluid.unavailable("Script loading in progress", "I/O");
        newNodes.forEach(newNode => {
            if (!oldNodes.find(node => node === newNode)) {
                fluid.loadScriptNodeInDocument(newNode, dokkument);
            }
        });
        oldNodes = newNodes;
        fluid.scriptLoadingIdle.value = true;
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
