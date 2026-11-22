/* eslint-env node */
"use strict";

// Bundles CodeMirror 6 for the "Edit in Infusion" extension into edit-in-infusion/lib/codemirror6.js, the global
// `fluidCodeMirror`. A Manifest V3 extension may load no remote code, so the bundle is vendored - run this, with
// `npm install` in this directory, to rebuild it after changing entry.js or the versions in package.json.

const path = require("path");
const esbuild = require("esbuild");

esbuild.build({
    entryPoints: [path.join(__dirname, "entry.js")],
    bundle: true,
    format: "iife",
    globalName: "fluidCodeMirror",
    minify: true,
    legalComments: "inline",
    target: "chrome110",
    outfile: path.join(__dirname, "../edit-in-infusion/lib/codemirror6.js")
}).then(() => console.log("Wrote edit-in-infusion/lib/codemirror6.js"), error => {
    console.error(error);
    process.exitCode = 1;
});
