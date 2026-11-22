/* eslint-env node */
// Bundles fluid-lint, with the parts of CodeMirror 6 its editor uses, as the browser global `fluidLint`, into Infusion's
// src/lib/fluid-lint/fluid-lint.js - which Infusion's live examples load, e.g. those of its documentation. Run with
// `npm run build` in this package, which first regenerates the parser of grammar/fluid-runes.grammar.

import path from "path";
import {fileURLToPath} from "url";
import esbuild from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));

esbuild.build({
    entryPoints: [path.join(dir, "src/codemirror.js")],
    bundle: true,
    format: "iife",
    globalName: "fluidLint",
    minify: true,
    legalComments: "inline",
    target: "es2020",
    outfile: path.join(dir, "../../src/lib/fluid-lint/fluid-lint.js")
}).then(() => console.log("Wrote src/lib/fluid-lint/fluid-lint.js"), error => {
    console.error(error);
    process.exitCode = 1;
});
