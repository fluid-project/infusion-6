"use strict";

// Checks what a release would publish, before it is published: packs Infusion, wend and wend-theme-beautiful with
// `npm pack`, installs a copy of packages/wend-test-site from those tarballs, and runs the extension's scenarios
// against that copy, built with the Infusion it installed rather than with this checkout - see
// EDIT_TEST_SITE and EDIT_TEST_INSTALLED_INFUSION in extension/test/harness.js.
//
// It writes only to a temporary directory, removed once done unless KEEP_PACKED is set. The install fetches the site's
// other dependencies, e.g. those of wend, from the npm registry.
// Run with: npm run test:packed

const fs = require("fs");
const os = require("os");
const path = require("path");
const {execFileSync} = require("child_process");
const releaseAssets = require("./releaseAssets.js");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "infusion-packed-"));
const tgzDir = path.join(workDir, "tgz");
const siteDir = path.join(workDir, "wend-test-site");

/**
 * Run npm, showing its output
 * @param {String[]} args - Its arguments
 * @param {String} cwd - The directory in which to run it
 * @param {Object} [env] - Further environment variables
 * @return {Boolean} `true` once it has succeeded - it throws if it fails
 */
const runNpm = function (args, cwd, env = {}) {
    execFileSync(npm, args, {cwd, stdio: "inherit", env: {...process.env, ...env}});
    return true;
};

/**
 * Pack the packages a release would publish, as it packs them - see releaseAssets.js
 * @return {Object<String, String>} The path of each package's tarball, keyed by its name
 */
const pack = function () {
    return Object.fromEntries(releaseAssets.packageDirs().map(dir => [releaseAssets.readPackage(dir).name, releaseAssets.pack(dir, tgzDir)]));
};

try {
    const tarballs = pack();
    console.log("Packed: " + Object.keys(tarballs).join(", "));
    fs.cpSync(path.join(root, "packages/wend-test-site"), siteDir, {recursive: true});
    const sitePackagePath = path.join(siteDir, "package.json");
    const sitePackage = JSON.parse(fs.readFileSync(sitePackagePath, "utf8"));
    Object.keys(sitePackage.dependencies).forEach(name => {
        if (tarballs[name]) {
            sitePackage.dependencies[name] = "file:" + tarballs[name];
        } else {
            throw new Error("The test site depends on " + name + ", which is not among the packages packed");
        }
    });
    fs.writeFileSync(sitePackagePath, JSON.stringify(sitePackage, null, 4) + "\n");
    runNpm(["install", "--no-audit", "--no-fund"], siteDir);
    runNpm(["run", "test:extension"], root, {EDIT_TEST_SITE: siteDir, EDIT_TEST_INSTALLED_INFUSION: "1"});
    console.log("test:packed PASS - the scenarios pass against the site installed from the packed tarballs");
} finally {
    if (process.env.KEEP_PACKED) {
        console.log("Kept " + workDir);
    } else {
        fs.rmSync(workDir, {recursive: true, force: true});
    }
}
