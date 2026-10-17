/* eslint-env node */
"use strict";

const path = require("path");

// Keep the captive browser downloaded by puppeteer within the checkout so that browser tests are self-contained
module.exports = {
    cacheDirectory: path.join(__dirname, "node_modules", ".cache", "puppeteer")
};
