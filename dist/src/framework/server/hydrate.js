/* eslint-env node */
"use strict";

const fluid = require("../../..");

const fs = require("fs"),
    path = require("path");
const minimist = require("minimist");

const parsedArgs = minimist(process.argv.slice(2));

fluid.writeFile = function (filename, data) {
    fs.writeFileSync(filename, data, "utf8");
    const stats = fs.statSync(filename);
    console.log("Written " + stats.size + " bytes to " + filename);
};

fluid.hydratedFilename = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    return inputFile.substring(0, lastdotpos) + "-hydrated" + inputFile.substring(lastdotpos);
};

fluid.writeDocument = function (filename, dokkument) {
    const outMarkup = "<!DOCTYPE html>" + dokkument.documentElement.outerHTML;
    fluid.writeFile(filename, outMarkup);
};

/**
 * Construct a signal which is available once a booted document is ready to be written - when all of its injections
 * are complete, no script is loading and no component is unavailable.
 * @param {Document} dokkument - The document which has been booted
 * @return {Cell<Boolean>} A signal which holds `true` once the document is ready, and is otherwise unavailable
 */
fluid.documentReady = function (dokkument) {
    const sources = [fluid.documentInjections.get(dokkument).injectionsComplete, fluid.scriptLoadingIdle, fluid.unavailableComponents];
    return fluid.cell(undefined, {name: "Document ready for writing"}).computed(() => true, sources);
};

/**
 * Write a booted document once the reactive graph has settled, so that all the injections and rendering it triggers
 * are complete. A free effect watching the document's readiness is pending whilst it is, e.g. whilst any injection is
 * in progress, and so holds its fit open until then. Once settled, nothing further can happen without some external
 * event, so a document which is not then ready never will be.
 * @param {Document} dokkument - The document which has been booted
 * @param {String} outFilename - The file to write the hydrated document to
 * @return {Promise} A promise which resolves once the document has been written, and rejects with the reason the
 * document is not ready if the graph settles without it becoming so
 */
fluid.writeDocumentWhenSettled = async function (dokkument, outFilename) {
    const ready = fluid.documentReady(dokkument);
    const readyWatcher = fluid.cell.effect(readiness => readiness, [ready], {isFree: true, name: "Watch document ready for writing"});
    readyWatcher.get();
    await fluid.cell.settle();
    readyWatcher.dispose();
    const readiness = ready.get();
    if (fluid.isUnavailable(readiness)) {
        throw new Error("Reactive graph settled but document is not ready: " + JSON.stringify(readiness));
    }
    fluid.writeDocument(outFilename, dokkument);
};

const inFilename = parsedArgs._[0];

const outFilename = parsedArgs["o"] || fluid.hydratedFilename(inFilename);

const dokkument = fluid.loadAndBootDocument(path.resolve(inFilename));

let written = false;

fluid.writeDocumentWhenSettled(dokkument, outFilename).then(() => {
    written = true;
}, error => {
    console.error("Failed to write hydrated document: ", error);
    process.exitCode = 1;
});

// node exits once no I/O or timer is outstanding - if the document has not been written by then, the graph is
// deadlocked on effects which can never complete
process.on("exit", function () {
    if (!written && process.exitCode !== 1) {
        console.error("Exiting without writing hydrated document - pending effects: ",
            fluid.cell.pendingEffects().map(effect => effect.name));
        process.exitCode = 1;
    }
});
