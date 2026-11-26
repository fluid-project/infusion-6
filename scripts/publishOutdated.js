"use strict";

// Releases whatever of this repository is out of date:
//  - Each package whose release has no tag on origin is packed with `npm pack`, and its tarball attached to a GitHub
//    release of it, from which the sites depending on it install it by URL - see releaseAssets.js, and
//    scripts/useRelease.js, which points a site at the releases. The packages are Infusion itself, the root package,
//    and then each workspace named in the root's package.json, in the order listed there - so that wend precedes
//    wend-theme-beautiful, which depends on it. Private packages are skipped.
//  - With --npm, held in reserve for special cases, each package whose version is not yet in the npm registry is
//    published there instead, as releases were made before, its GitHub release then carrying no tarball.
//  - The extension "Edit in Infusion", if the version of its manifest.json has no tag on origin, is zipped - see
//    scripts/zipExtension.js.
// Each is then tagged at HEAD - Infusion by its bare version, e.g. "6.6.0", as its releases always have been, a
// workspace by name and version, e.g. "@fluid-project/wend@1.0.0", as lerna names them, and the extension as
// "edit-in-infusion@<version>" - the tag pushed to origin, and a GitHub release made of it. The extension's release
// carries the zip as its asset edit-in-infusion.zip, and is marked the repository's latest, the others not - so that
// https://github.com/fluid-project/infusion-6/releases/latest/download/edit-in-infusion.zip is always the latest
// extension, and .../releases/download/edit-in-infusion@<version>/edit-in-infusion.zip a given one. Since a tag must
// name the commit that was released, the working tree must be clean unless tagging is skipped. A release's tarball is
// never replaced once attached, since the lockfiles of sites record its integrity - a fix is a fresh version.
//
// Run with: npm run release [-- options], or npm run npm-release [-- options] for --npm, where the options are
//    --dry-run     pack the tarballs alone, into dist/release - nothing is tagged, pushed, published or released; with
//                  --npm, passed to npm publish, which then uploads nothing (npm run npm-release:dry-run)
//    --no-github   tag locally alone, pushing nothing and making no GitHub release - the commands to push and release
//                  are printed
//    --npm         publish to the npm registry, rather than attaching tarballs to the GitHub releases
//    --no-tag      with --npm, publish to npm alone, without tagging, e.g. to retry a publish already tagged; the
//                  extension is then left alone
// and any others are passed to each npm publish, e.g. --otp=123456. The GitHub release is made by the gh command, as
// the account it is signed in to.
//
// First, fluid.version in src/framework/core/js/FluidCore.js is made to name the root package's version. If it didn't,
// the file is rewritten and the release stops, since what is tagged must be committed - commit it and run again.

const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");
const {zipExtension, readManifest} = require("./zipExtension.js");
const releaseAssets = require("./releaseAssets.js");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const toNpm = args.includes("--npm");
const tagging = !dryRun && !(toNpm && args.includes("--no-tag"));
const github = tagging && !args.includes("--no-github");
const ownOptions = ["--no-tag", "--no-github", "--npm"];
const publishArgs = args.filter(arg => !ownOptions.includes(arg));

/**
 * Run a command in the repository's root, returning its output
 * @param {String} command - The command
 * @param {String[]} commandArgs - Its arguments
 * @return {String} Its standard output, trimmed
 */
const run = function (command, commandArgs) {
    return execFileSync(command, commandArgs, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
};

/**
 * Read the package.json of a directory of this repository
 * @param {String} dir - The directory, relative to the root
 * @return {Object} The parsed package.json
 */
const readPackage = function (dir) {
    return JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8"));
};

/**
 * Determine whether a version of a package is already in the registry
 * @param {String} name - The package's name
 * @param {String} version - Its version
 * @return {Boolean} `true` if that version is published
 */
const isPublished = function (name, version) {
    let togo;
    try {
        togo = run(npm, ["view", name + "@" + version, "version"]) !== "";
    } catch (error) {
        if (String(error.stderr).includes("E404")) {
            togo = false;
        } else {
            throw new Error("Can't query the registry for " + name + "@" + version + ": " + error.stderr);
        }
    }
    return togo;
};

/**
 * Determine whether a git tag exists locally
 * @param {String} tag - The tag
 * @return {Boolean} `true` if it does
 */
const tagExists = function (tag) {
    return run("git", ["tag", "--list", tag]) !== "";
};

/**
 * Determine whether a git tag exists on origin
 * @param {String} tag - The tag
 * @return {Boolean} `true` if it does
 */
const remoteTagExists = function (tag) {
    return run("git", ["ls-remote", "--tags", "origin", "refs/tags/" + tag]) !== "";
};

/**
 * Tag HEAD for a release, and, unless --no-github, push the tag and make a GitHub release of it
 * @param {Object} release - The release: `{tag, title, notes, latest, assets}`, `assets` the paths of files to attach
 * @return {Boolean} `true` once done
 */
const tagAndRelease = function (release) {
    run("git", ["tag", "-a", release.tag, "-m", release.title]);
    console.log("Tagged " + release.tag);
    if (github) {
        run("git", ["push", "origin", "refs/tags/" + release.tag]);
        run("gh", ["release", "create", release.tag, "--verify-tag", "--title", release.title, "--notes", release.notes,
            "--latest=" + release.latest, ...release.assets]);
        console.log("Made the GitHub release " + release.tag);
    }
    return true;
};

const rootPackage = readPackage(".");

// fluid.version, in FluidCore.js, names the version of Infusion, so that it can be inspected programmatically
const fluidCorePath = path.join(root, "src/framework/core/js/FluidCore.js");
const fluidVersionPattern = /fluid\.version = "Infusion [^"]*";/;

/**
 * Make FluidCore.js's `fluid.version` name the root package's version
 * @return {Boolean} `true` if FluidCore.js was rewritten, `false` if it already named that version
 */
const syncFluidVersion = function () {
    const text = fs.readFileSync(fluidCorePath, "utf8");
    const wanted = "fluid.version = \"Infusion " + rootPackage.version + "\";";
    if (!fluidVersionPattern.test(text)) {
        throw new Error("Can't find the line fluid.version = \"Infusion ...\"; in " + fluidCorePath);
    }
    const synced = text.replace(fluidVersionPattern, wanted);
    const changed = synced !== text;
    if (changed) {
        fs.writeFileSync(fluidCorePath, synced);
    }
    return changed;
};

if (syncFluidVersion()) {
    const message = "Updated fluid.version in src/framework/core/js/FluidCore.js to \"Infusion " + rootPackage.version +
        "\" - commit it, and run the release again";
    if (dryRun) {
        console.log(message);
    } else {
        throw new Error(message);
    }
}
// A package is out of date if its version is not in the registry, with --npm, and otherwise if its release has no tag
const outdated = releaseAssets.packageDirs().map(dir => ({dir, pkg: readPackage(dir)}))
    .filter(({dir, pkg}) => {
        const released = toNpm ? isPublished(pkg.name, pkg.version) : remoteTagExists(releaseAssets.tagOf(dir, pkg));
        console.log((released ? "up to date: " : "to release: ") + pkg.name + "@" + pkg.version + " (" + dir + ")");
        return !released;
    });
const extensionVersion = readManifest().version;
const extensionTag = "edit-in-infusion@" + extensionVersion;
// Released only when tagging, since its release is its tag - a dry run says whether it would be
const extensionUntagged = !(toNpm && args.includes("--no-tag")) && !remoteTagExists(extensionTag);
const extensionOutdated = tagging && extensionUntagged;
if (!(toNpm && args.includes("--no-tag"))) {
    console.log((extensionUntagged ? "to release: " : "up to date: ") + "extension " + extensionTag);
}

const tagOf = releaseAssets.tagOf;

if (outdated.length === 0 && !extensionOutdated) {
    console.log("Nothing to release");
} else {
    if (tagging) {
        const dirty = run("git", ["status", "--porcelain"]);
        if (dirty !== "") {
            throw new Error("The working tree has changes not committed, so a tag of HEAD would not name what is released - " +
                "commit them, or pass --no-tag:\n" + dirty);
        }
        const tags = [...outdated.map(({dir, pkg}) => tagOf(dir, pkg)), ...(extensionOutdated ? [extensionTag] : [])];
        const clashing = tags.filter(tagExists);
        if (clashing.length > 0) {
            throw new Error("Tags already exist locally for " + clashing.join(", ") + " - delete them, or pass --no-tag");
        }
    }
    const tagged = [];
    outdated.forEach(({dir, pkg}) => {
        const tag = tagOf(dir, pkg);
        if (toNpm) {
            console.log("Publishing " + pkg.name + "@" + pkg.version + " to npm");
            const commandArgs = dir === "." ? ["publish", ...publishArgs] : ["publish", "-w", dir, ...publishArgs];
            execFileSync(npm, commandArgs, {cwd: root, stdio: "inherit"});
            if (tagging) {
                tagAndRelease({tag, title: pkg.name + " " + pkg.version, latest: false, assets: [],
                    notes: "Published to npm as https://www.npmjs.com/package/" + pkg.name + "/v/" + pkg.version});
                tagged.push(tag);
            }
        } else {
            const tarball = releaseAssets.pack(dir);
            console.log("Packed " + pkg.name + "@" + pkg.version + " as " + path.relative(root, tarball));
            if (tagging) {
                const url = releaseAssets.urlOf(tag, path.basename(tarball));
                tagAndRelease({tag, title: pkg.name + " " + pkg.version, latest: false, assets: [tarball],
                    notes: "Install by URL, as a dependency in package.json:\n\n    \"" + pkg.name + "\": \"" + url + "\"\n\n" +
                        "or point a site at this release and its fellows with Infusion's scripts/useRelease.js"});
                tagged.push(tag);
                if (!github) {
                    console.log("To release it: gh release create " + tag + " --verify-tag --latest=false " + path.relative(root, tarball));
                }
            }
        }
    });
    if (extensionOutdated) {
        const zips = zipExtension();
        tagAndRelease({tag: extensionTag, title: "Edit in Infusion " + extensionVersion, latest: true, assets: [zips.release],
            notes: "The Chrome extension Edit in Infusion. To install it unpacked, unzip edit-in-infusion.zip into a " +
                "directory of its own, open chrome://extensions, turn on Developer mode, click Load unpacked and choose " +
                "the directory."});
        tagged.push(extensionTag);
        console.log("For the Chrome Web Store: " + path.relative(root, zips.versioned));
    }
    if (tagged.length > 0 && !github) {
        console.log("To push the tags: git push origin " + tagged.join(" "));
    }
}
