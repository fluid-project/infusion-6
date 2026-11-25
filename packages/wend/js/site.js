"use strict";

// The site a wend build builds, as its descriptor wend.site.json describes it - so that nothing of wend assumes where a
// site keeps its parts. The site is the directory named by WEND_SITE_DIR, or else the current directory. Its descriptor
// names:
//  - `bases`: the sites of which this one is an overlay, from the most general to the most specific - each a git
//    repository, "owner/name" or {"repo": "owner/name", "branch": "main"}, fetched by fetchBases.js at the commit which
//    wend.bases.lock.json records, or {"path": "../other-site"}, a directory holding a site. A site inherits its bases'
//    files, its own taking the place of any at the same path, and any member of the descriptor it leaves out other than
//    `editing` - see "Layering" below;
//  - `exclude`: paths of files, or directories ending "/", which the site's bases hold but the site is not to - e.g. a
//    post of a base it does without;
//  - `modules`: the module ids of its SFCs, with their directories - wend's own, its theme's, e.g. wend-theme-beautiful, and the
//    site's - from the most general to the site's own;
//  - `root`: the layer of the root of the site's component tree, of which wend.json is a patch - its theme's, e.g.
//    beautifulWend.site;
//  - `host`: the host document declaring them, and importing their SFCs, e.g. wend/site.html;
//  - `editing`: its editing configuration, e.g. wend/editing.json - the repository and branch an editing client commits
//    to, the layers it boots in the browser, and the files of each page's framing it may edit. Never inherited, since it
//    names the repository edits are committed to;
//  - `staticDirs`: the directories of static files copied into the published site, later ones overlaying earlier;
//  - `overrides`: the directory of the site's forks of its modules' files, at <module id>/<path within the module> - a
//    file there takes the place of the module's own wherever it is imported, so that a site edits its theme's footer, say,
//    without editing the theme. An editing client forks a file there on its first edit - see `framing` in the editing configuration.
//
// Layering: the site and its bases are each defined as an Infusion layer, whose `$layers` are its bases, and whose
// member `files` is the tree of its files - content/, static/ and its forks of its modules' files, at override/ - each
// file a leaf naming the layer holding it. Infusion's merging of the site's layer then yields the site's complement of
// files, just as it yields the members of a component: directories merge, so that a site adds posts to a base's
// collection, and a file at the same path in a more specific layer takes the place of the more general one's. Static
// directories of modules, e.g. the theme's, are the most general layers. The site's own exclusions are `null` leaves. A
// base's wend.json is merged beneath the site's, in the same order. A path of a base beginning "node_modules/" is
// resolved against the site itself, since the packages a base names are installed only for the site built.

const fs = require("fs"),
    path = require("path");

const siteDir = path.resolve(process.env.WEND_SITE_DIR || process.cwd());

// The directory beneath the site in which fetchBases.js places its bases held as git repositories
const basesDir = ".wend/bases";
// The file recording the commit of each base held as a git repository at which the site is built
const lockFile = "wend.bases.lock.json";

/**
 * Normalise a base, as written in a descriptor's `bases`
 * @param {String|Object} base - The base - "owner/name", {repo, branch} or {path}
 * @param {String} dir - The directory of the site naming it
 * @return {Object} `{repo, branch}` for a git repository, or `{path}` for a directory, absolute
 */
const normaliseBase = function (base, dir) {
    const record = typeof(base) === "string" ? {repo: base} : base;
    return record.repo ? {repo: record.repo, branch: record.branch || "main"} : {path: path.resolve(dir, record.path)};
};

/**
 * Locate the directory holding a base
 * @param {Object} base - The base, as normalised by `normaliseBase`
 * @return {String} Its directory, absolute
 */
const baseDir = base => base.repo ? path.join(siteDir, basesDir, ...base.repo.split("/")) : base.path;

/**
 * Resolve a path written in a descriptor of a site or one of its bases
 * @param {String} dir - The directory of the site whose descriptor it is
 * @param {String} written - The path
 * @return {String} The path, absolute - one beneath node_modules is resolved against the site built
 */
const resolveIn = (dir, written) => path.resolve(written.startsWith("node_modules/") ? siteDir : dir, written);

/**
 * Read the descriptor of a site or one of its bases, its paths resolved
 * @param {String} dir - The site's directory
 * @return {Object} The descriptor, with `bases` normalised, and each path absolute
 */
const readDescriptor = function (dir) {
    const file = path.join(dir, "wend.site.json");
    if (!fs.existsSync(file)) {
        throw new Error("No site is found at " + dir + " - " + (dir.includes(basesDir) ? "fetch the site's bases with wend-fetch-bases" :
            "it holds no wend.site.json"));
    }
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    const resolved = {
        bases: (written.bases || []).map(base => normaliseBase(base, dir)),
        exclude: written.exclude || []
    };
    ["root"].filter(key => written[key] !== undefined).forEach(key => resolved[key] = written[key]);
    ["host", "editing", "overrides"].filter(key => written[key] !== undefined).forEach(key => resolved[key] = resolveIn(dir, written[key]));
    if (written.modules) {
        resolved.modules = Object.fromEntries(Object.entries(written.modules).map(([id, moduleDir]) => [id, resolveIn(dir, moduleDir)]));
    }
    if (written.staticDirs) {
        resolved.staticDirs = written.staticDirs.map(staticDir => resolveIn(dir, staticDir));
    }
    return resolved;
};

/**
 * Gather the site and all its bases, from the most general to the most specific, as the bases of each are listed
 * depth first - Infusion's own linearisation of their layers, see `wendSite.merge`, settles their final order
 * @return {Object[]} `{dir, descriptor, base}` for each, distinct by directory, the site itself last
 */
const gatherSites = function () {
    const seen = new Map();
    const visit = function (dir, base, trail) {
        if (trail.includes(dir)) {
            throw new Error("The site's bases form a cycle: " + [...trail, dir].join(" -> "));
        }
        if (!seen.has(dir)) {
            const descriptor = readDescriptor(dir);
            descriptor.bases.forEach(child => visit(baseDir(child), child, [...trail, dir]));
            seen.set(dir, {dir, descriptor, base});
        }
    };
    visit(siteDir, null, []);
    return [...seen.values()];
};

const sites = gatherSites();
const own = sites[sites.length - 1].descriptor;

/**
 * Find a member of the descriptor in effect - the site's own, or else that of the most specific base holding it
 * @param {String} key - The member
 * @return {any} Its value
 */
const inherited = function (key) {
    const holder = [...sites].reverse().find(site => site.descriptor[key] !== undefined);
    if (!holder) {
        throw new Error("Neither the site nor any of its bases has a member " + key + " in wend.site.json");
    }
    return holder.descriptor[key];
};

if (!own.editing) {
    throw new Error("The site's wend.site.json must name its own editing configuration, which names the repository it is edited in");
}

const wendSite = {
    siteDir,
    basesDir,
    lockFile,
    // Each module's id, and its directory, absolute
    modules: inherited("modules"),
    root: inherited("root"),
    host: inherited("host"),
    editing: own.editing,
    staticDirs: inherited("staticDirs"),
    overrides: own.overrides || path.join(siteDir, "wend/override"),
    // The site and its bases, each `{dir, descriptor, base}`, `base` being null for the site itself - in the order
    // gathered until `merge` orders them as Infusion linearises their layers
    sites,
    // Once merged, the site's complement of files, by path relative to the site, each `{file, layer, site}`, `file`
    // its absolute path
    files: null,
    // Once merged, the layer of each of the site and its bases, by its directory
    layerOf: null,
    // Once merged, the paths of the site's own files which take the place of a base's
    shadowed: []
};

/**
 * Render a path of the site relative to its directory, as the repository holds it
 * @param {String} absolute - The absolute path
 * @return {String} The path relative to the site, with "/" separators
 */
wendSite.rel = absolute => path.relative(siteDir, absolute).split(path.sep).join("/");

/**
 * Determine whether a directory is one of the site's or a base's own, rather than one of a module, e.g. the theme
 * @param {String} dir - The directory, absolute
 * @return {Boolean} `true` if it lies within the site or one of its bases, and not beneath node_modules
 */
wendSite.isSiteOwn = dir => sites.some(site => !path.relative(site.dir, dir).startsWith("..")) && !dir.split(path.sep).includes("node_modules");

/**
 * Read the commits at which the site's bases held as git repositories are built, as recorded by fetchBases.js
 * @return {Object<String, Object>} `{branch, sha}` for each, by repository
 */
wendSite.readLock = function () {
    const file = path.join(siteDir, lockFile);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
};

/**
 * List the files beneath a directory, recursively, as a tree whose leaves are made of each file's path
 * @param {String} dir - The directory, absolute
 * @param {Function} leaf - Makes the leaf of a file from its absolute path
 * @return {Object} The tree - each directory an object, each file a leaf, by name
 */
wendSite.fileTree = function (dir, leaf) {
    const togo = {};
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir, {withFileTypes: true}).forEach(entry => {
            const child = path.join(dir, entry.name);
            togo[entry.name] = entry.isDirectory() ? wendSite.fileTree(child, leaf) : leaf(child);
        });
    }
    return togo;
};

/**
 * Set a value in a tree at a path, making the directories leading to it
 * @param {Object} tree - The tree
 * @param {String} filePath - The path, with "/" separators - one ending "/" is a directory
 * @param {any} value - The value
 */
wendSite.setInTree = function (tree, filePath, value) {
    const segs = filePath.replace(/\/$/, "").split("/");
    const parent = segs.slice(0, -1).reduce((node, seg) => node[seg] = node[seg] && typeof(node[seg]) === "object" ? node[seg] : {}, tree);
    parent[segs[segs.length - 1]] = value;
};

/**
 * Merge the site with its bases, as Infusion merges layers, settling the site's complement of files and its
 * configuration - to be called once Infusion is loaded, and before any file of the site is resolved
 * @param {Object} fluid - Infusion
 * @return {Object} The complement of files, as held at `wendSite.files`
 */
wendSite.merge = function (fluid) {
    const layerOf = new Map();
    // Each file's leaf names its layer alone, the site being found from it once merged
    const leafOf = layer => file => ({file, layer});
    // The static directories of modules, e.g. the theme's, are the most general layers
    const moduleStatic = wendSite.staticDirs.filter(dir => !wendSite.isSiteOwn(dir));
    const moduleLayers = moduleStatic.map((dir, i) => {
        const layer = "wend.siteLayer.module" + i;
        fluid.def(layer, {$layers: i === 0 ? "fluid.component" : "wend.siteLayer.module" + (i - 1),
            files: {static: wendSite.fileTree(dir, leafOf(layer))}});
        return layer;
    });
    const rootLayer = moduleLayers.length > 0 ? moduleLayers[moduleLayers.length - 1] : "fluid.component";
    sites.forEach((site, i) => layerOf.set(site.dir, "wend.siteLayer.site" + i));
    // The paths of each site's own files, by its directory, to report those of the site which hide a base's
    const ownPaths = new Map();
    sites.forEach(site => {
        const layer = layerOf.get(site.dir);
        const leaf = leafOf(layer);
        const files = {
            content: wendSite.fileTree(path.join(site.dir, "content"), leaf),
            static: wendSite.fileTree(path.join(site.dir, "static"), leaf),
            override: wendSite.fileTree(site.descriptor.overrides || path.join(site.dir, "wend/override"), leaf)
        };
        const paths = [];
        const collect = (node, prefix) => Object.entries(node).forEach(([name, value]) => value && typeof(value.file) === "string" ?
            paths.push(prefix + name) : collect(value, prefix + name + "/"));
        collect(files, "");
        ownPaths.set(site.dir, paths);
        site.descriptor.exclude.forEach(excluded => wendSite.setInTree(files, excluded, null));
        const bases = site.descriptor.bases.map(base => layerOf.get(baseDir(base)));
        fluid.def(layer, {$layers: bases.length > 0 ? bases : rootLayer, files});
    });
    const merged = fluid.avatarMerged(layerOf.get(siteDir));
    // The sites, in the order Infusion linearises their layers
    const order = merged.$layers.filter(layer => layer.startsWith("wend.siteLayer.site"));
    wendSite.sites = order.map(layer => sites.find(site => layerOf.get(site.dir) === layer));
    const siteOf = new Map(sites.map(site => [layerOf.get(site.dir), site]));
    const files = {};
    const flatten = (node, prefix) => Object.entries(node || {}).forEach(([name, value]) => {
        const rel = prefix + name;
        if (value && typeof(value.file) === "string") {
            files[rel] = {file: value.file, layer: value.layer, site: siteOf.get(value.layer) || null};
        } else if (value && typeof(value) === "object") {
            flatten(value, rel + "/");
        }
    });
    flatten(merged.files, "");
    wendSite.files = files;
    wendSite.layerOf = layerOf;
    // Each file of the site which takes the place of one of a base's at the same path - each meant, it is hoped, but
    // reported, since a new post named as a base's would otherwise silently hide it
    const own = ownPaths.get(siteDir);
    wendSite.shadowed = own.filter(file => sites.some(site => site.dir !== siteDir && ownPaths.get(site.dir).includes(file)));
    return files;
};

/**
 * Check that the site has been merged with its bases
 * @return {Object} The complement of files, as held at `wendSite.files`
 */
wendSite.complement = function () {
    if (!wendSite.files) {
        throw new Error("The site's files are resolved only once it is merged with its bases - see wendSite.merge");
    }
    return wendSite.files;
};

/**
 * Find a file of the site's complement - its own, or else that of the most specific base or module holding it
 * @param {String} file - Its path relative to the site, e.g. "content/post/hello.md" or "static/img/cat.png"
 * @return {String|null} Its absolute path, or null if the complement holds no such file
 */
wendSite.resolve = function (file) {
    const found = wendSite.complement()[file];
    return found ? found.file : null;
};

/**
 * List the files of the site's complement beneath a directory
 * @param {String} dir - The directory relative to the site, e.g. "content" or "static/sfc"
 * @return {String[]} The paths of the files beneath it, relative to it, with "/" separators, sorted
 */
wendSite.list = function (dir) {
    const prefix = dir.replace(/\/?$/, "/");
    return Object.keys(wendSite.complement()).filter(file => file.startsWith(prefix)).map(file => file.substring(prefix.length)).sort();
};

/**
 * Describe where a file of the site's complement comes from, if from one of its bases
 * @param {String} file - Its path relative to the site
 * @return {Object|null} `{repo, sha, path}` for a base held as a git repository - the commit at which it is built -
 * `{path}` for one held as a directory, or null if the file is the site's own, or a module's
 */
wendSite.inheritedFrom = function (file) {
    const found = wendSite.complement()[file];
    let togo = null;
    if (found && found.site && found.site.base) {
        const base = found.site.base;
        const lock = wendSite.readLock()[base.repo];
        togo = base.repo ? {repo: base.repo, branch: base.branch, sha: lock ? lock.sha : null, path: path.relative(found.site.dir, found.file).split(path.sep).join("/")} :
            {path: path.relative(siteDir, found.file).split(path.sep).join("/")};
    }
    return togo;
};

/**
 * Describe the site's bases held as git repositories, with the commits at which it is built
 * @return {Object[]} `{repo, branch, sha}` for each
 */
wendSite.gitBases = function () {
    const lock = wendSite.readLock();
    return sites.filter(site => site.base && site.base.repo).map(site => ({repo: site.base.repo, branch: site.base.branch,
        sha: lock[site.base.repo] ? lock[site.base.repo].sha : null}));
};

/**
 * Merge plain data as Infusion merges configuration - objects member by member, anything else replaced
 * @param {any} target - The more general value
 * @param {any} source - The more specific value
 * @return {any} The merged value
 */
wendSite.mergeData = function (target, source) {
    const isObject = value => !!value && typeof(value) === "object" && !Array.isArray(value);
    let togo;
    if (isObject(target) && isObject(source)) {
        togo = {...target};
        Object.entries(source).forEach(([key, value]) => togo[key] = wendSite.mergeData(target[key], value));
    } else {
        togo = source === undefined ? target : source;
    }
    return togo;
};

/**
 * Read the site's configuration, wend.json, merged over those of its bases in the order their layers are merged
 * @param {String} patchFile - The configuration's file name, e.g. "wend.json"
 * @return {Object} The configuration
 */
wendSite.readPatch = function (patchFile) {
    return wendSite.sites.map(site => path.join(site.dir, patchFile)).filter(file => fs.existsSync(file))
        .map(file => JSON.parse(fs.readFileSync(file, "utf8"))).reduce((merged, patch) => wendSite.mergeData(merged, patch), {});
};

/**
 * Find a static file, as the published site holds it - the site's complement once merged, or else the last of the
 * static directories holding it
 * @param {String} file - Its path within the static directories, e.g. "js/highlight.min.js"
 * @return {String|null} Its absolute path, or null if none holds it
 */
wendSite.staticFile = function (file) {
    let togo;
    if (wendSite.files) {
        togo = wendSite.resolve("static/" + file);
    } else {
        const found = wendSite.staticDirs.map(dir => path.join(dir, file)).filter(candidate => fs.existsSync(candidate));
        togo = found.length > 0 ? found[found.length - 1] : null;
    }
    return togo;
};

/**
 * Find the site's fork of a file of one of its modules, if it has one
 * @param {String} moduleId - The module, e.g. "beautifulWend"
 * @param {String} file - The file's path within the module, e.g. "sfc/beautifulWend-footer.vue"
 * @return {String} The path, relative to the site, at which the site forks it - whether or not the fork exists
 */
wendSite.overridePath = (moduleId, file) => wendSite.rel(path.join(wendSite.overrides, moduleId, file));

/**
 * Find the file which a module's file stands for in this site - the fork of it by the site or the most specific of its
 * bases forking it, if any, or else the module's own
 * @param {String} moduleId - The module
 * @param {String} file - The file's path within the module
 * @return {String} The absolute path of the file in effect
 */
wendSite.effectiveFile = function (moduleId, file) {
    const fork = wendSite.files ? wendSite.resolve("override/" + moduleId + "/" + file) : path.join(wendSite.overrides, moduleId, file);
    return fork && fs.existsSync(fork) ? fork : path.join(wendSite.modules[moduleId], file);
};

module.exports = wendSite;
