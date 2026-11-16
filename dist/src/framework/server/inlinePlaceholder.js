/* eslint-env node */
"use strict";

// Write the material of a placeholder into a Single File Component as a top-level <placeholder> block, replacing any
// block of the same name, so that the SFC's layer may name it as placeholder://{layerName}/{name} - see FLUID-7032 and
// fluid.registerSFCPlaceholders in FluidView.js. A placeholder is as minimal as possible, and so is always held inline,
// travelling with its SFC wherever it is copied. Material which is not text, or which holds markup which would be read
// as the block's own, is encoded in base64, wrapped over lines of the SFC.
//
// Usage: node inlinePlaceholder.js <sfc.vue> <name> <file> [--type <media type>] [--encoding base64|text] [-n]
//   --type      The media type of the material, by default determined from the file's extension - see
//               fluid.inlinePlaceholder.mediaTypes - or else "application/octet-stream"
//   --encoding  Force the material to be written as base64 or as text - by default it is written as text if it is
//               valid UTF-8 holding no NUL character and no "<", else as base64
//   -n          Dry run - report what would be written, without writing it

const fs = require("fs"),
    path = require("path"),
    minimist = require("minimist");

const fluid = {inlinePlaceholder: {}};

// Media types of placeholder material by the extension of the file holding it
fluid.inlinePlaceholder.mediaTypes = {
    ".json": "application/json",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".html": "text/html"
};

// The length of each line of material encoded as base64
fluid.inlinePlaceholder.lineLength = 100;

// The indentation of each line of a block's material
fluid.inlinePlaceholder.indent = "    ";

/**
 * Determine whether material may be written as text - it is valid UTF-8, and holds no NUL character, nor any "<" which
 * might be read as markup within the block
 * @param {Buffer} bytes - The material
 * @return {Boolean} `true` if the material may be written as text
 */
fluid.inlinePlaceholder.isText = function (bytes) {
    let togo;
    try {
        const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
        togo = !text.includes("\0") && !text.includes("<");
    } catch (e) {
        togo = false;
    }
    return togo;
};

/**
 * Escape a String for use within a regular expression
 * @param {String} string - The String
 * @return {String} The escaped String
 */
fluid.inlinePlaceholder.escapeRegex = string => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Write the <placeholder> block holding some material
 * @param {String} name - The name of the placeholder
 * @param {Buffer} bytes - The material
 * @param {String} type - Its media type
 * @param {String} encoding - "base64" or "text"
 * @return {String} The block
 */
fluid.inlinePlaceholder.block = function (name, bytes, type, encoding) {
    const indent = fluid.inlinePlaceholder.indent;
    let attrs = `name="${name}" type="${type}"`;
    let body;
    if (encoding === "base64") {
        attrs += " encoding=\"base64\"";
        const encoded = bytes.toString("base64");
        const lines = [];
        for (let i = 0; i < encoded.length; i += fluid.inlinePlaceholder.lineLength) {
            lines.push(indent + encoded.substring(i, i + fluid.inlinePlaceholder.lineLength));
        }
        body = lines.join("\n");
    } else {
        body = bytes.toString("utf8").trim().split("\n").map(line => indent + line).join("\n");
    }
    return `<placeholder ${attrs}>\n${body}\n</placeholder>`;
};

/**
 * Write a placeholder's block into the text of an SFC, replacing any block of the same name, or else appending it
 * @param {String} sfcText - The text of the SFC
 * @param {String} name - The name of the placeholder
 * @param {String} block - Its block, as written by fluid.inlinePlaceholder.block
 * @return {String} The text of the SFC holding the block
 */
fluid.inlinePlaceholder.write = function (sfcText, name, block) {
    const existing = new RegExp(`<placeholder\\b[^>]*\\bname="${fluid.inlinePlaceholder.escapeRegex(name)}"[^>]*>[\\s\\S]*?</placeholder>`);
    let togo;
    if (existing.test(sfcText)) {
        togo = sfcText.replace(existing, () => block);
    } else {
        togo = sfcText.replace(/\s*$/, "") + "\n" + block + "\n";
    }
    return togo;
};

/**
 * Write the material of a placeholder from a file into an SFC
 * @param {Object} options - The options
 * @param {String} options.sfc - The path of the SFC
 * @param {String} options.name - The name of the placeholder
 * @param {String} options.file - The path of the file holding its material
 * @param {String} [options.type] - Its media type
 * @param {String} [options.encoding] - "base64" or "text"
 * @param {Boolean} [options.dryRun] - `true` if nothing is to be written
 * @return {Object} Members `changed`, `true` if the SFC's text differs from what it held, `encoding` and `type`
 */
fluid.inlinePlaceholder.run = function (options) {
    const bytes = fs.readFileSync(options.file);
    const type = options.type || fluid.inlinePlaceholder.mediaTypes[path.extname(options.file).toLowerCase()] || "application/octet-stream";
    const encoding = options.encoding || (fluid.inlinePlaceholder.isText(bytes) ? "text" : "base64");
    const sfcText = fs.readFileSync(options.sfc, "utf8");
    const written = fluid.inlinePlaceholder.write(sfcText, options.name, fluid.inlinePlaceholder.block(options.name, bytes, type, encoding));
    const changed = written !== sfcText;
    if (changed && !options.dryRun) {
        fs.writeFileSync(options.sfc, written);
    }
    console.log(`${changed ? (options.dryRun ? "Would write" : "Wrote") : "Unchanged:"} placeholder "${options.name}" `
        + `from ${options.file} (${bytes.length} bytes, ${type}, as ${encoding}) into ${options.sfc}`);
    return {changed, encoding, type};
};

module.exports = fluid.inlinePlaceholder;

if (require.main === module) {
    const parsedArgs = minimist(process.argv.slice(2), {string: ["type", "encoding"], boolean: ["n"]});
    const [sfc, name, file] = parsedArgs._;
    if (!sfc || !name || !file || parsedArgs.encoding && !["base64", "text"].includes(parsedArgs.encoding)) {
        console.error("Usage: node inlinePlaceholder.js <sfc.vue> <name> <file> [--type <media type>] [--encoding base64|text] [-n]");
        process.exitCode = 1;
    } else {
        fluid.inlinePlaceholder.run({sfc, name, file, type: parsedArgs.type, encoding: parsedArgs.encoding, dryRun: parsedArgs.n});
    }
}
