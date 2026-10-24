/* eslint-env node */
"use strict";

const fluid = require("../../..");

const path = require("path");
const minimist = require("minimist");

const parsedArgs = minimist(process.argv.slice(2));

fluid.hydratedFilename = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    return inputFile.substring(0, lastdotpos) + "-hydrated" + inputFile.substring(lastdotpos);
};

// fluid.writeDocumentWhenSettled and the functions it uses are defined in server-support.js

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
