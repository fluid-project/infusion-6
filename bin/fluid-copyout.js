#!/usr/bin/env node
"use strict";

// Run Infusion 6's copyout tool for the site in the current directory - see boot.js
require("./boot.js").run("copyout", process.argv.slice(2));
