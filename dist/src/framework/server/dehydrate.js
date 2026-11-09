/* eslint-env node */
"use strict";

const fluid = require("../../..");

const fs = require("fs"),
    minimist = require("minimist");

// Usage: node dehydrate.js <page-hydrated.html> [-o <output.html>]
// Reverse what hydrate.js did to a page, writing the page as it was before hydration - every element hydration added
// beside the page's own is removed, every element on which a component booted is restored to its attributes and
// content as written, and any expansion of Infusion's bootstrap is collapsed back into its script. The page is
// written in the form in which hydrate.js reads it, so that hydrating it again writes the same hydrated page. What
// hydration did is recorded by the attribute `data-fluid-hydrated` - see fluid.markHydration in server-support.js
const parsedArgs = minimist(process.argv.slice(2), {string: ["o"]});

fluid.dehydratedFilename = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    const stem = inputFile.substring(0, lastdotpos);
    return (stem.endsWith("-hydrated") ? stem.substring(0, stem.length - "-hydrated".length) : stem + "-dehydrated") +
        inputFile.substring(lastdotpos);
};

const inFilename = parsedArgs._[0];

if (!inFilename) {
    console.error("Usage: node dehydrate.js <page-hydrated.html> [-o <output.html>]");
    process.exit(1);
}

const outFilename = parsedArgs["o"] || fluid.dehydratedFilename(inFilename);

const dokkument = fluid.serverDocumentParser(fs.readFileSync(inFilename, "utf8"));

const marked = fluid.dehydrateDocument(dokkument);

if (marked === 0) {
    console.error("No marks of hydration found in " + inFilename + " - it was not written by hydrate.js, or was written before it marked its work");
    process.exitCode = 1;
} else {
    fluid.writeFile(outFilename, fluid.serializeDocument(dokkument));
}
