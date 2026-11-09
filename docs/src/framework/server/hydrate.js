/* eslint-env node */
"use strict";

const fluid = require("../../..");

const path = require("path");
const minimist = require("minimist");

// Usage: node hydrate.js <page.html> [-o <output.html>] [--framework boot|source|built]
//   --framework  The form in which the page's bootstrap of Infusion, FluidBoot.js, is written - left to load Infusion's
//                files in the browser ("boot", the default), replaced by a script for each of them ("source"), or by
//                their bundle in Infusion's dist ("built") - see fluid.writeBootScript
const parsedArgs = minimist(process.argv.slice(2), {string: ["o", "framework"]});

fluid.hydratedFilename = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    return inputFile.substring(0, lastdotpos) + "-hydrated" + inputFile.substring(lastdotpos);
};

// fluid.writeDocumentWhenSettled and the functions it uses are defined in server-support.js

const inFilename = parsedArgs._[0];

if (!inFilename) {
    console.error("Usage: node hydrate.js <page.html> [-o <output.html>] [--framework boot|source|built]");
    process.exit(1);
}

const outFilename = parsedArgs["o"] || fluid.hydratedFilename(inFilename);

const dokkument = fluid.loadAndBootDocument(path.resolve(inFilename));

let written = false;

fluid.writeDocumentWhenSettled(dokkument, outFilename, {framework: parsedArgs.framework}).then(() => {
    written = true;
    // Report what the static rendering was rendered from in place of the page's genuine data
    fluid.documentPlaceholders(dokkument).forEach(record => {
        console.log(record.placeholderUrl ? `Rendered ${record.path} from placeholder ${record.placeholderUrl} in place of ${record.url}` :
            `Rendered ${record.path} from ${record.url}, which has no placeholder`);
    });
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
