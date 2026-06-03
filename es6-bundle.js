/* eslint-env node */
"use strict";

const path = require("path");
const fs = require("fs-extra");

const writeFile = function (filename, data) {
    fs.writeFileSync(filename, data, "utf8");
    const stats = fs.statSync(filename);
    console.log("Written " + stats.size + " bytes to " + filename);
};

/**
 * Bundle a list of .mjs files (and their sibling .d.mts / .d.mts.map files)
 * by concatenation into a single output basename in dist/.
 *
 * @param {String[]} inputs - Absolute or relative paths to the .mjs source files,
 *   in the order they should appear in the bundle.
 * @param {String} outBase - Output basename without extension, e.g. "FluidCell".
 *   Files are written into dist/.
 * @return {void}
 */
function bundle(inputs, outBase) {
    const distDir = "dist";
    fs.mkdirSync(distDir, { recursive: true });

    const inputBaseNames = new Set(inputs.map(p => path.basename(p)));

    // Phase 1 - bundle the .mjs files
    const mjsChunks = [];
    const mapSections = []; // { offset, mapJson, sourcepath }
    let lineOffset = 0;
    let sawUseStrict = false;
    let defaultExportSeen = false;

    for (const input of inputs) {
        const raw = fs.readFileSync(input, "utf8");
        const sibMap = readIfExists(input + ".map");

        // Strip imports that resolve to other files in this bundle
        let stripped = stripInternalImports(raw, inputBaseNames);

        // Collapse repeated "use strict" directives - keep the first
        if (sawUseStrict) {
            stripped = stripped.replace(/^\s*"use strict";\s*\n?/m, "");
        } else if (/^\s*"use strict";/m.test(stripped)) {
            sawUseStrict = true;
        }

        // Drop "export default fluid;" from all but the last chunk; we'll add one at the end
        stripped = stripped.replace(/^\s*export\s+default\s+fluid\s*;\s*\n?/gm, () => {
            defaultExportSeen = true;
            return "";
        });

        // Ensure a trailing newline so the next chunk starts on a fresh line
        if (!stripped.endsWith("\n")) {
            stripped += "\n";
        }

        mjsChunks.push(stripped);
        mapSections.push({
            offset: lineOffset,
            sourcepath: input,
            mapJson: sibMap ? safeJson(sibMap) : null,
            lineCount: countLines(stripped)
        });
        lineOffset += countLines(stripped);
    }

    if (defaultExportSeen) {
        mjsChunks.push("export default fluid;\n");
    }

    const outMjs = path.join(distDir, outBase + ".mjs");
    const finalCode = mjsChunks.join("") + `//# sourceMappingURL=${outBase}.mjs.map\n`;
    writeFile(outMjs, finalCode);

    // Phase 2 - synthesise an aggregate source map.
    // We do not have token-level information; we produce a coarse "section" map
    // that records where in the bundle each input contributes, plus any
    // upstream maps verbatim for tooling that understands "sections".
    const aggregateMap = {
        version: 3,
        file: outBase + ".mjs",
        sections: mapSections.map(section => ({
            offset: { line: section.offset, column: 0 },
            map: section.mapJson || identityMap(section.sourcepath, section.lineCount)
        }))
    };
    writeFile(outMjs + ".map", JSON.stringify(aggregateMap));

    // Phase 3 - bundle the .d.mts declaration files
    const dtsChunks = [];
    const dtsMapSections = [];
    let dtsLineOffset = 0;
    let dtsDefaultSeen = false;

    for (const input of inputs) {
        const dtspath = input.replace(/\.mjs$/, ".d.mts");
        const dtsMappath = dtspath + ".map";
        if (!fs.existsSync(dtspath)) {
            continue;
        }
        let dts = fs.readFileSync(dtspath, "utf8");
        const dtsMap = readIfExists(dtsMappath);

        // Drop import lines pointing at sibling inputs
        dts = stripInternalImports(dts, inputBaseNames);
        // Drop sourceMappingURL trailers - we'll write our own
        dts = dts.replace(/\/\/#\s*sourceMappingURL=.*$/gm, "");
        // Collapse "export default fluid;" to a single trailing copy
        dts = dts.replace(/^\s*export\s+default\s+fluid\s*;\s*\n?/gm, () => {
            dtsDefaultSeen = true;
            return "";
        });
        if (!dts.endsWith("\n")) {
            dts += "\n";
        }
        dtsChunks.push(dts);
        dtsMapSections.push({
            offset: dtsLineOffset,
            sourcepath: dtspath,
            mapJson: dtsMap ? safeJson(dtsMap) : null,
            lineCount: countLines(dts)
        });
        dtsLineOffset += countLines(dts);
    }

    if (dtsDefaultSeen) {
        dtsChunks.push("export default fluid;\n");
    }

    if (dtsChunks.length > 0) {
        const outDts = path.join(distDir, outBase + ".d.mts");
        const finalDts = dtsChunks.join("") + `//# sourceMappingURL=${outBase}.d.mts.map\n`;
        writeFile(outDts, finalDts);

        const dtsAggregateMap = {
            version: 3,
            file: outBase + ".d.mts",
            sections: dtsMapSections.map(section => ({
                offset: { line: section.offset, column: 0 },
                map: section.mapJson || identityMap(section.sourcepath, section.lineCount)
            }))
        };
        writeFile(outDts + ".map", JSON.stringify(dtsAggregateMap));
    }
}

/**
 * Remove import statements whose specifier ends in one of the given basenames.
 * Handles single-line `import X from "./Y.mjs";` forms produced by the converter.
 *
 * @param {String} source - The source text to filter.
 * @param {Set<String>} internalBasenames - Set of basenames considered internal to the bundle.
 * @return {String} Source with internal imports removed.
 */
function stripInternalImports(source, internalBasenames) {
    return source.replace(
        /^\s*import\s+[^;]*?from\s+["']([^"']+)["']\s*;\s*\n?/gm,
        (whole, spec) => {
            const base = path.basename(spec);
            if (internalBasenames.has(base)) {
                return "";
            } else {
                return whole;
            }
        }
    );
}

/**
 * Read a file if it exists, otherwise return null.
 *
 * @param {String} p - path to read.
 * @return {String|null} File contents or null.
 */
function readIfExists(p) {
    if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf8");
    } else {
        return null;
    }
}

/**
 * Parse JSON, returning null on failure rather than throwing.
 *
 * @param {String} text - JSON text.
 * @return {Object|null} Parsed value or null.
 */
function safeJson(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

/**
 * Count lines in a string (number of '\n' characters).
 *
 * @param {String} s - Input.
 * @return {Number} Line count.
 */
function countLines(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        if (s.charAt(i) === "\n") {
            n++;
        }
    }
    return n;
}

/**
 * Synthesise a trivial (empty mappings) source map referencing the original file.
 * Used when no real map is available alongside the input.
 *
 * @param {String} sourcepath - path to the original source.
 * @param {Number} lineCount - Number of lines contributed by this section.
 * @return {Object} A v3 source map object.
 */
function identityMap(sourcepath, lineCount) {
    return {
        version: 3,
        sources: [sourcepath],
        names: [],
        mappings: new Array(lineCount).fill(";").join("")
    };
}

const bundles = {
    "fluid-cell": {
        "outBase": "FluidCell",
        "inFiles": ["src/framework/core/mjs/FluidCore.mjs", "src/framework/core/mjs/FluidSignals.mjs"]
    }
};

// CLI entry: node es6-bundle.js FluidCell src/framework/core/mjs/FluidCore.mjs src/framework/core/mjs/FluidSignals.mjs
if (require.main === module) {
    /*
    const [, , outBase, ...inputs] = process.argv;
    if (!outBase || inputs.length === 0) {
        console.error("Usage: node bundle.js <outBase> <input.mjs> [input.mjs ...]");
        process.exit(1);
    }
    bundle(inputs, outBase);
     */
    const bundleName = process.argv[2];
    const bundleDef = bundles[bundleName];
    if (!bundleDef) {
        console.error("Usage: node es6-bundle.js <bundleName> - supported are ", Object.keys(bundles).join(", "));
    } else {
        bundle(bundleDef.inFiles, bundleDef.outBase);
    }
}

module.exports = { bundle };
