#!/usr/bin/env node

"use strict";

// Renders the whole site as one component tree, with one beautifulWend.document per page, each rendering into an output
// document of its own (fluid.outputDocumentView), and writes every document which has changed - the multi-document
// counterpart of src/framework/server/hydrate.js in Infusion 6.
//
// Usage: node packages/wend/js/buildSite.js [--infusion ../infusion-6] [-o docs] [--live true]
//     [--verbose true] [--from M] [--limit N]
// The site built is that in the current directory, or that named by WEND_SITE_DIR, as its wend.site.json describes it -
// see site.js.
// --live true keeps the inert records of the SFCs' scripts in each page, from which the page could be made live again.
// Otherwise the build is static, and they are stripped.
// Infusion is that given by --infusion, or else the checkout named for infusion-6 by the site's moduleOverrides.json5,
// as for Infusion's own command-line tools - see bin/boot.js in Infusion 6 - or else the one installed in node_modules.

const fs = require("fs"),
    path = require("path");
const wendSite = require("./site.js"),
    siteModel = require("./siteModel.js"),
    feeds = require("./feeds.js"),
    trace = require("./trace.js");

/**
 * Parse the command line arguments of the form `--name value` or `-n value`
 * @param {String[]} args - The arguments following the script's name
 * @return {Object<String, String>} The values of the arguments keyed by name
 */
const parseArgs = function (args) {
    const togo = {};
    for (let i = 0; i < args.length - 1; i += 2) {
        togo[args[i].replace(/^-+/, "")] = args[i + 1];
    }
    return togo;
};

const parsedArgs = parseArgs(process.argv.slice(2));
const siteDir = wendSite.siteDir;
const overridesFile = "moduleOverrides.json5";

/**
 * Read the overrides of the modules of the site, if it has any - parsing the subset of JSON5 in which such a file is
 * written, JSON together with comments and trailing commas, as Infusion's FluidBoot.js does, since Infusion's own
 * JSON5 reader is not reachable before Infusion is located
 * @param {String} dir - The directory holding the site's package.json
 * @return {Object[]} The entries of its moduleOverrides.json5, each with members `moduleName` and `baseDir` - the
 * latter resolved to an absolute path - or an empty array if it has none
 */
const readOverrides = function (dir) {
    const file = path.join(dir, overridesFile);
    let togo = [];
    if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, "utf8");
        // Comments are removed only outside strings, so that a string holding "//" is kept whole
        const uncommented = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string || "");
        togo = JSON.parse(uncommented.replace(/,(\s*[\]}])/g, "$1")).map(entry => ({
            moduleName: entry.moduleName,
            baseDir: path.resolve(dir, entry.baseDir)
        }));
    }
    return togo;
};

/**
 * Locate the checkout of Infusion 6 with which the site is built
 * @param {String|undefined} given - The checkout given by --infusion, if any
 * @param {Object[]} overrides - The site's overrides, as read by `readOverrides`
 * @return {String} The absolute path of the checkout
 */
const locateInfusion = function (given, overrides) {
    const override = overrides.find(entry => entry.moduleName === "infusion-6");
    let togo;
    if (given) {
        togo = path.resolve(given);
    } else if (override) {
        togo = override.baseDir;
    } else {
        togo = path.dirname(require.resolve("infusion-6/package.json", {paths: [siteDir]}));
    }
    return togo;
};

const overrides = readOverrides(siteDir);
const infusionDir = locateInfusion(parsedArgs.infusion, overrides);
const outDir = path.resolve(parsedArgs.o ?? path.join(siteDir, "docs"));

// Infusion logs copiously to the console whilst rendering - keep the console for this script's own report
const report = console.log;
if (!parsedArgs.verbose) {
    console.log = () => {};
}
const fluid = require(infusionDir);
fluid.setLogging(!!parsedArgs.verbose);

/**
 * Strip from a rendered document the material which is only of use for making it live again - the inert records of the
 * scripts of its SFCs. The record of the site's root, by which the page recognises its own
 * location, is kept: it is a few bytes, and Infusion resolves the page's site-absolute URLs against it as it renders,
 * as it would again were the page made live
 * @param {Document} dokkument - The rendered document
 */
const stripForStatic = function (dokkument) {
    // Scripts marked fluid-client keep the marker, which browsers ignore, so that the page as built is the page its
    // component tree renders once booted over it
    dokkument.querySelectorAll("script").forEach(script => {
        if (fluid.classifyScriptNode(script) === "injection") {
            script.remove();
        }
    });
};

/**
 * List the HTML files beneath a directory, recursively
 * @param {String} dir - The directory
 * @return {String[]} Their absolute paths
 */
const listHtmlFiles = function (dir) {
    return fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ?
        listHtmlFiles(path.join(dir, entry.name)) : entry.name.endsWith(".html") ? [path.join(dir, entry.name)] : []) : [];
};

/**
 * Remove HTML files left in the publish directory by an earlier build which this build neither wrote nor copied, e.g.
 * the page of a content file since renamed
 * @param {String[]} staticFiles - The static files copied into the publish directory, by their paths within it
 * @param {String[]} rendered - The files of the documents rendered by this build
 */
const pruneStale = function (staticFiles, rendered) {
    const keep = new Set([...rendered, ...staticFiles.filter(file => file.endsWith(".html")).map(file => path.join(outDir, file))]);
    listHtmlFiles(outDir).filter(file => !keep.has(file)).forEach(file => {
        fs.rmSync(file);
        report("Removed stale " + path.relative(outDir, file));
    });
};

/**
 * Index the output paths of the site's documents by their URLs, with which they are created - see beautifulWend.document
 * @param {Object} model - The site's model, as loaded by siteModel.load
 * @return {Map<String, String>} The path of each page's and alias's output file relative to the publish directory, e.g.
 * "/post/x/index.html", keyed by its permalink
 */
const outputPathsByPermalink = function (model) {
    return new Map([...model.pages, ...model.aliases].map(record => [record.permalink, record.outputPath]));
};

const main = async function () {
    // The site's complement of files - its own, overlaying those of its bases and its modules' static files - see site.js
    const complement = wendSite.merge(fluid);
    wendSite.sites.filter(one => one.base).forEach(one => report("Inheriting from base " + (one.base.repo || wendSite.rel(one.dir)) + ": " +
        Object.values(complement).filter(file => file.site === one).length + " files"));
    wendSite.shadowed.forEach(file => report("The site's " + file + " takes the place of a base's"));
    // The host document holds no markup of its own - it only declares the modules and SFC imports
    // Each module named by the overrides, and Infusion, has its files read from its checkout, wherever site.html
    // locates it
    // The site's modules are read from the directories wend.site.json names, so that a host document inherited from a
    // base, whose relative paths lead to node_modules which only the site built has, finds them - see site.js
    const moduleSources = {...wendSite.modules, ...Object.fromEntries(overrides.map(entry => [entry.moduleName, entry.baseDir]))};
    moduleSources["infusion-6"] = infusionDir;
    const hostDocument = fluid.loadAndBootDocument(wendSite.host, {moduleSources});
    // The site's forks of its modules' SFCs stand in place of the modules' own - each is defined from the fork's text
    // before any is demanded, so that the module's own is never read - see site.js
    // A base's forks are inherited as any of its files are, the site's own taking their place
    wendSite.list("override").filter(file => file.endsWith(".vue")).forEach(file => {
        const [moduleId, ...within] = file.split("/");
        const forked = wendSite.modules[moduleId] && path.join(wendSite.modules[moduleId], ...within);
        const fork = wendSite.resolve("override/" + file);
        if (forked && fs.existsSync(forked)) {
            const layer = trace.layerOfFile(file);
            fluid.loadSFCText(layer, fs.readFileSync(fork, "utf8"));
            report("Using the fork " + wendSite.rel(fork) + " for " + layer);
        } else {
            // e.g. a fork of a file since renamed, which would otherwise silently stand for nothing
            report("Ignoring the fork " + wendSite.rel(fork) + ", which forks no file of its modules");
        }
    });
    const fullModel = siteModel.load(siteDir);
    // --from M --limit N renders just N pages starting from the Mth, e.g. for debugging the theme
    const from = +(parsedArgs.from ?? 0);
    const model = parsedArgs.limit || parsedArgs.from ? {...fullModel, pages: fullModel.pages.slice(from, from + +(parsedArgs.limit ?? Infinity))} : fullModel;

    // Hugo's static files - the theme's, overlaid by the bases', overlaid by the site's
    const staticFiles = wendSite.list("static");
    staticFiles.forEach(file => {
        const target = path.join(outDir, file);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.copyFileSync(wendSite.resolve("static/" + file), target);
    });

    // Every update is recorded, so that the trace of each document may be formed from the cell graph - see trace.js
    const recorder = fluid.cell.recordUpdates();
    // The creator functions of the layers live in Infusion's V8 context rather than node's global
    // wend.json is a patch of the site's members - its `config` amongst them
    const site = fluid.initFreeComponent(wendSite.root, {
        ...siteModel.patchOptions(model.patch),
        pages: {$reactiveRoot: model.pages},
        aliases: {$reactiveRoot: model.aliases},
        data: {$reactiveRoot: model.data}
    });

    Object.entries(feeds.files(fullModel)).forEach(([outputPath, text]) => fluid.writeFile(path.join(outDir, outputPath), text));

    // Each document is created at its page's URL, and written to the file of the page at that URL
    const outputPaths = outputPathsByPermalink(fullModel);
    const outputPathOf = function (record) {
        const outputPath = outputPaths.get(record.location);
        if (outputPath === undefined) {
            throw new Error("No page is at the location of output document " + record.location);
        }
        return outputPath;
    };
    // Each page with a source of its own advertises it, and the trace, to an editing client - see trace.js
    const editing = JSON.parse(fs.readFileSync(wendSite.editing, "utf8"));
    const sources = {...siteModel.hashSources(siteDir), ...trace.framingHashes(editing)};
    const pagesByPermalink = new Map(fullModel.pages.map(page => [page.permalink, page]));
    const rendererScripts = trace.publishRenderer(siteDir, outDir);
    trace.publishPreviewWorker(outDir);
    const migration = trace.publishMigration(siteDir, outDir, infusionDir, fluid.bootRecord);
    // The widgets of static/sfc are loaded, so that content holding them renders them, and every one of them must run
    // in the browser - those reaching fluid.topLevelWidget are offered for insertion by an editing client
    const widgetFiles = trace.widgetFiles(siteDir);
    // An SFC's layer is defined once it is demanded - each is bound into the host document at once, as PTF binds a
    // pasted one, and the widgets are listed once the documents have settled, as each page's provenance is written
    widgetFiles.forEach(widget => {
        fluid.loadSFCText(widget.layer, fs.readFileSync(wendSite.resolve("static/" + trace.widgetDir + "/" + widget.file), "utf8"));
        fluid.subscribeDocToInjections(widget.layer, hostDocument);
    });
    Object.defineProperty(migration, "widgets", {enumerable: true, get: () => {
        migration.widgetList = migration.widgetList || widgetFiles.filter(widget => fluid.ptf.layerAncestors(widget.layer).has("fluid.topLevelWidget"));
        return migration.widgetList;
    }});
    const bootLayers = [...editing.bootLayers || [], ...widgetFiles.map(widget => widget.layer)];
    const outcome = await fluid.writeOutputDocumentsWhenSettled(record => path.join(outDir, outputPathOf(record)), record => {
        if (!parsedArgs.live) {
            stripForStatic(record.dokkument);
        }
        const page = pagesByPermalink.get(record.location);
        const provenance = page && trace.provenanceRecord(page, editing, sources, rendererScripts, migration);
        if (provenance) {
            trace.insertProvenance(record.dokkument, provenance);
        }
        if (page && trace.needsBoot(page, bootLayers)) {
            trace.insertBoot(record.dokkument, page, migration);
        }
    });
    recorder.stop();
    // Only a build which rendered every page writes its traces and prunes what it did not write - one which failed would
    // otherwise remove every page as stale, and leave traces from which the next build could verify nothing
    const complete = outcome.unready.length === 0 && fluid.outputDocuments.get().length > 0;
    if (complete && !parsedArgs.limit && !parsedArgs.from) {
        const infusionVersion = JSON.parse(fs.readFileSync(path.join(infusionDir, "package.json"), "utf8")).version;
        const formed = trace.formTraces(fluid, recorder, fullModel, infusionVersion, {editing, rendererScripts, migration});
        const buildTraceFile = path.join(outDir, trace.buildTraceFile);
        const previous = fs.existsSync(buildTraceFile) ? JSON.parse(fs.readFileSync(buildTraceFile, "utf8")).documents : {};
        const comparison = trace.compareTraces(previous, formed);
        report(`Traces: ${comparison.unchanged.length} documents' inputs unchanged since the last build, ${comparison.changed.length} changed, ${comparison.added.length} new`);
        if (parsedArgs.verbose) {
            Object.entries(comparison.differences).forEach(([location, keys]) => report("  " + location + ": " + keys.slice(0, 5).join(", ") +
                (keys.length > 5 ? ", ..." : "")));
        }
        // Each page's slice of the model is written beside it, and the trace written without them
        const pagesByPermalink = new Map(fullModel.pages.map(page => [page.permalink, page]));
        Object.entries(formed).forEach(([location, documentTrace]) => {
            const page = pagesByPermalink.get(location);
            if (page && documentTrace.pageModel) {
                fluid.writeFile(path.join(outDir, trace.pageModelPath(page.outputPath)), JSON.stringify(documentTrace.pageModel) + "\n");
            }
            delete documentTrace.pageModel;
        });
        fluid.writeFile(buildTraceFile, JSON.stringify({version: 1, infusion: infusionVersion, documents: formed}, null, 1) + "\n");
        const built = trace.make({
            formed,
            model: fullModel,
            sources,
            template: trace.templateHash(siteDir, infusionVersion),
            infusionVersion,
            commit: process.env.GITHUB_SHA,
            assets: trace.assetPaths(),
            staticFiles: trace.staticHashes(),
            outDir
        });
        fluid.writeFile(path.join(outDir, trace.traceFile), JSON.stringify(built, null, 2) + "\n");
        pruneStale(staticFiles, fluid.outputDocuments.get().map(record => path.join(outDir, outputPathOf(record))));
    } else if (!complete) {
        report("The build is incomplete - its traces are not written, and nothing is pruned");
    }
    report(`Wrote ${outcome.written.length} pages to ${outDir}, ${outcome.unchanged.length} unchanged`);
    if (outcome.unready.length > 0) {
        console.error(`${outcome.unready.length} pages were not ready:`);
        outcome.unready.forEach(record => console.error("  " + record.location + ": " + fluid.renderUnavailable(record.readiness)));
        process.exitCode = 1;
    }
    if (fluid.outputDocuments.get().length === 0) {
        console.error("No pages were rendered - unavailable components: ", JSON.stringify(fluid.unavailableComponents.get()));
        process.exitCode = 1;
    }
    // The site is not destroyed - the process is about to exit, and tearing down so large a tree is costly
    return site;
};

let finished = false;

main().then(() => {
    finished = true;
}, error => {
    console.error(error);
    process.exitCode = 1;
});

// node exits once no I/O or timer is outstanding - if the pages have not been written by then, the graph is
// deadlocked on effects which can never complete
process.on("exit", function () {
    if (!finished && process.exitCode !== 1) {
        console.error("Exiting without writing pages - pending effects: ",
            fluid.cell.pendingEffects().map(effect => effect.name), "\nunavailable components: ",
            JSON.stringify(fluid.unavailableComponents.get()));
        process.exitCode = 1;
    }
});
