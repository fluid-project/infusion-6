"use strict";

// The tarballs of this repository's packages as they are released - attached to the package's GitHub release, from
// which the sites depending on it install it by URL, e.g.
//     "infusion-6": "https://github.com/fluid-project/infusion-6/releases/download/6.7.4/infusion-6-6.7.4.tgz"
// in place of a version in the npm registry, which remains in reserve - see publishOutdated.js. A release's tarball is
// exactly what `npm pack` makes, since the packages name one another only as peer dependencies, which npm checks
// against whatever versions a site installs, however it installs them.

const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const releaseAssets = {
    root: path.resolve(__dirname, ".."),
    // The repository whose GitHub releases hold the tarballs
    repo: "fluid-project/infusion-6",
    // Where the tarballs are packed, beside the extension's zips - ignored by git, and left out of the packages
    packDir: path.resolve(__dirname, "../dist/release")
};

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Read the package.json of a directory of this repository
 * @param {String} dir - The directory, relative to the root, e.g. "." or "packages/wend"
 * @return {Object} The parsed package.json
 */
releaseAssets.readPackage = function (dir) {
    return JSON.parse(fs.readFileSync(path.join(releaseAssets.root, dir, "package.json"), "utf8"));
};

/**
 * The directories of the packages this repository releases - Infusion itself, then each workspace, in the order the
 * root's package.json lists them - leaving out any marked private
 * @return {String[]} The directories, relative to the root
 */
releaseAssets.packageDirs = function () {
    return [".", ...(releaseAssets.readPackage(".").workspaces || [])].filter(dir => !releaseAssets.readPackage(dir).private);
};

/**
 * The tag naming a release of a package - Infusion by its bare version, e.g. "6.6.0", as its releases always have
 * been, and a workspace by name and version, e.g. "@fluid-project/wend@1.0.0"
 * @param {String} dir - The package's directory, relative to the root
 * @param {Object} pkg - Its package.json
 * @return {String} The tag
 */
releaseAssets.tagOf = function (dir, pkg) {
    return dir === "." ? pkg.version : pkg.name + "@" + pkg.version;
};

/**
 * The name of the tarball `npm pack` makes of a package, e.g. "fluid-project-wend-1.1.0.tgz"
 * @param {Object} pkg - Its package.json
 * @return {String} The file's name
 */
releaseAssets.tarballName = function (pkg) {
    return pkg.name.replace(/^@/, "").replace(/\//g, "-") + "-" + pkg.version + ".tgz";
};

/**
 * The URL from which a released tarball is downloaded - each segment of its tag encoded, as GitHub writes them,
 * keeping the slash of a scoped package's name
 * @param {String} tag - The release's tag
 * @param {String} file - The tarball's name
 * @return {String} The URL
 */
releaseAssets.urlOf = function (tag, file) {
    return "https://github.com/" + releaseAssets.repo + "/releases/download/" + tag.split("/").map(encodeURIComponent).join("/") + "/" + file;
};

/**
 * The URL of the tarball of a package of this repository as it now stands, once released
 * @param {String} dir - The package's directory, relative to the root
 * @return {Object} `{name, version, tag, file, url}`
 */
releaseAssets.describe = function (dir) {
    const pkg = releaseAssets.readPackage(dir);
    const tag = releaseAssets.tagOf(dir, pkg);
    const file = releaseAssets.tarballName(pkg);
    return {name: pkg.name, version: pkg.version, tag, file, url: releaseAssets.urlOf(tag, file)};
};

/**
 * Pack a package of this repository with `npm pack`
 * @param {String} dir - The package's directory, relative to the root
 * @param {String} [dest] - The directory into which it is packed - by default `packDir`
 * @return {String} The path of its tarball
 */
releaseAssets.pack = function (dir, dest = releaseAssets.packDir) {
    fs.mkdirSync(dest, {recursive: true});
    const packArgs = ["pack", "--json", "--pack-destination", dest, ...(dir === "." ? [] : ["-w", dir])];
    const [record] = JSON.parse(execFileSync(npm, packArgs, {cwd: releaseAssets.root, encoding: "utf8"}));
    return path.join(dest, record.filename);
};

module.exports = releaseAssets;
