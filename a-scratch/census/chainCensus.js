/* eslint-env node */
"use strict";
// Census of the components of the ponder build, grouped by their chains of layer definitions - see
// a-scratch/reports/component-census.md
//
// Usage: node a-scratch/census/chainCensus.js <infusionDir> <ponderDir> <outDir> <reportFile>
// e.g. node a-scratch/census/chainCensus.js . ../ponder-infusion /tmp/census-out census.json
// The site is built into <outDir>, and the census written as JSON to <reportFile>
const path = require("path"), fs = require("fs");
const infusionDir = path.resolve(process.argv[2]), siteDir = path.resolve(process.argv[3]), outFile = process.argv[5];
const fluid = require(infusionDir);

const ids = new WeakMap();
let nextId = 0;

/**
 * Allocate, or retrieve, a stable numeric id for an object
 * @param {Object} o - The object
 * @return {Number} Its id
 */
const idOf = function (o) {
    if (!ids.has(o)) {
        ids.set(o, ++nextId);
    }
    return ids.get(o);
};

/**
 * Determine whether a value is a `fluid.cell`
 * @param {Any} v - The value
 * @return {Boolean} `true` if it is a cell
 */
const isCell = v => !!v && typeof v === "object" && "_value" in v && "_observers" in v;

/**
 * Describe a value to a bounded depth, so that values of the same shape and content compare equal. Cells, functions and
 * objects beyond the depth are described by kind or identity
 * @param {Any} value - The value
 * @param {Number} [depth=0] - The depth reached
 * @return {String} The description
 */
const describe = function (value, depth = 0) {
    let togo;
    if (isCell(value)) {
        togo = "<cell>";
    } else if (typeof value === "function") {
        togo = "<fn " + (value.name || "anon") + ">";
    } else if (Array.isArray(value)) {
        togo = depth > 3 ? "<array#" + idOf(value) + ">" : "[" + value.map(v => describe(v, depth + 1)).join(",") + "]";
    } else if (value && typeof value === "object") {
        if (fluid.isPlainObject(value, true) && depth <= 3) {
            togo = "{" + Object.keys(value).map(k => k + ":" + describe(value[k], depth + 1)).join(",") + "}";
        } else {
            togo = "<obj#" + idOf(value) + ">";
        }
    } else {
        togo = JSON.stringify(value);
    }
    return togo;
};

/**
 * Classify the leaves of a layer's material as literals, IL references, directives or reactive roots
 * @param {Any} value - The material
 * @param {Object<String, Number>} counts - The counts of each class, incremented in place
 * @param {Number} [depth=0] - The depth reached
 * @return {Object<String, Number>} The counts
 */
const classify = function (value, counts, depth = 0) {
    if (typeof value === "string") {
        if (fluid.isILReference(value)) {
            counts.reference++;
        } else if (/^\$\w+:/.test(value)) {
            counts.directive++;
        } else {
            counts.literal++;
        }
    } else if (fluid.isPlainObject(value, true) && depth < 20) {
        if (Object.keys(value).some(k => k.startsWith("$") && k !== "$layers" && k !== "$variety")) {
            if ("$reactiveRoot" in value) {
                counts.reactiveRoot++;
            } else {
                counts.directive++;
            }
        } else {
            Object.keys(value).filter(k => k !== "$layers" && k !== "$variety").forEach(k => classify(value[k], counts, depth + 1));
        }
    } else if (Array.isArray(value)) {
        value.forEach(v => classify(v, counts, depth + 1));
    } else if (value !== undefined) {
        counts.literal++;
    }
    return counts;
};
const freshCounts = () => ({literal: 0, reference: 0, directive: 0, reactiveRoot: 0});

/**
 * Determine the number of entries held in a field of a shadow
 * @param {Any} v - The value of the field
 * @return {Number} The size of a Map or Set, the number of keys of any other object which is not a cell, otherwise 0
 */
const sizeOf = function (v) {
    let togo = 0;
    if (v instanceof Map || v instanceof Set) {
        togo = v.size;
    } else if (v && typeof v === "object" && !isCell(v)) {
        togo = Object.keys(v).length;
    }
    return togo;
};

process.on("exit", () => {
    const shadows = Object.values(fluid.globalInstantiator.pathToComponent);
    const chains = new Map();
    const fieldSizes = {};
    shadows.forEach(shadow => {
        const records = shadow.mergeRecords || [];
        const defs = records.filter(r => r.mergeRecordType === "def");
        const chainKey = defs.map(r => r.mergeRecordName).join(" < ");
        const own = records.filter(r => !["def", "defParents"].includes(r.mergeRecordType) && fluid.isPlainObject(r.layer, true)
            && Object.keys(r.layer).length > 0);
        let chain = chains.get(chainKey);
        if (!chain) {
            const defCounts = freshCounts();
            defs.forEach(r => classify(r.layer, defCounts));
            chain = {chainKey, strongest: defs[defs.length - 1]?.mergeRecordName, n: 0, defLeaves: defCounts, ownSigs: new Map(),
                keyValues: new Map(), ownLeaves: freshCounts(), ownTypes: {}, staticOwn: 0, paths: new Map(), fields: {}};
            chains.set(chainKey, chain);
        }
        chain.n++;
        const ownLeaves = freshCounts();
        own.forEach(r => {
            chain.ownTypes[r.mergeRecordType] = (chain.ownTypes[r.mergeRecordType] || 0) + 1;
            classify(r.layer, ownLeaves);
            Object.keys(r.layer).forEach(key => {
                const k = r.mergeRecordType + "." + key;
                const vals = chain.keyValues.get(k) || new Map();
                const d = describe(r.layer[key]);
                vals.set(d, (vals.get(d) || 0) + 1);
                chain.keyValues.set(k, vals);
            });
        });
        Object.keys(ownLeaves).forEach(k => chain.ownLeaves[k] += ownLeaves[k]);
        if (ownLeaves.reference + ownLeaves.directive + ownLeaves.reactiveRoot === 0) {
            chain.staticOwn++;
        }
        const sig = own.map(r => r.mergeRecordType + ":" + describe(r.layer)).join(" | ");
        chain.ownSigs.set(sig, (chain.ownSigs.get(sig) || 0) + 1);
        const pattern = shadow.path.replace(/\d+/g, "#");
        chain.paths.set(pattern, (chain.paths.get(pattern) || 0) + 1);
        Object.keys(shadow).forEach(field => {
            const s = sizeOf(shadow[field]);
            fieldSizes[field] = fieldSizes[field] || {total: 0, nonEmpty: 0};
            fieldSizes[field].total += s;
            fieldSizes[field].nonEmpty += s > 0 ? 1 : 0;
        });
    });
    const sorted = [...chains.values()].sort((a, b) => b.n - a.n);
    const report = {
        components: shadows.length, cellsCreated: fluid.cell.cellId, chains: chains.size,
        shadowFieldSizes: fieldSizes,
        chains: sorted.map(c => ({
            n: c.n, strongest: c.strongest, chain: c.chainKey, defLeaves: c.defLeaves, ownTypes: c.ownTypes,
            ownLeaves: c.ownLeaves, componentsWithStaticOwnRecords: c.staticOwn, distinctOwnRecords: c.ownSigs.size,
            paths: [...c.paths].sort((a, b) => b[1] - a[1]).slice(0, 4),
            ownKeys: [...c.keyValues].map(([k, vals]) => ({key: k, count: [...vals.values()].reduce((a, b) => a + b, 0),
                distinct: vals.size, top: [...vals].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d, n]) => [d.slice(0, 160), n])}))
        }))
    };
    fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
    console.error("census written", shadows.length, "components", chains.size, "chains", fluid.cell.cellId, "cells");
});
process.argv = [process.argv[0], path.join(siteDir, "infusion/js/buildSite.js"), "--infusion", infusionDir, "-o", process.argv[4]];
require(path.join(siteDir, "infusion/js/buildSite.js"));
