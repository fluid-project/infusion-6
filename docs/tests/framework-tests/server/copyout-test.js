/* eslint-env node */
"use strict";

// Test copyOut.js, which copies into a project the files of the modules its pages depend upon, and writes the module
// map through which its page locates them. The project is a copy of copyout/site, made in a temporary directory, whose
// page refers to Infusion through its bootstrap, and to the round trip fixture's Single File Components through the
// module fluid-tests-rt, which its map does not yet locate - and holds data of its own. Once their files are copied out, the project must
// render, served from its own directory alone, identically whether booted from its minimal page or from the page as
// hydrated - see hydrate-roundtrip-test.js. The round trip fixture is first copied into a checkout of its own, beside
// the packages on which one of its SFCs is made to depend by references %package/ - one installed beneath it, and
// one hoisted, as npm may, into the node_modules of the directory enclosing it. Each is a module of its own, copied out
// into the project's vendor directory and located by its map

const childProcess = require("child_process"),
    fs = require("fs"),
    os = require("os"),
    path = require("path");

const fluidHydrationRoundTrip = require("../../test-core/browser/js/hydration-roundtrip.js");
const fluidCopyOut = require("../../../src/framework/server/copyOut.js");

const repoRoot = path.resolve(__dirname, "../../.."),
    copyOutScript = path.join(repoRoot, "src/framework/server/copyOut.js"),
    rtFixture = path.join(__dirname, "roundtrip");

// The checkout of the round trip fixture, made within a temporary directory
let rtRoot;

/**
 * Write a file, creating its directory
 * @param {String} file - The path of the file
 * @param {String} text - Its text
 */
const writeFile = function (file, text) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
};

/**
 * Make a checkout of the round trip fixture, one of whose SFCs depends upon a package installed beneath it, which is
 * scoped, and one hoisted into the node_modules directory enclosing it
 * @param {String} checkoutsDir - The directory to hold the checkout
 * @return {String} The directory of the checkout
 */
const makeRtCheckout = function (checkoutsDir) {
    const checkout = path.join(checkoutsDir, "rt");
    fs.cpSync(rtFixture, checkout, {recursive: true});
    writeFile(path.join(checkout, "node_modules/@fluid-tests/nested-dep/package.json"), "{\"name\": \"@fluid-tests/nested-dep\"}\n");
    writeFile(path.join(checkout, "node_modules/@fluid-tests/nested-dep/dist/nested.css"), ".rt-panel {outline: 1px solid green;}\n");
    writeFile(path.join(checkoutsDir, "node_modules/fluid-tests-hoisted-dep/package.json"), "{\"name\": \"fluid-tests-hoisted-dep\", \"version\": \"1.0.0\"}\n");
    writeFile(path.join(checkoutsDir, "node_modules/fluid-tests-hoisted-dep/hoisted.css"), ".rt-panel {border-radius: 2px;}\n");
    const panel = path.join(checkout, "sfc/parts/fluid-tests-rt-panel.vue");
    fs.writeFileSync(panel, `<style src="%@fluid-tests/nested-dep/dist/nested.css"></style>
<style src="%fluid-tests-hoisted-dep/hoisted.css"></style>
` + fs.readFileSync(panel, "utf8"));
    return checkout;
};

const failures = [];
const expect = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

/**
 * Run copyOut.js on the project's page
 * @param {String} projectDir - The project's directory
 * @param {String[]} extraArgs - Further arguments
 * @return {Object} The result of the child process, with members `status` and `stdout`
 */
const copyOut = function (projectDir, extraArgs) {
    const result = childProcess.spawnSync(process.execPath, [copyOutScript, "index.html",
        "--source", "infusion-6=" + repoRoot, "--source", "fluid-tests-rt=" + rtRoot, ...extraArgs], {
        cwd: projectDir, encoding: "utf8", timeout: 120000
    });
    return {status: result.status, stdout: result.stdout + result.stderr};
};

const summary = stdout => (stdout.match(/\n(\d+ new, \d+ changed, \d+ unchanged, \d+ missing.*)/) || [])[1];

/**
 * Test the matching of versions against the specifications of a package.json
 */
const testVersionSatisfies = function () {
    [
        ["6.2.4", "6.2.4", true], ["6.2.4", "6.2.1", false], ["6.2.4", "=6.2.4", true], ["6.2.4", "v6.2.4", true],
        ["1.2.0", "^1.1.0", true], ["2.0.0", "^1.1.0", false], ["1.0.9", "^1.1.0", false],
        ["0.2.5", "^0.2.1", true], ["0.3.0", "^0.2.1", false], ["0.0.3", "^0.0.3", true], ["0.0.4", "^0.0.3", false],
        ["1.2.9", "~1.2.3", true], ["1.3.0", "~1.2.3", false], ["1.2.2", "~1.2.3", false],
        ["6.9.1", "6.x", true], ["7.0.0", "6.x", false], ["6.2.7", "6.2.*", true], ["6.2.7", "*", true],
        ["1.0.0-beta.1", "1.0.0-beta.1", true], ["1.0.0-beta.1", "1.0.0", false], ["1.0.0-beta.1", "^0.9.0", false],
        ["6.2.4", ">=6.0.0 <7.0.0", null], ["6.2.4", "latest", null], ["6.2.4", "file:../infusion-6", null],
        ["6.2.4", "github:fluid-project/infusion", null]
    ].forEach(([version, spec, expected]) => {
        const result = fluidCopyOut.versionSatisfies(version, spec);
        expect(result === expected, `Version ${version} against "${spec}" is ${expected} - found ${result}`);
    });
};

/**
 * Run git in a directory, as a fixed author
 * @param {String} dir - The directory
 * @param {String[]} args - The arguments to git
 */
const git = function (dir, args) {
    childProcess.execFileSync("git", ["-C", dir, "-c", "user.name=Fluid Tests", "-c", "user.email=tests@example.invalid",
        "-c", "commit.gpgsign=false", ...args], {stdio: "ignore"});
};

/**
 * Test that the version of each module copied is checked against the version the project names for it - a stale
 * installed package fails the copy before anything is copied, and a checkout which matches no release is warned of
 * @param {String} projectDir - The project's directory, whose modules have already been copied out
 */
const testVersionCheck = function (projectDir) {
    const packageFile = path.join(projectDir, "package.json");
    const writePackage = dependencies => fs.writeFileSync(packageFile, JSON.stringify({name: "fluid-tests-site", dependencies}, null, 4) + "\n");
    const hoisted = path.join(projectDir, "vendor/fluid-tests-hoisted-dep/hoisted.css");
    const installed = fs.readFileSync(hoisted, "utf8");
    // The project's copy of the package as a newer release left it, which the stale installed package would revert
    const newer = ".rt-panel {border-radius: 3px;}\n";
    fs.writeFileSync(hoisted, newer);

    writePackage({"fluid-tests-hoisted-dep": "1.1.0"});
    const stale = copyOut(projectDir, []);
    expect(stale.status === 1, "Copy out fails when an installed package's version differs from that the project names");
    expect(/Error: fluid-tests-hoisted-dep is installed at version 1\.0\.0 in .*, but package.json names 1\.1\.0 - run "npm install"/.test(stale.stdout),
        "The failure names the package, its versions, and the remedy - " + stale.stdout.slice(-600));
    expect(stale.stdout.includes("Nothing was copied"), "The failure says that nothing was copied");
    expect(fs.readFileSync(hoisted, "utf8") === newer, "The project's copy of the stale package is not reverted");

    const forced = copyOut(projectDir, ["--skip-version-check"]);
    expect(forced.status === 0 && fs.readFileSync(hoisted, "utf8") === installed, "--skip-version-check copies regardless");

    writePackage({"fluid-tests-hoisted-dep": "^1.0.0"});
    const ranged = copyOut(projectDir, []);
    expect(ranged.status === 0 && !/Error:/.test(ranged.stdout), "Copy out succeeds when the installed version satisfies the range named");

    // A checkout is not held to the version named, but a mismatch is warned of
    fs.writeFileSync(path.join(rtRoot, "package.json"), JSON.stringify({name: "fluid-tests-rt", version: "2.0.0"}) + "\n");
    writePackage({"fluid-tests-hoisted-dep": "1.0.0", "fluid-tests-rt": "2.1.0"});
    const ahead = copyOut(projectDir, []);
    expect(ahead.status === 0, "Copy out from a checkout whose version differs from that named succeeds - " + ahead.stdout.slice(-600));
    expect(/Warning: fluid-tests-rt is copied from the checkout at .*, at version 2\.0\.0, but package.json names 2\.1\.0/.test(ahead.stdout),
        "The checkout's differing version is warned of");

    // Nor is a checkout held to its commits, but uncommitted changes to the files copied from it are warned of
    writePackage({"fluid-tests-hoisted-dep": "1.0.0", "fluid-tests-rt": "2.0.0"});
    git(rtRoot, ["init", "-q"]);
    git(rtRoot, ["add", "-A"]);
    git(rtRoot, ["commit", "-q", "-m", "Fixture"]);
    const committed = copyOut(projectDir, []);
    expect(committed.status === 0 && !/Warning: fluid-tests-rt/.test(committed.stdout),
        "No warning is given of a checkout at the version named with no uncommitted changes - " + (committed.stdout.match(/Warning: fluid-tests-rt.*/) || [])[0]);
    fs.appendFileSync(path.join(rtRoot, "lib/shared.js"), "\n// Uncommitted edit\n");
    const dirty = copyOut(projectDir, []);
    expect(dirty.status === 0, "Copy out from a checkout with uncommitted changes succeeds");
    expect(/Warning: fluid-tests-rt is copied from the checkout at .*, which has uncommitted changes to files the project's copies are taken from - lib\/shared\.js/.test(dirty.stdout),
        "The uncommitted change to a file copied is warned of - " + (dirty.stdout.match(/Warning: fluid-tests-rt.*/) || [])[0]);
    fs.rmSync(packageFile);
};

const main = async function () {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-copyout-"));
    let projectDir = tempDir;
    try {
        fs.cpSync(path.join(__dirname, "copyout/site"), path.join(projectDir, "site"), {recursive: true});
        rtRoot = makeRtCheckout(path.join(projectDir, "checkouts"));
        projectDir = path.join(projectDir, "site");
        const exists = file => fs.existsSync(path.join(projectDir, file));

        const dry = copyOut(projectDir, ["-n"]);
        expect(dry.status === 0, "Dry run succeeds - " + dry.stdout.slice(-2000));
        expect(!exists("vendor"), "Dry run copies nothing");
        expect(!exists("fluid-modules.json"), "Dry run writes no module map");
        // Before anything is copied, every file of a module must be read from its checkout
        expect(!/Injection failure|Failure loading/.test(dry.stdout), "No injection fails on booting the page before copying out - " +
            (dry.stdout.match(/.*(Injection failure|Failure loading).*/) || [])[0]);

        const first = copyOut(projectDir, []);
        expect(first.status === 0, "Copy out succeeds - " + first.stdout.slice(-2000));
        [
            "vendor/infusion/src/framework/core/js/FluidBoot.js",
            "vendor/infusion/src/framework/core/js/Fluid.js",
            "vendor/infusion/src/framework/core/js/sfc-parser.js",
            "vendor/infusion/src/lib/lezer/lezer-javascript-browser.js",
            "vendor/fluid-tests-rt/sfc/fluid-tests-rt-app.vue",
            "vendor/fluid-tests-rt/sfc/parts/fluid-tests-rt-list.vue",
            "vendor/fluid-tests-rt/sfc/parts/fluid-tests-rt-item.vue",
            "vendor/fluid-tests-rt/sfc/parts/fluid-tests-rt-panel.vue",
            "vendor/fluid-tests-rt/sfc/parts/panel.css",
            "vendor/fluid-tests-rt/sfc/parts/star.svg",
            "vendor/fluid-tests-rt/lib/shared.js",
            "vendor/fluid-tests-rt/lib/client-widget.js",
            "vendor/@fluid-tests/nested-dep/dist/nested.css",
            "vendor/fluid-tests-hoisted-dep/hoisted.css"
        ].forEach(file => expect(exists(file), "Demanded file copied out: " + file));
        [
            "vendor/fluid-tests-rt/index.html",
            "vendor/fluid-tests-rt/data/records.json",
            "vendor/fluid-tests-rt/placeholder.html",
            "vendor/infusion/src/framework/core/js/FluidDebugging.js",
            "vendor/infusion/package.json"
        ].forEach(file => expect(!exists(file), "File not demanded is not copied out: " + file));
        const map = JSON.parse(fs.readFileSync(path.join(projectDir, "fluid-modules.json"), "utf8"));
        expect(JSON.stringify(map) === JSON.stringify({
            "@fluid-tests/nested-dep": "vendor/@fluid-tests/nested-dep",
            "fluid-tests-hoisted-dep": "vendor/fluid-tests-hoisted-dep",
            "fluid-tests-rt": "vendor/fluid-tests-rt"
        }), "Module map locates each module copied out - found " + JSON.stringify(map));
        const second = copyOut(projectDir, []).stdout;
        expect(/^0 new, 0 changed, \d+ unchanged, 0 missing/.test(summary(second)) && second.includes("module map unchanged"),
            "Second copy out finds everything unchanged");

        fs.appendFileSync(path.join(projectDir, "vendor/fluid-tests-rt/lib/shared.js"), "\n// Local edit\n");
        const changed = copyOut(projectDir, ["-n"]).stdout;
        expect(changed.includes("changed: vendor/fluid-tests-rt/lib/shared.js") && /^0 new, 1 changed/.test(summary(changed)),
            "Dry run reports a file differing from its checkout - found " + summary(changed));
        copyOut(projectDir, []);

        testVersionSatisfies();
        testVersionCheck(projectDir);

        // The page is hydrated with its bootstrap in each form - left to load Infusion's files, replaced by those files,
        // and replaced by their bundle, which is first copied out
        copyOut(projectDir, ["--framework", "built"]);
        expect(exists("vendor/infusion/dist/fluid.boot.min.js"), "Built bundle of Infusion copied out for its built form");
        for (const framework of ["boot", "source", "built"]) {
            const result = await fluidHydrationRoundTrip.run({
                root: projectDir,
                page: "index.html",
                hydrateArgs: ["--framework", framework],
                ready: `document.querySelectorAll(".rt-item").length === 3 && !!document.querySelector(".rt-app.rt-real")
                    && !!document.querySelector(".rt-widget-live")`,
                initial: `[...document.querySelectorAll(".rt-item")].map(item => item.textContent).join()`,
                timeout: 30000
            });
            const bootScripts = (result.hydratedText.match(/src="[^"]*FluidBoot\.js"/g) || []).length;
            const builtScripts = (result.hydratedText.match(/fluid\.boot\.min\.js/g) || []).length;
            const sourceScripts = (result.hydratedText.match(/src="vendor\/infusion\/src\/framework\/core\/js\/Fluid\.js"/g) || []).length;
            expect(framework === "boot" ? bootScripts === 1 && sourceScripts === 0 : framework === "source" ?
                bootScripts === 0 && sourceScripts === 1 : bootScripts === 0 && builtScripts === 1 && sourceScripts === 0,
            `Hydrated page holds its bootstrap in ${framework} form - found ${bootScripts} bootstraps, ${sourceScripts} sources, ${builtScripts} bundles`);
            expect(result.hydrated.initial === "Copied,Out,Site", `Hydrated project page in ${framework} form rendered from its own real data - found ` + result.hydrated.initial);
            expect(result.hydratedText.includes("src=\"vendor/fluid-tests-rt/lib/client-widget.js\""), "Hydrated page refers to the copied out script");
            expect(result.hydratedText.includes("href=\"vendor/fluid-tests-hoisted-dep/hoisted.css\""),
                "Hydrated page refers to the hoisted package where it is copied out, as a module of its own");
            [["dehydrated", result.dehydrated], ["hydrated", result.hydrated]].forEach(([name, loaded]) => {
                expect(loaded.errors.length === 0, `No errors in ${name} page in ${framework} form served from the project alone - found ${JSON.stringify(loaded.errors)}`);
            });
            expect(result.dehydrationDifference === null, `Project page in ${framework} form: hydration reversed exactly by dehydrate.js - ` + result.dehydrationDifference);
            const difference = fluidHydrationRoundTrip.firstDifference(result.dehydrated.snapshot, result.hydrated.snapshot);
            expect(difference === null, `Dehydrated and hydrated project pages in ${framework} form render identically - ` + difference);
        }
    } finally {
        fs.rmSync(tempDir, {recursive: true, force: true});
    }

    if (failures.length === 0) {
        console.log("copyout-test PASS");
    } else {
        console.log("copyout-test FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("copyout-test FAIL: ", error);
    process.exitCode = 1;
});
