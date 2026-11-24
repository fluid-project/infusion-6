"use strict";

const fluid = require("../../..");

const path = require("path");
const minimist = require("minimist");

// Usage: node hydrate.js <page.html> [-o <output.html>] [--framework boot|source|built] [--no-placeholders]
//   --framework  The form in which the page's bootstrap of Infusion, FluidBoot.js, is written - left to load Infusion's
//                files in the browser ("boot", the default), replaced by a script for each of them ("source"), or by
//                their bundle in Infusion's dist ("built") - see fluid.writeBootScript
//   --no-placeholders  Fail, writing nothing, if any of the page's components is rendered from a placeholder - for a
//                page which is a runnable application, to be rendered from its real data, rather than a test fixture.
//                See FLUID-7032
const parsedArgs = minimist(process.argv.slice(2), {string: ["o", "framework"], boolean: ["placeholders"], default: {placeholders: true}});

fluid.hydratedFilename = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    return inputFile.substring(0, lastdotpos) + "-hydrated" + inputFile.substring(lastdotpos);
};

// fluid.writeDocumentWhenSettled and the functions it uses are defined in server-support.js

const inFilename = parsedArgs._[0];

if (!inFilename) {
    console.error("Usage: node hydrate.js <page.html> [-o <output.html>] [--framework boot|source|built] [--no-placeholders]");
    process.exit(1);
}

const outFilename = parsedArgs["o"] || fluid.hydratedFilename(inFilename);

const dokkument = fluid.loadAndBootDocument(path.resolve(inFilename));

let written = false;

/**
 * Write the hydrated document once the reactive graph has settled, unless it is rendered from placeholders where
 * none are permitted, reporting each placeholder it is rendered from
 * @return {Promise<Boolean>} A promise for `true` if the document was written
 */
const hydrate = async function () {
    await fluid.cell.settle();
    const placeholders = fluid.documentPlaceholders(dokkument);
    placeholders.forEach(record => {
        console.log(`Rendered ${record.path} from placeholder ${record.url}, fetched from ${record.fetchUrl}`);
    });
    let togo = false;
    if (placeholders.length > 0 && !parsedArgs.placeholders) {
        console.error(`Not writing hydrated document: ${placeholders.length} of its components rendered from placeholders, `
            + "which a runnable application is not - override the URL each is configured with by that of its real data");
        process.exitCode = 1;
    } else {
        await fluid.writeDocumentWhenSettled(dokkument, outFilename, {framework: parsedArgs.framework});
        togo = true;
    }
    return togo;
};

hydrate().then(wrote => {
    written = wrote;
}, error => {
    console.error("Failed to write hydrated document: ", error);
    process.exitCode = 1;
});

// node exits once no I/O or timer is outstanding - if the document has not been written by then, the graph is
// deadlocked on effects which can never complete
process.on("exit", function () {
    if (!written && process.exitCode !== 1) {
        // Each pending effect is reported with the chain of what it awaits - see fluid.cell.explain
        console.error("Exiting without writing hydrated document - pending effects, each with what it awaits: ",
            fluid.cell.pendingEffects().map(effect => fluid.cell.explain(effect).join(" <- ")));
        process.exitCode = 1;
    }
});
