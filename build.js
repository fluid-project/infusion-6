/* eslint-env node */
"use strict";

const cpy = require("cpy");

// Copy node_modules structure but skip all files except package.json files
cpy("node_modules/@preact/signals-core/dist/signals-core.min.js", "src/lib/preact-signals/").then();
