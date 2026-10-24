/* eslint-env node */
"use strict";
// Census of the components of the ponder build, counted by the subtree of their page in which they lie - see
// a-scratch/reports/component-census.md
//
// Usage: node a-scratch/census/subtreeCensus.js <infusionDir> <ponderDir> <outDir> <reportFile>
// e.g. node a-scratch/census/subtreeCensus.js . ../ponder-infusion /tmp/census-out subtrees.json
// The site is built into <outDir>, and the census written as JSON to <reportFile>
const path = require("path"), fs = require("fs");
const infusionDir = path.resolve(process.argv[2]), siteDir = path.resolve(process.argv[3]), outFile = process.argv[5];
const fluid = require(infusionDir);
process.on("exit", () => {
    const shadows = Object.values(fluid.globalInstantiator.pathToComponent);
    const bySubtree = {}, perDoc = {};
    shadows.forEach(shadow => {
        const m = /documents\.(\d+)(?:\.([^.]+))?/.exec(shadow.path);
        const subtree = m ? (m[2] || "(document)") : shadow.path.replace(/\d+/g, "#");
        bySubtree[subtree] = (bySubtree[subtree] || 0) + 1;
        if (m) {
            perDoc[m[1]] = (perDoc[m[1]] || 0) + 1;
        }
    });
    const docCounts = Object.values(perDoc).sort((a, b) => a - b);
    // The components none of whose own records hold a cell or an IL reference or directive at their top level
    let staticViews = 0;
    shadows.forEach(shadow => {
        const records = shadow.mergeRecords || [];
        const own = records.filter(r => !["def", "defParents"].includes(r.mergeRecordType) && fluid.isPlainObject(r.layer, true));
        const hasCell = JSON.stringify(own.map(r => Object.values(r.layer).map(v => v && v._observers ? "CELL" : typeof v === "string" && (fluid.isILReference(v) || v.startsWith("$")) ? "DYN" : "")));
        if (!/CELL|DYN/.test(hasCell)) {
            staticViews++;
        }
    });
    fs.writeFileSync(outFile, JSON.stringify({bySubtree, documents: docCounts.length, perDocMin: docCounts[0], perDocMedian: docCounts[docCounts.length >> 1],
        perDocMax: docCounts[docCounts.length - 1], ownRecordsFreeOfCellsAndReferences: staticViews}, null, 1));
});
process.argv = [process.argv[0], path.join(siteDir, "infusion/js/buildSite.js"), "--infusion", infusionDir, "-o", process.argv[4]];
require(path.join(siteDir, "infusion/js/buildSite.js"));
