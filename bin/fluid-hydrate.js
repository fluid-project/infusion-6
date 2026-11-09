#!/usr/bin/env node
/* eslint-env node */
"use strict";

// Run Infusion 6's hydrate tool for the site in the current directory - see boot.js
require("./boot.js").run("hydrate", process.argv.slice(2));
