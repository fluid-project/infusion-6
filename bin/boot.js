/* eslint-env node */
"use strict";

// The boot of Infusion 6's command-line tools as run by a site which depends on Infusion 6 through npm, e.g. from the
// scripts of its package.json, as
//     fluid-hydrate docs/story/index.html -o docs/story/index.html
//     fluid-dehydrate docs/story/index.html -o page.html
//     fluid-copyout static/story/index-dev.html
// Each is run from the directory holding the site's package.json. If that directory holds a moduleOverrides.json5 - an
// array of {moduleName, baseDir}, with each baseDir relative to the file, naming checkouts of modules to be used in
// place of those installed - an entry for "infusion-6" names the checkout of Infusion 6 whose tool is run, in place of
// the one installed beside this file. fluid-copyout is also given the file as its --sources, so that it reads the
// files of every module named there from its checkout - see copyOut.js.
// This file reaches the tools of whichever Infusion 6 it runs only by their paths within it, so that it serves any
// version of Infusion 6 holding them there. It could equally be published as a module of its own.

const fs = require("fs"),
    path = require("path"),
    childProcess = require("child_process");

const boot = {};

// The tools, by the path of each within a checkout of Infusion 6
boot.tools = {
    hydrate: "src/framework/server/hydrate.js",
    dehydrate: "src/framework/server/dehydrate.js",
    copyout: "src/framework/server/copyOut.js"
};

boot.overridesFile = "moduleOverrides.json5";

/**
 * Read the overrides of the modules of a site, if it has any
 * @param {String} siteDir - The directory holding the site's package.json
 * @return {Object[]} The entries of its moduleOverrides.json5, each with members `moduleName` and `baseDir` - the
 * latter resolved to an absolute path - or an empty array if it has none
 */
boot.readOverrides = function (siteDir) {
    const file = path.join(siteDir, boot.overridesFile);
    let togo = [];
    if (fs.existsSync(file)) {
        const JSON5 = require("json5");
        togo = JSON5.parse(fs.readFileSync(file, "utf8")).map(entry => ({
            moduleName: entry.moduleName,
            baseDir: path.resolve(siteDir, entry.baseDir)
        }));
    }
    return togo;
};

/**
 * Find the checkout of Infusion 6 whose tools are run - that named for "infusion-6" by the site's overrides, or else
 * the one holding this file
 * @param {Object[]} overrides - The site's overrides, as read by `boot.readOverrides`
 * @return {String} The absolute path of the checkout
 */
boot.infusionDir = function (overrides) {
    const override = overrides.find(entry => entry.moduleName === "infusion-6");
    return override ? override.baseDir : path.resolve(__dirname, "..");
};

/**
 * Run one of Infusion 6's tools for the site in the current directory, exiting with its status
 * @param {String} tool - The name of the tool - a key of `boot.tools`
 * @param {String[]} args - The arguments given to it
 */
boot.run = function (tool, args) {
    const siteDir = process.cwd();
    const overrides = boot.readOverrides(siteDir);
    const script = path.join(boot.infusionDir(overrides), boot.tools[tool]);
    const sources = tool === "copyout" && overrides.length > 0 && !args.includes("--sources") ?
        ["--sources", path.join(siteDir, boot.overridesFile)] : [];
    if (fs.existsSync(script)) {
        const result = childProcess.spawnSync(process.execPath, [script, ...args, ...sources], {stdio: "inherit"});
        process.exitCode = result.status === null ? 1 : result.status;
    } else {
        console.error(`No ${tool} tool found at ${script} - is the checkout of infusion-6 named by ${boot.overridesFile} correct?`);
        process.exitCode = 1;
    }
};

module.exports = boot;
