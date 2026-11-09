/* eslint-env node */
"use strict";

// A fetch for node which also serves file: URLs, as the browser's would for a page loaded from a file. Other URLs are
// fetched by node's own fetch, available as a global since node 18
const fs = require("fs");

/**
 * Removes a leading slash from a Windows-style drive path.
 * For example, "/E:/things" becomes "E:/things".
 * Other paths remain unchanged.
 *
 * @param {String} path - The path to normalize
 * @return {String} - The normalized path
 */
const deDrivePath = function (path) {
    return path.replace(/^\/([a-zA-Z]:)/, "$1");
};

module.exports = async function fetchWrapper(url, options) {
    const parsedUrl = new URL(url);
    let togo;
    if (parsedUrl.protocol === "file:") {
        const filePath = deDrivePath(decodeURIComponent(parsedUrl.pathname));
        if (fs.existsSync(filePath)) {
            togo = new Response(await fs.promises.readFile(filePath), {
                status: 200,
                statusText: "OK"
            });
        } else {
            togo = new Response(null, {
                status: 404,
                statusText: "NOT FOUND"
            });
        }
    } else {
        togo = await fetch(url, options);
    }
    return togo;
};
