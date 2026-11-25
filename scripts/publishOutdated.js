"use strict";

// Releases whatever of this repository is out of date:
//  - Each package whose version in its package.json is not yet in the npm registry is published there: Infusion
//    itself, the root package, and then each workspace named in the root's package.json, in the order listed there - so
//    that wend precedes wend-theme-beautiful, which depends on it. Private packages are skipped.
//  - The extension "Edit in Infusion", if the version of its manifest.json has no tag on origin, is zipped - see
//    scripts/zipExtension.js.
// Each is then tagged at HEAD - Infusion by its bare version, e.g. "6.6.0", as its releases always have been, a
// workspace by name and version, e.g. "wend@1.0.0", as lerna names them, and the extension as
// "edit-in-infusion@<version>" - the tag pushed to origin, and a GitHub release made of it. The extension's release
// carries the zip as its asset edit-in-infusion.zip, and is marked the repository's latest, the others not - so that
// https://github.com/fluid-project/infusion-6/releases/latest/download/edit-in-infusion.zip is always the latest
// extension, and .../releases/download/edit-in-infusion@<version>/edit-in-infusion.zip a given one. Since a tag must
// name the commit that was released, the working tree must be clean unless tagging is skipped.
//
// Run with: npm run release [-- options], where the options are
//    --dry-run     passed to npm publish, which then uploads nothing; nothing is tagged, pushed or released
//    --no-github   tag locally alone, pushing nothing and making no GitHub release - the command to push is printed
//    --no-tag      publish to npm alone, without tagging, e.g. to retry a publish already tagged; the extension is
//                  then left alone
// and any others are passed to each npm publish, e.g. --otp=123456. The GitHub release is made by the gh command, as
// the account it is signed in to.
//
// First, fluid.version in src/framework/core/js/FluidCore.js is made to name the root package's version. If it didn't,
// the file is rewritten and the release stops, since what is tagged must be committed - commit it and run again.

const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");
const {zipExtension, readManifest} = require("./zipExtension.js");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const tagging = !dryRun && !args.includes("--no-tag");
const github = tagging && !args.includes("--no-github");
const ownOptions = ["--no-tag", "--no-github"];
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
const candidates = [".", ...(rootPackage.workspaces || [])];
const outdated = candidates.map(dir => ({dir, pkg: readPackage(dir)}))
    .filter(({pkg}) => !pkg.private)
    .filter(({dir, pkg}) => {
        const published = isPublished(pkg.name, pkg.version);
        console.log((published ? "up to date: " : "to publish: ") + pkg.name + "@" + pkg.version + " (" + dir + ")");
        return !published;
    });
const extensionVersion = readManifest().version;
const extensionTag = "edit-in-infusion@" + extensionVersion;
// Released only when tagging, since its release is its tag - a dry run says whether it would be
const extensionUntagged = !args.includes("--no-tag") && !remoteTagExists(extensionTag);
const extensionOutdated = tagging && extensionUntagged;
if (!args.includes("--no-tag")) {
    console.log((extensionUntagged ? "to release: " : "up to date: ") + "extension " + extensionTag);
}

/**
 * The tag naming a release of a package of this repository
 * @param {String} dir - The package's directory, relative to the root
 * @param {Object} pkg - Its package.json
 * @return {String} The tag
 */
const tagOf = function (dir, pkg) {
    return dir === "." ? pkg.version : pkg.name + "@" + pkg.version;
};

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
        console.log("Publishing " + pkg.name + "@" + pkg.version);
        const commandArgs = dir === "." ? ["publish", ...publishArgs] : ["publish", "-w", dir, ...publishArgs];
        execFileSync(npm, commandArgs, {cwd: root, stdio: "inherit"});
        if (tagging) {
            const tag = tagOf(dir, pkg);
            tagAndRelease({tag, title: pkg.name + " " + pkg.version, latest: false, assets: [],
                notes: "Published to npm as https://www.npmjs.com/package/" + pkg.name + "/v/" + pkg.version});
            tagged.push(tag);
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
