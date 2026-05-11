/* eslint-env node */
"use strict";

const fetch = require("node-fetch"); // v2
const { Response } = fetch;
const fs = require("fs");

/**
 * Removes a leading slash from a Windows-style drive path.
 * For example, "/E:/things" becomes "E:/things".
 * Other paths remain unchanged.
 *
 * @param {String} path - The path to normalize
 * @return {String} - The normalized path
 */
const deDrivePath = function(path) {
    return path.replace(/^\/([a-zA-Z]:)/, "$1");
};

module.exports = async function fetchWrapper(url, options) {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol === "file:") {
        const filePath = deDrivePath(decodeURIComponent(parsedUrl.pathname));

        if (!fs.existsSync(filePath)) {
            return new Response(null, {
                status: 404,
                statusText: "NOT FOUND"
            });
        }

        // Construct a readable stream – valid Response body type in node-fetch@2
        const stream = fs.createReadStream(filePath);

        return new Response(stream, {
            status: 200,
            statusText: "OK"
            // node-fetch@2 doesn't support explicit `url` here, but we can set it after
        });
    } else {
        // Normal HTTP fetch
        return fetch(url, options);
    }
};
