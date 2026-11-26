"use strict";

// Points a site at this repository's packages as released on GitHub - each of Infusion, wend and wend-theme-beautiful
// which the site's package.json names as a dependency is named instead by the URL of its tarball, attached to its
// GitHub release (see releaseAssets.js), at the version of this checkout - e.g.
//     "infusion-6": "https://github.com/fluid-project/infusion-6/releases/download/6.7.4/infusion-6-6.7.4.tgz"
// Only the site's package.json is written: run `npm install` in the site afterwards, to fetch the tarballs and record
// them in its lockfile. Each URL is checked first, so that a site is never pointed at a release not yet made.
//
// Run with: node scripts/useRelease.js <site directory> [--no-check]

const fs = require("fs");
const path = require("path");
const releaseAssets = require("./releaseAssets.js");

const args = process.argv.slice(2);
const siteDir = args.find(arg => !arg.startsWith("--"));
const check = !args.includes("--no-check");

/**
 * Determine whether a released tarball can be downloaded, following GitHub's redirect to where it is stored
 * @param {String} url - Its URL
 * @return {Promise<Boolean>} `true` if it can be
 */
const isReleased = async function (url) {
    const response = await fetch(url, {method: "HEAD", redirect: "follow"});
    return response.ok;
};

const main = async function () {
    if (!siteDir) {
        throw new Error("Name the directory of the site to point at the releases: node scripts/useRelease.js <site directory>");
    }
    const packagePath = path.resolve(siteDir, "package.json");
    const sitePackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const released = releaseAssets.packageDirs().map(releaseAssets.describe);
    const changes = [];
    for (const field of ["dependencies", "devDependencies"]) {
        for (const release of released) {
            const current = sitePackage[field] && sitePackage[field][release.name];
            if (current !== undefined && current !== release.url) {
                if (check && !await isReleased(release.url)) {
                    throw new Error(release.name + "@" + release.version + " has no released tarball at " + release.url +
                        " - release it first, with npm run release, or pass --no-check");
                }
                sitePackage[field][release.name] = release.url;
                changes.push(field + ": " + release.name + " " + current + " -> " + release.url);
            }
        }
    }
    if (changes.length > 0) {
        // Written as npm writes it, with the indentation it already has
        const indent = (fs.readFileSync(packagePath, "utf8").match(/^[ \t]+(?=")/m) || ["  "])[0];
        fs.writeFileSync(packagePath, JSON.stringify(sitePackage, null, indent) + "\n");
        changes.forEach(change => console.log(change));
        console.log("Now run npm install in " + path.resolve(siteDir));
    } else {
        console.log(path.resolve(siteDir) + " already depends on the released tarballs of this checkout's versions");
    }
};

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
