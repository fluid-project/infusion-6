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
    writeFile(path.join(checkoutsDir, "node_modules/fluid-tests-hoisted-dep/package.json"), "{\"name\": \"fluid-tests-hoisted-dep\"}\n");
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

        // The page is hydrated with its bootstrap in each form - left to load Infusion's files, replaced by those files,
        // and replaced by their bundle, which is first copied out
        copyOut(projectDir, ["--framework", "built"]);
        expect(exists("vendor/infusion/dist/fluid.boot.min.js"), "Built bundle of Infusion copied out for its built form");
        for (const framework of ["boot", "source", "built"]) {
            const result = await fluidHydrationRoundTrip.run({
                root: projectDir,
                page: "index.html",
                hydrateArgs: ["--framework", framework],
                ready: `document.querySelectorAll(".rt-item").length === 3 && !!document.querySelector(".rt-app.rt-loaded")
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
            expect(result.hydrated.initial === "Placeholder", `Hydrated project page in ${framework} form rendered from its own placeholder - found ` + result.hydrated.initial);
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
