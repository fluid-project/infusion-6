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

fluid.makeDocumentWriter = function (dokkument, outFilename) {
    return fluid.effect( () => {
        fluid.writeDocument(outFilename, dokkument);
    }, [fluid.documentInjections.get(dokkument).injectionsComplete, fluid.scriptLoadingIdle, fluid.unavailableComponents]);
};

const inFilename = parsedArgs._[0];

const outFilename = parsedArgs["o"] || fluid.hydratedFilename(inFilename);

const dokkument = fluid.loadAndBootDocument(path.resolve(inFilename));

fluid.makeDocumentWriter(dokkument, outFilename);

process.on("exit", function () {
    console.log("About to exit");
});
