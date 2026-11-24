"use strict";

// Zips the "Edit in Infusion" extension into dist/extension, which git and npm ignore, under two names:
//  - edit-in-infusion-<version>.zip, <version> being that of its manifest.json - for the Chrome Web Store, see
//    extension/edit-in-infusion/STORE.md
//  - edit-in-infusion.zip - the asset of its GitHub release, made by scripts/publishOutdated.js, whose name is the same
//    in every release so that https://github.com/fluid-project/infusion-6/releases/latest/download/edit-in-infusion.zip
//    is always the latest
// The zips hold the contents of extension/edit-in-infusion, manifest.json at their root, leaving out its markdown notes.
// Run with: npm run zip:extension

const fs = require("fs");
const path = require("path");
const fflate = require("fflate");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension", "edit-in-infusion");
const outDir = path.join(root, "dist", "extension");

/**
 * Collect the files of a directory, recursively, for zipping - leaving out markdown files
 * @param {String} dir - The directory
 * @return {Object<String, Uint8Array>} The contents of each file, keyed by its path relative to `dir`, with "/"
 */
const collect = function (dir) {
    const files = {};
    fs.readdirSync(dir, {recursive: true, withFileTypes: true})
        .filter(entry => entry.isFile() && !entry.name.endsWith(".md"))
        .forEach(entry => {
            const full = path.join(entry.parentPath, entry.name);
            files[path.relative(dir, full).split(path.sep).join("/")] = fs.readFileSync(full);
        });
    return Object.fromEntries(Object.keys(files).sort().map(key => [key, files[key]]));
};

/**
 * Read the extension's manifest
 * @return {Object} The parsed manifest.json
 */
const readManifest = function () {
    return JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
};

/**
 * Zip the extension into dist/extension, replacing whatever was there
 * @return {Object} `{versioned, release}`, the absolute paths of the zip named by version and of the release's asset
 */
const zipExtension = function () {
    const manifest = readManifest();
    if (manifest.fluid_testing) {
        throw new Error("The extension's manifest.json bears fluid_testing, which only the scenario tests' copy may - see STORE.md");
    } else {
        const zipped = fflate.zipSync(collect(extensionDir), {level: 9});
        const togo = {
            versioned: path.join(outDir, "edit-in-infusion-" + manifest.version + ".zip"),
            release: path.join(outDir, "edit-in-infusion.zip")
        };
        fs.rmSync(outDir, {recursive: true, force: true});
        fs.mkdirSync(outDir, {recursive: true});
        Object.values(togo).forEach(file => {
            fs.writeFileSync(file, zipped);
            console.log("Wrote " + path.relative(root, file));
        });
        return togo;
    }
};

module.exports = {zipExtension, readManifest};

if (require.main === module) {
    zipExtension();
}
