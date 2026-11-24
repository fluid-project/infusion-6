"use strict";

// The site a wend build builds, as its descriptor wend.site.json describes it - so that nothing of wend assumes where a
// site keeps its parts. The site is the directory named by WEND_SITE_DIR, or else the current directory. Its descriptor
// names:
//  - `modules`: the module ids of its SFCs, with their directories - wend's own, its theme's, e.g. wend-theme-beautiful, and the
//    site's - from the most general to the site's own;
//  - `root`: the layer of the root of the site's component tree, of which wend.json is a patch - its theme's, e.g.
//    beautifulWend.site;
//  - `host`: the host document declaring them, and importing their SFCs, e.g. wend/site.html;
//  - `editing`: its editing configuration, e.g. wend/editing.json - the repository and branch an editing client commits
//    to, the layers it boots in the browser, and the files of each page's framing it may edit;
//  - `staticDirs`: the directories of static files copied into the published site, later ones overlaying earlier;
//  - `overrides`: the directory of the site's forks of its modules' files, at <module id>/<path within the module> - a
//    file there takes the place of the module's own wherever it is imported, so that a site edits its theme's footer, say,
//    without editing the theme. An editing client forks a file there on its first edit - see `framing` in the editing configuration.

const fs = require("fs"),
    path = require("path");

const siteDir = path.resolve(process.env.WEND_SITE_DIR || process.cwd());
const descriptor = JSON.parse(fs.readFileSync(path.join(siteDir, "wend.site.json"), "utf8"));

const wendSite = {
    siteDir,
    // Each module's id, and its directory, absolute
    modules: Object.fromEntries(Object.entries(descriptor.modules).map(([id, dir]) => [id, path.resolve(siteDir, dir)])),
    root: descriptor.root,
    host: path.resolve(siteDir, descriptor.host),
    editing: path.resolve(siteDir, descriptor.editing),
    staticDirs: descriptor.staticDirs.map(dir => path.resolve(siteDir, dir)),
    overrides: path.resolve(siteDir, descriptor.overrides)
};

/**
 * Render a path of the site relative to its directory, as the repository holds it
 * @param {String} absolute - The absolute path
 * @return {String} The path relative to the site, with "/" separators
 */
wendSite.rel = absolute => path.relative(siteDir, absolute).split(path.sep).join("/");

/**
 * Find a static file, in the last of the static directories holding it, as the published site holds it
 * @param {String} file - Its path within the static directories, e.g. "js/highlight.min.js"
 * @return {String|null} Its absolute path, or null if none holds it
 */
wendSite.staticFile = function (file) {
    const found = wendSite.staticDirs.map(dir => path.join(dir, file)).filter(candidate => fs.existsSync(candidate));
    return found.length > 0 ? found[found.length - 1] : null;
};

/**
 * Find the site's fork of a file of one of its modules, if it has one
 * @param {String} moduleId - The module, e.g. "beautifulWend"
 * @param {String} file - The file's path within the module, e.g. "sfc/beautifulWend-footer.vue"
 * @return {String} The path, relative to the site, at which the site forks it - whether or not the fork exists
 */
wendSite.overridePath = (moduleId, file) => wendSite.rel(path.join(wendSite.overrides, moduleId, file));

/**
 * Find the file which a module's file stands for in this site - the site's fork of it, if any, or else its own
 * @param {String} moduleId - The module
 * @param {String} file - The file's path within the module
 * @return {String} The absolute path of the file in effect
 */
wendSite.effectiveFile = function (moduleId, file) {
    const fork = path.join(wendSite.overrides, moduleId, file);
    return fs.existsSync(fork) ? fork : path.join(wendSite.modules[moduleId], file);
};

module.exports = wendSite;
