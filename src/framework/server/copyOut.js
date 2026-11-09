/* eslint-env node */
"use strict";

// Copy into a project the files of the modules which one of its pages depends upon, from checkouts of those modules,
// and write the module map through which the page locates them. A page refers to Infusion through its one bootstrap,
// <script src=".../FluidBoot.js">, and declares the module holding it, naming its module map, e.g.
//     <fluid-module id="my-project" src="../" modules="fluid-modules.json">
// Every other reference, within the page or the Single File Components it imports, is relative to the file making it,
// or is a module reference such as %imerss-bioinfo/src/client/sfc/bbea/hortis-beaVizLoader.vue or
// %maplibre-gl/dist/maplibre-gl-dev.js. The page is booted under node, as by hydrate.js, with the files of each module
// read from its checkout - the checkout given by --source, or else the directory where node finds the npm package of
// that name, from the project or any of the checkouts given. So all the Single File Components, scripts, stylesheets
// and data which it demands are discovered, together with whatever those stylesheets refer to. Each module is placed at
// the directory the map already gives it, or else at <vendor>/<module>, its demanded files are copied there, and the
// map is written to locate it. Infusion's own files are copied in the form in which the bootstrap is to be written.
//
// Usage: node copyOut.js <page.html>... --source <module>=<checkout> [--source ...] [--vendor <dir>] [--in-place]
//            [--framework boot|source|built] [-n] [--list] [--hydrate]
//   --source     The checkout of a module - may be given several times, and may also be supplied in a JSON or JSON5
//                file, by --sources <file>, as an array of {moduleName, baseDir} as for moduleOverrides.json5, with
//                baseDir relative to the file
//   --vendor     The directory into which modules not yet located by the map are copied, by default "vendor" beside the
//                module map
//   --in-place   Copy nothing, but write a map locating each module where its source is found - e.g. for a page served
//                from a checkout, whose packages lie in its node_modules
//   --framework  The form of Infusion's bootstrap whose files are copied, and in which it is written by --hydrate -
//                see fluid.writeBootScript in server-support.js. By default "boot"
//   -n           Dry run - report what would change without copying or writing anything
//   --list       List every file which the pages demand
//   --hydrate    Also write each page's hydrated form beside it, as hydrate.js does
//   --ignore-missing  A regular expression matching references to files which may be missing without failing, e.g.
//                those of a stylesheet written for another site - may be given several times
// Files demanded by a page which lie outside any module's directory are not copied, but must exist.

const fs = require("fs"),
    path = require("path"),
    {pathToFileURL, fileURLToPath} = require("url");

const minimist = require("minimist"),
    JSON5 = require("json5");

const fluid = require("../../..");

fluid.registerNamespace("fluid.copyOut");

/**
 * Parse the sources of modules given on the command line
 * @param {Object} parsedArgs - The arguments as parsed by minimist
 * @return {Object<String, String>} Map of module id to the absolute path of its checkout
 */
fluid.copyOut.parseSources = function (parsedArgs) {
    const sources = {};
    if (parsedArgs.sources) {
        const sourcesFile = path.resolve(parsedArgs.sources);
        const entries = JSON5.parse(fs.readFileSync(sourcesFile, "utf8"));
        entries.forEach(({moduleName, baseDir}) => {
            sources[moduleName] = path.resolve(path.dirname(sourcesFile), baseDir);
        });
    }
    [].concat(parsedArgs.source || []).forEach(arg => {
        const eq = arg.indexOf("=");
        if (eq === -1) {
            fluid.fail("--source must be of the form <module>=<checkout>, not " + arg);
        } else {
            sources[arg.substring(0, eq)] = path.resolve(arg.substring(eq + 1));
        }
    });
    return sources;
};

/**
 * Whether a reference within a document or stylesheet is to a local file, rather than e.g. a remote resource, a
 * fragment of the same document or inline data
 * @param {String} ref - The reference
 * @return {Boolean} `true` if the reference is to a local file
 */
fluid.copyOut.isLocalRef = function (ref) {
    return !!ref && !ref.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith("//") && !ref.startsWith("%");
};

/**
 * Collect the URLs of the local files referred to by a booted document - by its scripts, stylesheets, images and
 * imports, whether written in the page itself or injected by its Single File Components, and by the data and
 * placeholders of its components bearing fluid.withPlaceholder
 * @param {Document} dokkument - The booted document
 * @return {String[]} The absolute URLs of the files
 */
fluid.copyOut.documentRefs = function (dokkument) {
    const refs = [];
    const collect = (selector, attr) => dokkument.querySelectorAll(selector).forEach(node => {
        const ref = node.getAttribute(attr);
        if (fluid.copyOut.isLocalRef(ref)) {
            refs.push(new URL(ref, dokkument.location).href);
        }
    });
    collect("script[src]", "src");
    collect("link[href]", "href");
    collect("img[src]", "src");
    collect("source[src]", "src");
    collect("fluid-import[src]", "src");
    // The genuine data of each component bearing fluid.withPlaceholder, which is not fetched under node, as well as its
    // placeholder, which is
    fluid.documentPlaceholders(dokkument).forEach(record => {
        [record.url, record.placeholderUrl].forEach(url => {
            if (url && url.startsWith("file:")) {
                refs.push(url);
            }
        });
    });
    return refs;
};

/**
 * Collect the URLs of the local files referred to by a stylesheet, by `url(...)` or `@import`
 * @param {String} text - The text of the stylesheet
 * @param {String} cssUrl - The absolute URL of the stylesheet
 * @return {String[]} The absolute URLs of the files
 */
fluid.copyOut.cssRefs = function (text, cssUrl) {
    const refs = [];
    const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const ref = (match[2] || match[4]).trim();
        if (fluid.copyOut.isLocalRef(ref)) {
            // A query or fragment, e.g. a font's "?#iefix", names the same file
            refs.push(new URL(ref.replace(/[?#].*$/, ""), cssUrl).href);
        }
    }
    return refs;
};

/**
 * Compute the closure of the files demanded by a set of URLs - adding those referred to by any stylesheet amongst them,
 * read from wherever it is found under node
 * @param {String[]} urls - Absolute URLs of files demanded
 * @return {String[]} The sorted absolute file: URLs of all the files demanded, without query or fragment
 */
fluid.copyOut.closeDemands = function (urls) {
    const demanded = new Set();
    const pending = [...urls];
    while (pending.length > 0) {
        const url = pending.pop().replace(/[?#].*$/, "");
        if (url.startsWith("file:") && !demanded.has(url)) {
            demanded.add(url);
            const sourcePath = fileURLToPath(fluid.moduleSourceUrl(url));
            if (url.endsWith(".css") && fs.existsSync(sourcePath)) {
                pending.push(...fluid.copyOut.cssRefs(fs.readFileSync(sourcePath, "utf8"), url));
            }
        }
    }
    return [...demanded].sort();
};

/**
 * @typedef {Object} CopyPlanEntry
 * @property {String} target - The absolute path within the project where the file is demanded
 * @property {String|null} source - The absolute path within a module's checkout from which it is copied, or `null`
 * if it lies outside every module's directory
 * @property {String} status - One of "new", "changed", "unchanged", "missing" if there is no file to be found, or
 * "ignored" if it is missing but matches a pattern given by --ignore-missing
 */

/**
 * Plan the copying of a set of demanded files from the checkouts of the modules within whose directories they lie
 * @param {String[]} urls - The absolute file: URLs of the files, as the pages refer to them
 * @return {CopyPlanEntry[]} An entry for each file
 */
fluid.copyOut.plan = function (urls) {
    return urls.map(url => {
        const target = fileURLToPath(url);
        const sourceUrl = fluid.moduleSourceUrl(url);
        const source = sourceUrl === url ? null : fileURLToPath(sourceUrl);
        const from = source ?? target;
        let status;
        if (!fs.existsSync(from) || !fs.statSync(from).isFile()) {
            status = "missing";
        } else if (source === null) {
            status = "unchanged";
        } else if (!fs.existsSync(target)) {
            status = "new";
        } else if (fs.readFileSync(source).equals(fs.readFileSync(target))) {
            status = "unchanged";
        } else {
            status = "changed";
        }
        return {target, source, status};
    });
};

/**
 * Copy the files of a plan which are new or changed
 * @param {CopyPlanEntry[]} plan - The plan, as returned by `fluid.copyOut.plan`
 */
fluid.copyOut.execute = function (plan) {
    plan.filter(entry => entry.status === "new" || entry.status === "changed").forEach(entry => {
        fs.mkdirSync(path.dirname(entry.target), {recursive: true});
        fs.copyFileSync(entry.source, entry.target);
    });
};

/**
 * Find the element of a page declaring the module which holds it, and naming its module map
 * @param {Document} dokkument - The page
 * @return {Object} Members `name`, the module's name, `dir`, the absolute path of its directory, and `mapFile`, that of
 * its map
 */
fluid.copyOut.ownModule = function (dokkument) {
    const node = dokkument.querySelector("fluid-module[modules]");
    if (!node) {
        fluid.fail("Page " + fileURLToPath(dokkument.location) + " declares no module holding it, with a map - e.g. " +
            "<fluid-module id=\"my-project\" src=\"../\" modules=\"fluid-modules.json\">");
    }
    const dirUrl = new URL(fluid.deSlash(node.getAttribute("src")) + "/", dokkument.location);
    return {
        name: node.getAttribute("id"),
        dir: fileURLToPath(dirUrl),
        mapFile: fileURLToPath(new URL(node.getAttribute("modules"), dirUrl))
    };
};

/**
 * Read a module map, if there is one
 * @param {String} mapFile - The absolute path of the map
 * @return {Object<String, String>} The map, empty if there is none
 */
fluid.copyOut.readMap = function (mapFile) {
    return fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : {};
};

/**
 * Find the source of a module - the checkout given for it, or else the directory where node finds the npm package of
 * its name from any of a list of directories
 * @param {String} name - The module's name
 * @param {Object<String, String>} moduleSources - Map of module name to the absolute path of its checkout
 * @param {String[]} fromDirs - The directories from which packages are sought
 * @return {String|null} The absolute path of the module's source, or `null` if none is found
 */
fluid.copyOut.findSource = function (name, moduleSources, fromDirs) {
    return moduleSources[name] || fromDirs.map(dir => fluid.findPackageDir(name, dir)).find(dir => dir) || null;
};

/**
 * Boot a page under node, reading the files of its modules from their sources, and collect the files it demands
 * @param {String} pageFile - The absolute path of the page
 * @param {Object<String, String>} moduleSources - Map of module name to the absolute path of its checkout
 * @param {Object} options - Options as parsed from the command line, with members `vendor`, `inPlace` and `framework`
 * @param {Object<String, String>} map - The module map being written for the page's module, which is updated with
 * each module the page locates through it
 * @return {Promise<Object>} A promise for members `demands`, the absolute file: URLs of the files the page demands,
 * and `own`, the module holding the page, as returned by `fluid.copyOut.ownModule`
 */
fluid.copyOut.pageDemands = async function (pageFile, moduleSources, options, map) {
    const dokkument = fluid.serverDocumentParser(fs.readFileSync(pageFile, "utf8"));
    dokkument.location = pathToFileURL(pageFile);
    const own = fluid.copyOut.ownModule(dokkument);
    const fromDirs = [own.dir, ...Object.values(moduleSources)];
    const vendorDir = options.vendor ? path.resolve(options.vendor) : path.join(path.dirname(own.mapFile), "vendor");
    // The source of every module the map already locates, so that its files are read from there
    const sources = {...moduleSources};
    Object.keys(fluid.copyOut.readMap(own.mapFile)).forEach(name => {
        sources[name] = sources[name] || fluid.copyOut.findSource(name, moduleSources, fromDirs);
    });
    // A module referred to which the map does not yet locate is placed in the vendor directory, or where its source is
    fluid.module.unregisteredResolver = function (name) {
        const source = fluid.copyOut.findSource(name, moduleSources, fromDirs);
        if (source) {
            const dir = options.inPlace ? source : path.join(vendorDir, name);
            fluid.serverModuleSourcesById[name] = source;
            fluid.module.register(name, fluid.deSlash(pathToFileURL(dir).href), dir, false);
        }
    };
    const booted = fluid.loadAndBootDocument(pageFile, {moduleSources: sources});
    const readiness = await fluid.documentWhenSettled(booted);
    if (fluid.isUnavailable(readiness)) {
        throw new Error("Reactive graph settled but document " + pageFile + " is not ready: " + JSON.stringify(readiness));
    }
    // Every module the page reached, other than its own and Infusion, which it reaches through its bootstrap, is
    // located by the map
    const mapDir = path.dirname(own.mapFile);
    Object.entries(fluid.module.modules).forEach(([name, record]) => {
        if (name !== own.name && name !== fluid.bootRecord.moduleName && record.url.startsWith("file:")) {
            map[name] = path.relative(mapDir, fileURLToPath(record.url)).split(path.sep).join("/");
        }
    });
    const infusion = fluid.module.modules[fluid.bootRecord.moduleName];
    const frameworkUrls = infusion ? fluid.bootFiles(options.framework).map(file => infusion.url + "/" + file) : [];
    if (options.hydratedFile) {
        fluid.writeBootScript(booted, options.framework);
        fluid.writeDocument(options.hydratedFile, booted);
    }
    // The module map is written rather than copied
    const mapUrl = pathToFileURL(own.mapFile).href;
    const demands = [pathToFileURL(pageFile).href, ...fluid.serverFetchedUrls, ...fluid.copyOut.documentRefs(booted), ...frameworkUrls];
    return {
        own,
        demands: demands.filter(url => url !== mapUrl)
    };
};

/**
 * Write a module map, unless it already holds exactly those entries
 * @param {String} mapFile - The absolute path of the map
 * @param {Object<String, String>} map - The map
 * @param {Boolean} dryRun - If `true`, nothing is written
 * @return {String} "new", "changed" or "unchanged"
 */
fluid.copyOut.writeMap = function (mapFile, map, dryRun) {
    const sorted = Object.fromEntries(Object.keys(map).sort().map(name => [name, map[name]]));
    const text = JSON.stringify(sorted, null, 4) + "\n";
    const existing = fs.existsSync(mapFile) ? fs.readFileSync(mapFile, "utf8") : null;
    const status = existing === null ? "new" : existing === text ? "unchanged" : "changed";
    if (status !== "unchanged" && !dryRun) {
        fluid.writeFile(mapFile, text);
    }
    return status;
};

fluid.copyOut.main = async function (args) {
    const parsedArgs = minimist(args, {boolean: ["n", "list", "hydrate", "in-place"], string: ["source", "sources", "vendor", "framework", "ignore-missing"]});
    const pages = parsedArgs._.map(page => path.resolve(page));
    if (pages.length === 0) {
        console.error("Usage: node copyOut.js <page.html>... --source <module>=<checkout> [--sources <file>] [--vendor <dir>] " +
            "[--in-place] [--framework boot|source|built] [-n] [--list] [--hydrate]");
        process.exitCode = 1;
    } else {
        const moduleSources = fluid.copyOut.parseSources(parsedArgs);
        const demands = [];
        const maps = {};
        // Each page is booted in turn - the registries a booted page populates are global, so that those demanded by
        // a later page include those of earlier ones, which are all to be copied in any case
        for (const page of pages) {
            const options = {
                vendor: parsedArgs.vendor,
                inPlace: parsedArgs["in-place"],
                framework: parsedArgs.framework || "boot",
                hydratedFile: parsedArgs.hydrate ? page.replace(/\.html$/, "-hydrated.html") : undefined
            };
            const dokkument = fluid.serverDocumentParser(fs.readFileSync(page, "utf8"));
            dokkument.location = pathToFileURL(page);
            const mapFile = fluid.copyOut.ownModule(dokkument).mapFile;
            maps[mapFile] = maps[mapFile] || {};
            const result = await fluid.copyOut.pageDemands(page, moduleSources, options, maps[mapFile]);
            demands.push(...result.demands);
        }
        // In place, each module's files are found where its source is, so nothing is to be copied, but each demanded
        // file must exist
        const plan = fluid.copyOut.plan(fluid.copyOut.closeDemands(demands));
        const counts = {new: 0, changed: 0, unchanged: 0, missing: 0, ignored: 0};
        const projectDir = process.cwd();
        const ignorable = [].concat(parsedArgs["ignore-missing"] || []).map(pattern => new RegExp(pattern));
        plan.forEach(entry => {
            if (entry.status === "missing" && ignorable.some(pattern => pattern.test(entry.target))) {
                entry.status = "ignored";
            }
            ++counts[entry.status];
            if (parsedArgs.list || entry.status !== "unchanged") {
                console.log(entry.status + ": " + path.relative(projectDir, entry.target) +
                    (entry.source ? " <- " + path.relative(projectDir, entry.source) : ""));
            }
        });
        Object.entries(maps).forEach(([mapFile, map]) => {
            const status = fluid.copyOut.writeMap(mapFile, map, parsedArgs.n);
            console.log("module map " + status + ": " + path.relative(projectDir, mapFile));
        });
        if (!parsedArgs.n) {
            fluid.copyOut.execute(plan);
        }
        console.log(`\n${counts.new} new, ${counts.changed} changed, ${counts.unchanged} unchanged, ${counts.missing} missing` +
            (counts.ignored ? `, ${counts.ignored} missing but ignored` : "") +
            (parsedArgs.n ? " (dry run - nothing copied)" : ""));
        if (counts.missing > 0) {
            process.exitCode = 1;
        }
    }
};

if (require.main === module) {
    fluid.copyOut.main(process.argv.slice(2)).catch(error => {
        console.error("copyOut failed: ", error);
        process.exitCode = 1;
    });
}

module.exports = fluid.copyOut;
