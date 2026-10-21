/* eslint-env node */
"use strict";

// Sends a direction to the IFM model exactly as the tldraw demo's "Ask me anything" panel would, from a mocked-up
// workspace held in ifm-harness.html, applies its responses, and assesses the widgets they produce.
// See fluid-project/infusion-6#25
// Run from the repository root as
//     node a-scratch/ifm-harness/run-harness.js [samples=3]
// Setting HARNESS_VARIANT=nohint withdraws the strategy hint describing the geometry of the composition.
// Setting HARNESS_ORDER=old restores the earlier order of the system prompt, in which the workspace preceded the rules.
// Setting HARNESS_DRYRUN=1 supplies the ideal response in place of the model's, to check the harness itself.
// Setting HARNESS_REPLAY=<path of a response-n.txt> supplies that saved response in place of the model's.
// Each sample runs in a process of its own, so that layers defined by one response cannot affect another. Results are
// written to a-scratch/ifm-harness/runs/<timestamp>/sample-<n>/

const fs = require("fs"),
    path = require("path"),
    {fork} = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");
const htmlPath = path.join(__dirname, "ifm-harness.html");

/**
 * Run a single sample in this process, within the fqunit browser-like context, supplying the context with web crypto
 * (needed to derive the proxy token from the password) and a means of writing its results
 * @param {String} outDir - The directory into which the sample's results are written
 */
const runSample = function (outDir) {
    const fluid = require(path.join(repoRoot, "tests/test-core/qunit/js/fqunit-node.js"));
    const fQUnit = fluid.registerNamespace("fQUnit");
    require(path.join(repoRoot, "tests/test-core/qunit/js/fqunit-html.js"));
    const makeBrowserContext = fQUnit.makeBrowserContext;
    fQUnit.makeBrowserContext = function (contextPath) {
        const context = makeBrowserContext(contextPath);
        context.crypto = require("crypto").webcrypto;
        context.harnessIO = {
            sample: path.basename(outDir),
            // In a dry run the ideal response is supplied in place of the model's, to check the harness itself
            dryRun: !!process.env.HARNESS_DRYRUN || !!process.env.HARNESS_REPLAY,
            // Replaying supplies a response saved from an earlier run in place of the ideal one
            replay: process.env.HARNESS_REPLAY ? fs.readFileSync(path.resolve(process.env.HARNESS_REPLAY), "utf8") : null,
            // "nohint" withdraws the strategy hint describing the geometry of a dominant widget composed with a supplier
            variant: process.env.HARNESS_VARIANT,
            // "old" restores the earlier order of the system prompt, with the workspace before the response rules and hints
            order: process.env.HARNESS_ORDER,
            writeFile: (name, text) => fs.writeFileSync(path.join(outDir, name), text),
            // The password is never written out or logged
            readPassword: () => fs.readFileSync(path.join(repoRoot, "ifm-password.txt"), "utf8").trim()
        };
        return context;
    };
    fQUnit.runHtmlFile(htmlPath).then(summary => {
        process.exit(summary.failed === 0 ? 0 : 1);
    });
};

/**
 * Fork a process for each sample, running them concurrently, with each one's console output written to its directory
 * @param {Number} samples - The number of samples to run
 */
const runAll = function (samples) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runDir = path.join(__dirname, "runs", stamp);
    const runs = [];
    for (let i = 1; i <= samples; ++i) {
        const outDir = path.join(runDir, "sample-" + i);
        fs.mkdirSync(outDir, {recursive: true});
        const log = fs.openSync(path.join(outDir, "console.log"), "w");
        const child = fork(__filename, [], {
            cwd: repoRoot,
            env: {...process.env, HARNESS_OUT: outDir},
            stdio: ["ignore", log, log, "ipc"]
        });
        runs.push(new Promise(resolve => child.on("exit", code => resolve({outDir, code}))));
    }
    console.log(`Running ${samples} samples into ${runDir}`);
    Promise.all(runs).then(results => {
        results.forEach(({outDir, code}) => {
            const assessmentPath = path.join(outDir, "assessment.json");
            const assessment = fs.existsSync(assessmentPath) ? JSON.parse(fs.readFileSync(assessmentPath, "utf8")) : null;
            console.log(`${path.basename(outDir)}: exit ${code} - ` + (assessment ? assessment.verdict : "no assessment written"));
        });
    });
};

if (process.env.HARNESS_OUT) {
    runSample(process.env.HARNESS_OUT);
} else {
    runAll(Number(process.argv[2]) || 3);
}
